// Intelligence consumer: profile_edited — AC-95
// Schedules quality_score_recalculation and resets freshness timestamp.

import type { SchedulerDb } from "@/lib/scheduler/api"
import { scheduleDeferredAction, cancelDeferredAction } from "@/lib/scheduler/api"
import type { Db } from "@/db/types"
import type { EventHandler } from "@/lib/events/types"
import { resetFreshnessTimestamp } from "./helpers"

export type ProfileEditedDeps = {
  db: Db
  schedulerDb: SchedulerDb
}

export function profileEditedHandler(deps: ProfileEditedDeps): EventHandler<"profile_edited"> {
  return {
    domain: "intelligence",
    eventType: "profile_edited",
    mode: "async",
    handler: async (event) => {
      // Reset freshness timestamp immediately
      await resetFreshnessTimestamp(deps.db, event.listingId)

      // Cancel any pending quality recalc to avoid redundant work
      await cancelDeferredAction(deps.schedulerDb, {
        action: "quality_score_recalculation",
        filterParams: { listingId: event.listingId },
        cancelledBy: "intelligence:profile_edited",
      })

      // Schedule new quality recalc (2 min delay for batching rapid edits)
      await scheduleDeferredAction(deps.schedulerDb, {
        action: "quality_score_recalculation",
        params: { listingId: event.listingId },
        executeAt: new Date(Date.now() + 2 * 60 * 1000),
        retryPolicy: "once",
        onFailure: "log",
        createdBy: "intelligence:profile_edited",
      })
    },
  }
}
