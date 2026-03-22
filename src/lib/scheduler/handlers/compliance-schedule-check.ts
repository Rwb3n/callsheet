// compliance_schedule_check handler — S7 §5.4, CS-WORK-060 AC-5.3
// Daily recurring. Scans compliance_register for approaching deadlines + marks overdue.
// Self-perpetuates with 24h delay.

import { and, inArray, isNotNull, sql, lt } from "drizzle-orm"
import { complianceRegister } from "@/db/schema/operations"
import type { Db } from "@/db/types"
import type { ActionHandlerRegistry } from "@/lib/scheduler"
import type { SchedulerDb } from "@/lib/scheduler/api"
import type { DecisionLogDb } from "@/lib/decisions/logger"
import type { NotificationDb } from "@/lib/notifications"
import { scheduleDeferredAction } from "@/lib/scheduler/api"
import { logDecision } from "@/lib/decisions/logger"
import { createNotification } from "@/lib/notifications"

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000

export function registerComplianceScheduleCheckHandler(
  registry: ActionHandlerRegistry,
  deps: {
    db: Db
    schedulerDb: SchedulerDb
    decisionLogDb: DecisionLogDb
    notificationDb: NotificationDb
    adminAccountId: string
  },
): void {
  registry.register("compliance_schedule_check", async () => {
    const now = new Date()
    const sevenDaysAhead = new Date(now.getTime() + SEVEN_DAYS_MS)

    // Entries approaching deadline within 7 days
    const approachingEntries = await deps.db
      .select({
        id: complianceRegister.id,
        type: complianceRegister.type,
        deadline: complianceRegister.deadline,
      })
      .from(complianceRegister)
      .where(
        and(
          inArray(complianceRegister.status, ["open", "in_progress"]),
          isNotNull(complianceRegister.deadline),
          sql`${complianceRegister.deadline} BETWEEN now() AND ${sevenDaysAhead}`,
        ),
      )

    for (const entry of approachingEntries) {
      const daysRemaining = entry.deadline
        ? Math.ceil((entry.deadline.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
        : 0

      await createNotification(deps.notificationDb, {
        accountId: deps.adminAccountId,
        type: "compliance_deadline",
        title: `${entry.type} deadline approaching`,
        body: `${entry.type} entry ${entry.id} deadline in ${daysRemaining} days`,
        link: `/admin/compliance/${entry.id}`,
      })
    }

    // Mark overdue entries
    const overdueEntries = await deps.db
      .select({ id: complianceRegister.id })
      .from(complianceRegister)
      .where(
        and(
          inArray(complianceRegister.status, ["open", "in_progress"]),
          isNotNull(complianceRegister.deadline),
          lt(complianceRegister.deadline, now),
        ),
      )

    for (const entry of overdueEntries) {
      await deps.db
        .update(complianceRegister)
        .set({ status: "overdue" })
        .where(sql`${complianceRegister.id} = ${entry.id}`)
    }

    // Self-perpetuate: schedule next check in 24h
    await scheduleDeferredAction(deps.schedulerDb, {
      action: "compliance_schedule_check",
      params: {},
      executeAt: new Date(now.getTime() + TWENTY_FOUR_HOURS_MS),
      retryPolicy: "retry_3",
      onFailure: "alert_principal",
      createdBy: "compliance_schedule_check.self_perpetuate",
    })

    await logDecision(deps.decisionLogDb, {
      domain: "operations",
      decisionType: "compliance_scheduling",
      inputs: { approachingCount: approachingEntries.length, overdueCount: overdueEntries.length },
      output: { notificationsCreated: approachingEntries.length, overdueTransitions: overdueEntries.length },
    })
  })
}
