// Intelligence consumer: listing_created — AC-92
// Schedules initial quality_score_recalculation and creates enrichment schedules.

import type { Db } from "@/db/types"
import type { SchedulerDb } from "@/lib/scheduler/api"
import { scheduleDeferredAction } from "@/lib/scheduler/api"
import type { EventHandler } from "@/lib/events/types"
import { scheduleEnrichmentForListing } from "./helpers"

export type ListingCreatedDeps = {
  db: Db
  schedulerDb: SchedulerDb
}

export function listingCreatedHandler(deps: ListingCreatedDeps): EventHandler<"listing_created"> {
  return {
    domain: "intelligence",
    eventType: "listing_created",
    mode: "async",
    handler: async (event) => {
      // Schedule initial quality score calculation (5 min delay for data settlement)
      await scheduleDeferredAction(deps.schedulerDb, {
        action: "quality_score_recalculation",
        params: { listingId: event.listingId },
        executeAt: new Date(Date.now() + 5 * 60 * 1000),
        retryPolicy: "once",
        onFailure: "log",
        createdBy: "intelligence:listing_created",
      })

      // Create enrichment schedules — new listings start as unclaimed
      await scheduleEnrichmentForListing(
        deps.db,
        deps.schedulerDb,
        event.listingId,
        "unclaimed",
      )
    },
  }
}
