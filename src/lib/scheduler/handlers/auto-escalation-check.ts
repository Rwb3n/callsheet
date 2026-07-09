// auto_escalation_check handler — SI §3.4, CS-WORK-083 AC-8
// Scheduled at flow creation for deadline proximity alerts (7d, 3d).
// Checks orchestrated_flows deadline and creates notifications / escalates.

import { eq } from "drizzle-orm"
import { orchestratedFlows } from "@/db/schema/shared"
import type { Db } from "@/db/types"
import type { ActionHandlerRegistry } from "@/lib/scheduler"
import type { NotificationDb } from "@/lib/notifications"
import { createNotification } from "@/lib/notifications"

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000

export function registerAutoEscalationCheckHandler(
  registry: ActionHandlerRegistry,
  deps: {
    db: Db
    notificationDb: NotificationDb
    adminAccountId: string
  },
): void {
  registry.register("auto_escalation_check", async (params) => {
    const { flowId } = params

    const [flow] = await deps.db
      .select({
        id: orchestratedFlows.id,
        status: orchestratedFlows.status,
        deadline: orchestratedFlows.deadline,
        flowType: orchestratedFlows.flowType,
      })
      .from(orchestratedFlows)
      .where(eq(orchestratedFlows.id, flowId))

    if (!flow) return
    // Flow already resolved — no action needed
    if (flow.status === "completed" || flow.status === "escalated") return

    if (!flow.deadline) return

    const now = new Date()
    const msRemaining = flow.deadline.getTime() - now.getTime()
    const daysRemaining = Math.ceil(msRemaining / (24 * 60 * 60 * 1000))

    if (msRemaining <= 0) {
      // Deadline passed — critical alert + escalate
      await deps.db
        .update(orchestratedFlows)
        .set({
          status: "escalated",
          escalatedAt: now,
          escalationReason: `${flow.flowType} flow deadline passed`,
          updatedAt: now,
        })
        .where(eq(orchestratedFlows.id, flowId))

      await createNotification(deps.notificationDb, {
        accountId: deps.adminAccountId,
        type: "compliance_deadline",
        title: `CRITICAL: ${flow.flowType} flow deadline passed`,
        body: `Flow ${flowId} deadline has passed. Immediate action required.`,
        link: `/admin/flows/${flowId}`,
      })
    } else if (msRemaining <= THREE_DAYS_MS) {
      // 3 days remaining — auto-escalate
      await deps.db
        .update(orchestratedFlows)
        .set({
          status: "escalated",
          escalatedAt: now,
          escalationReason: `${flow.flowType} flow deadline in ${daysRemaining} days`,
          updatedAt: now,
        })
        .where(eq(orchestratedFlows.id, flowId))

      await createNotification(deps.notificationDb, {
        accountId: deps.adminAccountId,
        type: "compliance_deadline",
        title: `${flow.flowType} flow deadline in ${daysRemaining} days`,
        body: `Flow ${flowId} auto-escalated. ${daysRemaining} days remaining.`,
        link: `/admin/flows/${flowId}`,
      })
    } else {
      // 7 days remaining — alert only (no escalation)
      await createNotification(deps.notificationDb, {
        accountId: deps.adminAccountId,
        type: "compliance_deadline",
        title: `${flow.flowType} flow deadline approaching`,
        body: `Flow ${flowId} deadline in ${daysRemaining} days.`,
        link: `/admin/flows/${flowId}`,
      })
    }
  })
}
