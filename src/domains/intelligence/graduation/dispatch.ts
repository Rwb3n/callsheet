// Graduated decision dispatch — S10 §7.4
// Routes recommendations through graduation evaluation, governance bounds, and decision logging.

import type { Db } from "@/db/types"
import type { DecisionLogDb } from "@/lib/decisions/logger"
import { logDecision } from "@/lib/decisions/logger"
import {
  evaluateGraduationCriteria,
  evaluateCeremonyGraduation,
  withinGovernanceBounds,
} from "./evaluate"
import type {
  GraduationCapability,
  CeremonyRecommendation,
} from "./evaluate"

export type DispatchDeps = {
  db: Db
  decisionLogDb: DecisionLogDb
}

export type Recommendation = {
  entityContext?: Record<string, unknown>
} & (
  | { type: "enrichment_cadence"; subEntity: string }
  | ({ type: "ceremony" } & CeremonyRecommendation)
  | { type: "algorithm_rollout"; subEntity: string }
)

export async function dispatchGraduatedDecision(
  deps: DispatchDeps,
  subEntity: string,
  capability: GraduationCapability,
  recommendation: Recommendation,
): Promise<"auto_applied" | "escalated"> {
  // 1. Evaluate graduation criteria
  const evaluation =
    capability === "ceremony_auto_apply" && recommendation.type === "ceremony"
      ? await evaluateCeremonyGraduation(deps.db, recommendation)
      : await evaluateGraduationCriteria(deps.db, subEntity, capability)

  // 2. Check governance bounds BEFORE logging (so the current evaluation
  //    doesn't count against the bound that gates it) — AC-63
  const canAutoApply =
    evaluation.graduated && (await withinGovernanceBounds(deps.db, capability))

  // 3. Log the evaluation (every invocation, graduated or not) — AC-62
  await logDecision(deps.decisionLogDb, {
    domain: "cross-domain",
    decisionType: "graduation_evaluation",
    inputs: {
      subEntity,
      capability,
      currentMetrics: evaluation.currentMetrics,
      thresholds: evaluation.thresholds,
    },
    output: {
      graduated: evaluation.graduated,
      reason: evaluation.reason,
    },
    additionalContext: recommendation.entityContext
      ? Object.fromEntries(
          Object.entries(recommendation.entityContext).map(([k, v]) => [
            k,
            String(v),
          ]),
        )
      : undefined,
  })

  // 4. Apply or escalate
  if (canAutoApply) {
    return "auto_applied"
  }

  return "escalated"
}
