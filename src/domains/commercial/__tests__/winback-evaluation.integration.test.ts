// Integration tests — CS-WORK-069: Win-back evaluation and delivery
// AC-22, AC-25 (handler), AC-26, AC-27, AC-28

import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest"
import { eq } from "drizzle-orm"
import { getTestDb, resetDb, closeTestDb } from "@/db/test-utils"
import {
  seedTestUser,
  createTestListing,
  makeUUID,
  createDecisionLogDb,
  createSchedulerDb,
  InMemoryNotificationDb,
} from "@/db/test-fixtures"
import { churnAnalysisLog } from "@/db/schema/commercial"
import { deferredActions } from "@/db/schema/shared"
import { decisionLogs } from "@/db/schema/shared"
import { engagements, listings } from "@/db/schema/data-and-listings"
import { createTestBus } from "@/db/test-fixtures"
import { ActionHandlerRegistry } from "@/lib/scheduler"
import { scheduleDeferredAction } from "@/lib/scheduler/api"
import { invokeHandler } from "@/lib/scheduler/handlers/__tests__/invoke-handler"
import { registerWinBackEvaluationHandler } from "@/lib/scheduler/handlers/win-back-evaluation"
import {
  cancelWinBackSchedules,
  checkWinBackAttribution,
} from "../winback-evaluation"

let db: ReturnType<typeof getTestDb>

const USER_ID = makeUUID("069a")
const LISTING_ID = makeUUID("069b")

beforeAll(() => { db = getTestDb() })
beforeEach(async () => { await resetDb() })
afterAll(async () => { await closeTestDb() })

// --- AC-22: handler fires only for paddle-origin (scheduling tested in subscription consumer) ---
// Here we test that the handler itself reads listing state correctly and routes to evaluateWinBack.

describe("win_back_evaluation handler", () => {
  it("emits winback_eligible when listing is active with high engagement", async () => {
    await seedTestUser(db, USER_ID)
    await createTestListing(db, USER_ID, { id: LISTING_ID })

    // Set high engagement
    await db.update(engagements)
      .set({ enquiriesReceived: 5, profileViews: 200 })
      .where(eq(engagements.listingId, LISTING_ID))

    const bus = createTestBus()
    const emitted: unknown[] = []
    bus.on({
      domain: "operations",
      eventType: "winback_eligible",
      mode: "async",
      handler: async (payload) => { emitted.push(payload) },
    })

    const registry = new ActionHandlerRegistry()
    registerWinBackEvaluationHandler(registry, {
      db,
      decisionLogDb: createDecisionLogDb(db),
      bus,
      waitUntilFn: (p) => { p.catch(() => {}) },
    })

    await invokeHandler(registry, "win_back_evaluation", {
      listingId: LISTING_ID,
      accountId: USER_ID,
    })

    // AC-25: payload matches EventPayloadMap
    expect(emitted).toHaveLength(1)
    const event = emitted[0] as Record<string, unknown>
    expect(event._brand).toBe("WinbackEligibleEvent")
    expect(event.listingId).toBe(LISTING_ID)
    expect(event.cancelledAccountId).toBe(USER_ID)
    expect(event.mergeFields).toBeDefined()
    expect(event.timestamp).toBeDefined()

    const mf = event.mergeFields as Record<string, unknown>
    expect(mf.subject).toBeDefined()
    expect(mf.body).toBeDefined()
    expect(mf.listingName).toBeDefined()
  })

  it("does not emit when listing is archived", async () => {
    await seedTestUser(db, USER_ID)
    await createTestListing(db, USER_ID, { id: LISTING_ID })

    await db.update(listings)
      .set({ lifecycleStatus: "archived" })
      .where(eq(listings.id, LISTING_ID))

    const bus = createTestBus()
    const emitted: unknown[] = []
    bus.on({
      domain: "operations",
      eventType: "winback_eligible",
      mode: "async",
      handler: async (payload) => { emitted.push(payload) },
    })

    const registry = new ActionHandlerRegistry()
    registerWinBackEvaluationHandler(registry, {
      db,
      decisionLogDb: createDecisionLogDb(db),
      bus,
      waitUntilFn: (p) => { p.catch(() => {}) },
    })

    await invokeHandler(registry, "win_back_evaluation", {
      listingId: LISTING_ID,
      accountId: USER_ID,
    })

    expect(emitted).toHaveLength(0)
  })

  it("does not emit when ownership changed", async () => {
    const OTHER_USER = makeUUID("069c")
    await seedTestUser(db, USER_ID)
    await seedTestUser(db, OTHER_USER, "other@test.com")
    await createTestListing(db, OTHER_USER, { id: LISTING_ID })

    await db.update(engagements)
      .set({ enquiriesReceived: 10 })
      .where(eq(engagements.listingId, LISTING_ID))

    const bus = createTestBus()
    const emitted: unknown[] = []
    bus.on({
      domain: "operations",
      eventType: "winback_eligible",
      mode: "async",
      handler: async (payload) => { emitted.push(payload) },
    })

    const registry = new ActionHandlerRegistry()
    registerWinBackEvaluationHandler(registry, {
      db,
      decisionLogDb: createDecisionLogDb(db),
      bus,
      waitUntilFn: (p) => { p.catch(() => {}) },
    })

    // USER_ID is the cancelled account, but OTHER_USER now owns the listing
    await invokeHandler(registry, "win_back_evaluation", {
      listingId: LISTING_ID,
      accountId: USER_ID,
    })

    expect(emitted).toHaveLength(0)
  })

  it("does not emit when engagement is low", async () => {
    await seedTestUser(db, USER_ID)
    await createTestListing(db, USER_ID, { id: LISTING_ID })

    // Default engagement is 0 — below thresholds

    const bus = createTestBus()
    const emitted: unknown[] = []
    bus.on({
      domain: "operations",
      eventType: "winback_eligible",
      mode: "async",
      handler: async (payload) => { emitted.push(payload) },
    })

    const registry = new ActionHandlerRegistry()
    registerWinBackEvaluationHandler(registry, {
      db,
      decisionLogDb: createDecisionLogDb(db),
      bus,
      waitUntilFn: (p) => { p.catch(() => {}) },
    })

    await invokeHandler(registry, "win_back_evaluation", {
      listingId: LISTING_ID,
      accountId: USER_ID,
    })

    expect(emitted).toHaveLength(0)
  })

  it("silently returns when listing is deleted", async () => {
    // No listing seeded — handler should not throw
    const bus = createTestBus()
    const registry = new ActionHandlerRegistry()
    registerWinBackEvaluationHandler(registry, {
      db,
      decisionLogDb: createDecisionLogDb(db),
      bus,
      waitUntilFn: (p) => { p.catch(() => {}) },
    })

    await expect(invokeHandler(registry, "win_back_evaluation", {
      listingId: LISTING_ID,
      accountId: USER_ID,
    })).resolves.toBeUndefined()
  })

  // AC-28: decision log for every invocation
  it("writes decision log entry on every invocation", async () => {
    await seedTestUser(db, USER_ID)
    await createTestListing(db, USER_ID, { id: LISTING_ID })

    const bus = createTestBus()
    const registry = new ActionHandlerRegistry()
    registerWinBackEvaluationHandler(registry, {
      db,
      decisionLogDb: createDecisionLogDb(db),
      bus,
      waitUntilFn: (p) => { p.catch(() => {}) },
    })

    await invokeHandler(registry, "win_back_evaluation", {
      listingId: LISTING_ID,
      accountId: USER_ID,
    })

    const logs = await db.select().from(decisionLogs)
      .where(eq(decisionLogs.decisionType, "winback_evaluation"))

    expect(logs).toHaveLength(1)
    expect(logs[0].domain).toBe("commercial")
    expect(logs[0].listingId).toBe(LISTING_ID)
    const inputs = logs[0].inputs as Record<string, unknown>
    expect(inputs.cancelledAccountId).toBe(USER_ID)
  })
})

// --- AC-26: cancellation of pending win_back_evaluation deferred actions ---

describe("cancelWinBackSchedules", () => {
  it("cancels pending win_back_evaluation for specified listing IDs", async () => {
    const schedulerDb = createSchedulerDb(db)
    const LIST_A = makeUUID("069d")
    const LIST_B = makeUUID("069e")

    await scheduleDeferredAction(schedulerDb, {
      action: "win_back_evaluation",
      params: { listingId: LIST_A, accountId: USER_ID },
      executeAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
      retryPolicy: "retry_3",
      onFailure: "log",
      createdBy: "commercial",
    })

    await scheduleDeferredAction(schedulerDb, {
      action: "win_back_evaluation",
      params: { listingId: LIST_B, accountId: USER_ID },
      executeAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
      retryPolicy: "retry_3",
      onFailure: "log",
      createdBy: "commercial",
    })

    const cancelled = await cancelWinBackSchedules(schedulerDb, [LIST_A, LIST_B], "claim_approved")
    expect(cancelled).toBe(2)

    // Verify none remain pending
    const pending = await db.select().from(deferredActions)
      .where(eq(deferredActions.status, "pending"))
    expect(pending).toHaveLength(0)
  })

  it("returns 0 when no matching actions exist", async () => {
    const schedulerDb = createSchedulerDb(db)
    const cancelled = await cancelWinBackSchedules(schedulerDb, [LISTING_ID], "erasure_completed")
    expect(cancelled).toBe(0)
  })
})

// --- AC-27: win-back attribution ---

describe("checkWinBackAttribution", () => {
  it("writes win_back_converted when resubscription occurs within 90 days of win_back_sent", async () => {
    await seedTestUser(db, USER_ID)
    await createTestListing(db, USER_ID, { id: LISTING_ID })

    // Insert a win_back_sent entry 30 days ago
    const sentDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    await db.insert(churnAnalysisLog).values({
      listingId: LISTING_ID,
      accountId: USER_ID,
      eventType: "win_back_sent",
      reason: "winback_email_delivered",
      createdAt: sentDate,
    })

    const attributed = await checkWinBackAttribution(db, LISTING_ID, USER_ID)
    expect(attributed).toBe(true)

    // Verify win_back_converted entry written
    const converted = await db.select().from(churnAnalysisLog)
      .where(eq(churnAnalysisLog.eventType, "win_back_converted"))
    expect(converted).toHaveLength(1)
    expect(converted[0].listingId).toBe(LISTING_ID)
    expect(converted[0].accountId).toBe(USER_ID)
    expect(converted[0].reason).toBe("resubscription_within_90d")

    const metadata = converted[0].metadata as Record<string, unknown>
    expect(metadata.daysBetween).toBeDefined()
    expect(metadata.resubscribedAt).toBeDefined()
  })

  it("returns false when no win_back_sent entry exists within 90 days", async () => {
    await seedTestUser(db, USER_ID)
    await createTestListing(db, USER_ID, { id: LISTING_ID })

    const attributed = await checkWinBackAttribution(db, LISTING_ID, USER_ID)
    expect(attributed).toBe(false)

    // No win_back_converted entry written
    const converted = await db.select().from(churnAnalysisLog)
      .where(eq(churnAnalysisLog.eventType, "win_back_converted"))
    expect(converted).toHaveLength(0)
  })

  it("returns false when win_back_sent is older than 90 days", async () => {
    await seedTestUser(db, USER_ID)
    await createTestListing(db, USER_ID, { id: LISTING_ID })

    // Insert a win_back_sent entry 100 days ago
    const sentDate = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000)
    await db.insert(churnAnalysisLog).values({
      listingId: LISTING_ID,
      accountId: USER_ID,
      eventType: "win_back_sent",
      reason: "winback_email_delivered",
      createdAt: sentDate,
    })

    const attributed = await checkWinBackAttribution(db, LISTING_ID, USER_ID)
    expect(attributed).toBe(false)
  })
})
