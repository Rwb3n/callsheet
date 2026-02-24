// Zero-result query tracking — D&L §3.5
// search_performed with resultCount === 0 → insert into zeroResultQueries

import type { Db } from "@/db/types"
import { zeroResultQueries } from "@/db/schema/data-and-listings"
import type { EventHandler } from "@/lib/events/types"

export function searchPerformedHandler(db: Db): EventHandler<"search_performed"> {
  return {
    domain: "data-and-listings",
    eventType: "search_performed",
    mode: "async",
    handler: async (payload) => {
      if (payload.resultCount !== 0) return
      await db.insert(zeroResultQueries).values({
        query: payload.query,
        filters: payload.filters,
      })
    },
  }
}
