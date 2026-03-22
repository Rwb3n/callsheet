// Billing reconciliation integration tests — CS-WORK-059 AC-4.1 through AC-4.7, AC-4.12
import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { eq, sql } from "drizzle-orm"
import { getTestDb, resetDb, closeTestDb } from "@/db/test-utils"
import {
  makeUUID,
  seedTestUser,
  createTestListing,
  createSchedulerDb,
  createDecisionLogDb,
  InMemoryNotificationDb,
} from "@/db/test-fixtures"
import { handleBillingReconciliation } from "../reconciliation"
import type { ReconciliationDeps } from "../reconciliation"
import { billingHolds, billingReconciliationStatus, pendingCancellations } from "@/db/schema/operations"
import { deferredActions, decisionLogs } from "@/db/schema/shared"
import { listings } from "@/db/schema/data-and-listings"
import { InMemoryPaymentService } from "@/lib/services/mocks"
import { InProcessEventBus } from "@/lib/events/bus"
import { emptyConsumerMatrix, createTestBus } from "@/db/test-fixtures"
import type { SubscriptionEndedEvent } from "@/lib/events/types"

const db = getTestDb()
const schedulerDb = createSchedulerDb(db)
const decisionLogDb = createDecisionLogDb(db)

const ADMIN_ID = makeUUID("admin001")
const USER_ID = makeUUID("user001")

let payment: InMemoryPaymentService
let notificationDb: InMemoryNotificationDb
let eventBus: InProcessEventBus

function makeDeps(): ReconciliationDeps {
  return {
    db,
    schedulerDb,
    decisionLogDb,
    notificationDb,
    payment,
    eventBus,
    waitUntilFn: (p) => { p.catch(() => {}) },
    adminAccountId: ADMIN_ID,
  }
}

beforeEach(async () => {
  await resetDb()
  payment = new InMemoryPaymentService()
  notificationDb = new InMemoryNotificationDb()
  eventBus = createTestBus()
  await seedTestUser(db, ADMIN_ID, "admin@callsheet.test")
  await seedTestUser(db, USER_ID, "user@callsheet.test")
})

afterAll(async () => {
  await closeTestDb()
})

// --- Helper: create a paid listing with paddle subscription ---

async function createPaidListing(paddleSubId: string, tier = "standard") {
  return createTestListing(db, USER_ID, {
    subscriptionTier: tier,
    paddleSubscriptionId: paddleSubId,
  })
}

// --- AC-4.1: fetches Paddle subscriptions and compares with local ---

describe("reconciliation handler (AC-4.1)", () => {
  it("detects no mismatches when Paddle and local agree", async () => {
    const listing = await createPaidListing("sub_001")
    payment.setSubscriptions([
      { id: "sub_001", status: "active", tier: "standard", currentPeriodEnd: "2027-01-01" },
    ])

    await handleBillingReconciliation(makeDeps())

    // No holds created
    const holds = await db.select().from(billingHolds)
    expect(holds).toHaveLength(0)

    // Status upserted as healthy
    const [status] = await db.select().from(billingReconciliationStatus)
    expect(status.status).toBe("healthy")
  })

  it("identifies local subscriptions missing from Paddle", async () => {
    // 20 listings, 1 missing = 5% (below 10% threshold)
    for (let i = 0; i < 20; i++) {
      await createPaidListing(`sub_${String(i).padStart(3, "0")}`)
    }
    // Paddle returns 19 — sub_019 missing
    payment.setSubscriptions(
      Array.from({ length: 19 }, (_, i) => ({
        id: `sub_${String(i).padStart(3, "0")}`,
        status: "active" as const,
        tier: "standard" as const,
        currentPeriodEnd: "2027-01-01",
      })),
    )

    await handleBillingReconciliation(makeDeps())

    const holds = await db.select().from(billingHolds)
    expect(holds).toHaveLength(1)
    expect(holds[0].reason).toContain("sub_019")
  })

  it("calls PaymentService.listAllActiveSubscriptions", async () => {
    payment.setSubscriptions([])
    await handleBillingReconciliation(makeDeps())
    expect(payment.wasCalledWith("listAllActiveSubscriptions")).toBe(true)
  })
})

// --- AC-4.2: anomaly threshold halts reconciliation ---

describe("anomaly threshold (AC-4.2)", () => {
  it("halts when >= 10% of subscriptions are missing", async () => {
    // Create 10 paid listings, Paddle returns only 9 = 10% missing
    for (let i = 0; i < 10; i++) {
      await createPaidListing(`sub_${String(i).padStart(3, "0")}`)
    }
    payment.setSubscriptions(
      Array.from({ length: 9 }, (_, i) => ({
        id: `sub_${String(i).padStart(3, "0")}`,
        status: "active" as const,
        tier: "standard" as const,
        currentPeriodEnd: "2027-01-01",
      })),
    )

    await handleBillingReconciliation(makeDeps())

    // Status = failed
    const [status] = await db.select().from(billingReconciliationStatus)
    expect(status.status).toBe("failed")
    expect(status.lastAnomalyDescription).toContain("10.0%")

    // NO holds created
    const holds = await db.select().from(billingHolds)
    expect(holds).toHaveLength(0)

    // Critical notification created
    const notifications = notificationDb.getAll()
    expect(notifications.some((n) => n.type === "billing_anomaly" && n.title.includes("anomaly"))).toBe(true)
  })

  it("does not halt when below 10% threshold", async () => {
    // 20 paid listings, 1 missing = 5%
    for (let i = 0; i < 20; i++) {
      await createPaidListing(`sub_${String(i).padStart(3, "0")}`)
    }
    payment.setSubscriptions(
      Array.from({ length: 19 }, (_, i) => ({
        id: `sub_${String(i).padStart(3, "0")}`,
        status: "active" as const,
        tier: "standard" as const,
        currentPeriodEnd: "2027-01-01",
      })),
    )

    await handleBillingReconciliation(makeDeps())

    const [status] = await db.select().from(billingReconciliationStatus)
    expect(status.status).toBe("anomaly_detected")

    // 1 hold created for the missing subscription
    const holds = await db.select().from(billingHolds)
    expect(holds).toHaveLength(1)
  })
})

// --- AC-4.3: creates billing_hold with 48h expiry and schedules billing_hold_expiry ---

describe("hold creation (AC-4.3)", () => {
  it("creates hold with 48h expiry for mismatch", async () => {
    // 20 listings, 1 missing = below threshold
    const target = await createPaidListing("sub_target")
    for (let i = 0; i < 19; i++) {
      await createPaidListing(`sub_ok_${String(i).padStart(3, "0")}`)
    }
    payment.setSubscriptions(
      Array.from({ length: 19 }, (_, i) => ({
        id: `sub_ok_${String(i).padStart(3, "0")}`,
        status: "active" as const,
        tier: "standard" as const,
        currentPeriodEnd: "2027-01-01",
      })),
    )

    await handleBillingReconciliation(makeDeps())

    const holds = await db.select().from(billingHolds)
    expect(holds).toHaveLength(1)
    expect(holds[0].listingId).toBe(target.id)

    // expiresAt is ~48h in the future (allow 5 min tolerance)
    const diffMs = holds[0].expiresAt.getTime() - Date.now()
    expect(diffMs).toBeGreaterThan(47 * 60 * 60 * 1000)
    expect(diffMs).toBeLessThan(49 * 60 * 60 * 1000)
  })

  it("schedules billing_hold_expiry deferred action", async () => {
    // 20 listings, 1 missing
    await createPaidListing("sub_target")
    for (let i = 0; i < 19; i++) {
      await createPaidListing(`sub_ok_${String(i).padStart(3, "0")}`)
    }
    payment.setSubscriptions(
      Array.from({ length: 19 }, (_, i) => ({
        id: `sub_ok_${String(i).padStart(3, "0")}`,
        status: "active" as const,
        tier: "standard" as const,
        currentPeriodEnd: "2027-01-01",
      })),
    )

    await handleBillingReconciliation(makeDeps())

    const actions = await db
      .select()
      .from(deferredActions)
      .where(eq(deferredActions.action, "billing_hold_expiry"))
    expect(actions).toHaveLength(1)
    expect((actions[0].params as Record<string, unknown>).listingId).toBeDefined()
  })

  it("does not create duplicate hold for same listing", async () => {
    // 20 listings, 1 missing
    await createPaidListing("sub_target")
    for (let i = 0; i < 19; i++) {
      await createPaidListing(`sub_ok_${String(i).padStart(3, "0")}`)
    }
    payment.setSubscriptions(
      Array.from({ length: 19 }, (_, i) => ({
        id: `sub_ok_${String(i).padStart(3, "0")}`,
        status: "active" as const,
        tier: "standard" as const,
        currentPeriodEnd: "2027-01-01",
      })),
    )

    // First run creates hold
    await handleBillingReconciliation(makeDeps())

    const holds = await db.select().from(billingHolds)
    expect(holds).toHaveLength(1)

    // Second run — hold already exists, still active
    await handleBillingReconciliation(makeDeps())

    const holdsAfter = await db.select().from(billingHolds)
    expect(holdsAfter).toHaveLength(1) // same hold, not duplicated
  })
})

// --- AC-4.4: expired hold with no pending_cancellation emits subscription_ended ---

describe("expired hold processing (AC-4.4)", () => {
  it("emits subscription_ended for expired hold with no pending_cancellation", async () => {
    const listing = await createPaidListing("sub_target")
    // Add 19 matching listings to stay below threshold
    for (let i = 0; i < 19; i++) {
      await createPaidListing(`sub_ok_${String(i).padStart(3, "0")}`)
    }

    // Insert expired hold (expiresAt in the past)
    await db.insert(billingHolds).values({
      listingId: listing.id,
      reason: "test hold",
      expiresAt: new Date(Date.now() - 1000),
    })

    payment.setSubscriptions(
      Array.from({ length: 19 }, (_, i) => ({
        id: `sub_ok_${String(i).padStart(3, "0")}`,
        status: "active" as const,
        tier: "standard" as const,
        currentPeriodEnd: "2027-01-01",
      })),
    )

    const emitted: SubscriptionEndedEvent[] = []
    eventBus = new InProcessEventBus({
      logError: async () => {},
      consumerMatrix: emptyConsumerMatrix,
    })
    eventBus.on({
      domain: "operations",
      eventType: "subscription_ended",
      mode: "sync",
      handler: async (payload) => { emitted.push(payload) },
    })

    await handleBillingReconciliation({ ...makeDeps(), eventBus })

    expect(emitted).toHaveLength(1)
    expect(emitted[0].reason).toBe("paddle_reconciliation")
    expect(emitted[0].origin).toBe("paddle")
    expect(emitted[0].listingId).toBe(listing.id)
    expect(emitted[0].accountId).toBe(USER_ID)
    expect(emitted[0].previousTier).toBe("standard")

    // Expired hold cleaned up
    const holds = await db.select().from(billingHolds)
    expect(holds).toHaveLength(0)
  })

  it("does NOT emit subscription_ended if pending_cancellation exists", async () => {
    const listing = await createPaidListing("sub_target")
    // Add 19 matching listings to stay below threshold
    for (let i = 0; i < 19; i++) {
      await createPaidListing(`sub_ok_${String(i).padStart(3, "0")}`)
    }

    // Insert expired hold
    await db.insert(billingHolds).values({
      listingId: listing.id,
      reason: "test hold",
      expiresAt: new Date(Date.now() - 1000),
    })

    // Insert pending_cancellation — webhook path handles this
    await db.insert(pendingCancellations).values({
      paddleSubscriptionId: "sub_target",
      listingId: listing.id,
      reason: "voluntary",
    })

    payment.setSubscriptions(
      Array.from({ length: 19 }, (_, i) => ({
        id: `sub_ok_${String(i).padStart(3, "0")}`,
        status: "active" as const,
        tier: "standard" as const,
        currentPeriodEnd: "2027-01-01",
      })),
    )

    const emitted: SubscriptionEndedEvent[] = []
    eventBus = new InProcessEventBus({
      logError: async () => {},
      consumerMatrix: emptyConsumerMatrix,
    })
    eventBus.on({
      domain: "operations",
      eventType: "subscription_ended",
      mode: "sync",
      handler: async (payload) => { emitted.push(payload) },
    })

    await handleBillingReconciliation({ ...makeDeps(), eventBus })

    expect(emitted).toHaveLength(0)
  })
})

// --- AC-4.5: upserts billing_reconciliation_status on every run ---

describe("status upsert (AC-4.5)", () => {
  it("creates status row on first run", async () => {
    payment.setSubscriptions([])

    await handleBillingReconciliation(makeDeps())

    const rows = await db.select().from(billingReconciliationStatus)
    expect(rows).toHaveLength(1)
    expect(rows[0].status).toBe("healthy")
    expect(rows[0].lastRunAt).toBeInstanceOf(Date)
  })

  it("updates existing status row on subsequent run", async () => {
    payment.setSubscriptions([])

    await handleBillingReconciliation(makeDeps())
    await handleBillingReconciliation(makeDeps())

    // Still single row
    const rows = await db.select().from(billingReconciliationStatus)
    expect(rows).toHaveLength(1)
  })
})

// --- AC-4.6: self-perpetuates by scheduling next run at now() + 24h ---

describe("self-perpetuation (AC-4.6)", () => {
  it("schedules next billing_reconciliation after completion", async () => {
    payment.setSubscriptions([])

    await handleBillingReconciliation(makeDeps())

    const actions = await db
      .select()
      .from(deferredActions)
      .where(eq(deferredActions.action, "billing_reconciliation"))
    expect(actions).toHaveLength(1)

    // executeAt is ~24h in the future
    const diffMs = actions[0].executeAt.getTime() - Date.now()
    expect(diffMs).toBeGreaterThan(23 * 60 * 60 * 1000)
    expect(diffMs).toBeLessThan(25 * 60 * 60 * 1000)
  })

  it("self-perpetuates even after anomaly halt", async () => {
    // Create 10 listings, Paddle has 0 = 100% missing
    for (let i = 0; i < 10; i++) {
      await createPaidListing(`sub_${String(i).padStart(3, "0")}`)
    }
    payment.setSubscriptions([])

    await handleBillingReconciliation(makeDeps())

    const actions = await db
      .select()
      .from(deferredActions)
      .where(eq(deferredActions.action, "billing_reconciliation"))
    expect(actions).toHaveLength(1) // still scheduled despite halt
  })
})

// --- AC-4.12: decision logging ---

describe("decision logging (AC-4.12)", () => {
  it("logs decision on successful reconciliation run", async () => {
    payment.setSubscriptions([])

    await handleBillingReconciliation(makeDeps())

    const logs = await db
      .select()
      .from(decisionLogs)
      .where(eq(decisionLogs.decisionType, "billing_reconciliation"))
    expect(logs.length).toBeGreaterThanOrEqual(1)
    expect((logs[0].output as Record<string, unknown>).action).toBe("completed")
  })

  it("logs decision when hold is created", async () => {
    // 20 listings, 1 missing = below threshold
    await createPaidListing("sub_target")
    for (let i = 0; i < 19; i++) {
      await createPaidListing(`sub_ok_${String(i).padStart(3, "0")}`)
    }
    payment.setSubscriptions(
      Array.from({ length: 19 }, (_, i) => ({
        id: `sub_ok_${String(i).padStart(3, "0")}`,
        status: "active" as const,
        tier: "standard" as const,
        currentPeriodEnd: "2027-01-01",
      })),
    )

    await handleBillingReconciliation(makeDeps())

    const logs = await db
      .select()
      .from(decisionLogs)
      .where(eq(decisionLogs.decisionType, "billing_reconciliation"))

    const holdLog = logs.find((l) => (l.output as Record<string, unknown>).action === "hold_created")
    expect(holdLog).toBeDefined()
  })

  it("logs decision on anomaly halt", async () => {
    for (let i = 0; i < 10; i++) {
      await createPaidListing(`sub_${String(i).padStart(3, "0")}`)
    }
    payment.setSubscriptions([])

    await handleBillingReconciliation(makeDeps())

    const logs = await db
      .select()
      .from(decisionLogs)
      .where(eq(decisionLogs.decisionType, "billing_reconciliation"))

    const haltLog = logs.find((l) => (l.output as Record<string, unknown>).action === "halted")
    expect(haltLog).toBeDefined()
  })
})

// --- Reverse mismatch: Paddle-only subscriptions ---

describe("reverse mismatch detection", () => {
  it("creates notification for Paddle subscription with no local match", async () => {
    payment.setSubscriptions([
      { id: "sub_orphan", status: "active", tier: "standard", currentPeriodEnd: "2027-01-01" },
    ])

    await handleBillingReconciliation(makeDeps())

    const notifications = notificationDb.getAll()
    expect(notifications.some((n) => n.body.includes("sub_orphan"))).toBe(true)
  })
})
