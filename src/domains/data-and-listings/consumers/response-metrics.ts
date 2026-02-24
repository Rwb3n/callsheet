// Enquiry response metrics consumer — D&L §3.3
// No-op at S1. Running-average response time logic is S9 scope.
// Registered for matrix completeness.

import type { EventHandler } from "@/lib/events/types"

export function enquiryRespondedHandler(): EventHandler<"enquiry_responded"> {
  return {
    domain: "data-and-listings",
    eventType: "enquiry_responded",
    mode: "async",
    handler: async () => {},
  }
}
