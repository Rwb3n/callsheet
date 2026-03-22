// S4 → S8 migration: subscription_ended consumer tests updated for full S8 implementation
// Tests AC-67 (origin branch), AC-69 (commercial_state upsert) from CS-WORK-073.
// Full AC coverage is in the main consumers.integration.test.ts file.

import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest"
import { eq } from "drizzle-orm"
import { getTestDb, resetDb, closeTestDb } from "@/db/test-utils"
import { createSchedulerDb, createDecisionLogDb, makeUUID, seedTestUser, createTestListing } from "@/db/test-fixtures"
import { deferredActions, decisionLogs } from "@/db/schema/shared"
import { churnAnalysisLog, commercialState } from "@/db/schema/commercial"
import { InProcessEventBus } from "@/lib/events/bus"
import type { EventConsumerError } from "@/lib/events/types"
import { subscriptionEndedHandler } from "../subscription-ended"

let db: ReturnType<typeof getTestDb>

const ACCOUNT_ID = makeUUID("043a")

beforeAll(() => { db = getTestDb() })
beforeEach(async () => { await resetDb(); await seedTestUser(db, ACCOUNT_ID) })
afterAll(async () => { await closeTestDb() })

function makeBus() {
  return new InProcessEventBus({
    logError: vi.fn<(err: EventConsumerError) => Promise<void>>().mockResolvedValue(undefined),
  })
}

describe("subscription_ended consumer", () => {
  it("schedules win_back_evaluation and logs churn when origin is paddle", async () => {
    const listing = await createTestListing(db, ACCOUNT_ID, { subscriptionTier: "premium" })
    const bus = makeBus()
    const handler = subscriptionEndedHandler({
      db,
      schedulerDb: createSchedulerDb(db),
      decisionLogDb: createDecisionLogDb(db),
      bus,
      waitUntilFn: (p) => { p.catch(() => {}) },
    })

    await handler.handler({
      _brand: "SubscriptionEndedEvent" as const,
      listingId: listing.id,
      accountId: ACCOUNT_ID,
      previousTier: "premium",
      reason: "cancellation",
      origin: "paddle",
      timestamp: new Date().toISOString(),
    })

    const actions = await db.select().from(deferredActions)
      .where(eq(deferredActions.action, "win_back_evaluation"))
    expect(actions).toHaveLength(1)

    const logs = await db.select().from(churnAnalysisLog)
      .where(eq(churnAnalysisLog.listingId, listing.id))
    expect(logs).toHaveLength(1)
    expect(logs[0].eventType).toBe("churn")

    const [state] = await db.select().from(commercialState)
      .where(eq(commercialState.listingId, listing.id))
    expect(state.lastChurnReason).toBe("cancellation")
  })

  it("does not schedule win_back_evaluation when origin is archival", async () => {
    const listing = await createTestListing(db, ACCOUNT_ID, { subscriptionTier: "standard" })
    const bus = makeBus()
    const handler = subscriptionEndedHandler({
      db,
      schedulerDb: createSchedulerDb(db),
      decisionLogDb: createDecisionLogDb(db),
      bus,
      waitUntilFn: (p) => { p.catch(() => {}) },
    })

    await handler.handler({
      _brand: "SubscriptionEndedEvent" as const,
      listingId: listing.id,
      accountId: ACCOUNT_ID,
      previousTier: "standard",
      reason: "cancellation",
      origin: "archival",
      timestamp: new Date().toISOString(),
    })

    const actions = await db.select().from(deferredActions)
      .where(eq(deferredActions.action, "win_back_evaluation"))
    expect(actions).toHaveLength(0)

    // Churn still logged
    const logs = await db.select().from(churnAnalysisLog)
      .where(eq(churnAnalysisLog.listingId, listing.id))
    expect(logs).toHaveLength(1)
  })

  it("does not schedule win_back_evaluation when origin is closure", async () => {
    const listing = await createTestListing(db, ACCOUNT_ID, { subscriptionTier: "premium" })
    const bus = makeBus()
    const handler = subscriptionEndedHandler({
      db,
      schedulerDb: createSchedulerDb(db),
      decisionLogDb: createDecisionLogDb(db),
      bus,
      waitUntilFn: (p) => { p.catch(() => {}) },
    })

    await handler.handler({
      _brand: "SubscriptionEndedEvent" as const,
      listingId: listing.id,
      accountId: ACCOUNT_ID,
      previousTier: "premium",
      reason: "account_closure",
      origin: "closure",
      timestamp: new Date().toISOString(),
    })

    const actions = await db.select().from(deferredActions)
      .where(eq(deferredActions.action, "win_back_evaluation"))
    expect(actions).toHaveLength(0)
  })
})
