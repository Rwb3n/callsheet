// sla_breach_warning handler — S7 §2.7, CS-WORK-058 AC-2.5, AC-2.6
// Fires at 80% SLA duration. Creates admin notification. No-ops if ticket already resolved.

import { eq } from "drizzle-orm"
import { supportTickets } from "@/db/schema/operations"
import type { Db } from "@/db/types"
import type { ActionHandlerRegistry } from "@/lib/scheduler"
import type { NotificationDb } from "@/lib/notifications"
import { createNotification } from "@/lib/notifications"

export function registerSlaBreachWarningHandler(
  registry: ActionHandlerRegistry,
  deps: { db: Db; notificationDb: NotificationDb; adminAccountId: string },
): void {
  registry.register("sla_breach_warning", async (params) => {
    const { ticketId, slaDeadline } = params

    const [ticket] = await deps.db
      .select({ status: supportTickets.status, subject: supportTickets.subject })
      .from(supportTickets)
      .where(eq(supportTickets.id, ticketId))
      .limit(1)

    // Guard: ticket resolved/closed between scheduling and execution
    if (!ticket || ticket.status === "resolved" || ticket.status === "closed") return

    await createNotification(deps.notificationDb, {
      accountId: deps.adminAccountId,
      type: "task_overdue",
      title: "SLA breach approaching",
      body: `Ticket "${ticket.subject}" — SLA deadline ${slaDeadline}`,
      link: `/admin/support/${ticketId}`,
    })
  })
}
