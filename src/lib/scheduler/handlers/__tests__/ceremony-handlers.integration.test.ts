// Ceremony handlers integration tests — AC-55 through AC-69
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest"
import { eq, and, sql } from "drizzle-orm"
import { getTestDb, resetDb, closeTestDb } from "@/db/test-utils"
import {
  seedTestUser,
  createTestListing,
  createTestCredit,
  seedTaxonomy,
  makeUUID,
  createMockDecisionLogDb,
  createSchedulerDb,
  createDecisionLogDb,
} from "@/db/test-fixtures"
import { ActionHandlerRegistry } from "@/lib/scheduler"
import { invokeHandler } from "./invoke-handler"
import { ceremonyRuns, principalBriefings, learningHypotheses } from "@/db/schema/intelligence"
import { decisionLogs } from "@/db/schema/shared"
import { listings, listingTaxonomyTags, zeroResultQueries, credits } from "@/db/schema/data-and-listings"
import { taskSpecs, supportTickets } from "@/db/schema/operations"
import { InMemoryEmailService } from "@/lib/email/transport"
import { clearTemplates } from "@/lib/email/templates"

// Import handlers
import { registerTaxonomyReviewPreparationHandler } from "../taxonomy-review-preparation"
import { registerDataHealthReviewHandler } from "../data-health-review"
import { registerVerificationCalibrationReviewHandler } from "../verification-calibration-review"
import { registerProviderOutreachRankingHandler } from "../provider-outreach-ranking"
import { registerConversionFunnelAnalysisHandler } from "../conversion-funnel-analysis"
import { registerMultiListingPricingEvaluationHandler } from "../multi-listing-pricing-evaluation"
import { registerPrincipalBriefingGenerationHandler } from "../principal-briefing-generation"
import { registerOperationalHealthReviewHandler } from "../operational-health-review"
import { registerContractorPerformanceReviewHandler } from "../contractor-performance-review"
import { runCreditConfirmationOutreach } from "../credit-confirmation-outreach"

// Import email template registration functions
import {
  registerPrincipalBriefingTemplate,
  registerCreditConfirmationOutreachTemplate,
  registerDecayFinalNoticeTemplate,
  registerEnrichmentConfirmationRequestTemplate,
} from "@/domains/intelligence/ceremony/email-templates"

let db: ReturnType<typeof getTestDb>

const ACCOUNT_ID = "acct-ceremony-001"

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
  clearTemplates()
  // Re-register templates after clear
  registerPrincipalBriefingTemplate()
  registerCreditConfirmationOutreachTemplate()
  registerDecayFinalNoticeTemplate()
  registerEnrichmentConfirmationRequestTemplate()
})

afterAll(async () => {
  await closeTestDb()
})

// --- AC-55: Self-perpetuating scheduling ---
describe("AC-55: self-perpetuating scheduling", () => {
  it("taxonomy_review_preparation schedules next run after execution", async () => {
    const registry = new ActionHandlerRegistry()
    const mockScheduler = createMockSchedulerDb()
    const mockDecisions = createMockDecisionLogDb()

    await seedTestUser(db, ACCOUNT_ID)
    const listing = await createTestListing(db, ACCOUNT_ID)
    const taxonomy = await seedTaxonomy(db)

    // Add a taxonomy tag so it doesn't return insufficient_data
    await db.insert(listingTaxonomyTags).values({
      listingId: listing.id,
      sectorId: taxonomy.camera.id,
      serviceAreaId: taxonomy.cinematography.id,
      specialisationId: taxonomy.steadicam.id,
    })

    registerTaxonomyReviewPreparationHandler(registry, {
      db,
      schedulerDb: mockScheduler.db,
      decisionLogDb: mockDecisions.db,
    })

    await invokeHandler(registry, "taxonomy_review_preparation", {} as Record<string, never>)

    const scheduled = mockScheduler.getScheduled()
    expect(scheduled.some((s) => s.action === "taxonomy_review_preparation")).toBe(true)
  })
})

// --- AC-56: Idempotency guard ---
describe("AC-56: idempotency guard", () => {
  it("prevents duplicate ceremony run within same period", async () => {
    const registry = new ActionHandlerRegistry()
    const mockScheduler = createMockSchedulerDb()
    const mockDecisions = createMockDecisionLogDb()

    registerDataHealthReviewHandler(registry, {
      db,
      schedulerDb: mockScheduler.db,
      decisionLogDb: mockDecisions.db,
    })

    // Run once
    await invokeHandler(registry, "data_health_review", {} as Record<string, never>)

    const [runCount1] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(ceremonyRuns)
      .where(eq(ceremonyRuns.ceremonyType, "data_health_review"))

    expect(runCount1.count).toBe(1)

    // Need a new registry to re-register (handler is already registered)
    const registry2 = new ActionHandlerRegistry()
    const mockScheduler2 = createMockSchedulerDb()
    registerDataHealthReviewHandler(registry2, {
      db,
      schedulerDb: mockScheduler2.db,
      decisionLogDb: mockDecisions.db,
    })

    // Run again — should skip due to idempotency
    await invokeHandler(registry2, "data_health_review", {} as Record<string, never>)

    const [runCount2] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(ceremonyRuns)
      .where(eq(ceremonyRuns.ceremonyType, "data_health_review"))

    // Still just 1 run
    expect(runCount2.count).toBe(1)

    // But should still schedule next run even when skipping
    expect(mockScheduler2.getScheduled().length).toBeGreaterThan(0)
  })
})

// --- AC-57: evaluateCeremonyOutcome logs ceremony_outcome_evaluation ---
describe("AC-57: evaluateCeremonyOutcome logs decision", () => {
  it("logs ceremony_outcome_evaluation when data_health_review escalates decay trend", async () => {
    const registry = new ActionHandlerRegistry()
    const mockScheduler = createMockSchedulerDb()
    const decisionLogDb = createDecisionLogDb(db)

    await seedTestUser(db, ACCOUNT_ID)
    const listing = await createTestListing(db, ACCOUNT_ID)

    // Create decay signals: 5 new in last 30 days, 1 resolved (ratio > 2x)
    const { decaySignals: decaySignalsTable } = await import("@/db/schema/intelligence")
    for (let i = 0; i < 5; i++) {
      await db.insert(decaySignalsTable).values({
        listingId: listing.id,
        signalType: "website_dead",
        severity: "high",
        detectedAt: new Date(),
      })
    }
    await db.insert(decaySignalsTable).values({
      listingId: listing.id,
      signalType: "email_bounced",
      severity: "medium",
      detectedAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000),
      resolvedAt: new Date(),
      resolution: "auto_healed",
    })

    registerDataHealthReviewHandler(registry, {
      db,
      schedulerDb: mockScheduler.db,
      decisionLogDb,
    })

    await invokeHandler(registry, "data_health_review", {} as Record<string, never>)

    // Check decision_logs for ceremony_outcome_evaluation
    const decisions = await db
      .select()
      .from(decisionLogs)
      .where(eq(decisionLogs.decisionType, "ceremony_outcome_evaluation"))

    expect(decisions.length).toBeGreaterThanOrEqual(1)
    const outcomeDecision = decisions[0]
    expect(outcomeDecision.domain).toBe("data-and-listings")
  })
})

// --- AC-58: taxonomy_review insufficient_data when tags empty ---
describe("AC-58: taxonomy_review insufficient_data", () => {
  it("returns insufficient_data when listing_taxonomy_tags is empty", async () => {
    const registry = new ActionHandlerRegistry()
    const mockScheduler = createMockSchedulerDb()
    const mockDecisions = createMockDecisionLogDb()

    registerTaxonomyReviewPreparationHandler(registry, {
      db,
      schedulerDb: mockScheduler.db,
      decisionLogDb: mockDecisions.db,
    })

    await invokeHandler(registry, "taxonomy_review_preparation", {} as Record<string, never>)

    const [run] = await db
      .select()
      .from(ceremonyRuns)
      .where(eq(ceremonyRuns.ceremonyType, "taxonomy_review"))

    expect(run).toBeDefined()
    expect(run.status).toBe("completed")
    expect((run.outputs as Record<string, unknown>).status).toBe("insufficient_data")

    // Still schedules next run
    const scheduled = mockScheduler.getScheduled()
    expect(scheduled.some((s) => s.action === "taxonomy_review_preparation")).toBe(true)
  })
})

// --- AC-59: verification_calibration insufficient_data when no claim decisions ---
describe("AC-59: verification_calibration insufficient_data", () => {
  it("returns insufficient_data when no claim_evaluation decisions exist", async () => {
    const registry = new ActionHandlerRegistry()
    const mockScheduler = createMockSchedulerDb()
    const mockDecisions = createMockDecisionLogDb()

    registerVerificationCalibrationReviewHandler(registry, {
      db,
      schedulerDb: mockScheduler.db,
      decisionLogDb: mockDecisions.db,
    })

    await invokeHandler(registry, "verification_calibration_review", {} as Record<string, never>)

    const [run] = await db
      .select()
      .from(ceremonyRuns)
      .where(eq(ceremonyRuns.ceremonyType, "verification_calibration"))

    expect(run).toBeDefined()
    expect((run.outputs as Record<string, unknown>).status).toBe("insufficient_data")

    const scheduled = mockScheduler.getScheduled()
    expect(scheduled.some((s) => s.action === "verification_calibration_review")).toBe(true)
  })
})

// --- AC-60: conversion_funnel insufficient_data when no trigger decisions ---
describe("AC-60: conversion_funnel insufficient_data", () => {
  it("returns insufficient_data when no conversion_trigger_evaluation decisions exist", async () => {
    const registry = new ActionHandlerRegistry()
    const mockScheduler = createMockSchedulerDb()
    const mockDecisions = createMockDecisionLogDb()

    registerConversionFunnelAnalysisHandler(registry, {
      db,
      schedulerDb: mockScheduler.db,
      decisionLogDb: mockDecisions.db,
    })

    await invokeHandler(registry, "conversion_funnel_analysis", {} as Record<string, never>)

    const [run] = await db
      .select()
      .from(ceremonyRuns)
      .where(eq(ceremonyRuns.ceremonyType, "conversion_funnel_analysis"))

    expect(run).toBeDefined()
    expect((run.outputs as Record<string, unknown>).status).toBe("insufficient_data")

    const scheduled = mockScheduler.getScheduled()
    expect(scheduled.some((s) => s.action === "conversion_funnel_analysis")).toBe(true)
  })
})

// --- AC-61 / AC-63: multi_listing_pricing insufficient_data when < 20 accounts ---
describe("AC-61/AC-63: multi_listing_pricing insufficient_data and threshold ordering", () => {
  it("returns insufficient_data when fewer than 20 multi-listing paid accounts", async () => {
    const registry = new ActionHandlerRegistry()
    const mockScheduler = createMockSchedulerDb()
    const mockDecisions = createMockDecisionLogDb()

    // Create 1 paid account with 2 listings — still below 20 threshold
    await seedTestUser(db, ACCOUNT_ID)
    await createTestListing(db, ACCOUNT_ID, { subscriptionTier: "standard" })
    await createTestListing(db, ACCOUNT_ID, { subscriptionTier: "standard" })

    registerMultiListingPricingEvaluationHandler(registry, {
      db,
      schedulerDb: mockScheduler.db,
      decisionLogDb: mockDecisions.db,
    })

    await invokeHandler(registry, "multi_listing_pricing_evaluation", {} as Record<string, never>)

    const [run] = await db
      .select()
      .from(ceremonyRuns)
      .where(eq(ceremonyRuns.ceremonyType, "multi_listing_pricing"))

    expect(run).toBeDefined()
    expect((run.outputs as Record<string, unknown>).status).toBe("insufficient_data")

    const scheduled = mockScheduler.getScheduled()
    expect(scheduled.some((s) => s.action === "multi_listing_pricing_evaluation")).toBe(true)
  })
})

// --- AC-62: contractor_performance insufficient_data when no tasks ---
describe("AC-62: contractor_performance insufficient_data", () => {
  it("returns insufficient_data when no completed task_specs exist", async () => {
    const registry = new ActionHandlerRegistry()
    const mockScheduler = createMockSchedulerDb()
    const mockDecisions = createMockDecisionLogDb()

    registerContractorPerformanceReviewHandler(registry, {
      db,
      schedulerDb: mockScheduler.db,
      decisionLogDb: mockDecisions.db,
    })

    await invokeHandler(registry, "contractor_performance_review", {} as Record<string, never>)

    const [run] = await db
      .select()
      .from(ceremonyRuns)
      .where(eq(ceremonyRuns.ceremonyType, "contractor_performance_review"))

    expect(run).toBeDefined()
    expect((run.outputs as Record<string, unknown>).status).toBe("insufficient_data")

    const scheduled = mockScheduler.getScheduled()
    expect(scheduled.some((s) => s.action === "contractor_performance_review")).toBe(true)
  })
})

// --- AC-64: principal_briefing aggregates ceremony outputs ---
describe("AC-64: principal_briefing aggregates monthly outputs", () => {
  it("aggregates outputs from ceremonies that ran in the month", async () => {
    const registry = new ActionHandlerRegistry()
    const mockScheduler = createMockSchedulerDb()
    const mockDecisions = createMockDecisionLogDb()
    const emailService = new InMemoryEmailService()

    // Pre-populate a ceremony run so the briefing has something to aggregate
    await db.insert(ceremonyRuns).values({
      ceremonyType: "data_health_review",
      startedAt: new Date(),
      completedAt: new Date(),
      status: "completed",
      inputsHash: "test-hash",
      outputs: { qualityBands: { poor: 1, fair: 2, good: 3, excellent: 4 } },
      decisionsLogged: 0,
      nextScheduledAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    })

    registerPrincipalBriefingGenerationHandler(registry, {
      db,
      schedulerDb: mockScheduler.db,
      decisionLogDb: mockDecisions.db,
      emailService,
    })

    await invokeHandler(registry, "principal_briefing_generation", {} as Record<string, never>)

    // Check principal_briefings table
    const briefings = await db.select().from(principalBriefings)
    expect(briefings).toHaveLength(1)
    const briefing = briefings[0]
    expect(briefing.content).toBeDefined()
    expect((briefing.content as Record<string, unknown>).ceremonies).toBeDefined()
  })
})

// --- AC-65: principal_briefing sends email, updates sentAt ---
describe("AC-65: principal_briefing sends email", () => {
  it("sends principal_briefing email and updates sentAt", async () => {
    const registry = new ActionHandlerRegistry()
    const mockScheduler = createMockSchedulerDb()
    const mockDecisions = createMockDecisionLogDb()
    const emailService = new InMemoryEmailService()

    registerPrincipalBriefingGenerationHandler(registry, {
      db,
      schedulerDb: mockScheduler.db,
      decisionLogDb: mockDecisions.db,
      emailService,
    })

    await invokeHandler(registry, "principal_briefing_generation", {} as Record<string, never>)

    // Check email was sent
    expect(emailService.wasCalledWith("principal_briefing")).toBe(true)
    const calls = emailService.getCalls()
    const briefingEmail = calls.find((c) => c.template === "principal_briefing")
    expect(briefingEmail?.category).toBe("transactional")

    // Check sentAt is populated
    const briefings = await db.select().from(principalBriefings)
    expect(briefings).toHaveLength(1)
    expect(briefings[0].sentAt).not.toBeNull()
  })
})

// --- AC-66: credit_confirmation_outreach ---
describe("AC-66: credit_confirmation_outreach", () => {
  it("sends email for client-confirmed credits with verifiedAt 330-365 days ago", async () => {
    const emailService = new InMemoryEmailService()

    await seedTestUser(db, ACCOUNT_ID)
    const listing = await createTestListing(db, ACCOUNT_ID, {
      contactEmail: "provider@example.com",
    })

    // Create a client-confirmed credit with verifiedAt 340 days ago
    const verifiedAt = new Date(Date.now() - 340 * 24 * 60 * 60 * 1000)
    await createTestCredit(db, listing.id, {
      sourcingMethod: "client_confirmed",
      verificationDate: verifiedAt,
      clientCommissioner: "Test Commissioner",
    })

    // Create another credit outside the window (200 days ago)
    const recentVerified = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000)
    await createTestCredit(db, listing.id, {
      sourcingMethod: "client_confirmed",
      verificationDate: recentVerified,
    })

    const emailsSent = await runCreditConfirmationOutreach(
      { db, emailService },
      listing.id,
    )

    expect(emailsSent).toBe(1)
    expect(emailService.wasCalledWith("credit_confirmation_outreach")).toBe(true)
    const calls = emailService.getCalls()
    expect(calls[0].to).toBe("provider@example.com")
    expect(calls[0].category).toBe("listing_status")
  })

  it("sends no emails when credits are outside the 330-365 day window", async () => {
    const emailService = new InMemoryEmailService()

    await seedTestUser(db, ACCOUNT_ID)
    const listing = await createTestListing(db, ACCOUNT_ID, {
      contactEmail: "provider@example.com",
    })

    // Credit verified 100 days ago — outside window
    const recentVerified = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000)
    await createTestCredit(db, listing.id, {
      sourcingMethod: "client_confirmed",
      verificationDate: recentVerified,
    })

    const emailsSent = await runCreditConfirmationOutreach(
      { db, emailService },
      listing.id,
    )

    expect(emailsSent).toBe(0)
  })
})

// --- AC-67: taxonomy_promotion_evaluation decision for promotable tags ---
describe("AC-67: taxonomy_promotion_evaluation", () => {
  it("logs taxonomy_promotion_evaluation for promotable tags with frequency >= 20 and clean mapping", async () => {
    const registry = new ActionHandlerRegistry()
    const mockScheduler = createMockSchedulerDb()
    const decisionLogDb = createDecisionLogDb(db)

    await seedTestUser(db, ACCOUNT_ID)
    const listing = await createTestListing(db, ACCOUNT_ID)
    const taxonomy = await seedTaxonomy(db)

    // Add a taxonomy tag so the prerequisite passes
    await db.insert(listingTaxonomyTags).values({
      listingId: listing.id,
      sectorId: taxonomy.camera.id,
      serviceAreaId: taxonomy.cinematography.id,
      specialisationId: taxonomy.steadicam.id,
    })

    // Add 25 zero-result queries for "steadicam" — exact match to taxonomy specialisation "Steadicam"
    for (let i = 0; i < 25; i++) {
      await db.insert(zeroResultQueries).values({
        query: "steadicam",
      })
    }

    registerTaxonomyReviewPreparationHandler(registry, {
      db,
      schedulerDb: mockScheduler.db,
      decisionLogDb,
    })

    await invokeHandler(registry, "taxonomy_review_preparation", {} as Record<string, never>)

    // Check for taxonomy_promotion_evaluation decision
    const decisions = await db
      .select()
      .from(decisionLogs)
      .where(eq(decisionLogs.decisionType, "taxonomy_promotion_evaluation"))

    expect(decisions.length).toBeGreaterThanOrEqual(1)
    const decision = decisions[0]
    expect(decision.domain).toBe("data-and-listings")
    expect((decision.inputs as Record<string, unknown>).tag).toBe("steadicam")
    expect((decision.inputs as Record<string, unknown>).frequency).toBe(25)
  })
})

// --- AC-68: conversion_threshold_adjustment for outlier firing rates ---
describe("AC-68: conversion_threshold_adjustment", () => {
  it("logs conversion_threshold_adjustment when firing rate is below 5%", async () => {
    const registry = new ActionHandlerRegistry()
    const mockScheduler = createMockSchedulerDb()
    const decisionLogDb = createDecisionLogDb(db)

    // Insert 100 conversion_trigger_evaluation decisions with low firing rate
    for (let i = 0; i < 100; i++) {
      await db.insert(decisionLogs).values({
        domain: "commercial",
        decisionType: "conversion_trigger_evaluation",
        inputs: { triggerType: "analytics_tease", accountId: makeUUID(`conv-${i}`) },
        output: { triggered: i < 2 }, // 2% firing rate
      })
    }

    registerConversionFunnelAnalysisHandler(registry, {
      db,
      schedulerDb: mockScheduler.db,
      decisionLogDb,
    })

    await invokeHandler(registry, "conversion_funnel_analysis", {} as Record<string, never>)

    // Check for conversion_threshold_adjustment decision
    const decisions = await db
      .select()
      .from(decisionLogs)
      .where(eq(decisionLogs.decisionType, "conversion_threshold_adjustment"))

    expect(decisions.length).toBeGreaterThanOrEqual(1)
    const decision = decisions[0]
    expect(decision.domain).toBe("commercial")
    expect((decision.inputs as Record<string, unknown>).triggerType).toBe("analytics_tease")
  })
})

// --- AC-69: Every ceremony logged to ceremony_runs ---
describe("AC-69: ceremony_runs logging", () => {
  it("logs to ceremony_runs with all required fields", async () => {
    const registry = new ActionHandlerRegistry()
    const mockScheduler = createMockSchedulerDb()
    const mockDecisions = createMockDecisionLogDb()

    registerOperationalHealthReviewHandler(registry, {
      db,
      schedulerDb: mockScheduler.db,
      decisionLogDb: mockDecisions.db,
    })

    await invokeHandler(registry, "operational_health_review", {} as Record<string, never>)

    const runs = await db
      .select()
      .from(ceremonyRuns)
      .where(eq(ceremonyRuns.ceremonyType, "operational_health_review"))

    expect(runs).toHaveLength(1)
    const run = runs[0]

    // Verify all required fields
    expect(run.ceremonyType).toBe("operational_health_review")
    expect(run.status).toBe("completed")
    expect(run.inputsHash).toBeDefined()
    expect(run.inputsHash.length).toBe(64) // SHA-256 hex
    expect(run.outputs).toBeDefined()
    expect(run.decisionsLogged).toBe(0)
    expect(run.nextScheduledAt).toBeDefined()
    expect(run.startedAt).toBeDefined()
    expect(run.completedAt).toBeDefined()
  })
})
