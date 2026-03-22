// contact_attempt → outreach prioritisation — S7 §9.11

import type { EventHandler } from "@/lib/events/types"
import type { DecisionLogDb } from "@/lib/decisions/logger"
import { logDecision } from "@/lib/decisions/logger"

export function contactAttemptHandler(
  deps: { decisionLogDb: DecisionLogDb },
): EventHandler<"contact_attempt"> {
  return {
    domain: "operations",
    eventType: "contact_attempt",
    mode: "async",
    handler: async (payload) => {
      if (payload.result !== "unreachable") return

      await logDecision(deps.decisionLogDb, {
        domain: "operations",
        decisionType: "support_triage",
        inputs: { listingId: payload.listingId, contactResult: payload.result },
        output: { action: "outreach_signal_logged" },
        listingId: payload.listingId,
      })
    },
  }
}
