// Intelligence consumer: enquiry_responded — AC-101
// Recomputes response insights and upserts to perception_aggregates.

import type { Db } from "@/db/types"
import type { EventHandler } from "@/lib/events/types"
import { computeEnquiryResponseInsights } from "@/domains/data-and-listings/analytics/enquiry-response"

export type EnquiryRespondedDeps = { db: Db }

export function enquiryRespondedHandler(
  deps: EnquiryRespondedDeps,
): EventHandler<"enquiry_responded"> {
  return {
    domain: "intelligence",
    eventType: "enquiry_responded",
    mode: "async",
    handler: async (event) => {
      // Recompute full response insights — handles upsert to perception_aggregates
      await computeEnquiryResponseInsights(deps.db, event.listingId)
    },
  }
}
