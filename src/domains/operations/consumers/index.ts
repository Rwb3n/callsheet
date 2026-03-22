// Ops consumer registration — wires all S7 event handlers into the bus
// S7 §9: 12 consumer entries (pending_cancellation_created already wired via S4)

import type { InProcessEventBus } from "@/lib/events/bus"
import type { Db } from "@/db/types"
import type { DecisionLogDb } from "@/lib/decisions/logger"
import type { SchedulerDb } from "@/lib/scheduler/api"
import type { EmailService } from "@/lib/email/types"
import type { NotificationDb } from "@/lib/notifications"

import { claimApprovedVolumeHandler, claimRejectedVolumeHandler } from "./claim-volume"
import { listingArchivedHandler, listingSuspendedHandler, listingReactivatedHandler } from "./listing-lifecycle"
import { decayOutreachHandler } from "./decay-outreach"
import { accountClosedHandler } from "./account-closed"
import { listingCreatedTrackingHandler } from "./listing-created"
import { contactAttemptHandler } from "./contact-attempt"
import { churnRiskDetectedHandler } from "./churn-risk"
import { winbackDeliveryHandler } from "./winback-delivery"

// Ensure email templates are registered before handlers execute
import "@/domains/operations/email-templates"

export type OpsConsumerDeps = {
  db: Db
  decisionLogDb: DecisionLogDb
  schedulerDb: SchedulerDb
  emailService: EmailService
  notificationDb: NotificationDb
  adminAccountId: string
  emit: (eventType: "winback_delivery_result", payload: {
    readonly _brand: "WinbackDeliveryResultEvent"
    listingId: string
    accountId: string
    status: "delivered" | "failed"
    timestamp: string
  }) => Promise<void>
}

export function registerOperationsConsumers(
  bus: InProcessEventBus,
  deps: OpsConsumerDeps,
): void {
  // Claim volume tracking (§9.2, §9.3)
  bus.on(claimApprovedVolumeHandler({ decisionLogDb: deps.decisionLogDb }))
  bus.on(claimRejectedVolumeHandler({ decisionLogDb: deps.decisionLogDb }))

  // Listing lifecycle (§9.4, §9.5, §9.6)
  bus.on(listingArchivedHandler({ db: deps.db, decisionLogDb: deps.decisionLogDb, schedulerDb: deps.schedulerDb }))
  bus.on(listingSuspendedHandler({ db: deps.db, decisionLogDb: deps.decisionLogDb, schedulerDb: deps.schedulerDb }))
  bus.on(listingReactivatedHandler({ db: deps.db, decisionLogDb: deps.decisionLogDb, schedulerDb: deps.schedulerDb }))

  // Decay outreach (§9.7 + §11.2)
  bus.on(decayOutreachHandler({ db: deps.db, decisionLogDb: deps.decisionLogDb, emailService: deps.emailService }))

  // Account closed (§9.9)
  bus.on(accountClosedHandler({
    db: deps.db, decisionLogDb: deps.decisionLogDb, schedulerDb: deps.schedulerDb,
    notificationDb: deps.notificationDb, adminAccountId: deps.adminAccountId,
  }))

  // Listing created (§9.10)
  bus.on(listingCreatedTrackingHandler({ decisionLogDb: deps.decisionLogDb }))

  // Contact attempt (§9.11)
  bus.on(contactAttemptHandler({ decisionLogDb: deps.decisionLogDb }))

  // Churn risk (§9.12)
  bus.on(churnRiskDetectedHandler({ db: deps.db, decisionLogDb: deps.decisionLogDb }))

  // Winback delivery (§9.13 + §11.1)
  bus.on(winbackDeliveryHandler({
    db: deps.db, decisionLogDb: deps.decisionLogDb,
    emailService: deps.emailService, emit: deps.emit,
  }))
}
