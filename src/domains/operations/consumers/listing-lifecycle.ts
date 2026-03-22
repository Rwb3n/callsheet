// listing_archived, listing_suspended, listing_reactivated — S7 §9.4, §9.5, §9.6

import { eq, and, inArray } from "drizzle-orm"
import { supportTickets } from "@/db/schema/operations"
import type { Db } from "@/db/types"
import type { EventHandler } from "@/lib/events/types"
import type { DecisionLogDb } from "@/lib/decisions/logger"
import type { SchedulerDb } from "@/lib/scheduler/api"
import { logDecision } from "@/lib/decisions/logger"
import { cancelDeferredAction } from "@/lib/scheduler/api"

type Deps = { db: Db; decisionLogDb: DecisionLogDb; schedulerDb: SchedulerDb }

async function closeTicketsForListing(
  deps: Deps,
  listingId: string,
  trigger: string,
): Promise<void> {
  const active = await deps.db
    .select({ id: supportTickets.id, slaDeadline: supportTickets.slaDeadline })
    .from(supportTickets)
    .where(and(
      eq(supportTickets.listingId, listingId),
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
        cancelledBy: `operations:${trigger}`,
      })
    }
  }

  await logDecision(deps.decisionLogDb, {
    domain: "operations",
    decisionType: "support_triage",
    inputs: { trigger, listingId },
    output: { action: "tickets_closed", count: active.length },
  })
}

export function listingArchivedHandler(deps: Deps): EventHandler<"listing_archived"> {
  return {
    domain: "operations",
    eventType: "listing_archived",
    mode: "async",
    handler: async (payload) => {
      await closeTicketsForListing(deps, payload.listingId, "listing_archived")
    },
  }
}

export function listingSuspendedHandler(deps: Deps): EventHandler<"listing_suspended"> {
  return {
    domain: "operations",
    eventType: "listing_suspended",
    mode: "async",
    handler: async (payload) => {
      await closeTicketsForListing(deps, payload.listingId, "listing_suspended")
    },
  }
}

export function listingReactivatedHandler(deps: Deps): EventHandler<"listing_reactivated"> {
  return {
    domain: "operations",
    eventType: "listing_reactivated",
    mode: "async",
    handler: async (payload) => {
      await logDecision(deps.decisionLogDb, {
        domain: "operations",
        decisionType: "support_triage",
        inputs: { trigger: "listing_reactivated", listingId: payload.listingId },
        output: { action: "outreach_resumed" },
        listingId: payload.listingId,
      })
    },
  }
}
