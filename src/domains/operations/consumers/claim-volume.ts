// claim_approved + claim_rejected → volume tracking — S7 §9.2, §9.3

import type { EventHandler } from "@/lib/events/types"
import type { DecisionLogDb } from "@/lib/decisions/logger"
import { logDecision } from "@/lib/decisions/logger"

export function claimApprovedVolumeHandler(
  deps: { decisionLogDb: DecisionLogDb },
): EventHandler<"claim_approved"> {
  return {
    domain: "operations",
    eventType: "claim_approved",
    mode: "async",
    handler: async (payload) => {
      await logDecision(deps.decisionLogDb, {
        domain: "operations",
        decisionType: "claim_volume_tracking",
        inputs: { method: payload.method },
        output: { action: "logged", direction: "approved" },
        listingId: payload.listingId,
      })
    },
  }
}

export function claimRejectedVolumeHandler(
  deps: { decisionLogDb: DecisionLogDb },
): EventHandler<"claim_rejected"> {
  return {
    domain: "operations",
    eventType: "claim_rejected",
    mode: "async",
    handler: async (payload) => {
      await logDecision(deps.decisionLogDb, {
        domain: "operations",
        decisionType: "claim_volume_tracking",
        inputs: {},
        output: { action: "logged", direction: "rejected" },
        listingId: payload.listingId,
      })
    },
  }
}
