// Intelligence consumer: decay_signal_detected — AC-91
// Annotates decay signal with support ticket info if active ticket exists.

import { eq, isNull, and } from "drizzle-orm"
import type { Db } from "@/db/types"
import type { EventHandler } from "@/lib/events/types"
import { decaySignals } from "@/db/schema/intelligence"
import { hasActiveTicket } from "@/domains/operations/support/queries"

export type DecaySignalDetectedDeps = { db: Db }

export function decaySignalDetectedHandler(deps: DecaySignalDetectedDeps): EventHandler<"decay_signal_detected"> {
  return {
    domain: "intelligence",
    eventType: "decay_signal_detected",
    mode: "async",
    handler: async (event) => {
      const ticket = await hasActiveTicket(deps.db, event.listingId)
      if (!ticket) return

      // Annotate the most recent unresolved signal for this listing
      const [latestSignal] = await deps.db
        .select({ id: decaySignals.id, checkDetails: decaySignals.checkDetails })
        .from(decaySignals)
        .where(
          and(
            eq(decaySignals.listingId, event.listingId),
            isNull(decaySignals.resolvedAt),
          ),
        )
        .orderBy(decaySignals.detectedAt)
        .limit(1)

      if (!latestSignal) return

      const updatedDetails = {
        ...(latestSignal.checkDetails ?? {}),
        supportAnnotation: {
          ticketId: ticket.ticketId,
          category: ticket.category,
          openedAt: ticket.openedAt.toISOString(),
        },
      }

      await deps.db
        .update(decaySignals)
        .set({ checkDetails: updatedDetails })
        .where(eq(decaySignals.id, latestSignal.id))
    },
  }
}
