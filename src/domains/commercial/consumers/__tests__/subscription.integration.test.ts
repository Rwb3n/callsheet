// AC-43: CR subscription_ended consumer schedules win_back_evaluation only when origin === "paddle"

import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest"
import { eq } from "drizzle-orm"
import { getTestDb, resetDb, closeTestDb } from "@/db/test-utils"
import { createSchedulerDb, createDecisionLogDb, makeUUID } from "@/db/test-fixtures"
import { deferredActions } from "@/db/schema/shared"
import { subscriptionEndedChurnAndWinbackHandler } from "../subscription"

let db: ReturnType<typeof getTestDb>

const ACCOUNT_ID = makeUUID("043a")

beforeAll(() => { db = getTestDb() })
beforeEach(async () => { await resetDb() })
afterAll(async () => { await closeTestDb() })

describe("subscription_ended churnAndWinback consumer", () => {
  // AC-43: schedules win_back_evaluation only when origin === "paddle"
  it("schedules win_back_evaluation when origin is paddle", async () => {
    const handler = subscriptionEndedChurnAndWinbackHandler({
      schedulerDb: createSchedulerDb(db),
      decisionLogDb: createDecisionLogDb(db),
    })

    await handler.handler({
      _brand: "SubscriptionEndedEvent" as const,
      listingId: makeUUID("043b"),
      accountId: ACCOUNT_ID,
      previousTier: "premium",
      reason: "cancellation",
      origin: "paddle",
      timestamp: new Date().toISOString(),
    })

    // win_back_evaluation scheduled
    const actions = await db.select().from(deferredActions)
      .where(eq(deferredActions.action, "win_back_evaluation"))
    expect(actions).toHaveLength(1)
    expect(actions[0].createdBy).toBe("commercial")

    // Churn decision logged
    const decisions = await db.select().from(
      (await import("@/db/schema/shared")).decisionLogs,
    )
    const churnDecisions = decisions.filter(
      (d) => d.decisionType === "churn_event_evaluation",
    )
    expect(churnDecisions).toHaveLength(1)
  })

  it("does not schedule win_back_evaluation when origin is archival", async () => {
    const handler = subscriptionEndedChurnAndWinbackHandler({
      schedulerDb: createSchedulerDb(db),
      decisionLogDb: createDecisionLogDb(db),
    })

    await handler.handler({
      _brand: "SubscriptionEndedEvent" as const,
      listingId: makeUUID("043c"),
      accountId: ACCOUNT_ID,
      previousTier: "standard",
      reason: "cancellation",
      origin: "archival",
      timestamp: new Date().toISOString(),
    })

    // No win_back_evaluation scheduled
    const actions = await db.select().from(deferredActions)
      .where(eq(deferredActions.action, "win_back_evaluation"))
    expect(actions).toHaveLength(0)

    // Churn still logged
    const decisions = await db.select().from(
      (await import("@/db/schema/shared")).decisionLogs,
    )
    const churnDecisions = decisions.filter(
      (d) => d.decisionType === "churn_event_evaluation",
    )
    expect(churnDecisions).toHaveLength(1)
  })

  it("does not schedule win_back_evaluation when origin is closure", async () => {
    const handler = subscriptionEndedChurnAndWinbackHandler({
      schedulerDb: createSchedulerDb(db),
      decisionLogDb: createDecisionLogDb(db),
    })

    await handler.handler({
      _brand: "SubscriptionEndedEvent" as const,
      listingId: makeUUID("043d"),
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
