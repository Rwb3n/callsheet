// Ceremony infrastructure — S9 §4.1
// Shared utilities: idempotency guard, run logging, outcome evaluation, scheduling.

import { createHash } from "crypto"
import { eq, and, gte } from "drizzle-orm"
import type { Db } from "@/db/types"
import type { DecisionLogDb } from "@/lib/decisions/logger"
import type { SchedulerDb } from "@/lib/scheduler/api"
import { logDecision } from "@/lib/decisions/logger"
import { scheduleDeferredAction } from "@/lib/scheduler/api"
import { ceremonyRuns } from "@/db/schema/intelligence"
import type { DeferredActionType } from "@/lib/scheduler/types"

// --- Ceremony types ---

export type CeremonyType =
  | "taxonomy_review"
  | "data_health_review"
  | "verification_calibration"
  | "provider_outreach"
  | "conversion_funnel_analysis"
  | "revenue_review"
  | "multi_listing_pricing"
  | "sponsored_placement_learning"
  | "operational_health_review"
  | "contractor_performance_review"
  | "principal_briefing"
  | "learning_hypothesis_analysis"

type CeremonyDomain = "data-and-listings" | "commercial" | "operations"

export const CEREMONY_DOMAIN_MAP: Record<CeremonyType, CeremonyDomain> = {
  taxonomy_review: "data-and-listings",
  data_health_review: "data-and-listings",
  verification_calibration: "data-and-listings",
  provider_outreach: "data-and-listings",
  conversion_funnel_analysis: "commercial",
  multi_listing_pricing: "commercial",
  revenue_review: "commercial",
  sponsored_placement_learning: "commercial",
  operational_health_review: "operations",
  contractor_performance_review: "operations",
  principal_briefing: "operations",
  learning_hypothesis_analysis: "operations",
}

// Cadence per ceremony type
type Cadence = "monthly" | "quarterly" | "weekly"

const CEREMONY_CADENCE: Record<CeremonyType, Cadence> = {
  taxonomy_review: "quarterly",
  data_health_review: "monthly",
  verification_calibration: "quarterly",
  provider_outreach: "monthly",
  conversion_funnel_analysis: "monthly",
  multi_listing_pricing: "quarterly",
  revenue_review: "monthly",
  sponsored_placement_learning: "monthly",
  operational_health_review: "monthly",
  contractor_performance_review: "quarterly",
  principal_briefing: "monthly",
  learning_hypothesis_analysis: "monthly",
}

const DAY_MS = 24 * 60 * 60 * 1000

export const CADENCE_MS: Record<Cadence, number> = {
  monthly: 30 * DAY_MS,
  quarterly: 90 * DAY_MS,
  weekly: 7 * DAY_MS,
}

// --- SHA-256 hash ---

export function computeInputsHash(inputs: Record<string, unknown>): string {
  return createHash("sha256")
    .update(JSON.stringify(inputs))
    .digest("hex")
}

// --- Period helpers ---

export function currentMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
}

export function currentQuarter(): string {
  const now = new Date()
  const q = Math.floor(now.getMonth() / 3) + 1
  return `${now.getFullYear()}-Q${q}`
}

export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

export function startOfQuarter(date: Date): Date {
  const quarterMonth = Math.floor(date.getMonth() / 3) * 3
  return new Date(date.getFullYear(), quarterMonth, 1)
}

function periodStart(ceremonyType: CeremonyType, now: Date): Date {
  const cadence = CEREMONY_CADENCE[ceremonyType]
  switch (cadence) {
    case "monthly":
      return new Date(now.getTime() - 30 * DAY_MS)
    case "quarterly":
      return new Date(now.getTime() - 90 * DAY_MS)
    case "weekly":
      return new Date(now.getTime() - 7 * DAY_MS)
  }
}

// --- Idempotency guard — AC-56 ---

export type IdempotencyResult =
  | { skip: true; existingRunId: string }
  | { skip: false }

export async function checkCeremonyIdempotency(
  db: Db,
  ceremonyType: CeremonyType,
  inputsHash: string,
  now?: Date,
): Promise<IdempotencyResult> {
  const refDate = now ?? new Date()
  const start = periodStart(ceremonyType, refDate)

  const [existing] = await db
    .select({ id: ceremonyRuns.id })
    .from(ceremonyRuns)
    .where(
      and(
        eq(ceremonyRuns.ceremonyType, ceremonyType),
        eq(ceremonyRuns.inputsHash, inputsHash),
        gte(ceremonyRuns.startedAt, start),
      ),
    )
    .limit(1)

  if (existing) {
    return { skip: true, existingRunId: existing.id }
  }
  return { skip: false }
}

// --- Log ceremony run — AC-69 ---

export interface LogCeremonyRunParams {
  ceremonyType: CeremonyType
  status: "completed" | "failed"
  inputsHash: string
  outputs: Record<string, unknown>
  decisionsLogged: number
  nextScheduledAt: Date
}

export async function logCeremonyRun(
  db: Db,
  params: LogCeremonyRunParams,
): Promise<string> {
  const now = new Date()
  const [row] = await db
    .insert(ceremonyRuns)
    .values({
      ceremonyType: params.ceremonyType,
      startedAt: now,
      completedAt: now,
      status: params.status,
      inputsHash: params.inputsHash,
      outputs: params.outputs,
      decisionsLogged: params.decisionsLogged,
      nextScheduledAt: params.nextScheduledAt,
    })
    .returning({ id: ceremonyRuns.id })

  return row.id
}

// --- Evaluate ceremony outcome — AC-57 ---

export interface CeremonyRecommendation {
  action: string
  hasFinancialImpact: boolean
  hasUserVisibleChange: boolean
  precedentExists: boolean
}

export type CeremonyDisposition = "auto_apply" | "escalate_to_principal"

export interface EvaluateCeremonyOutcomeParams {
  ceremonyType: CeremonyType
  recommendation: CeremonyRecommendation
}

export interface EvaluateCeremonyOutcomeResult {
  disposition: CeremonyDisposition
  reason: string
}

export function evaluateCeremonyOutcomeLogic(
  params: EvaluateCeremonyOutcomeParams,
): EvaluateCeremonyOutcomeResult {
  const rec = params.recommendation

  if (rec.hasFinancialImpact) {
    return { disposition: "escalate_to_principal", reason: "financial impact" }
  }
  if (rec.hasUserVisibleChange) {
    return { disposition: "escalate_to_principal", reason: "user-visible change" }
  }
  if (!rec.precedentExists) {
    return { disposition: "escalate_to_principal", reason: "first-time recommendation type" }
  }

  return { disposition: "auto_apply", reason: "low-risk with precedent" }
}

export async function evaluateCeremonyOutcome(
  decisionLogDb: DecisionLogDb,
  params: EvaluateCeremonyOutcomeParams,
): Promise<EvaluateCeremonyOutcomeResult> {
  const result = evaluateCeremonyOutcomeLogic(params)

  await logDecision(decisionLogDb, {
    domain: CEREMONY_DOMAIN_MAP[params.ceremonyType],
    decisionType: "ceremony_outcome_evaluation",
    inputs: {
      ceremonyType: params.ceremonyType,
      recommendation: params.recommendation,
    },
    output: { disposition: result.disposition, reason: result.reason },
    confidence: result.disposition === "auto_apply" ? 0.9 : 0.7,
  })

  return result
}

// --- Schedule next ceremony run — AC-55 ---

const CEREMONY_ACTION_MAP: Partial<Record<CeremonyType, DeferredActionType>> = {
  taxonomy_review: "taxonomy_review_preparation",
  data_health_review: "data_health_review",
  verification_calibration: "verification_calibration_review",
  provider_outreach: "provider_outreach_ranking",
  conversion_funnel_analysis: "conversion_funnel_analysis",
  multi_listing_pricing: "multi_listing_pricing_evaluation",
  revenue_review: "revenue_health_extended",
  sponsored_placement_learning: "sponsored_placement_learning",
  operational_health_review: "operational_health_review",
  contractor_performance_review: "contractor_performance_review",
  principal_briefing: "principal_briefing_generation",
  learning_hypothesis_analysis: "learning_hypothesis_analysis",
}

export function getNextRunDate(ceremonyType: CeremonyType, now?: Date): Date {
  const base = now ?? new Date()
  const cadence = CEREMONY_CADENCE[ceremonyType]
  return new Date(base.getTime() + CADENCE_MS[cadence])
}

export async function scheduleCeremonyNextRun(
  schedulerDb: SchedulerDb,
  ceremonyType: CeremonyType,
  nextRunAt: Date,
): Promise<void> {
  const action = CEREMONY_ACTION_MAP[ceremonyType]
  if (!action) return

  await scheduleDeferredAction(schedulerDb, {
    action,
    params: {} as Record<string, never>,
    executeAt: nextRunAt,
    retryPolicy: "once",
    onFailure: "log",
    createdBy: action,
  })
}
