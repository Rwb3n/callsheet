// CR consumer registration — wires all 8 commercial event handlers into the bus

import type { InProcessEventBus } from "@/lib/events/bus"
import type { Db } from "@/db/types"
import type { SchedulerDb } from "@/lib/scheduler/api"
import type { DecisionLogDb } from "@/lib/decisions/logger"
import type { NotificationDb } from "@/lib/notifications"
import type { EmailService } from "@/lib/email/types"
import type { WaitUntilFn } from "@/lib/events/waitUntil"
import { subscriptionTierChangedHandler } from "./subscription-tier-changed"
import { subscriptionEndedHandler } from "./subscription-ended"
import { claimApprovedHandler } from "./claim-approved"
import { listingArchivedChurnHandler } from "./listing-archived"
import { qualityScoreChangedHandler } from "./quality-score-changed"
import { accountClosedHandler } from "./account-closed"
import { enquirySubmittedHandler } from "./enquiry-submitted"
import { erasureCompletedHandler } from "./erasure-completed"

export type CommercialConsumerDeps = {
  db: Db
  schedulerDb: SchedulerDb
  decisionLogDb: DecisionLogDb
  notificationDb: NotificationDb
  emailService: EmailService
  bus: InProcessEventBus
  waitUntilFn: WaitUntilFn
}

export function registerCommercialConsumers(
  bus: InProcessEventBus,
  deps: CommercialConsumerDeps,
) {
  // §10.1: subscription_tier_changed → revenue metrics + conversion milestone
  bus.on(subscriptionTierChangedHandler({
    db: deps.db,
    decisionLogDb: deps.decisionLogDb,
    bus: deps.bus,
    waitUntilFn: deps.waitUntilFn,
  }))

  // §10.2: subscription_ended → churn log + win-back scheduling
  bus.on(subscriptionEndedHandler({
    db: deps.db,
    decisionLogDb: deps.decisionLogDb,
    schedulerDb: deps.schedulerDb,
    bus: deps.bus,
    waitUntilFn: deps.waitUntilFn,
  }))

  // §10.3: claim_approved → conversion reset + win-back cancellation
  bus.on(claimApprovedHandler({
    db: deps.db,
    schedulerDb: deps.schedulerDb,
  }))

  // §10.4: listing_archived → churn log for paid listings
  bus.on(listingArchivedChurnHandler({ db: deps.db }))

  // §10.5: quality_score_changed → low-quality intervention
  bus.on(qualityScoreChangedHandler({
    db: deps.db,
    notificationDb: deps.notificationDb,
    schedulerDb: deps.schedulerDb,
    decisionLogDb: deps.decisionLogDb,
  }))

  // §10.6: account_closed → churn log + win-back cancellation
  bus.on(accountClosedHandler({
    db: deps.db,
    schedulerDb: deps.schedulerDb,
  }))

  // §10.7: enquiry_submitted → first_enquiry trigger
  bus.on(enquirySubmittedHandler({
    db: deps.db,
    decisionLogDb: deps.decisionLogDb,
    emailService: deps.emailService,
    bus: deps.bus,
    waitUntilFn: deps.waitUntilFn,
  }))

  // §10.8: erasure_completed → win-back cancellation + anonymisation + trigger reset
  bus.on(erasureCompletedHandler({
    db: deps.db,
    schedulerDb: deps.schedulerDb,
  }))
}
