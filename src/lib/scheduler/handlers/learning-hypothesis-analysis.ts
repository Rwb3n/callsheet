// learning_hypothesis_analysis ceremony handler — S9 §5.1, AC-71/72/73/55/56/69
// Monthly. Measures L1-L7 hypotheses against decision_logs, updates learning_hypotheses
// rows with trend + confound warnings. Self-perpetuating deferred action pattern.

import { sql, eq } from "drizzle-orm"
import { decisionLogs } from "@/db/schema/shared"
import { learningHypotheses } from "@/db/schema/intelligence"
import type { Db } from "@/db/types"
import type { ActionHandlerRegistry } from "@/lib/scheduler"
import type { SchedulerDb } from "@/lib/scheduler/api"
import type { DecisionLogDb } from "@/lib/decisions/logger"
import {
  checkCeremonyIdempotency,
  logCeremonyRun,
  scheduleCeremonyNextRun,
  getNextRunDate,
  computeInputsHash,
  currentMonth,
} from "@/domains/intelligence/ceremony/infrastructure"
import {
  HYPOTHESIS_MEASUREMENT_CONFIG,
  computeHypothesisMeasurement,
  type HypothesisMeasurement,
  type HypothesisId,
} from "@/domains/intelligence/learning/hypothesis-analysis"

export type LearningHypothesisAnalysisDeps = {
  db: Db
  schedulerDb: SchedulerDb
  decisionLogDb: DecisionLogDb
}

export function registerLearningHypothesisAnalysisHandler(
  registry: ActionHandlerRegistry,
  deps: LearningHypothesisAnalysisDeps,
): void {
  registry.register("learning_hypothesis_analysis", async (_params) => {
    const ceremonyType = "learning_hypothesis_analysis" as const
    const hash = computeInputsHash({ month: currentMonth() })
    const nextRunAt = getNextRunDate(ceremonyType)

    // 1. Idempotency guard — AC-56
    const idem = await checkCeremonyIdempotency(deps.db, ceremonyType, hash)
    if (idem.skip) {
      await scheduleCeremonyNextRun(deps.schedulerDb, ceremonyType, nextRunAt)
      return
    }

    const now = new Date()
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

    // 2. Load all hypothesis rows
    const hypothesisRows = await deps.db.select().from(learningHypotheses)

    // 3. Measure each hypothesis
    const measurements: HypothesisMeasurement[] = []

    for (const row of hypothesisRows) {
      const hypothesisId = row.id as HypothesisId
      const config = HYPOTHESIS_MEASUREMENT_CONFIG[hypothesisId]
      if (!config) continue

      // Count decision_logs matching this hypothesis's decisionType in last 30 days
      const [countRow] = await deps.db
        .select({ count: sql<number>`count(*)::int` })
        .from(decisionLogs)
        .where(
          sql`${decisionLogs.decisionType} = ${config.decisionType} AND ${decisionLogs.createdAt} >= ${thirtyDaysAgo}`,
        )
      const sampleSize = countRow?.count ?? 0

      // V1 simplified: the count IS the measurement value
      const currentValue = sampleSize
      const previousValue = row.currentValue != null ? parseFloat(row.currentValue) : null

      const measurement = computeHypothesisMeasurement(
        hypothesisId,
        sampleSize,
        currentValue,
        previousValue,
        config.improvingDirection,
        thirtyDaysAgo,
      )

      measurements.push(measurement)

      // 4. Update the hypothesis row
      await deps.db
        .update(learningHypotheses)
        .set({
          previousValue: row.currentValue,
          currentValue: String(measurement.currentValue),
          trend: measurement.trend,
          confoundWarning: measurement.confoundWarning,
          lastMeasuredAt: now,
          updatedAt: now,
        })
        .where(eq(learningHypotheses.id, hypothesisId))
    }

    // 5. Log ceremony run — AC-69
    await logCeremonyRun(deps.db, {
      ceremonyType,
      status: "completed",
      inputsHash: hash,
      outputs: { measurements },
      decisionsLogged: 0,
      nextScheduledAt: nextRunAt,
    })

    // 6. Self-perpetuate — AC-55
    await scheduleCeremonyNextRun(deps.schedulerDb, ceremonyType, nextRunAt)
  })
}
