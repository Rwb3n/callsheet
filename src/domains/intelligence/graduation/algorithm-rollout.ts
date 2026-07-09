// Algorithm versioning and controlled rollout — S10 §8, CS-WORK-090
// selectAlgorithmVersion, scoreListingDuringRollout, handleRolloutPercentageChange,
// checkAlgorithmRollbackTrigger, evaluateAlgorithmRolloutGraduation

import { eq, and, sql, gte } from "drizzle-orm"
import type { Db } from "@/db/types"
import type { DecisionLogDb } from "@/lib/decisions/logger"
import { logDecision } from "@/lib/decisions/logger"
import type { SchedulerDb } from "@/lib/scheduler/api"
import { scheduleDeferredAction } from "@/lib/scheduler/api"
import { qualityScores, listings } from "@/db/schema/data-and-listings"
import { decisionLogs } from "@/db/schema/shared"
import type { GraduationDecision } from "./evaluate"

// --- CRC32 (D6: deterministic hash for bucket assignment) ---

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let j = 0; j < 8; j++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[i] = c >>> 0
  }
  return table
})()

export function crc32(str: string): number {
  let crc = 0xffffffff
  for (let i = 0; i < str.length; i++) {
    crc = CRC32_TABLE[(crc ^ str.charCodeAt(i)) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

// --- Spec constants ---

const DECLASSIFICATION_RATE_THRESHOLD = 0.10
const GRADUATION_DECLASSIFICATION_THRESHOLD = 0.05
const GRADUATION_MIN_WEEKLY_CHECKS = 4
const FOUR_WEEKS_MS = 28 * 24 * 60 * 60 * 1000

// --- selectAlgorithmVersion (§8.1) — AC-65, AC-66 ---

export function selectAlgorithmVersion(
  listingId: string,
  rolloutPercentage: number,
): 1 | 2 {
  const bucket = crc32(listingId) % 100
  return bucket < rolloutPercentage ? 2 : 1
}

// --- Types ---

export type AlgorithmRolloutDeps = {
  db: Db
  decisionLogDb: DecisionLogDb
  schedulerDb: SchedulerDb
}

// --- scoreListingDuringRollout (§8.2) — AC-67 ---

export async function scoreListingDuringRollout(
  deps: AlgorithmRolloutDeps,
  listingId: string,
  rolloutPercentage: number,
  computeScore: (listingId: string, version: 1 | 2) => Promise<{
    composite: number
    completeness: number
    freshness: number
    accuracy: number
    richness: number
    verification: number
    band: string
  }>,
): Promise<void> {
  const version = selectAlgorithmVersion(listingId, rolloutPercentage)

  if (version === 2) {
    // V2 cohort: compute both scores for comparison
    const v2Score = await computeScore(listingId, 2)
    const v1Score = await computeScore(listingId, 1)

    // Write V2 as the active score
    await deps.db
      .update(qualityScores)
      .set({
        composite: v2Score.composite,
        completeness: v2Score.completeness,
        freshness: v2Score.freshness,
        accuracy: v2Score.accuracy,
        richness: v2Score.richness,
        verification: v2Score.verification,
        algorithmVersion: 2,
        lastCalculated: new Date(),
      })
      .where(eq(qualityScores.listingId, listingId))

    // Log comparison — AC-67
    await logDecision(deps.decisionLogDb, {
      domain: "data-and-listings",
      decisionType: "algorithm_comparison",
      inputs: {
        listingId,
        v1Score: {
          composite: v1Score.composite,
          band: v1Score.band,
          dimensions: {
            completeness: v1Score.completeness,
            freshness: v1Score.freshness,
            accuracy: v1Score.accuracy,
            richness: v1Score.richness,
            verification: v1Score.verification,
          },
        },
        v2Score: {
          composite: v2Score.composite,
          band: v2Score.band,
          dimensions: {
            completeness: v2Score.completeness,
            freshness: v2Score.freshness,
            accuracy: v2Score.accuracy,
            richness: v2Score.richness,
            verification: v2Score.verification,
          },
        },
      },
      output: {
        bandChanged: v1Score.band !== v2Score.band,
        direction:
          v2Score.composite > v1Score.composite
            ? "improved"
            : v2Score.composite < v1Score.composite
              ? "declined"
              : "unchanged",
        compositeDelta: v2Score.composite - v1Score.composite,
      },
      additionalContext: { listingId },
    })
  } else {
    // V1 cohort: score with V1 only
    const v1Score = await computeScore(listingId, 1)

    await deps.db
      .update(qualityScores)
      .set({
        composite: v1Score.composite,
        completeness: v1Score.completeness,
        freshness: v1Score.freshness,
        accuracy: v1Score.accuracy,
        richness: v1Score.richness,
        verification: v1Score.verification,
        algorithmVersion: 1,
        lastCalculated: new Date(),
      })
      .where(eq(qualityScores.listingId, listingId))
  }
}

// --- handleRolloutPercentageChange (§8.3) — AC-68, AC-70 ---

export async function handleRolloutPercentageChange(
  deps: AlgorithmRolloutDeps,
  previousPercentage: number,
  newPercentage: number,
): Promise<{ affectedListings: number }> {
  const lowerBound = Math.min(previousPercentage, newPercentage)
  const upperBound = Math.max(previousPercentage, newPercentage)

  // Fetch all active listings
  const activeListings = await deps.db
    .select({ id: listings.id })
    .from(listings)
    .where(eq(listings.lifecycleStatus, "active"))

  // Filter to those crossing the boundary
  const crossingListings = activeListings.filter((listing) => {
    const bucket = crc32(listing.id) % 100
    return bucket >= lowerBound && bucket < upperBound
  })

  // Schedule re-scoring for each affected listing — AC-68
  for (const listing of crossingListings) {
    await scheduleDeferredAction(deps.schedulerDb, {
      action: "quality_score_recalculation",
      params: { listingId: listing.id },
      executeAt: new Date(),
      retryPolicy: "retry_3",
      onFailure: "log",
      createdBy: "algorithm_rollout.percentage_change",
    })
  }

  // Log the rollout change as a graduation evaluation — AC-70
  await logDecision(deps.decisionLogDb, {
    domain: "cross-domain",
    decisionType: "graduation_evaluation",
    inputs: {
      subEntity: "data-and-listings",
      capability: "algorithm_rollout",
      currentMetrics: {
        previousPercentage,
        newPercentage,
        affectedListings: crossingListings.length,
      },
      thresholds: { declassificationRate: DECLASSIFICATION_RATE_THRESHOLD },
    },
    output: {
      graduated: newPercentage === 100,
      reason:
        newPercentage === 100
          ? "Full rollout: algorithm V2 applied to all listings"
          : `Rollout adjusted: ${previousPercentage}% -> ${newPercentage}%`,
    },
  })

  return { affectedListings: crossingListings.length }
}

// --- checkAlgorithmRollbackTrigger (§8.4) — AC-69 ---

export async function checkAlgorithmRollbackTrigger(
  deps: AlgorithmRolloutDeps,
): Promise<{ shouldRollback: boolean; declassificationRate: number }> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

  const [row] = await deps.db
    .select({
      declassified:
        sql<number>`count(*) filter (where ${decisionLogs.output}->>'bandChanged' = 'true' and ${decisionLogs.output}->>'direction' = 'declined')`.as(
          "declassified",
        ),
      total: sql<number>`count(*)`.as("total"),
    })
    .from(decisionLogs)
    .where(
      and(
        eq(decisionLogs.decisionType, "algorithm_comparison"),
        gte(decisionLogs.createdAt, sevenDaysAgo),
      ),
    )

  const total = Number(row?.total ?? 0)
  const declassified = Number(row?.declassified ?? 0)

  if (total === 0) {
    return { shouldRollback: false, declassificationRate: 0 }
  }

  const declassificationRate = declassified / total

  if (declassificationRate > DECLASSIFICATION_RATE_THRESHOLD) {
    // Log rollback decision — AC-69
    await logDecision(deps.decisionLogDb, {
      domain: "cross-domain",
      decisionType: "graduation_evaluation",
      inputs: {
        subEntity: "data-and-listings",
        capability: "algorithm_rollout",
        currentMetrics: { declassificationRate, sampleSize: total },
        thresholds: {
          declassificationRate: DECLASSIFICATION_RATE_THRESHOLD,
        },
      },
      output: {
        graduated: false,
        reason: `Quality regression: ${(declassificationRate * 100).toFixed(1)}% declassification rate exceeds 10% threshold`,
      },
    })

    return { shouldRollback: true, declassificationRate }
  }

  return { shouldRollback: false, declassificationRate }
}

// --- evaluateAlgorithmRolloutGraduation (§8.5) — AC-72 ---

export async function evaluateAlgorithmRolloutGraduation(
  db: Db,
): Promise<GraduationDecision> {
  const fourWeeksAgo = new Date(Date.now() - FOUR_WEEKS_MS)

  const recentEvaluations = await db
    .select({
      inputs: decisionLogs.inputs,
      output: decisionLogs.output,
      createdAt: decisionLogs.createdAt,
    })
    .from(decisionLogs)
    .where(
      and(
        eq(decisionLogs.decisionType, "graduation_evaluation"),
        sql`${decisionLogs.inputs}->>'capability' = ${"algorithm_rollout"}`,
        gte(decisionLogs.createdAt, fourWeeksAgo),
      ),
    )
    .orderBy(sql`${decisionLogs.createdAt} DESC`)

  if (recentEvaluations.length < GRADUATION_MIN_WEEKLY_CHECKS) {
    return {
      graduated: false,
      reason: `Insufficient monitoring: fewer than ${GRADUATION_MIN_WEEKLY_CHECKS} weekly checks in 4-week window`,
      currentMetrics: { weeklyChecks: recentEvaluations.length },
      thresholds: { weeklyChecks: GRADUATION_MIN_WEEKLY_CHECKS },
    }
  }

  // All recent evaluations must show 100% rollout with declassification <5%
  const allStable = recentEvaluations.every((e) => {
    const metrics = (e.inputs as Record<string, unknown>)
      .currentMetrics as Record<string, number> | undefined
    if (!metrics) return false
    const pct = metrics.newPercentage ?? metrics.rolloutPercentage ?? 0
    const declassRate = metrics.declassificationRate ?? 0
    return pct === 100 && declassRate < GRADUATION_DECLASSIFICATION_THRESHOLD
  })

  const latestMetrics = (
    recentEvaluations[0]?.inputs as Record<string, unknown>
  )?.currentMetrics as Record<string, number> | undefined

  return {
    graduated: allStable,
    reason: allStable
      ? "Algorithm V2 stable at 100% for 4 weeks with declassification <5%"
      : "Stability criteria not met: requires 4 consecutive weeks at 100% with declassification <5%",
    currentMetrics: {
      weeklyChecks: recentEvaluations.length,
      latestDeclassificationRate: latestMetrics?.declassificationRate ?? 0,
      rolloutPercentage:
        latestMetrics?.newPercentage ??
        latestMetrics?.rolloutPercentage ??
        0,
    },
    thresholds: {
      weeklyChecks: GRADUATION_MIN_WEEKLY_CHECKS,
      declassificationRate: GRADUATION_DECLASSIFICATION_THRESHOLD,
      rolloutPercentage: 100,
    },
  }
}
