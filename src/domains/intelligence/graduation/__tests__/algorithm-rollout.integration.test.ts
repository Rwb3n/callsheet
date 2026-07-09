// Algorithm rollout integration tests — CS-WORK-090
// AC-67, AC-68, AC-69, AC-70, AC-71, AC-72

import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { eq, and, sql } from "drizzle-orm"
import { getTestDb, resetDb, closeTestDb } from "@/db/test-utils"
import {
  makeUUID,
  seedTestUser,
  createTestListing,
  createDecisionLogDb,
  createSchedulerDb,
} from "@/db/test-fixtures"
import { qualityScores } from "@/db/schema/data-and-listings"
import { decisionLogs, deferredActions } from "@/db/schema/shared"
import { logDecision } from "@/lib/decisions/logger"
import {
  crc32,
  selectAlgorithmVersion,
  scoreListingDuringRollout,
  handleRolloutPercentageChange,
  checkAlgorithmRollbackTrigger,
  evaluateAlgorithmRolloutGraduation,
} from "../algorithm-rollout"

const db = getTestDb()
const decisionLogDb = createDecisionLogDb(db)
const schedulerDb = createSchedulerDb(db)
const ACCOUNT_ID = makeUUID("algroll0001")

const deps = { db, decisionLogDb, schedulerDb }

beforeEach(async () => {
  await resetDb()
  await seedTestUser(db, ACCOUNT_ID)
})

afterAll(async () => {
  await closeTestDb()
})

// --- AC-67: scoreListingDuringRollout writes algorithmVersion=2 and logs comparison ---

describe("AC-67: scoreListingDuringRollout", () => {
  it("V2-cohort listing: writes algorithmVersion=2 and logs algorithm_comparison", async () => {
    const listing = await createTestListing(db, ACCOUNT_ID)
    const bucket = crc32(listing.id) % 100

    // Set rollout percentage to include this listing's bucket
    const rolloutPct = bucket + 1 // ensures bucket < rolloutPct → V2

    // Mock compute function that returns different scores for V1 vs V2
    const computeScore = async (_listingId: string, version: 1 | 2) => ({
      composite: version === 2 ? 75 : 60,
      completeness: version === 2 ? 20 : 15,
      freshness: version === 2 ? 15 : 12,
      accuracy: version === 2 ? 15 : 13,
      richness: version === 2 ? 15 : 12,
      verification: version === 2 ? 10 : 8,
      band: version === 2 ? "good" : "fair",
    })

    await scoreListingDuringRollout(deps, listing.id, rolloutPct, computeScore)

    // Verify quality_scores updated with V2 score
    const [score] = await db
      .select({
        composite: qualityScores.composite,
        algorithmVersion: qualityScores.algorithmVersion,
      })
      .from(qualityScores)
      .where(eq(qualityScores.listingId, listing.id))

    expect(score.composite).toBe(75)
    expect(score.algorithmVersion).toBe(2)

    // Verify algorithm_comparison decision log
    const logs = await db
      .select({
        decisionType: decisionLogs.decisionType,
        inputs: decisionLogs.inputs,
        output: decisionLogs.output,
      })
      .from(decisionLogs)
      .where(eq(decisionLogs.decisionType, "algorithm_comparison"))

    expect(logs).toHaveLength(1)
    const log = logs[0]
    const inputs = log.inputs as Record<string, unknown>
    const v1Score = inputs.v1Score as Record<string, unknown>
    const v2Score = inputs.v2Score as Record<string, unknown>
    expect(v1Score.composite).toBe(60)
    expect(v2Score.composite).toBe(75)

    const output = log.output as Record<string, unknown>
    expect(output.bandChanged).toBe(true)
    expect(output.direction).toBe("improved")
    expect(output.compositeDelta).toBe(15)
  })

  it("V1-cohort listing: writes algorithmVersion=1, no comparison log", async () => {
    const listing = await createTestListing(db, ACCOUNT_ID)
    const bucket = crc32(listing.id) % 100

    // Set rollout percentage BELOW this listing's bucket → V1
    const rolloutPct = Math.max(0, bucket - 1)

    // Only V1 should be called if listing is in V1 cohort
    // (but for bucket=0, rolloutPct would be -1 which we clamp to 0,
    //  and bucket 0 < 0 is false, so V1 path runs)
    // Handle edge: if bucket is 0, selectAlgorithmVersion(id, 0) returns 1
    const v1Pct = bucket === 0 ? 0 : rolloutPct

    const computeScore = async (_listingId: string, version: 1 | 2) => ({
      composite: 50,
      completeness: 10,
      freshness: 10,
      accuracy: 10,
      richness: 10,
      verification: 10,
      band: "fair",
    })

    await scoreListingDuringRollout(deps, listing.id, v1Pct, computeScore)

    const [score] = await db
      .select({ algorithmVersion: qualityScores.algorithmVersion })
      .from(qualityScores)
      .where(eq(qualityScores.listingId, listing.id))

    expect(score.algorithmVersion).toBe(1)

    // No algorithm_comparison log for V1-cohort
    const logs = await db
      .select()
      .from(decisionLogs)
      .where(eq(decisionLogs.decisionType, "algorithm_comparison"))
    expect(logs).toHaveLength(0)
  })
})

// --- AC-68: handleRolloutPercentageChange schedules only boundary-crossing listings ---

describe("AC-68: handleRolloutPercentageChange boundary detection", () => {
  it("change from 10 to 25 schedules only listings in buckets 10-24", async () => {
    // Create several listings and determine their buckets
    const listingsCreated = []
    for (let i = 0; i < 20; i++) {
      const listing = await createTestListing(db, ACCOUNT_ID)
      const bucket = crc32(listing.id) % 100
      listingsCreated.push({ id: listing.id, bucket })
    }

    const result = await handleRolloutPercentageChange(deps, 10, 25)

    // Check scheduled deferred actions
    const scheduled = await db
      .select({
        action: deferredActions.action,
        params: deferredActions.params,
      })
      .from(deferredActions)
      .where(eq(deferredActions.action, "quality_score_recalculation"))

    // Each scheduled action should be for a listing with bucket in [10, 25)
    const scheduledIds = new Set(
      scheduled.map((s) => (s.params as { listingId: string }).listingId),
    )

    for (const listing of listingsCreated) {
      if (listing.bucket >= 10 && listing.bucket < 25) {
        expect(scheduledIds.has(listing.id)).toBe(true)
      } else {
        expect(scheduledIds.has(listing.id)).toBe(false)
      }
    }

    // Verify count matches
    const expectedCount = listingsCreated.filter(
      (l) => l.bucket >= 10 && l.bucket < 25,
    ).length
    expect(result.affectedListings).toBe(expectedCount)
  })
})

// --- AC-69: checkAlgorithmRollbackTrigger ---

describe("AC-69: rollback trigger", () => {
  it("returns shouldRollback=true when declassification >10%", async () => {
    // Insert algorithm_comparison logs — 20% declassified (2 of 10)
    for (let i = 0; i < 10; i++) {
      await logDecision(decisionLogDb, {
        domain: "data-and-listings",
        decisionType: "algorithm_comparison",
        inputs: { listingId: makeUUID(`rl${String(i).padStart(8, "0")}`) },
        output: {
          bandChanged: i < 2 ? true : false,
          direction: i < 2 ? "declined" : "unchanged",
          compositeDelta: i < 2 ? -10 : 0,
        },
      })
    }

    const result = await checkAlgorithmRollbackTrigger(deps)
    expect(result.shouldRollback).toBe(true)
    expect(result.declassificationRate).toBeCloseTo(0.2, 1)

    // Verify graduation_evaluation decision logged with "quality regression"
    const gradLogs = await db
      .select({ output: decisionLogs.output })
      .from(decisionLogs)
      .where(eq(decisionLogs.decisionType, "graduation_evaluation"))

    const rollbackLog = gradLogs.find((l) => {
      const output = l.output as Record<string, unknown>
      return (
        output.graduated === false &&
        typeof output.reason === "string" &&
        (output.reason as string).toLowerCase().includes("quality regression")
      )
    })
    expect(rollbackLog).toBeDefined()
  })

  it("returns shouldRollback=false when declassification <10%", async () => {
    // Insert logs — 5% declassified (1 of 20)
    for (let i = 0; i < 20; i++) {
      await logDecision(decisionLogDb, {
        domain: "data-and-listings",
        decisionType: "algorithm_comparison",
        inputs: { listingId: makeUUID(`rl${String(i).padStart(8, "0")}`) },
        output: {
          bandChanged: i === 0,
          direction: i === 0 ? "declined" : "improved",
          compositeDelta: i === 0 ? -5 : 3,
        },
      })
    }

    const result = await checkAlgorithmRollbackTrigger(deps)
    expect(result.shouldRollback).toBe(false)
    expect(result.declassificationRate).toBeCloseTo(0.05, 2)
  })

  it("returns shouldRollback=false when no comparison data exists", async () => {
    const result = await checkAlgorithmRollbackTrigger(deps)
    expect(result.shouldRollback).toBe(false)
    expect(result.declassificationRate).toBe(0)
  })
})

// --- AC-70: logDecision called on every handleRolloutPercentageChange ---

describe("AC-70: graduation_evaluation logged on rollout change", () => {
  it("logs previousPercentage, newPercentage, and affectedListings", async () => {
    await createTestListing(db, ACCOUNT_ID)

    await handleRolloutPercentageChange(deps, 0, 10)

    const logs = await db
      .select({
        inputs: decisionLogs.inputs,
        output: decisionLogs.output,
      })
      .from(decisionLogs)
      .where(
        and(
          eq(decisionLogs.decisionType, "graduation_evaluation"),
          sql`${decisionLogs.inputs}->>'capability' = ${"algorithm_rollout"}`,
        ),
      )

    expect(logs).toHaveLength(1)
    const metrics = (logs[0].inputs as Record<string, unknown>)
      .currentMetrics as Record<string, number>
    expect(metrics.previousPercentage).toBe(0)
    expect(metrics.newPercentage).toBe(10)
    expect(typeof metrics.affectedListings).toBe("number")
  })
})

// --- AC-71: Rollback to 0% reschedules all V2 listings ---

describe("AC-71: rollback to 0%", () => {
  it("schedules quality_score_recalculation for all V2 listings", async () => {
    // Create listings and set some to algorithmVersion=2
    const listing1 = await createTestListing(db, ACCOUNT_ID)
    const listing2 = await createTestListing(db, ACCOUNT_ID)
    const listing3 = await createTestListing(db, ACCOUNT_ID)

    // Determine which are in the V2 cohort at 50%
    const at50 = [listing1, listing2, listing3].filter(
      (l) => selectAlgorithmVersion(l.id, 50) === 2,
    )
    const at50Ids = new Set(at50.map((l) => l.id))

    // Mark V2 listings with algorithmVersion=2
    for (const listing of at50) {
      await db
        .update(qualityScores)
        .set({ algorithmVersion: 2 })
        .where(eq(qualityScores.listingId, listing.id))
    }

    // Rollback: 50% → 0%
    const result = await handleRolloutPercentageChange(deps, 50, 0)

    // All V2 listings should have recalc scheduled
    // (buckets 0-49 cross the boundary when going from 50→0)
    const scheduled = await db
      .select({ params: deferredActions.params })
      .from(deferredActions)
      .where(eq(deferredActions.action, "quality_score_recalculation"))

    const scheduledIds = new Set(
      scheduled.map((s) => (s.params as { listingId: string }).listingId),
    )

    // Every V2 listing (bucket < 50) should be in the scheduled set
    for (const listing of at50) {
      expect(scheduledIds.has(listing.id)).toBe(true)
    }

    expect(result.affectedListings).toBeGreaterThanOrEqual(at50.length)
  })
})

// --- AC-72: evaluateAlgorithmRolloutGraduation ---

describe("AC-72: algorithm rollout graduation", () => {
  it("returns graduated=true when 4+ weekly checks at 100% with declassification <5%", async () => {
    // Insert 4 graduation_evaluation logs at 100% with low declassification
    const fourWeeksMs = 28 * 24 * 60 * 60 * 1000
    for (let week = 0; week < 4; week++) {
      await logDecision(decisionLogDb, {
        domain: "cross-domain",
        decisionType: "graduation_evaluation",
        inputs: {
          subEntity: "data-and-listings",
          capability: "algorithm_rollout",
          currentMetrics: {
            newPercentage: 100,
            declassificationRate: 0.03, // 3% — below 5% threshold
            affectedListings: 0,
          },
          thresholds: { declassificationRate: 0.10 },
        },
        output: {
          graduated: true,
          reason: "Full rollout: algorithm V2 applied to all listings",
        },
      })
    }

    const result = await evaluateAlgorithmRolloutGraduation(db)
    expect(result.graduated).toBe(true)
    expect(result.reason).toContain("stable at 100%")
  })

  it("returns graduated=false with fewer than 4 weekly checks", async () => {
    // Only 2 evaluations
    for (let i = 0; i < 2; i++) {
      await logDecision(decisionLogDb, {
        domain: "cross-domain",
        decisionType: "graduation_evaluation",
        inputs: {
          subEntity: "data-and-listings",
          capability: "algorithm_rollout",
          currentMetrics: {
            newPercentage: 100,
            declassificationRate: 0.02,
          },
          thresholds: { declassificationRate: 0.10 },
        },
        output: { graduated: true, reason: "Full rollout" },
      })
    }

    const result = await evaluateAlgorithmRolloutGraduation(db)
    expect(result.graduated).toBe(false)
    expect(result.reason).toContain("Insufficient monitoring")
  })

  it("returns graduated=false when declassification exceeds 5%", async () => {
    for (let i = 0; i < 4; i++) {
      await logDecision(decisionLogDb, {
        domain: "cross-domain",
        decisionType: "graduation_evaluation",
        inputs: {
          subEntity: "data-and-listings",
          capability: "algorithm_rollout",
          currentMetrics: {
            newPercentage: 100,
            declassificationRate: i === 2 ? 0.08 : 0.03, // One week exceeds 5%
          },
          thresholds: { declassificationRate: 0.10 },
        },
        output: { graduated: true, reason: "Full rollout" },
      })
    }

    const result = await evaluateAlgorithmRolloutGraduation(db)
    expect(result.graduated).toBe(false)
    expect(result.reason).toContain("Stability criteria not met")
  })

  it("returns graduated=false when not at 100% rollout", async () => {
    for (let i = 0; i < 4; i++) {
      await logDecision(decisionLogDb, {
        domain: "cross-domain",
        decisionType: "graduation_evaluation",
        inputs: {
          subEntity: "data-and-listings",
          capability: "algorithm_rollout",
          currentMetrics: {
            newPercentage: 50, // Not at 100%
            declassificationRate: 0.01,
          },
          thresholds: { declassificationRate: 0.10 },
        },
        output: { graduated: false, reason: "Rollout at 50%" },
      })
    }

    const result = await evaluateAlgorithmRolloutGraduation(db)
    expect(result.graduated).toBe(false)
  })
})
