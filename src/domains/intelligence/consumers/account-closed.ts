// Intelligence consumer: account_closed — AC-87
// No-op — D&L consumer already handles enrichment suspension.
// Registered for matrix completeness and domain attribution.

import type { EventHandler } from "@/lib/events/types"

export function accountClosedHandler(): EventHandler<"account_closed"> {
  return {
    domain: "intelligence",
    eventType: "account_closed",
    mode: "async",
    handler: async () => {
      // D&L consumer at src/domains/data-and-listings/consumers/account-closed.ts
      // already cancels decay_liveness_check + enrichment_full_cycle deferred actions
      // and deletes enrichment_schedules rows. No duplicate work needed.
    },
  }
}
