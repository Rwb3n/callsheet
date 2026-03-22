// listing_created → onboarding tracking — S7 §9.10

import type { EventHandler } from "@/lib/events/types"
import type { DecisionLogDb } from "@/lib/decisions/logger"
import { logDecision } from "@/lib/decisions/logger"

export function listingCreatedTrackingHandler(
  deps: { decisionLogDb: DecisionLogDb },
): EventHandler<"listing_created"> {
  return {
    domain: "operations",
    eventType: "listing_created",
    mode: "async",
    handler: async (payload) => {
      await logDecision(deps.decisionLogDb, {
        domain: "operations",
        decisionType: "onboarding_tracking",
        inputs: { entityType: payload.entityType },
        output: { action: "logged" },
        listingId: payload.listingId,
      })
    },
  }
}
