// Intelligence consumer: search_performed
// Aggregates search terms per listing for analytics pipeline.

import type { Db } from "@/db/types"
import type { EventHandler } from "@/lib/events/types"
import { aggregateSearchTerm } from "@/domains/data-and-listings/analytics/search-terms"

export type SearchPerformedDeps = { db: Db }

export function searchPerformedHandler(deps: SearchPerformedDeps): EventHandler<"search_performed"> {
  return {
    domain: "intelligence",
    eventType: "search_performed",
    mode: "async",
    handler: async (event) => {
      if (!event.query.trim()) return

      // Aggregate the search term for each listing that appeared in results
      for (const listingId of event.resultListingIds) {
        await aggregateSearchTerm(deps.db, listingId, event.query)
      }
    },
  }
}
