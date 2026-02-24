// Grace period management — CR §2.3, S4 §8, AC-26 through AC-30
// createGracePeriod: inserts row, schedules expiry, notifies provider, sets subscriptionEndDate.
// finaliseSubscriptionEnd: downgrade to free, clear subscription metadata, emit subscription_ended.

import { eq, and, isNull } from "drizzle-orm"
import { gracePeriods } from "@/db/schema/commercial"
import { listings } from "@/db/schema/data-and-listings"
import { applyDowngrade, type ApplyDowngradeDeps } from "./downgrade"
import { scheduleDeferredAction, type SchedulerDb } from "@/lib/scheduler/api"
import { createNotification, type NotificationDb } from "@/lib/notifications"
import type { Db } from "@/db/types"
import type { CancellationReason } from "./types"
import type { SubscriptionTier } from "@/lib/events/types"
import type { InProcessEventBus } from "@/lib/events/bus"
import type { WaitUntilFn } from "@/lib/events/waitUntil"

export const GRACE_PERIOD_DAYS = 14
const GRACE_PERIOD_MS = GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000

export type GracePeriodDeps = {
  db: Db
  schedulerDb: SchedulerDb
  notificationDb: NotificationDb
}

export type CreateGracePeriodParams = {
  listingId: string
  accountId: string | null
  paddleSubscriptionId: string
  subscriptionTier: SubscriptionTier
  listingName: string
}

export async function createGracePeriod(
  deps: GracePeriodDeps,
  params: CreateGracePeriodParams,
): Promise<{ gracePeriodId: string; expiresAt: Date }> {
  const { db, schedulerDb, notificationDb } = deps
  const expiresAt = new Date(Date.now() + GRACE_PERIOD_MS)

  const [created] = await db.insert(gracePeriods).values({
    listingId: params.listingId,
    paddleSubscriptionId: params.paddleSubscriptionId,
    previousTier: params.subscriptionTier,
    expiresAt,
  }).returning({ id: gracePeriods.id })

  // Schedule grace period expiry check [SI §2.1]
  await scheduleDeferredAction(schedulerDb, {
    action: "grace_period_expiry",
    params: { listingId: params.listingId, gracePeriodId: created.id },
    executeAt: expiresAt,
    retryPolicy: "retry_3",
    onFailure: "alert_principal",
    createdBy: "commercial",
  })

  // Notify provider [AC-26]
  if (params.accountId) {
    await createNotification(notificationDb, {
      accountId: params.accountId,
      type: "subscription_ending",
      title: "Your subscription is ending",
      body: `Your ${params.subscriptionTier} subscription for ${params.listingName} will end in ${GRACE_PERIOD_DAYS} days. Update your payment method to continue.`,
      link: `/dashboard/listings/${params.listingId}/subscription`,
    })
  }

  // Update listing end date
  await db.update(listings).set({
    subscriptionEndDate: expiresAt,
    updatedAt: new Date(),
  }).where(eq(listings.id, params.listingId))

  return { gracePeriodId: created.id, expiresAt }
}

export type FinaliseSubscriptionEndDeps = {
  db: Db
  notificationDb: NotificationDb
  eventBus: InProcessEventBus
  waitUntilFn: WaitUntilFn
}

export type FinaliseSubscriptionEndParams = {
  listingId: string
  accountId: string
  previousTier: SubscriptionTier
  reason: CancellationReason
  origin: "paddle" | "archival" | "closure"
}

export async function finaliseSubscriptionEnd(
  deps: FinaliseSubscriptionEndDeps,
  params: FinaliseSubscriptionEndParams,
): Promise<void> {
  const { db, notificationDb, eventBus, waitUntilFn } = deps
  const { listingId, accountId, previousTier, reason, origin } = params

  // Downgrade to free — suppress notification (subscription_ended consumers handle it) [S4-ST-8]
  await applyDowngrade(
    { db, notificationDb } satisfies ApplyDowngradeDeps,
    { listingId, previousTier, newTier: "free", suppressNotification: true },
  )

  // Clear subscription metadata and downgrade tier
  await db.update(listings).set({
    subscriptionTier: "free",
    paddleSubscriptionId: null,
    billingCadence: null,
    subscriptionEndDate: new Date(),
    updatedAt: new Date(),
  }).where(eq(listings.id, listingId))

  // Emit subscription_ended [Ops interface spec §1.2]
  const eventReason = reason === "payment_failure" ? "grace_period_expired" as const
    : reason === "account_closed" ? "account_closure" as const
    : "cancellation" as const // voluntary, listing_archived, paddle_reconciliation [S4-ST-3]

  await eventBus.emit(
    "subscription_ended",
    {
      _brand: "SubscriptionEndedEvent" as const,
      listingId,
      accountId,
      previousTier,
      reason: eventReason,
      origin,
      timestamp: new Date().toISOString(),
    },
    waitUntilFn,
  )
}

// Look up active (unresolved) grace period for a listing
export async function findActiveGracePeriod(
  db: Db,
  listingId: string,
) {
  const [grace] = await db.select()
    .from(gracePeriods)
    .where(and(
      eq(gracePeriods.listingId, listingId),
      isNull(gracePeriods.resolvedAt),
    ))
    .limit(1)
  return grace ?? null
}

// Resolve a grace period (mark as resolved with a given resolution)
export async function resolveGracePeriod(
  db: Db,
  gracePeriodId: string,
  resolution: "payment_recovered" | "downgraded" | "cancelled_by_refund",
) {
  await db.update(gracePeriods).set({
    resolvedAt: new Date(),
    resolution,
  }).where(eq(gracePeriods.id, gracePeriodId))
}
