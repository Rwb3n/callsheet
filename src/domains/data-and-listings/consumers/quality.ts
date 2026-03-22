// Quality score consumers — D&L §3.1
// listing_created: no-op at S1. Quality score computation is S9 scope.
// profile_edited: S5 addition — schedules/reschedules 90-day listing update reminder [AC-35, AC-36]

import type { EventHandler } from "@/lib/events/types"
import type { SchedulerDb } from "@/lib/scheduler/api"
import { scheduleDeferredAction, cancelDeferredAction } from "@/lib/scheduler"
import { REMINDER_INTERVAL_MS } from "@/domains/platform/reminders/listing-update-reminder"

export function listingCreatedHandler(): EventHandler<"listing_created"> {
  return {
    domain: "data-and-listings",
    eventType: "listing_created",
    mode: "async",
    handler: async () => {},
  }
}

export type ProfileEditedHandlerDeps = {
  schedulerDb: SchedulerDb
}

export function profileEditedHandler(deps?: ProfileEditedHandlerDeps): EventHandler<"profile_edited"> {
  return {
    domain: "data-and-listings",
    eventType: "profile_edited",
    mode: "async",
    handler: async (payload) => {
      if (!deps) return // no-op when deps not provided (S1 backwards compat)

      // AC-36: cancel existing reminder (clock reset)
      await cancelDeferredAction(deps.schedulerDb, {
        action: "listing_update_reminder",
        filterParams: { listingId: payload.listingId },
        cancelledBy: "platform",
      })

      // AC-35: schedule 90-day reminder
      await scheduleDeferredAction(deps.schedulerDb, {
        action: "listing_update_reminder",
        params: { listingId: payload.listingId },
        executeAt: new Date(Date.now() + REMINDER_INTERVAL_MS),
        retryPolicy: "once",
        onFailure: "log",
        createdBy: "platform",
      })
    },
  }
}
