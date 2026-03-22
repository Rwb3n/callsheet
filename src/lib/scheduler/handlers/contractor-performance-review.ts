// contractor_performance_review ceremony handler — S9 §4.2, AC-55/56/62/69
// Quarterly. Reviews task spec completion rates per contractor.
// Self-perpetuating deferred action pattern.

import { sql, gte, and, inArray } from "drizzle-orm"
import { taskSpecs } from "@/db/schema/operations"
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
  currentQuarter,
  startOfQuarter,
} from "@/domains/intelligence/ceremony/infrastructure"

export type ContractorPerformanceReviewDeps = {
  db: Db
  schedulerDb: SchedulerDb
  decisionLogDb: DecisionLogDb
}

type ContractorStats = {
  assignedTo: string
  taskCount: number
  completedCount: number
  timedOutCount: number
  completionRate: number
}

export function registerContractorPerformanceReviewHandler(
  registry: ActionHandlerRegistry,
  deps: ContractorPerformanceReviewDeps,
): void {
  registry.register("contractor_performance_review", async (_params) => {
    const ceremonyType = "contractor_performance_review" as const
    const hash = computeInputsHash({ quarter: currentQuarter() })
    const nextRunAt = getNextRunDate(ceremonyType)

    // 1. Idempotency guard — AC-56
    const idem = await checkCeremonyIdempotency(deps.db, ceremonyType, hash)
    if (idem.skip) {
      await scheduleCeremonyNextRun(deps.schedulerDb, ceremonyType, nextRunAt)
      return
    }

    // 2. AC-62: Prerequisite — task specs completed or timed out this quarter
    const now = new Date()
    const quarterStart = startOfQuarter(now)

    const tasks = await deps.db
      .select({
        id: taskSpecs.id,
        status: taskSpecs.status,
        // taskSpecs doesn't have an assignedTo text column — use externalRef as contractor identifier
        // The schema has domain, priority, status, task, context, etc. but no assignedTo column.
        // Use context->>'assignedTo' or externalRef as proxy.
        externalRef: taskSpecs.externalRef,
        updatedAt: sql<Date>`${taskSpecs.completedAt}`,
      })
      .from(taskSpecs)
      .where(
        and(
          inArray(taskSpecs.status, ["completed", "timed_out"]),
          gte(taskSpecs.completedAt, quarterStart),
        ),
      )

    if (tasks.length === 0) {
      // Insufficient data — AC-62, Pattern #15
      await logCeremonyRun(deps.db, {
        ceremonyType,
        status: "completed",
        inputsHash: hash,
        outputs: { status: "insufficient_data", reason: "no completed task_specs this quarter" },
        decisionsLogged: 0,
        nextScheduledAt: nextRunAt,
      })
      await scheduleCeremonyNextRun(deps.schedulerDb, ceremonyType, nextRunAt)
      return
    }

    // 3. Group by contractor (externalRef as contractor identifier)
    const contractorMap = new Map<string, { completed: number; timedOut: number; total: number }>()
    for (const task of tasks) {
      const contractor = task.externalRef ?? "unassigned"
      const entry = contractorMap.get(contractor) ?? { completed: 0, timedOut: 0, total: 0 }
      entry.total += 1
      if (task.status === "completed") entry.completed += 1
      if (task.status === "timed_out") entry.timedOut += 1
      contractorMap.set(contractor, entry)
    }

    // 4. Compute per-contractor stats
    const contractors: ContractorStats[] = []
    for (const [assignedTo, counts] of contractorMap.entries()) {
      contractors.push({
        assignedTo,
        taskCount: counts.total,
        completedCount: counts.completed,
        timedOutCount: counts.timedOut,
        completionRate: counts.total > 0 ? counts.completed / counts.total : 0,
      })
    }

    // 5. Build report
    const report = {
      quarter: currentQuarter(),
      contractors,
      totalTasks: tasks.length,
    }

    // 6. Log ceremony run — AC-69 (decisionsLogged: 0)
    await logCeremonyRun(deps.db, {
      ceremonyType,
      status: "completed",
      inputsHash: hash,
      outputs: report,
      decisionsLogged: 0,
      nextScheduledAt: nextRunAt,
    })

    // 7. Self-perpetuate — AC-55
    await scheduleCeremonyNextRun(deps.schedulerDb, ceremonyType, nextRunAt)
  })
}
