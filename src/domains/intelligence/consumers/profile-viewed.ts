// Intelligence consumer: profile_viewed — AC-86
// Deduplicates views (1hr window) and aggregates viewer demographics.

import type { Db } from "@/db/types"
import type { EventHandler } from "@/lib/events/types"
import { deduplicateProfileView } from "@/domains/data-and-listings/quality/dedup"
import { aggregateViewerDemographic } from "@/domains/data-and-listings/analytics/viewer-demographics"

export type ProfileViewedDeps = { db: Db }

export function profileViewedHandler(deps: ProfileViewedDeps): EventHandler<"profile_viewed"> {
  return {
    domain: "intelligence",
    eventType: "profile_viewed",
    mode: "async",
    handler: async (event) => {
      const counted = await deduplicateProfileView(
        deps.db,
        event.listingId,
        event.viewerAccountId,
      )

      // Only aggregate demographics for non-duplicate views
      if (counted) {
        await aggregateViewerDemographic(deps.db, event.listingId, {
          // viewer profile is minimal — source is the only data we have
          entityType: event.source,
        })
      }
    },
  }
}
