// Contact attempt consumer — D&L §3.4
// No-op at S1. Data quality flagging is S9 scope.
// Registered for matrix completeness.

import type { EventHandler } from "@/lib/events/types"

export function contactAttemptHandler(): EventHandler<"contact_attempt"> {
  return {
    domain: "data-and-listings",
    eventType: "contact_attempt",
    mode: "async",
    handler: async () => {},
  }
}
