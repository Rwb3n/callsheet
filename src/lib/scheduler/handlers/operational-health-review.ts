// operational_health_review ceremony handler — S9 §4.2, §5.6, AC-55/56/69
// Monthly. Full operational health snapshot: support tickets, task specs,
// decay signals, learning hypotheses, decision logs, ceremony runs.
// Self-perpetuating deferred action pattern.

import { sql, gte, and, isNull, eq, count as drizzleCount } from "drizzle-orm"
import { supportTickets, taskSpecs } from "@/db/schema/operations"
import { decaySignals, learningHypotheses, ceremonyRuns } from "@/db/schema/intelligence"
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
import type { OperationalHealthReport } from "@/domains/intelligence/operations/health-review"

export type { OperationalHealthReport }

export type OperationalHealthReviewDeps = {
  db: Db
  schedulerDb: SchedulerDb
  decisionLogDb: DecisionLogDb
}

export function registerOperationalHealthReviewHandler(
  registry: ActionHandlerRegistry,
  deps: OperationalHealthReviewDeps,
): void {
  registry.register("operational_health_review", async (_params) => {
    const ceremonyType = "operational_health_review" as const
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

    // 2. Query learning hypotheses → hypotheses
    const hypothesesRows = await deps.db.select().from(learningHypotheses)
    const hypotheses = hypothesesRows.map((h) => ({
      id: h.id,
      trend: h.trend ?? "unmeasured",
      confoundWarning: h.confoundWarning,
    }))

    // 3. Support ticket trends — §5.6 supportTicketTrends
    const [openCountRow] = await deps.db
      .select({ count: sql<number>`count(*)::int` })
      .from(supportTickets)
      .where(eq(supportTickets.status, "open"))
    const openCount = openCountRow?.count ?? 0

    const [closedCountRow] = await deps.db
      .select({ count: sql<number>`count(*)::int` })
      .from(supportTickets)
      .where(
        and(
          sql`${supportTickets.status} IN ('resolved', 'closed')`,
          gte(supportTickets.resolvedAt, thirtyDaysAgo),
        ),
      )
    const closedCount = closedCountRow?.count ?? 0

    const [avgResolutionRow] = await deps.db
      .select({
        avgDays: sql<number>`coalesce(avg(extract(epoch from (${supportTickets.resolvedAt} - ${supportTickets.createdAt})) / 86400.0), 0)`,
      })
      .from(supportTickets)
      .where(
        and(
          sql`${supportTickets.status} IN ('resolved', 'closed')`,
          gte(supportTickets.resolvedAt, thirtyDaysAgo),
        ),
      )
    const avgResolutionDays = Math.round((Number(avgResolutionRow?.avgDays) || 0) * 100) / 100

    const topCategoryRows = await deps.db
      .select({
        category: supportTickets.category,
        count: sql<number>`count(*)::int`,
      })
      .from(supportTickets)
      .where(gte(supportTickets.createdAt, thirtyDaysAgo))
      .groupBy(supportTickets.category)
      .orderBy(sql`count(*) desc`)
      .limit(5)
    const topCategories = topCategoryRows.map((r) => ({
      category: r.category,
      count: r.count,
    }))

    // 4. Task completion rates — §5.6 taskCompletionRates
    const [totalTasksRow] = await deps.db
      .select({ count: sql<number>`count(*)::int` })
      .from(taskSpecs)
      .where(gte(taskSpecs.createdAt, thirtyDaysAgo))
    const totalTasks = totalTasksRow?.count ?? 0

    const [completedTasksRow] = await deps.db
      .select({ count: sql<number>`count(*)::int` })
      .from(taskSpecs)
      .where(
        and(
          eq(taskSpecs.status, "completed"),
          gte(taskSpecs.completedAt, thirtyDaysAgo),
        ),
      )
    const completedTasks = completedTasksRow?.count ?? 0

    const completionRate = Math.round((completedTasks / Math.max(totalTasks, 1)) * 100) / 100

    const [avgTaskCompletionRow] = await deps.db
      .select({
        avgDays: sql<number>`coalesce(avg(extract(epoch from (${taskSpecs.completedAt} - ${taskSpecs.createdAt})) / 86400.0), 0)`,
      })
      .from(taskSpecs)
      .where(
        and(
          eq(taskSpecs.status, "completed"),
          gte(taskSpecs.completedAt, thirtyDaysAgo),
        ),
      )
    const avgCompletionDays = Math.round((Number(avgTaskCompletionRow?.avgDays) || 0) * 100) / 100

    // 5. Signal summary — §5.6 signalSummary
    const [decisionLogsCountRow] = await deps.db
      .select({ count: sql<number>`count(*)::int` })
      .from(decisionLogs)
      .where(gte(decisionLogs.createdAt, thirtyDaysAgo))
    const decisionLogsThisPeriod = decisionLogsCountRow?.count ?? 0

    const [escalationsCountRow] = await deps.db
      .select({ count: sql<number>`count(*)::int` })
      .from(decisionLogs)
      .where(
        and(
          gte(decisionLogs.createdAt, thirtyDaysAgo),
          sql`${decisionLogs.output}::text LIKE '%escalat%'`,
        ),
      )
    const escalationsThisPeriod = escalationsCountRow?.count ?? 0

    const [ceremonyRunsCountRow] = await deps.db
      .select({ count: sql<number>`count(*)::int` })
      .from(ceremonyRuns)
      .where(gte(ceremonyRuns.startedAt, thirtyDaysAgo))
    const ceremonyRunsThisPeriod = ceremonyRunsCountRow?.count ?? 0

    // 6. Also query decay signals for backwards-compatible fields
    const [decayCountRow] = await deps.db
      .select({ count: sql<number>`count(*)::int` })
      .from(decaySignals)
      .where(gte(decaySignals.detectedAt, thirtyDaysAgo))
    const decaySignalsLast30d = decayCountRow?.count ?? 0

    const [unresolvedDecayRow] = await deps.db
      .select({ count: sql<number>`count(*)::int` })
      .from(decaySignals)
      .where(isNull(decaySignals.resolvedAt))
    const unresolvedDecaySignals = unresolvedDecayRow?.count ?? 0

    // 7. Build full OperationalHealthReport — §5.6
    const report: OperationalHealthReport & {
      period: string
      decaySignalsLast30d: number
      unresolvedDecaySignals: number
    } = {
      period: currentMonth(),
      hypotheses,
      supportTicketTrends: {
        openCount,
        closedCount,
        avgResolutionDays,
        topCategories,
      },
      taskCompletionRates: {
        totalTasks,
        completedTasks,
        completionRate,
        avgCompletionDays,
      },
      signalSummary: {
        decisionLogsThisPeriod,
        escalationsThisPeriod,
        ceremonyRunsThisPeriod,
      },
      // Backwards-compatible fields from original implementation
      decaySignalsLast30d,
      unresolvedDecaySignals,
    }

    // 8. Log ceremony run — AC-69
    await logCeremonyRun(deps.db, {
      ceremonyType,
      status: "completed",
      inputsHash: hash,
      outputs: report,
      decisionsLogged: 0,
      nextScheduledAt: nextRunAt,
    })

    // 9. Self-perpetuate — AC-55
    await scheduleCeremonyNextRun(deps.schedulerDb, ceremonyType, nextRunAt)
  })
}
