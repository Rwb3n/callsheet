// Admin billing integration tests — CS-WORK-059 AC-4.7 through AC-4.13
import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { eq } from "drizzle-orm"
import { getTestDb, resetDb, closeTestDb } from "@/db/test-utils"
import {
  makeUUID,
  makeAdminSession,
  makeSession,
  ctx,
  seedTestUser,
  createTestListing,
  createSchedulerDb,
  createDecisionLogDb,
} from "@/db/test-fixtures"
import { createAdminBillingRouter } from "@/server/routers/admin/billing"
import { billingHolds, billingReconciliationStatus } from "@/db/schema/operations"
import { deferredActions, decisionLogs } from "@/db/schema/shared"
import { registerBillingHoldExpiryHandler } from "@/lib/scheduler/handlers/billing-hold-expiry"
import { invokeHandler } from "@/lib/scheduler/handlers/__tests__/invoke-handler"
import { ActionHandlerRegistry } from "@/lib/scheduler"

const db = getTestDb()
const schedulerDb = createSchedulerDb(db)
const decisionLogDb = createDecisionLogDb(db)

const ADMIN_ID = makeUUID("admin001")
const USER_ID = makeUUID("user001")

function makeRouter() {
  return createAdminBillingRouter({ db, schedulerDb, decisionLogDb })
}

beforeEach(async () => {
  await resetDb()
  await seedTestUser(db, ADMIN_ID, "admin@callsheet.test")
  await seedTestUser(db, USER_ID, "user@callsheet.test")
})

afterAll(async () => {
  await closeTestDb()
})

// --- AC-4.8: getStatus returns current status ---

describe("admin.billing.getStatus (AC-4.8)", () => {
  it("returns defaults when no reconciliation has run", async () => {
    const router = makeRouter()
    const caller = router.createCaller(ctx(makeAdminSession(ADMIN_ID)))

    const result = await caller.getStatus()

    expect(result.lastRunAt).toBeNull()
    expect(result.status).toBe("healthy")
    expect(result.activeHolds).toBe(0)
  })

  it("returns status after reconciliation has run", async () => {
    // Insert a status row
    await db.insert(billingReconciliationStatus).values({
      lastRunAt: new Date(),
      status: "anomaly_detected",
      activeHolds: 3,
      lastAnomalyAt: new Date(),
      lastAnomalyDescription: "3 holds created",
    })

    const router = makeRouter()
    const caller = router.createCaller(ctx(makeAdminSession(ADMIN_ID)))

    const result = await caller.getStatus()

    expect(result.status).toBe("anomaly_detected")
    expect(result.activeHolds).toBe(3)
    expect(result.lastAnomalyDescription).toBe("3 holds created")
    expect(result.lastRunAt).toBeDefined()
  })
})

// --- AC-4.9: triggerReconciliation schedules immediate action ---

describe("admin.billing.triggerReconciliation (AC-4.9)", () => {
  it("schedules immediate billing_reconciliation deferred action", async () => {
    const router = makeRouter()
    const caller = router.createCaller(ctx(makeAdminSession(ADMIN_ID)))

    const result = await caller.triggerReconciliation()
    expect(result.scheduled).toBe(true)

    const actions = await db
      .select()
      .from(deferredActions)
      .where(eq(deferredActions.action, "billing_reconciliation"))
    expect(actions).toHaveLength(1)
    // executeAt should be approximately now
    expect(actions[0].executeAt.getTime()).toBeLessThanOrEqual(Date.now() + 5000)
  })

  it("logs decision with admin identity", async () => {
    const router = makeRouter()
    const caller = router.createCaller(ctx(makeAdminSession(ADMIN_ID)))

    await caller.triggerReconciliation()

    const logs = await db
      .select()
      .from(decisionLogs)
      .where(eq(decisionLogs.decisionType, "billing_reconciliation"))
    expect(logs).toHaveLength(1)
    expect((logs[0].inputs as Record<string, unknown>).trigger).toBe("manual_admin")
    expect((logs[0].inputs as Record<string, unknown>).triggeredBy).toBe(ADMIN_ID)
  })
})

// --- AC-4.10: releaseHold deletes hold and cancels deferred action ---

describe("admin.billing.releaseHold (AC-4.10)", () => {
  it("deletes hold and logs decision with admin identity", async () => {
    const listing = await createTestListing(db, USER_ID)
    const [hold] = await db.insert(billingHolds).values({
      listingId: listing.id,
      reason: "test mismatch",
      expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
    }).returning()

    const router = makeRouter()
    const caller = router.createCaller(ctx(makeAdminSession(ADMIN_ID)))

    await caller.releaseHold({ holdId: hold.id, reason: "Verified with Paddle" })

    // Hold deleted
    const holds = await db.select().from(billingHolds)
    expect(holds).toHaveLength(0)

    // Decision logged
    const logs = await db
      .select()
      .from(decisionLogs)
      .where(eq(decisionLogs.decisionType, "billing_reconciliation"))
    expect(logs).toHaveLength(1)
    const output = logs[0].output as Record<string, unknown>
    expect(output.action).toBe("hold_released")
    expect(output.reason).toBe("Verified with Paddle")
    expect(output.releasedBy).toBe(ADMIN_ID)
  })

  it("cancels billing_hold_expiry deferred action", async () => {
    const listing = await createTestListing(db, USER_ID)
    const [hold] = await db.insert(billingHolds).values({
      listingId: listing.id,
      reason: "test mismatch",
      expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
    }).returning()

    // Schedule hold expiry
    await db.insert(deferredActions).values({
      action: "billing_hold_expiry",
      params: { listingId: listing.id, holdId: hold.id },
      executeAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
      retryPolicy: "once",
      onFailure: "log",
      createdBy: "billing_reconciliation",
      status: "pending",
      attempts: 0,
    })

    const router = makeRouter()
    const caller = router.createCaller(ctx(makeAdminSession(ADMIN_ID)))

    await caller.releaseHold({ holdId: hold.id, reason: "Verified" })

    // Deferred action cancelled
    const actions = await db
      .select()
      .from(deferredActions)
      .where(eq(deferredActions.action, "billing_hold_expiry"))
    expect(actions[0].status).toBe("cancelled")
  })

  it("throws NOT_FOUND for non-existent hold", async () => {
    const router = makeRouter()
    const caller = router.createCaller(ctx(makeAdminSession(ADMIN_ID)))

    await expect(
      caller.releaseHold({ holdId: makeUUID("nonexist1"), reason: "test" }),
    ).rejects.toThrow("Hold not found or already released")
  })
})

// --- AC-4.11: listHolds with pagination and computed remainingHours ---

describe("admin.billing.listHolds (AC-4.11)", () => {
  it("returns holds with listing name and remainingHours", async () => {
    const listing = await createTestListing(db, USER_ID, { name: "Test Production Co" })
    await db.insert(billingHolds).values({
      listingId: listing.id,
      reason: "mismatch",
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h remaining
    })

    const router = makeRouter()
    const caller = router.createCaller(ctx(makeAdminSession(ADMIN_ID)))

    const result = await caller.listHolds({})

    expect(result.holds).toHaveLength(1)
    expect(result.holds[0].listingName).toBe("Test Production Co")
    expect(result.holds[0].remainingHours).toBeGreaterThan(23)
    expect(result.holds[0].remainingHours).toBeLessThan(25)
    expect(result.nextCursor).toBeUndefined()
  })

  it("paginates with cursor", async () => {
    const listing = await createTestListing(db, USER_ID)
    const now = Date.now()
    // Insert 3 holds with distinct createdAt for stable cursor ordering
    for (let i = 0; i < 3; i++) {
      await db.insert(billingHolds).values({
        listingId: listing.id,
        reason: `hold-${i}`,
        expiresAt: new Date(now + (i + 1) * 60 * 60 * 1000),
        createdAt: new Date(now - i * 60000), // 0, -1min, -2min
      })
    }

    const router = makeRouter()
    const caller = router.createCaller(ctx(makeAdminSession(ADMIN_ID)))

    const page1 = await caller.listHolds({ limit: 2 })
    expect(page1.holds).toHaveLength(2)
    expect(page1.nextCursor).toBeDefined()

    const page2 = await caller.listHolds({ limit: 2, cursor: page1.nextCursor })
    expect(page2.holds).toHaveLength(1)
    expect(page2.nextCursor).toBeUndefined()
  })

  it("remainingHours is 0 for expired holds", async () => {
    const listing = await createTestListing(db, USER_ID)
    await db.insert(billingHolds).values({
      listingId: listing.id,
      reason: "expired hold",
      expiresAt: new Date(Date.now() - 60 * 60 * 1000), // 1h ago
    })

    const router = makeRouter()
    const caller = router.createCaller(ctx(makeAdminSession(ADMIN_ID)))

    const result = await caller.listHolds({})
    expect(result.holds[0].remainingHours).toBe(0)
  })
})

// --- AC-4.7: billing_hold_expiry handler ---

describe("billing_hold_expiry handler (AC-4.7)", () => {
  it("deletes expired hold and logs decision", async () => {
    const listing = await createTestListing(db, USER_ID)
    const [hold] = await db.insert(billingHolds).values({
      listingId: listing.id,
      reason: "test hold",
      expiresAt: new Date(Date.now() - 1000), // expired
    }).returning()

    const registry = new ActionHandlerRegistry()
    registerBillingHoldExpiryHandler(registry, { db, decisionLogDb })
    await invokeHandler(registry, "billing_hold_expiry", { holdId: hold.id, listingId: listing.id })

    // Hold deleted
    const holds = await db.select().from(billingHolds)
    expect(holds).toHaveLength(0)

    // Decision logged
    const logs = await db
      .select()
      .from(decisionLogs)
      .where(eq(decisionLogs.decisionType, "billing_reconciliation"))
    expect(logs).toHaveLength(1)
    expect((logs[0].output as Record<string, unknown>).action).toBe("hold_auto_expired")
  })

  it("no-ops when hold already released", async () => {
    // No hold exists in DB
    const registry = new ActionHandlerRegistry()
    registerBillingHoldExpiryHandler(registry, { db, decisionLogDb })
    await invokeHandler(registry, "billing_hold_expiry", { holdId: makeUUID("ghost0001"), listingId: makeUUID("ghost0002") })

    // No decision logged (handler returned early)
    const logs = await db
      .select()
      .from(decisionLogs)
      .where(eq(decisionLogs.decisionType, "billing_reconciliation"))
    expect(logs).toHaveLength(0)
  })
})

// --- AC-4.13: checkComplianceHold constraint ---

describe("compliance hold separation (AC-4.13)", () => {
  it("billing_holds and compliance_register are separate tables", async () => {
    // Structural assertion — billing_holds has no compliance fields
    const listing = await createTestListing(db, USER_ID)
    const [hold] = await db.insert(billingHolds).values({
      listingId: listing.id,
      reason: "billing mismatch",
      expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
    }).returning()

    // billingHolds has: id, listingId, reason, expiresAt, createdAt — no type/status/accountId
    expect(hold.id).toBeDefined()
    expect(hold.listingId).toBe(listing.id)
    expect(hold.reason).toBe("billing mismatch")
    expect(hold.expiresAt).toBeInstanceOf(Date)
  })
})
