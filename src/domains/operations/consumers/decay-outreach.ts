// decay_signal_detected → outreach with email delivery — S7 §9.7, §11.2
// AC-11.4 through AC-11.8

import { eq } from "drizzle-orm"
import { listings } from "@/db/schema/data-and-listings"
import { user } from "@/db/schema/auth"
import type { Db } from "@/db/types"
import type { EventHandler } from "@/lib/events/types"
import type { DecisionLogDb } from "@/lib/decisions/logger"
import type { EmailService } from "@/lib/email/types"
import { logDecision } from "@/lib/decisions/logger"

type Deps = { db: Db; decisionLogDb: DecisionLogDb; emailService: EmailService }

export function decayOutreachHandler(deps: Deps): EventHandler<"decay_signal_detected"> {
  return {
    domain: "operations",
    eventType: "decay_signal_detected",
    mode: "async",
    handler: async (payload) => {
      // AC-11.4: skip email when activeSupportTicket present
      if (payload.activeSupportTicket) {
        // AC-11.5: decision log with action: decay_warning_suppressed
        await logDecision(deps.decisionLogDb, {
          domain: "operations",
          decisionType: "decay_response",
          inputs: {
            listingId: payload.listingId,
            signalSeverity: payload.signal.severity,
            activeTicketId: payload.activeSupportTicket,
          },
          output: { action: "decay_warning_suppressed", reason: "active_support_ticket" },
        })
        return
      }

      // AC-11.6: resolve listing owner, skip for unclaimed
      const [listing] = await deps.db
        .select({ accountId: listings.accountId, name: listings.name })
        .from(listings)
        .where(eq(listings.id, payload.listingId))

      if (!listing?.accountId) {
        await logDecision(deps.decisionLogDb, {
          domain: "operations",
          decisionType: "decay_response",
          inputs: { listingId: payload.listingId, signalSeverity: payload.signal.severity },
          output: { action: "skipped", reason: "unclaimed_listing" },
        })
        return
      }

      const [account] = await deps.db
        .select({ email: user.email })
        .from(user)
        .where(eq(user.id, listing.accountId))

      if (!account?.email) return

      // AC-11.7, AC-11.7a, AC-11.8: send with try/catch, failures do NOT propagate
      try {
        await deps.emailService.send({
          to: account.email,
          template: "listing_decay_warning",
          data: {
            listingId: payload.listingId,
            signalType: payload.signal.type,
            signalSeverity: payload.signal.severity,
            listingName: listing.name,
          },
          category: "listing_status",
          accountId: listing.accountId,
        })
      } catch {
        // AC-11.8: email failures caught, do NOT propagate
      }

      await logDecision(deps.decisionLogDb, {
        domain: "operations",
        decisionType: "decay_response",
        inputs: { listingId: payload.listingId, signalSeverity: payload.signal.severity },
        output: { action: "decay_warning_sent", recipientAccountId: listing.accountId },
        listingId: payload.listingId,
      })
    },
  }
}
