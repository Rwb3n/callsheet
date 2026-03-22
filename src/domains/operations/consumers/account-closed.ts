// account_closed → close tickets + compliance — S7 §9.9

import { eq, and, inArray, notInArray } from "drizzle-orm"
import { supportTickets, complianceRegister } from "@/db/schema/operations"
import type { Db } from "@/db/types"
import type { EventHandler } from "@/lib/events/types"
import type { DecisionLogDb } from "@/lib/decisions/logger"
import type { SchedulerDb } from "@/lib/scheduler/api"
import type { NotificationDb } from "@/lib/notifications"
import { logDecision } from "@/lib/decisions/logger"
import { cancelDeferredAction } from "@/lib/scheduler/api"

type Deps = {
  db: Db
  decisionLogDb: DecisionLogDb
  schedulerDb: SchedulerDb
  notificationDb: NotificationDb
  adminAccountId: string
}

export function accountClosedHandler(deps: Deps): EventHandler<"account_closed"> {
  return {
    domain: "operations",
    eventType: "account_closed",
    mode: "async",
    handler: async (payload) => {
      // Close all active tickets for the account
      const active = await deps.db
        .select({ id: supportTickets.id, slaDeadline: supportTickets.slaDeadline })
        .from(supportTickets)
        .where(and(
          eq(supportTickets.accountId, payload.accountId),
          inArray(supportTickets.status, ["open", "assigned"]),
        ))

      for (const ticket of active) {
        await deps.db
          .update(supportTickets)
          .set({ status: "closed", closedAt: new Date() })
          .where(and(
            eq(supportTickets.id, ticket.id),
            inArray(supportTickets.status, ["open", "assigned"]),
          ))

        if (ticket.slaDeadline) {
          await cancelDeferredAction(deps.schedulerDb, {
            action: "sla_breach_warning",
            filterParams: { ticketId: ticket.id },
            cancelledBy: "operations:account_closed",
          })
        }
      }

      // Update compliance register: complete non-DSAR/investigation entries
      await deps.db
        .update(complianceRegister)
        .set({ status: "completed", completedAt: new Date() })
        .where(and(
          eq(complianceRegister.accountId, payload.accountId),
          notInArray(complianceRegister.type, ["dsar", "investigation"]),
          inArray(complianceRegister.status, ["open", "in_progress"]),
        ))

      // If compliance hold active, create monitor note + admin notification
      if (payload.complianceHoldActive) {
        await deps.db.insert(complianceRegister).values({
          type: "obligation",
          accountId: payload.accountId,
          status: "open",
          details: {
            note: "Compliance hold active at account closure. Monitor until resolved.",
            closedAccountId: payload.accountId,
          },
        })

        await deps.notificationDb.insert({
          id: crypto.randomUUID(),
          accountId: deps.adminAccountId,
          type: "compliance_deadline",
          title: "Compliance hold persists after account closure",
          body: `Account ${payload.accountId} closed with active compliance hold.`,
          link: "/admin/compliance",
          dismissed: false,
          createdAt: new Date().toISOString(),
        })
      }

      await logDecision(deps.decisionLogDb, {
        domain: "operations",
        decisionType: "support_triage",
        inputs: {
          trigger: "account_closed",
          accountId: payload.accountId,
          complianceHoldActive: payload.complianceHoldActive ?? false,
        },
        output: {
          ticketsClosed: active.length,
          complianceEntriesUpdated: true,
          holdMonitorCreated: payload.complianceHoldActive ?? false,
        },
      })
    },
  }
}
