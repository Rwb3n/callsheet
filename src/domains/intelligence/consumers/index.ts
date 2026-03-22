// Intelligence consumer registration — wires all 15 event handlers into the bus

import type { Db } from "@/db/types"
import type { InProcessEventBus } from "@/lib/events/bus"
import type { SchedulerDb } from "@/lib/scheduler/api"
import type { WaitUntilFn } from "@/lib/events/waitUntil"
import { profileViewedHandler } from "./profile-viewed"
import { accountClosedHandler } from "./account-closed"
import { contactAttemptHandler } from "./contact-attempt"
import { decaySignalDetectedHandler } from "./decay-signal-detected"
import { listingCreatedHandler } from "./listing-created"
import { profileEditedHandler } from "./profile-edited"
import { claimApprovedHandler } from "./claim-approved"
import { searchPerformedHandler } from "./search-performed"
import { shortlistAddedHandler } from "./shortlist-added"
import { enquirySubmittedHandler } from "./enquiry-submitted"
import { subscriptionTierChangedHandler } from "./subscription-tier-changed"
import { subscriptionEndedHandler } from "./subscription-ended"
import { conversionMilestoneHandler } from "./conversion-milestone"
import { winbackDeliveryResultHandler } from "./winback-delivery-result"
import { enquiryRespondedHandler } from "./enquiry-responded"

export function registerIntelligenceConsumers(
  bus: InProcessEventBus,
  deps: {
    db: Db
    schedulerDb: SchedulerDb
    waitUntilFn: WaitUntilFn
  },
) {
  // D&L perception consumers (10)
  bus.on(profileViewedHandler({ db: deps.db }))
  bus.on(accountClosedHandler())
  bus.on(contactAttemptHandler({ db: deps.db, bus, waitUntilFn: deps.waitUntilFn }))
  bus.on(decaySignalDetectedHandler({ db: deps.db }))
  bus.on(listingCreatedHandler({ db: deps.db, schedulerDb: deps.schedulerDb }))
  bus.on(profileEditedHandler({ db: deps.db, schedulerDb: deps.schedulerDb }))
  bus.on(claimApprovedHandler({ db: deps.db, schedulerDb: deps.schedulerDb }))
  bus.on(searchPerformedHandler({ db: deps.db }))
  bus.on(shortlistAddedHandler({ db: deps.db }))
  bus.on(enquirySubmittedHandler({ db: deps.db }))

  // CR/Ops intelligence consumers (5)
  bus.on(subscriptionTierChangedHandler({ db: deps.db, schedulerDb: deps.schedulerDb }))
  bus.on(subscriptionEndedHandler({ db: deps.db }))
  bus.on(conversionMilestoneHandler({ db: deps.db }))
  bus.on(winbackDeliveryResultHandler({ db: deps.db }))
  bus.on(enquiryRespondedHandler({ db: deps.db }))
}
