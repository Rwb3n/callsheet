// Entity learning + commercial intelligence integration tests — CS-WORK-080
// AC-70, AC-72, AC-73, AC-74, AC-76, AC-79, AC-82, AC-84
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest"
import { eq, sql } from "drizzle-orm"
import { getTestDb, resetDb, closeTestDb } from "@/db/test-utils"
import {
  seedTestUser,
  createTestListing,
  makeUUID,
  createMockDecisionLogDb,
  createSchedulerDb,
  createDecisionLogDb,
  createTestBus,
} from "@/db/test-fixtures"
import { ActionHandlerRegistry } from "@/lib/scheduler"
import { invokeHandler } from "./invoke-handler"
import { ceremonyRuns, learningHypotheses, perceptionAggregates } from "@/db/schema/intelligence"
import { churnAnalysisLog, commercialState } from "@/db/schema/commercial"
import { churnRiskRegistry } from "@/db/schema/operations"
import { decisionLogs } from "@/db/schema/shared"
import { listings } from "@/db/schema/data-and-listings"

// Import handlers
import { registerLearningHypothesisAnalysisHandler } from "../learning-hypothesis-analysis"
import { registerProactiveChurnDetectionHandler } from "../proactive-churn-detection"
import { registerRevenueHealthExtendedHandler } from "../revenue-health-extended"
import { registerOperationalHealthReviewHandler } from "../operational-health-review"

let db: ReturnType<typeof getTestDb>

const ACCOUNT_ID = "acct-entity-learn-001"
const LISTING_ID = makeUUID("entity-learn-01")

function createMockSchedulerDb() {
  const scheduled: Array<{
    action: string
    params: Record<string, unknown>
    executeAt: Date
  }> = []
  return {
    db: {
      insert: async (row: Record<string, unknown>) => {
        scheduled.push({
          action: row.action as string,
          params: row.params as Record<string, unknown>,
          executeAt: row.executeAt as Date,
        })
        return "mock-scheduled-id"
      },
      cancelMatching: async () => 0,
      findPending: async () => null,
    },
    getScheduled: () => scheduled,
    clear: () => { scheduled.length = 0 },
  }
}

beforeAll(async () => {
  db = getTestDb()
})

beforeEach(async () => {
  await resetDb()
})

afterAll(async () => {
  await closeTestDb()
})

describe("learning_hypothesis_analysis handler", () => {
  it("AC-70: updates all 7 rows L1-L7 with currentValue, previousValue, trend, lastMeasuredAt", async () => {
    await seedTestUser(db, ACCOUNT_ID)
    await createTestListing(db, ACCOUNT_ID, { id: LISTING_ID })

    // Seed learning hypotheses (normally done by custom-sql)
    const hypothesisIds = ["L1", "L2", "L3", "L4", "L5", "L6", "L7"]
    for (const id of hypothesisIds) {
      await db.insert(learningHypotheses).values({
        id,
        hypothesis: `Hypothesis ${id}`,
        measurementQuery: `query for ${id}`,
        currentValue: "42",
        updatedAt: new Date(),
      })
    }

    // Seed some decision logs for L1's decisionType ("claim_evaluation")
    for (let i = 0; i < 15; i++) {
      await db.insert(decisionLogs).values({
        domain: "data-and-listings",
        decisionType: "claim_evaluation",
        inputs: { test: true },
        output: { result: "ok" },
        confidence: 80,
      })
    }

    const registry = new ActionHandlerRegistry()
    const scheduler = createMockSchedulerDb()
    const decisionLog = createMockDecisionLogDb()

    registerLearningHypothesisAnalysisHandler(registry, {
      db,
      schedulerDb: scheduler.db,
      decisionLogDb: decisionLog.db,
    })

    await invokeHandler(registry, "learning_hypothesis_analysis", {} as Record<string, never>)

    // Verify all 7 rows updated
    const rows = await db.select().from(learningHypotheses)
    expect(rows).toHaveLength(7)

    for (const row of rows) {
      expect(row.lastMeasuredAt).not.toBeNull()
      expect(row.updatedAt).not.toBeNull()

      if (row.id === "L1" || row.id === "L2") {
        // L1 and L2 both map to claim_evaluation → both get 15
        expect(parseFloat(row.currentValue!)).toBe(15)
        expect(parseFloat(row.previousValue!)).toBe(42)
        expect(row.trend).not.toBeNull()
      } else {
        // Other hypotheses had 0 decision logs → currentValue should be 0
        expect(parseFloat(row.currentValue!)).toBe(0)
        expect(parseFloat(row.previousValue!)).toBe(42)
      }
    }
  })

  it("AC-84: logs ceremony run with ceremonyType, outputs JSONB, correct inputsHash", async () => {
    // Seed learning hypotheses
    for (const id of ["L1", "L2", "L3", "L4", "L5", "L6", "L7"]) {
      await db.insert(learningHypotheses).values({
        id,
        hypothesis: `Hypothesis ${id}`,
        measurementQuery: `query for ${id}`,
        updatedAt: new Date(),
      })
    }

    const registry = new ActionHandlerRegistry()
    const scheduler = createMockSchedulerDb()
    const decisionLog = createMockDecisionLogDb()

    registerLearningHypothesisAnalysisHandler(registry, {
      db,
      schedulerDb: scheduler.db,
      decisionLogDb: decisionLog.db,
    })

    await invokeHandler(registry, "learning_hypothesis_analysis", {} as Record<string, never>)

    // Verify ceremony run logged
    const runs = await db
      .select()
      .from(ceremonyRuns)
      .where(eq(ceremonyRuns.ceremonyType, "learning_hypothesis_analysis"))

    expect(runs).toHaveLength(1)
    expect(runs[0].status).toBe("completed")
    expect(runs[0].inputsHash).toBeTruthy()

    const outputs = runs[0].outputs as Record<string, unknown>
    expect(outputs).toHaveProperty("measurements")
    const measurements = outputs.measurements as Array<Record<string, unknown>>
    expect(measurements).toHaveLength(7)

    // Verify next run scheduled
    expect(scheduler.getScheduled()).toHaveLength(1)
    expect(scheduler.getScheduled()[0].action).toBe("learning_hypothesis_analysis")
  })
})

describe("proactive_churn_detection handler", () => {
  it("AC-72: detects engagement_dropping when views decline >30% over 30 days", async () => {
    await seedTestUser(db, ACCOUNT_ID)
    await createTestListing(db, ACCOUNT_ID, {
      id: LISTING_ID,
      subscriptionTier: "premium",
    })

    const now = new Date()
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000)

    // Previous period: 100 views
    await db.insert(perceptionAggregates).values({
      listingId: LISTING_ID,
      aggregateType: "viewer_demographics",
      periodStart: sixtyDaysAgo.toISOString().slice(0, 10),
      periodEnd: thirtyDaysAgo.toISOString().slice(0, 10),
      data: { totalViews: 100 },
      sampleSize: 100,
    })

    // Current period: 60 views (40% decline > 30% threshold)
    await db.insert(perceptionAggregates).values({
      listingId: LISTING_ID,
      aggregateType: "viewer_demographics",
      periodStart: thirtyDaysAgo.toISOString().slice(0, 10),
      periodEnd: now.toISOString().slice(0, 10),
      data: { totalViews: 60 },
      sampleSize: 60,
    })

    const registry = new ActionHandlerRegistry()
    const scheduler = createMockSchedulerDb()
    const decisionLog = createDecisionLogDb(db)
    const bus = createTestBus()

    registerProactiveChurnDetectionHandler(registry, {
      db,
      schedulerDb: scheduler.db,
      decisionLogDb: decisionLog,
      bus,
      waitUntilFn: (p) => { p.catch(() => {}) },
    })

    await invokeHandler(registry, "proactive_churn_detection", {} as Record<string, never>)

    // Verify decision logged with engagement_dropping
    const decisions = await db
      .select()
      .from(decisionLogs)
      .where(eq(decisionLogs.decisionType, "proactive_churn_detection"))

    expect(decisions.length).toBeGreaterThanOrEqual(1)
    const inputs = decisions[0].inputs as Record<string, unknown>
    expect(inputs.factor).toBe("engagement_dropping")
  })

  it("AC-73: detects billing_cadence_switch_to_monthly within 7 days", async () => {
    await seedTestUser(db, ACCOUNT_ID)
    await createTestListing(db, ACCOUNT_ID, {
      id: LISTING_ID,
      subscriptionTier: "standard",
    })

    // Insert churn_analysis_log entry for cadence change
    await db.insert(churnAnalysisLog).values({
      listingId: LISTING_ID,
      accountId: makeUUID("entity-learn-01"),
      eventType: "cadence_change",
      metadata: { previousCadence: "annual", newCadence: "monthly" },
      createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), // 3 days ago
    })

    const registry = new ActionHandlerRegistry()
    const scheduler = createMockSchedulerDb()
    const decisionLog = createDecisionLogDb(db)
    const bus = createTestBus()

    registerProactiveChurnDetectionHandler(registry, {
      db,
      schedulerDb: scheduler.db,
      decisionLogDb: decisionLog,
      bus,
      waitUntilFn: (p) => { p.catch(() => {}) },
    })

    await invokeHandler(registry, "proactive_churn_detection", {} as Record<string, never>)

    const decisions = await db
      .select()
      .from(decisionLogs)
      .where(eq(decisionLogs.decisionType, "proactive_churn_detection"))

    expect(decisions.length).toBeGreaterThanOrEqual(1)
    const hasSwitch = decisions.some(d => {
      const inputs = d.inputs as Record<string, unknown>
      return inputs.factor === "billing_cadence_switch_to_monthly"
    })
    expect(hasSwitch).toBe(true)
  })

  it("AC-74: emits churn_risk_detected when overallRisk >= medium", async () => {
    await seedTestUser(db, ACCOUNT_ID)
    await createTestListing(db, ACCOUNT_ID, {
      id: LISTING_ID,
      subscriptionTier: "premium",
    })

    // cadence switch triggers medium risk (single non-payment factor)
    await db.insert(churnAnalysisLog).values({
      listingId: LISTING_ID,
      accountId: makeUUID("entity-learn-01"),
      eventType: "cadence_change",
      metadata: { previousCadence: "annual", newCadence: "monthly" },
      createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    })

    const registry = new ActionHandlerRegistry()
    const scheduler = createMockSchedulerDb()
    const decisionLog = createDecisionLogDb(db)

    // Track emitted events
    let emittedEvent: Record<string, unknown> | null = null
    const bus = createTestBus()
    const origEmit = bus.emit.bind(bus)
    bus.emit = (async (...args: Parameters<typeof bus.emit>) => {
      if (args[0] === "churn_risk_detected") {
        emittedEvent = args[1] as unknown as Record<string, unknown>
      }
      return origEmit(...args)
    }) as typeof bus.emit

    registerProactiveChurnDetectionHandler(registry, {
      db,
      schedulerDb: scheduler.db,
      decisionLogDb: decisionLog,
      bus,
      waitUntilFn: (p) => { p.catch(() => {}) },
    })

    await invokeHandler(registry, "proactive_churn_detection", {} as Record<string, never>)

    // Verify event emitted
    expect(emittedEvent).not.toBeNull()
    expect(emittedEvent!.listingId).toBe(LISTING_ID)
    expect(emittedEvent!._brand).toBe("ChurnRiskDetectedEvent")
    expect(emittedEvent!.riskFactors).toContain("billing_cadence_switch_to_monthly")
  })

  it("AC-76: logs decision for every invocation (clean scan)", async () => {
    await seedTestUser(db, ACCOUNT_ID)

    const registry = new ActionHandlerRegistry()
    const scheduler = createMockSchedulerDb()
    const decisionLog = createDecisionLogDb(db)
    const bus = createTestBus()

    registerProactiveChurnDetectionHandler(registry, {
      db,
      schedulerDb: scheduler.db,
      decisionLogDb: decisionLog,
      bus,
      waitUntilFn: (p) => { p.catch(() => {}) },
    })

    await invokeHandler(registry, "proactive_churn_detection", {} as Record<string, never>)

    // Even with no signals, a clean-scan decision should be logged
    const decisions = await db
      .select()
      .from(decisionLogs)
      .where(eq(decisionLogs.decisionType, "proactive_churn_detection"))

    expect(decisions).toHaveLength(1)
    const inputs = decisions[0].inputs as Record<string, unknown>
    expect(inputs.scanType).toBe("weekly_proactive")

    // Verify self-scheduling
    expect(scheduler.getScheduled().length).toBeGreaterThanOrEqual(1)
    expect(scheduler.getScheduled().some(s => s.action === "proactive_churn_detection")).toBe(true)
  })
})

describe("revenue_health_extended handler", () => {
  it("AC-79: computes all 8 S9 extension fields and writes to commercial_state", async () => {
    await seedTestUser(db, ACCOUNT_ID)
    await createTestListing(db, ACCOUNT_ID, {
      id: LISTING_ID,
      subscriptionTier: "premium",
      lifecycleStatus: "active",
    })

    // Create a commercial_state row for this listing
    await db.insert(commercialState).values({
      listingId: LISTING_ID,
    })

    // Add some churn data
    await db.insert(churnAnalysisLog).values({
      listingId: LISTING_ID,
      accountId: makeUUID("entity-learn-01"),
      eventType: "churn",
      subscriptionTier: "premium",
      annualRevenue: 699,
    })

    const registry = new ActionHandlerRegistry()
    const scheduler = createMockSchedulerDb()
    const decisionLog = createMockDecisionLogDb()

    registerRevenueHealthExtendedHandler(registry, {
      db,
      schedulerDb: scheduler.db,
      decisionLogDb: decisionLog.db,
    })

    await invokeHandler(registry, "revenue_health_extended", {} as Record<string, never>)

    // Verify commercial_state updated with extended fields
    const [state] = await db
      .select({ revenueHealthExtended: commercialState.revenueHealthExtended })
      .from(commercialState)
      .where(eq(commercialState.listingId, LISTING_ID))

    expect(state.revenueHealthExtended).not.toBeNull()
    const ext = state.revenueHealthExtended!
    expect(ext).toHaveProperty("churnByTier")
    expect(ext).toHaveProperty("annualRenewalRate")
    expect(ext).toHaveProperty("ltv")
    expect(ext.cac).toBe(0) // AC-80 verified here too
    expect(ext).toHaveProperty("discountCohortDivergence")
    expect(ext).toHaveProperty("downgradeToPaidChurnRatio")
    expect(ext).toHaveProperty("averageSubscriptionLifetimeDays")
    expect(ext).toHaveProperty("secondaryListingChurnRate")

    // Verify ceremony run logged
    const runs = await db
      .select()
      .from(ceremonyRuns)
      .where(eq(ceremonyRuns.ceremonyType, "revenue_review"))

    expect(runs).toHaveLength(1)
    expect(runs[0].status).toBe("completed")

    // Verify next run scheduled
    expect(scheduler.getScheduled().some(s => s.action === "revenue_health_extended")).toBe(true)
  })
})

describe("operational_health_review handler (enhanced)", () => {
  it("AC-82: aggregates L1-L7 summary, ticket trends, task rates into OperationalHealthReport", async () => {
    // Seed learning hypotheses
    for (const id of ["L1", "L2", "L3"]) {
      await db.insert(learningHypotheses).values({
        id,
        hypothesis: `Hypothesis ${id}`,
        measurementQuery: `query for ${id}`,
        trend: id === "L1" ? "improving" : null,
        confoundWarning: id === "L2" ? "Sample size < 10" : null,
        updatedAt: new Date(),
      })
    }

    const registry = new ActionHandlerRegistry()
    const scheduler = createMockSchedulerDb()
    const decisionLog = createMockDecisionLogDb()

    registerOperationalHealthReviewHandler(registry, {
      db,
      schedulerDb: scheduler.db,
      decisionLogDb: decisionLog.db,
    })

    await invokeHandler(registry, "operational_health_review", {} as Record<string, never>)

    // Verify ceremony run logged with full report
    const runs = await db
      .select()
      .from(ceremonyRuns)
      .where(eq(ceremonyRuns.ceremonyType, "operational_health_review"))

    expect(runs).toHaveLength(1)
    const outputs = runs[0].outputs as Record<string, unknown>

    // Check full OperationalHealthReport shape
    expect(outputs).toHaveProperty("hypotheses")
    expect(outputs).toHaveProperty("supportTicketTrends")
    expect(outputs).toHaveProperty("taskCompletionRates")
    expect(outputs).toHaveProperty("signalSummary")

    const hypotheses = outputs.hypotheses as Array<Record<string, unknown>>
    expect(hypotheses).toHaveLength(3)
    expect(hypotheses.find(h => h.id === "L1")).toMatchObject({
      id: "L1",
      trend: "improving",
      confoundWarning: null,
    })
    expect(hypotheses.find(h => h.id === "L2")).toMatchObject({
      id: "L2",
      confoundWarning: "Sample size < 10",
    })

    const ticketTrends = outputs.supportTicketTrends as Record<string, unknown>
    expect(ticketTrends).toHaveProperty("openCount")
    expect(ticketTrends).toHaveProperty("closedCount")
    expect(ticketTrends).toHaveProperty("avgResolutionDays")
    expect(ticketTrends).toHaveProperty("topCategories")

    const taskRates = outputs.taskCompletionRates as Record<string, unknown>
    expect(taskRates).toHaveProperty("totalTasks")
    expect(taskRates).toHaveProperty("completedTasks")
    expect(taskRates).toHaveProperty("completionRate")
    expect(taskRates).toHaveProperty("avgCompletionDays")

    const signals = outputs.signalSummary as Record<string, unknown>
    expect(signals).toHaveProperty("decisionLogsThisPeriod")
    expect(signals).toHaveProperty("escalationsThisPeriod")
    expect(signals).toHaveProperty("ceremonyRunsThisPeriod")
  })
})
