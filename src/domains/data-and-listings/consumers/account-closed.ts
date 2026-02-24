// Account closed consumer — D&L §2.6
// No-op at S1. Registered for matrix completeness.
// S7+ implements listing archival and enrichment suspension.

import type { EventHandler } from "@/lib/events/types"

export function accountClosedHandler(): EventHandler<"account_closed"> {
  return {
    domain: "data-and-listings",
    eventType: "account_closed",
    mode: "async",
    handler: async () => {},
  }
}
