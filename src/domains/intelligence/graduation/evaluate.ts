// Autonomy graduation evaluation — S10 §7, entity-architecture-frame Design Principle 5
// evaluateGraduationCriteria, evaluateCeremonyGraduation, withinGovernanceBounds

import { eq, and, sql, gte } from "drizzle-orm"
import type { Db } from "@/db/types"
import { decisionLogs } from "@/db/schema/shared"
import { ceremonyRuns } from "@/db/schema/intelligence"
import { evaluateAlgorithmRolloutGraduation } from "./algorithm-rollout"

// --- Types ---

export type GraduationCapability =
  | "enrichment_cadence_adjustment"
  | "ceremony_auto_apply"
  | "algorithm_rollout"

export type GraduationDecision = {
  graduated: boolean
  reason: string
  currentMetrics: Record<string, number>
  thresholds: Record<string, number>
}

export type CeremonyRecommendation = {
  ceremonyType: string
  disposition: string
  isFinancial: boolean
  isUserVisible: boolean
}

// --- Spec constants ---

const MIN_SAMPLE_SIZE = 12
const SIX_MONTHS_MS = 180 * 24 * 60 * 60 * 1000
const FALSE_POSITIVE_THRESHOLD = 0.02
const ENRICHMENT_ROI_THRESHOLD = 0.5
const PRECEDENT_COUNT_THRESHOLD = 50

const GOVERNANCE_BOUNDS: Record<GraduationCapability, { maxPerMonth: number }> =
  {
    enrichment_cadence_adjustment: { maxPerMonth: 10 },
    ceremony_auto_apply: { maxPerMonth: 5 },
    algorithm_rollout: { maxPerMonth: 1 },
  }

// --- evaluateGraduationCriteria (§7.1) ---

export async function evaluateGraduationCriteria(
  db: Db,
  subEntity: string,
  capability: GraduationCapability,
): Promise<GraduationDecision> {
  // 1. Check for manual override (most recent graduation_evaluation with reason = "manual_override")
  const overrideRows = await db
    .select({
      output: decisionLogs.output,
    })
    .from(decisionLogs)
    .where(
      and(
        eq(decisionLogs.decisionType, "graduation_evaluation"),
        sql`${decisionLogs.inputs}->>'subEntity' = ${subEntity}`,
        sql`${decisionLogs.inputs}->>'capability' = ${capability}`,
        sql`${decisionLogs.inputs}->>'reason' = ${"manual_override"}`,
      ),
    )
    .orderBy(sql`${decisionLogs.createdAt} DESC`)
    .limit(1)

  if (overrideRows.length > 0) {
    const overrideOutput = overrideRows[0].output as Record<string, unknown>
    if (String(overrideOutput.graduated) === "false") {
      return {
        graduated: false,
        reason: "Manual override: graduation reverted by admin",
        currentMetrics: {},
        thresholds: {},
      }
    }
  }

  // 2. Dispatch to capability-specific evaluator
  switch (capability) {
    case "enrichment_cadence_adjustment":
      return evaluateEnrichmentCadenceGraduation(db)
    case "ceremony_auto_apply":
      throw new Error(
        "ceremony_auto_apply evaluated per-ceremony via evaluateCeremonyGraduation()",
      )
    case "algorithm_rollout":
      return evaluateAlgorithmRolloutGraduation(db)
  }
}

// --- Enrichment cadence graduation (§7.2) ---

async function evaluateEnrichmentCadenceGraduation(
  db: Db,
): Promise<GraduationDecision> {
  const sixMonthsAgo = new Date(Date.now() - SIX_MONTHS_MS)

  const adjustments = await db
    .select({
      id: decisionLogs.id,
      inputs: decisionLogs.inputs,
      output: decisionLogs.output,
      createdAt: decisionLogs.createdAt,
    })
    .from(decisionLogs)
    .where(
      and(
        eq(decisionLogs.decisionType, "enrichment_cadence_adjustment"),
        gte(decisionLogs.createdAt, sixMonthsAgo),
      ),
    )

  if (adjustments.length < MIN_SAMPLE_SIZE) {
    return {
      graduated: false,
      reason: `Insufficient data: fewer than ${MIN_SAMPLE_SIZE} adjustments in 6-month window`,
      currentMetrics: { sampleSize: adjustments.length },
      thresholds: { minSampleSize: MIN_SAMPLE_SIZE },
    }
  }

  // Count false positives: adjustments where output indicates no quality improvement
  let falsePositives = 0
  for (const adj of adjustments) {
    const output = adj.output as Record<string, unknown>
    // V1 proxy: an adjustment is a false positive if output.qualityImproved is explicitly false
    // At V1 scale, the graduation check reads the decision log output field
    // (populated by the cadence adjustment handler) rather than re-querying quality_scores
    if (output.qualityImproved === false) {
      falsePositives++
    }
  }

  const falsePositiveRate = falsePositives / adjustments.length
  const truePositives = adjustments.length - falsePositives
  const enrichmentROI = truePositives / adjustments.length

  const thresholds = {
    falsePositiveRate: FALSE_POSITIVE_THRESHOLD,
    enrichmentROI: ENRICHMENT_ROI_THRESHOLD,
  }
  const currentMetrics = {
    falsePositiveRate,
    enrichmentROI,
    sampleSize: adjustments.length,
  }

  const graduated =
    falsePositiveRate < thresholds.falsePositiveRate &&
    enrichmentROI > thresholds.enrichmentROI

  return {
    graduated,
    reason: graduated
      ? "All criteria met: FP rate and ROI within thresholds"
      : `Criteria not met: FP=${(falsePositiveRate * 100).toFixed(1)}% (threshold <2%), ROI=${enrichmentROI.toFixed(2)} (threshold >0.5)`,
    currentMetrics,
    thresholds,
  }
}

// --- evaluateCeremonyGraduation (§7.3) ---

export async function evaluateCeremonyGraduation(
  db: Db,
  rec: CeremonyRecommendation,
): Promise<GraduationDecision> {
  // Hard constraints — never auto-apply
  if (rec.isFinancial) {
    return {
      graduated: false,
      reason: "Financial impact: never auto-applied",
      currentMetrics: { isFinancial: 1 },
      thresholds: { isFinancial: 0 },
    }
  }
  if (rec.isUserVisible) {
    return {
      graduated: false,
      reason: "User-visible impact: never auto-applied",
      currentMetrics: { isUserVisible: 1 },
      thresholds: { isUserVisible: 0 },
    }
  }

  // Precedent check: count completed ceremony_runs with same type + disposition
  const [row] = await db
    .select({
      count: sql<number>`count(*)::int`.as("count"),
    })
    .from(ceremonyRuns)
    .where(
      and(
        eq(ceremonyRuns.ceremonyType, rec.ceremonyType as never),
        sql`${ceremonyRuns.outputs}->>'disposition' = ${rec.disposition}`,
        eq(ceremonyRuns.status, "completed"),
      ),
    )

  const precedentCount = row?.count ?? 0

  const thresholds = { precedentCount: PRECEDENT_COUNT_THRESHOLD }
  const currentMetrics = { precedentCount }
  const graduated = precedentCount >= PRECEDENT_COUNT_THRESHOLD

  return {
    graduated,
    reason: graduated
      ? `Precedent met: ${precedentCount} prior instances of same ceremonyType + disposition`
      : `Insufficient precedent: ${precedentCount}/${PRECEDENT_COUNT_THRESHOLD} required`,
    currentMetrics,
    thresholds,
  }
}

// --- withinGovernanceBounds (§7.2) ---

export async function withinGovernanceBounds(
  db: Db,
  capability: GraduationCapability,
): Promise<boolean> {
  const bound = GOVERNANCE_BOUNDS[capability]
  const monthStart = startOfMonth(new Date())

  const [row] = await db
    .select({
      count: sql<number>`count(*)::int`.as("count"),
    })
    .from(decisionLogs)
    .where(
      and(
        eq(decisionLogs.decisionType, "graduation_evaluation"),
        sql`${decisionLogs.inputs}->>'capability' = ${capability}`,
        sql`${decisionLogs.output}->>'graduated' = ${"true"}`,
        sql`${decisionLogs.inputs}->>'reason' IS DISTINCT FROM ${"manual_override"}`,
        gte(decisionLogs.createdAt, monthStart),
      ),
    )

  return (row?.count ?? 0) < bound.maxPerMonth
}

// --- Utility ---

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}
