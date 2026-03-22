// Intelligence consumer: contact_attempt — AC-89
// Unreachable result → evaluate decay response. Reached → no-op.

import { eq, isNull } from "drizzle-orm"
import type { Db } from "@/db/types"
import type { EventHandler } from "@/lib/events/types"
import { decaySignals } from "@/db/schema/intelligence"
import { evaluateDecayResponse } from "@/domains/data-and-listings/decay/detection"
import { hasActiveTicket } from "@/domains/operations/support/queries"
import type { InProcessEventBus } from "@/lib/events/bus"
import type { WaitUntilFn } from "@/lib/events/waitUntil"

export type ContactAttemptDeps = {
  db: Db
  bus: InProcessEventBus
  waitUntilFn: WaitUntilFn
}

export function contactAttemptHandler(deps: ContactAttemptDeps): EventHandler<"contact_attempt"> {
  return {
    domain: "intelligence",
    eventType: "contact_attempt",
    mode: "async",
    handler: async (event) => {
      if (event.result === "reached") return

      // Load existing unresolved signals for this listing
      const existingSignals = await deps.db
        .select({
          id: decaySignals.id,
          signalType: decaySignals.signalType,
          resolvedAt: decaySignals.resolvedAt,
          checkDetails: decaySignals.checkDetails,
        })
        .from(decaySignals)
        .where(eq(decaySignals.listingId, event.listingId))

      const ticket = await hasActiveTicket(deps.db, event.listingId)

      await evaluateDecayResponse({
        listingId: event.listingId,
        signal: {
          signalType: "email_bounced",
          severity: "high",
          checkDetails: {
            source: "contact_attempt",
            reporterAccountId: event.reporterAccountId,
            timestamp: event.timestamp,
          },
        },
        existingSignals: existingSignals.map((s) => ({
          id: s.id,
          signalType: s.signalType,
          resolvedAt: s.resolvedAt,
          checkDetails: s.checkDetails,
        })),
        hasActiveSupportTicket: ticket,
        deps: {
          updateSignal: async (id, checkDetails) => {
            await deps.db
              .update(decaySignals)
              .set({ checkDetails })
              .where(eq(decaySignals.id, id))
          },
          insertSignal: async (signal) => {
            const [row] = await deps.db
              .insert(decaySignals)
              .values({
                listingId: signal.listingId,
                signalType: signal.signalType as "email_bounced",
                severity: signal.severity as "high",
                checkDetails: signal.checkDetails,
              })
              .returning({ id: decaySignals.id })
            return row.id
          },
          logDecision: async () => {
            // Decision logging handled by evaluateDecayResponse internally
          },
          emitEvent: async (payload) => {
            await deps.bus.emit("decay_signal_detected", payload, deps.waitUntilFn)
          },
        },
      })
    },
  }
}
