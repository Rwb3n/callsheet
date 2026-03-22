// Account closed consumer — D&L §2.6
// Suspends enrichment for all listings belonging to the closed account.

import { inArray } from "drizzle-orm"
import type { Db } from "@/db/types"
import { enrichmentSchedules } from "@/db/schema/intelligence"
import { cancelDeferredAction } from "@/lib/scheduler/api"
import type { SchedulerDb } from "@/lib/scheduler/api"
import type { EventHandler } from "@/lib/events/types"

export type AccountClosedEnrichmentDeps = {
  db: Db
  schedulerDb: SchedulerDb
}

export function accountClosedHandler(deps: AccountClosedEnrichmentDeps): EventHandler<"account_closed"> {
  return {
    domain: "data-and-listings",
    eventType: "account_closed",
    mode: "async",
    handler: async (event) => {
      const listingIds = event.listingsArchived
      if (listingIds.length === 0) return

      for (const listingId of listingIds) {
        await cancelDeferredAction(deps.schedulerDb, {
          action: "decay_liveness_check",
          filterParams: { listingId },
          cancelledBy: "account_closed_enrichment_suspension",
        })

        await cancelDeferredAction(deps.schedulerDb, {
          action: "enrichment_full_cycle",
          filterParams: { listingId },
          cancelledBy: "account_closed_enrichment_suspension",
        })
      }

      await deps.db.delete(enrichmentSchedules).where(
        inArray(enrichmentSchedules.listingId, listingIds),
      )
    },
  }
}
