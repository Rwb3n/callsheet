// sponsored_placement_learning ceremony handler — S9 §5.6, AC-55/56/69/81
// Monthly. Analyses quality floor exclusion rates and fairness cap activation.
// Self-perpetuating deferred action pattern.

import { sql, gte } from "drizzle-orm"
import { decisionLogs } from "@/db/schema/shared"
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
  analyseSponsoredPlacements,
  INSUFFICIENT_DATA_RESULT,
  type PlacementDecisionContext,
} from "@/domains/intelligence/commercial/sponsored-learning"

export type SponsoredPlacementLearningDeps = {
  db: Db
  schedulerDb: SchedulerDb
  decisionLogDb: DecisionLogDb
}

export function registerSponsoredPlacementLearningHandler(
  registry: ActionHandlerRegistry,
  deps: SponsoredPlacementLearningDeps,
): void {
  registry.register("sponsored_placement_learning", async (_params) => {
    const ceremonyType = "sponsored_placement_learning" as const
    const hash = computeInputsHash({ month: currentMonth() })
    const nextRunAt = getNextRunDate(ceremonyType)

    // 1. Idempotency guard — AC-56
    const idem = await checkCeremonyIdempotency(deps.db, ceremonyType, hash)
    if (idem.skip) {
      await scheduleCeremonyNextRun(deps.schedulerDb, ceremonyType, nextRunAt)
      return
    }

    // 2. Query decision logs for sponsored_placement_selection in last 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const decisions = await deps.db
      .select({
        inputs: decisionLogs.inputs,
      })
      .from(decisionLogs)
      .where(
        sql`${decisionLogs.decisionType} = 'sponsored_placement_selection' AND ${decisionLogs.createdAt} >= ${thirtyDaysAgo}`,
      )

    // 3. If no decisions, log insufficient_data and schedule next run
    if (decisions.length === 0) {
      await logCeremonyRun(deps.db, {
        ceremonyType,
        status: "completed",
        inputsHash: hash,
        outputs: { status: "insufficient_data", ...INSUFFICIENT_DATA_RESULT },
        decisionsLogged: 0,
        nextScheduledAt: nextRunAt,
      })
      await scheduleCeremonyNextRun(deps.schedulerDb, ceremonyType, nextRunAt)
      return
    }

    // 4. Extract PlacementDecisionContext from each decision's inputs JSONB
    const contexts: PlacementDecisionContext[] = decisions.map(row => {
      const inputs = row.inputs as Record<string, unknown>
      const context = (inputs.context ?? inputs) as Record<string, unknown>
      return {
        paidAndEligible: context.paidAndEligible === true,
        excludedReason: context.excludedReason as string | undefined,
        serviceArea: context.serviceArea as string | undefined,
        fairnessCapReached: context.fairnessCapReached === true,
      }
    })

    // 5. Analyse sponsored placements
    const result = analyseSponsoredPlacements(contexts)

    // 6. Log ceremony run — AC-69
    await logCeremonyRun(deps.db, {
      ceremonyType,
      status: "completed",
      inputsHash: hash,
      outputs: { period: currentMonth(), ...result },
      decisionsLogged: 0,
      nextScheduledAt: nextRunAt,
    })

    // 7. Self-perpetuate — AC-55
    await scheduleCeremonyNextRun(deps.schedulerDb, ceremonyType, nextRunAt)
  })
}
