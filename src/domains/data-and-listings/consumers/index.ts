// D&L consumer registration — wires all 9 event handlers into the bus

import type { Db } from "@/db/types"
import type { InProcessEventBus } from "@/lib/events/bus"
import type { SchedulerDb } from "@/lib/scheduler/api"
import { profileViewedHandler, enquirySubmittedHandler } from "./engagement"
import { searchPerformedHandler } from "./zero-results"
import { subscriptionTierChangedHandler } from "./tier-update"
import { accountClosedHandler } from "./account-closed"
import { listingCreatedHandler, profileEditedHandler } from "./quality"
import { contactAttemptHandler } from "./contact"
import { enquiryRespondedHandler } from "./response-metrics"

export function registerDataAndListingsConsumers(
  bus: InProcessEventBus,
  deps: { db: Db; schedulerDb: SchedulerDb },
) {
  bus.on(profileViewedHandler(deps.db))
  bus.on(enquirySubmittedHandler(deps.db))
  bus.on(searchPerformedHandler(deps.db))
  bus.on(subscriptionTierChangedHandler(deps.db))
  bus.on(accountClosedHandler({ db: deps.db, schedulerDb: deps.schedulerDb }))
  bus.on(listingCreatedHandler())
  bus.on(profileEditedHandler({ schedulerDb: deps.schedulerDb }))
  bus.on(contactAttemptHandler())
  bus.on(enquiryRespondedHandler())
}
