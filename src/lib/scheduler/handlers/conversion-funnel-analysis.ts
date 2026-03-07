// conversion_funnel_analysis ceremony handler — S9 §4.3, AC-55/56/60/68/69/77/78
// Monthly. Analyses conversion trigger firing rates, logs threshold adjustments.
// S9 AC-77/78: per-gate friction ratio computation with escalation.
// Self-perpetuating deferred action pattern.

import { sql, gte } from "drizzle-orm"
import { decisionLogs } from "@/db/schema/shared"
import type { Db } from "@/db/types"
import type { ActionHandlerRegistry } from "@/lib/scheduler"
import type { SchedulerDb } from "@/lib/scheduler/api"
import type { DecisionLogDb } from "@/lib/decisions/logger"
import { logDecision } from "@/lib/decisions/logger"
import {
  checkCeremonyIdempotency,
  logCeremonyRun,
  scheduleCeremonyNextRun,
  getNextRunDate,
  computeInputsHash,
  currentMonth,
} from "@/domains/intelligence/ceremony/infrastructure"
import { getFeatureGateFrictionSummary } from "@/domains/operations/friction/queries"
import {
  computeFrictionRatios,
  findEscalationGates,
  FUNNEL_SPEC,
  type GateConversionAttribution,
} from "@/domains/intelligence/commercial/funnel-analysis"

const SPEC = {
  CONVERSION_FIRING_RATE_LOW: 0.05,
  CONVERSION_FIRING_RATE_HIGH: 0.50,
  FRICTION_RATIO_ESCALATION: FUNNEL_SPEC.FRICTION_RATIO_ESCALATION,
}

export type ConversionFunnelAnalysisDeps = {
  db: Db
  schedulerDb: SchedulerDb
  decisionLogDb: DecisionLogDb
}

type TriggerStats = {
  triggerType: string
  total: number
  fired: number
  firingRate: number
}

export function registerConversionFunnelAnalysisHandler(
  registry: ActionHandlerRegistry,
  deps: ConversionFunnelAnalysisDeps,
): void {
  registry.register("conversion_funnel_analysis", async (_params) => {
    const ceremonyType = "conversion_funnel_analysis" as const
    const hash = computeInputsHash({ month: currentMonth() })
    const nextRunAt = getNextRunDate(ceremonyType)

    // 1. Idempotency guard — AC-56
    const idem = await checkCeremonyIdempotency(deps.db, ceremonyType, hash)
    if (idem.skip) {
      await scheduleCeremonyNextRun(deps.schedulerDb, ceremonyType, nextRunAt)
      return
    }

    // 2. Prerequisite — AC-60: need conversion_trigger_evaluation decisions from last 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const triggerDecisions = await deps.db
      .select({
        inputs: decisionLogs.inputs,
        output: decisionLogs.output,
      })
      .from(decisionLogs)
      .where(
        sql`${decisionLogs.decisionType} = 'conversion_trigger_evaluation' AND ${decisionLogs.createdAt} >= ${thirtyDaysAgo}`,
      )

    if (triggerDecisions.length === 0) {
      // Insufficient data — AC-60, Pattern #15
      await logCeremonyRun(deps.db, {
        ceremonyType,
        status: "completed",
        inputsHash: hash,
        outputs: { status: "insufficient_data", reason: "no conversion_trigger_evaluation decision logs this month" },
        decisionsLogged: 0,
        nextScheduledAt: nextRunAt,
      })
      await scheduleCeremonyNextRun(deps.schedulerDb, ceremonyType, nextRunAt)
      return
    }

    // 3. Group trigger decisions by triggerType
    const triggerMap = new Map<string, { total: number; fired: number }>()
    for (const row of triggerDecisions) {
      const inputs = row.inputs as Record<string, unknown>
      const output = row.output as Record<string, unknown>
      const triggerType = (inputs.triggerType as string) ?? "unknown"
      const entry = triggerMap.get(triggerType) ?? { total: 0, fired: 0 }
      entry.total += 1
      if (output.triggered === true || output.fired === true) {
        entry.fired += 1
      }
      triggerMap.set(triggerType, entry)
    }

    // 4. Compute per-trigger stats
    const perTrigger: TriggerStats[] = []
    let totalFirings = 0
    let decisionsLogged = 0

    for (const [triggerType, counts] of triggerMap.entries()) {
      const firingRate = counts.total > 0 ? counts.fired / counts.total : 0
      totalFirings += counts.fired
      perTrigger.push({ triggerType, total: counts.total, fired: counts.fired, firingRate })

      // AC-68: threshold adjustment for outlier firing rates
      if (firingRate < SPEC.CONVERSION_FIRING_RATE_LOW || firingRate > SPEC.CONVERSION_FIRING_RATE_HIGH) {
        await logDecision(deps.decisionLogDb, {
          domain: "commercial",
          decisionType: "conversion_threshold_adjustment",
          inputs: { triggerType, firingRate, total: counts.total, fired: counts.fired },
          output: {
            recommendation: firingRate < SPEC.CONVERSION_FIRING_RATE_LOW
              ? "increase_sensitivity"
              : "decrease_sensitivity",
            currentRate: firingRate,
            thresholdLow: SPEC.CONVERSION_FIRING_RATE_LOW,
            thresholdHigh: SPEC.CONVERSION_FIRING_RATE_HIGH,
          },
          confidence: 0.7,
        })
        decisionsLogged += 1
      }
    }

    // --- S9 AC-77/78: Per-gate friction ratio computation ---
    let frictionRatios: GateConversionAttribution[] = []
    const frictionSummary = await getFeatureGateFrictionSummary(deps.db, "30d")

    if (frictionSummary.gates.length > 0) {
      frictionRatios = computeFrictionRatios(frictionSummary.gates, perTrigger)

      // AC-78: Escalate gates exceeding 5:1 friction ratio
      const escalationGates = findEscalationGates(frictionRatios)
      for (const gate of escalationGates) {
        await logDecision(deps.decisionLogDb, {
          domain: "commercial",
          decisionType: "conversion_threshold_adjustment",
          inputs: {
            gate: gate.gate,
            complaints: gate.complaints,
            conversions: gate.conversions,
            frictionRatio: gate.frictionRatio,
          },
          output: {
            recommendation: "escalate_to_principal",
            reason: "Friction ratio exceeds 5:1 threshold",
            frictionRatio: gate.frictionRatio,
          },
          confidence: 0.8,
        })
        decisionsLogged += 1
      }
    }

    // 5. Build report and log ceremony run — AC-69
    const report = {
      period: currentMonth(),
      perTrigger,
      totalFirings,
      overallConversionRate: 0,
      triggerDecisionCount: triggerDecisions.length,
      decisionsLogged,
      frictionRatios,
    }

    await logCeremonyRun(deps.db, {
      ceremonyType,
      status: "completed",
      inputsHash: hash,
      outputs: report,
      decisionsLogged,
      nextScheduledAt: nextRunAt,
    })

    // 6. Self-perpetuate — AC-55
    await scheduleCeremonyNextRun(deps.schedulerDb, ceremonyType, nextRunAt)
  })
}
