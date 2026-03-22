// Integration tests — CS-WORK-068: Churn detection and intervention
// AC-14 (via direct call), AC-16, AC-18, AC-19, AC-20, AC-21

import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest"
import { eq, and } from "drizzle-orm"
import { getTestDb, resetDb, closeTestDb } from "@/db/test-utils"
import {
  seedTestUser,
  createTestListing,
  makeUUID,
  createDecisionLogDb,
} from "@/db/test-fixtures"
import { churnAnalysisLog, commercialState } from "@/db/schema/commercial"
import { decisionLogs } from "@/db/schema/shared"
import {
  evaluateChurnIntervention,
  logChurnEvent,
  logChurnInterventionDecision,
  type ChurnInterventionInput,
} from "../churn-intervention"

let db: ReturnType<typeof getTestDb>

const USER_ID = makeUUID("068a")
const LISTING_ID = makeUUID("068b")

beforeAll(() => { db = getTestDb() })
beforeEach(async () => { await resetDb() })
afterAll(async () => { await closeTestDb() })

function makeInput(overrides: Partial<ChurnInterventionInput> = {}): ChurnInterventionInput {
  return {
    listingId: LISTING_ID,
    accountId: USER_ID,
    cancellationReason: "voluntary",
    previousTier: "standard",
    recentEngagement: { profileViews: 0, searchAppearances: 0, enquiriesReceived: 0 },
    subscriptionStartDate: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
    lastChurnEventAt: null,
    ...overrides,
  }
}

// AC-20: Every churn path writes to churn_analysis_log
describe("logChurnEvent", () => {
  it("writes voluntary churn with negative annualRevenue for standard tier", async () => {
    await seedTestUser(db, USER_ID)
    await createTestListing(db, USER_ID, { id: LISTING_ID })

    await logChurnEvent(db, {
      listingId: LISTING_ID,
      accountId: USER_ID,
      eventType: "churn",
      reason: "voluntary",
      subscriptionTier: "standard",
      metadata: { origin: "paddle" },
    })

    const [row] = await db.select().from(churnAnalysisLog)
      .where(eq(churnAnalysisLog.listingId, LISTING_ID))
    expect(row.eventType).toBe("churn")
    expect(row.reason).toBe("voluntary")
    expect(row.subscriptionTier).toBe("standard")
    expect(row.annualRevenue).toBe(-199)
  })

  it("writes payment_failure churn with negative annualRevenue for premium tier", async () => {
    await seedTestUser(db, USER_ID)
    await createTestListing(db, USER_ID, { id: LISTING_ID })

    await logChurnEvent(db, {
      listingId: LISTING_ID,
      accountId: USER_ID,
      eventType: "churn",
      reason: "payment_failure",
      subscriptionTier: "premium",
      metadata: { origin: "paddle", riskFactors: ["payment_at_risk"] },
    })

    const [row] = await db.select().from(churnAnalysisLog)
      .where(eq(churnAnalysisLog.listingId, LISTING_ID))
    expect(row.annualRevenue).toBe(-399)
  })

  it("writes partner tier churn with -699 annualRevenue", async () => {
    await seedTestUser(db, USER_ID)
    await createTestListing(db, USER_ID, { id: LISTING_ID })

    await logChurnEvent(db, {
      listingId: LISTING_ID,
      accountId: USER_ID,
      eventType: "churn",
      reason: "paddle_reconciliation",
      subscriptionTier: "partner",
      metadata: { origin: "paddle" },
    })

    const [row] = await db.select().from(churnAnalysisLog)
      .where(eq(churnAnalysisLog.listingId, LISTING_ID))
    expect(row.annualRevenue).toBe(-699)
  })

  it("writes account_closed churn", async () => {
    await seedTestUser(db, USER_ID)
    await createTestListing(db, USER_ID, { id: LISTING_ID })

    await logChurnEvent(db, {
      listingId: LISTING_ID,
      accountId: USER_ID,
      eventType: "churn",
      reason: "account_closed",
      subscriptionTier: "standard",
      metadata: { origin: "closure" },
    })

    const [row] = await db.select().from(churnAnalysisLog)
      .where(eq(churnAnalysisLog.listingId, LISTING_ID))
    expect(row.reason).toBe("account_closed")
    expect(row.annualRevenue).toBe(-199)
  })

  it("writes listing_archived churn", async () => {
    await seedTestUser(db, USER_ID)
    await createTestListing(db, USER_ID, { id: LISTING_ID })

    await logChurnEvent(db, {
      listingId: LISTING_ID,
      accountId: USER_ID,
      eventType: "churn",
      reason: "listing_archived",
      subscriptionTier: "premium",
      metadata: { origin: "archival" },
    })

    const [row] = await db.select().from(churnAnalysisLog)
      .where(eq(churnAnalysisLog.listingId, LISTING_ID))
    expect(row.reason).toBe("listing_archived")
    expect(row.annualRevenue).toBe(-399)
  })

  it("writes retention_save with null annualRevenue", async () => {
    await seedTestUser(db, USER_ID)
    await createTestListing(db, USER_ID, { id: LISTING_ID })

    await logChurnEvent(db, {
      listingId: LISTING_ID,
      accountId: USER_ID,
      eventType: "renewal",
      reason: "retention_save",
      subscriptionTier: "standard",
      metadata: { retentionDataShown: true },
    })

    const [row] = await db.select().from(churnAnalysisLog)
      .where(eq(churnAnalysisLog.listingId, LISTING_ID))
    expect(row.eventType).toBe("renewal")
    expect(row.annualRevenue).toBeNull()
  })

  it("writes 0 annualRevenue for free tier churn", async () => {
    await seedTestUser(db, USER_ID)
    await createTestListing(db, USER_ID, { id: LISTING_ID })

    await logChurnEvent(db, {
      listingId: LISTING_ID,
      accountId: USER_ID,
      eventType: "churn",
      reason: "voluntary",
      subscriptionTier: "free",
    })

    const [row] = await db.select().from(churnAnalysisLog)
      .where(eq(churnAnalysisLog.listingId, LISTING_ID))
    expect(row.annualRevenue).toBe(0)
  })

  it("updates commercial_state with lastChurnEventAt on churn", async () => {
    await seedTestUser(db, USER_ID)
    await createTestListing(db, USER_ID, { id: LISTING_ID })

    await logChurnEvent(db, {
      listingId: LISTING_ID,
      accountId: USER_ID,
      eventType: "churn",
      reason: "voluntary",
      subscriptionTier: "standard",
    })

    const [state] = await db.select().from(commercialState)
      .where(eq(commercialState.listingId, LISTING_ID))
    expect(state).toBeTruthy()
    expect(state.lastChurnEventAt).toBeTruthy()
    expect(state.lastChurnReason).toBe("voluntary")
  })

  it("creates commercial_state row if none exists", async () => {
    await seedTestUser(db, USER_ID)
    await createTestListing(db, USER_ID, { id: LISTING_ID })

    // No pre-existing commercial_state row
    const before = await db.select().from(commercialState)
      .where(eq(commercialState.listingId, LISTING_ID))
    expect(before).toHaveLength(0)

    await logChurnEvent(db, {
      listingId: LISTING_ID,
      accountId: USER_ID,
      eventType: "churn",
      reason: "payment_failure",
      subscriptionTier: "premium",
    })

    const after = await db.select().from(commercialState)
      .where(eq(commercialState.listingId, LISTING_ID))
    expect(after).toHaveLength(1)
    expect(after[0].lastChurnReason).toBe("payment_failure")
  })
})

// AC-21: Every evaluateChurnIntervention invocation produces a DecisionLog entry
describe("logChurnInterventionDecision", () => {
  it("logs churn_intervention decision for accept outcome", async () => {
    await seedTestUser(db, USER_ID)
    const decisionLogDb = createDecisionLogDb(db)

    const input = makeInput({ cancellationReason: "voluntary" })
    const result = evaluateChurnIntervention(input)

    await logChurnInterventionDecision(decisionLogDb, input, result)

    const rows = await db.select().from(decisionLogs)
      .where(
        and(
          eq(decisionLogs.domain, "commercial"),
          eq(decisionLogs.decisionType, "churn_intervention"),
        ),
      )
    expect(rows).toHaveLength(1)
    expect(rows[0].listingId).toBe(LISTING_ID)
    expect(rows[0].accountId).toBe(USER_ID)

    const inputs = rows[0].inputs as Record<string, unknown>
    expect(inputs.cancellationReason).toBe("voluntary")
    expect(inputs.previousTier).toBe("standard")

    const output = rows[0].output as Record<string, unknown>
    expect(output.action).toBe("accept")
  })

  it("logs churn_intervention decision for show_retention_data outcome", async () => {
    await seedTestUser(db, USER_ID)
    const decisionLogDb = createDecisionLogDb(db)

    const input = makeInput({
      recentEngagement: { profileViews: 100, searchAppearances: 50, enquiriesReceived: 5 },
    })
    const result = evaluateChurnIntervention(input)

    await logChurnInterventionDecision(decisionLogDb, input, result)

    const rows = await db.select().from(decisionLogs)
      .where(eq(decisionLogs.decisionType, "churn_intervention"))
    expect(rows).toHaveLength(1)

    const inputs = rows[0].inputs as Record<string, unknown>
    expect(inputs.recentEnquiries).toBe(5)
    expect(inputs.recentViews).toBe(100)

    const output = rows[0].output as Record<string, unknown>
    expect(output.action).toBe("show_retention_data")
  })

  it("logs churn_intervention decision for grace_period outcome", async () => {
    await seedTestUser(db, USER_ID)
    const decisionLogDb = createDecisionLogDb(db)

    const input = makeInput({ cancellationReason: "payment_failure" })
    const result = evaluateChurnIntervention(input)

    await logChurnInterventionDecision(decisionLogDb, input, result)

    const rows = await db.select().from(decisionLogs)
      .where(eq(decisionLogs.decisionType, "churn_intervention"))
    expect(rows).toHaveLength(1)

    const output = rows[0].output as Record<string, unknown>
    expect(output.action).toBe("grace_period")
  })

  it("captures subscriptionAgeDays in inputs", async () => {
    await seedTestUser(db, USER_ID)
    const decisionLogDb = createDecisionLogDb(db)

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const input = makeInput({ subscriptionStartDate: thirtyDaysAgo })
    const result = evaluateChurnIntervention(input)

    await logChurnInterventionDecision(decisionLogDb, input, result)

    const rows = await db.select().from(decisionLogs)
      .where(eq(decisionLogs.decisionType, "churn_intervention"))
    const inputs = rows[0].inputs as Record<string, unknown>
    const ageDays = inputs.subscriptionAgeDays as number
    expect(ageDays).toBeGreaterThanOrEqual(29)
    expect(ageDays).toBeLessThanOrEqual(31)
  })
})
