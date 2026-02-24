// Quality score consumers — D&L §3.1
// No-op at S1. Quality score computation is S9 scope.
// Registered for matrix completeness.

import type { EventHandler } from "@/lib/events/types"

export function listingCreatedHandler(): EventHandler<"listing_created"> {
  return {
    domain: "data-and-listings",
    eventType: "listing_created",
    mode: "async",
    handler: async () => {},
  }
}

export function profileEditedHandler(): EventHandler<"profile_edited"> {
  return {
    domain: "data-and-listings",
    eventType: "profile_edited",
    mode: "async",
    handler: async () => {},
  }
}
