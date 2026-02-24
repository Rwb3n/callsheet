// Paddle webhook handler — Ops §5, S4 §2.2–§2.8
// Signature verification, idempotency, 6 handler functions, cleanup.
// Operations is the sole Paddle webhook receiver [CR-X-14].
// Operations is the sole emitter of subscription_tier_changed and subscription_ended [Ops §1.1, §1.2].

import { eq, lt } from "drizzle-orm"
import { processedPaddleEvents } from "@/db/schema/operations"
import { listings } from "@/db/schema/data-and-listings"
import { accountProfiles } from "@/db/schema/accounts"
import type { PaddleWebhookEvent } from "./types"
import type { SubscriptionEvent, CancellationReason } from "@/domains/commercial/subscription/types"
import { mapPaddleWebhook } from "@/domains/commercial/subscription/map-paddle-webhook"
import { lookupPendingCancellation, cleanupStalePendingCancellations } from "./pending-cancellations"
import { applyDowngrade } from "@/domains/commercial/subscription/downgrade"
import { restoreHiddenItems } from "@/domains/commercial/subscription/restore-hidden"
import {
  createGracePeriod,
  finaliseSubscriptionEnd,
} from "@/domains/commercial/subscription/grace-period"
import { scheduleDeferredAction } from "@/lib/scheduler/api"
import { logDecision } from "@/lib/decisions/logger"
import { createNotification } from "@/lib/notifications"
import type { Db } from "@/db/types"
import type { SubscriptionTier } from "@/lib/events/types"
import type { InProcessEventBus } from "@/lib/events/bus"
import type { WaitUntilFn } from "@/lib/events/waitUntil"
import type { SchedulerDb } from "@/lib/scheduler/api"
import type { DecisionLogDb } from "@/lib/decisions/logger"
import type { NotificationDb } from "@/lib/notifications"
import { createHmac, timingSafeEqual } from "crypto"

const IDEMPOTENCY_RETENTION_MS = 30 * 24 * 60 * 60 * 1000 // 30 days
const CHECKOUT_RETRY_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes
const CHECKOUT_MAX_ATTEMPTS = 12 // 12 × 5min = 1 hour

export type WebhookHandlerDeps = {
  db: Db
  webhookSecret: string
  eventBus: InProcessEventBus
  waitUntilFn: WaitUntilFn
  schedulerDb: SchedulerDb
  decisionLogDb: DecisionLogDb
  notificationDb: NotificationDb
}

/** Verify Paddle webhook signature (ts + h1 scheme). */
export function verifyPaddleSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
): boolean {
  if (!signatureHeader) return false

  // Paddle signature format: ts=TIMESTAMP;h1=HASH
  const parts = Object.fromEntries(
    signatureHeader.split(";").map((p) => {
      const [key, ...rest] = p.split("=")
      return [key, rest.join("=")]
    }),
  )

  const ts = parts["ts"]
  const h1 = parts["h1"]
  if (!ts || !h1) return false

  const signedPayload = `${ts}:${rawBody}`
  const expectedSignature = createHmac("sha256", secret)
    .update(signedPayload)
    .digest("hex")

  try {
    return timingSafeEqual(Buffer.from(h1), Buffer.from(expectedSignature))
  } catch {
    return false
  }
}

/** Check if event was already processed (idempotency). */
export async function isEventProcessed(db: Db, eventId: string): Promise<boolean> {
  const rows = await db
    .select({ eventId: processedPaddleEvents.eventId })
    .from(processedPaddleEvents)
    .where(eq(processedPaddleEvents.eventId, eventId))
    .limit(1)
  return rows.length > 0
}

/** Record event as processed. */
export async function markEventProcessed(db: Db, eventId: string): Promise<void> {
  await db.insert(processedPaddleEvents).values({ eventId })
}

/** Clean up processed events older than 30 days [AC-48]. */
export async function cleanupProcessedEvents(db: Db): Promise<void> {
  await db
    .delete(processedPaddleEvents)
    .where(lt(processedPaddleEvents.processedAt, new Date(Date.now() - IDEMPOTENCY_RETENTION_MS)))
}

/** Look up current listing state for mapping context. */
async function getCurrentListing(
  db: Db,
  paddleSubscriptionId: string,
): Promise<{
  listingId: string
  subscriptionTier: SubscriptionTier
  billingCadence: string | null
  accountId: string | null
  name: string
  paddleSubscriptionId: string | null
  claimStatus: string
} | null> {
  const rows = await db
    .select({
      listingId: listings.id,
      subscriptionTier: listings.subscriptionTier,
      billingCadence: listings.billingCadence,
      accountId: listings.accountId,
      name: listings.name,
      paddleSubscriptionId: listings.paddleSubscriptionId,
      claimStatus: listings.claimStatus,
    })
    .from(listings)
    .where(eq(listings.paddleSubscriptionId, paddleSubscriptionId))
    .limit(1)
  return rows[0] ?? null
}

/** Look up listing by ID (for checkout_completed where subscription ID isn't set yet). */
async function getListingById(
  db: Db,
  listingId: string,
): Promise<{
  id: string
  subscriptionTier: SubscriptionTier
  accountId: string | null
  name: string
  claimStatus: string
  paddleSubscriptionId: string | null
} | null> {
  const rows = await db
    .select({
      id: listings.id,
      subscriptionTier: listings.subscriptionTier,
      accountId: listings.accountId,
      name: listings.name,
      claimStatus: listings.claimStatus,
      paddleSubscriptionId: listings.paddleSubscriptionId,
    })
    .from(listings)
    .where(eq(listings.id, listingId))
    .limit(1)
  return rows[0] ?? null
}

/**
 * Process a verified, deduplicated Paddle webhook event.
 * Called asynchronously via waitUntil() after the 200 response.
 */
export async function processPaddleWebhook(
  deps: WebhookHandlerDeps,
  paddleEvent: PaddleWebhookEvent,
): Promise<void> {
  const { db } = deps

  // Look up pending cancellation for reason attribution [AC-10, AC-38]
  const subscriptionId =
    paddleEvent.data.id ?? paddleEvent.data.custom_data?.listing_id
  const pendingCancellation = subscriptionId
    ? await lookupPendingCancellation(db, subscriptionId)
    : null

  // Look up current listing for tier/cadence context
  const currentListing = subscriptionId
    ? await getCurrentListing(db, subscriptionId)
    : null

  const subscriptionEvent = mapPaddleWebhook(paddleEvent, pendingCancellation, currentListing)

  if (subscriptionEvent) {
    switch (subscriptionEvent.type) {
      case "checkout_completed":
        await handleCheckoutCompleted(deps, subscriptionEvent)
        break
      case "subscription_upgraded":
        await handleSubscriptionUpgraded(deps, subscriptionEvent)
        break
      case "subscription_downgraded":
        await handleSubscriptionDowngraded(deps, subscriptionEvent)
        break
      case "billing_cadence_changed":
        await handleBillingCadenceChanged(deps, subscriptionEvent)
        break
      case "subscription_cancelled":
        await handleSubscriptionCancelled(deps, subscriptionEvent)
        break
      case "renewal_failed":
        await handleRenewalFailed(deps, subscriptionEvent)
        break
    }
  }

  // Inline cleanup [AC-39, AC-48]
  await cleanupStalePendingCancellations(db)
  await cleanupProcessedEvents(db)
}

// --- Handler functions [S4 §2.4–§2.8] ---

/** AC-04, AC-05, AC-06: Checkout completed — set subscription data, emit tier change. */
async function handleCheckoutCompleted(
  deps: WebhookHandlerDeps,
  event: Extract<SubscriptionEvent, { type: "checkout_completed" }>,
): Promise<void> {
  const { db, eventBus, waitUntilFn, schedulerDb, decisionLogDb } = deps
  const listing = await getListingById(db, event.listingId)
  if (!listing) return

  // Precondition guard [CR-X-1, AC-05]: listing must be claimed with accountId
  if (listing.claimStatus !== "claimed" || !listing.accountId) {
    await scheduleDeferredAction(schedulerDb, {
      action: "checkout_precondition_retry",
      params: {
        paddleEvent: event,
        attemptCount: 1,
        maxAttempts: CHECKOUT_MAX_ATTEMPTS,
      },
      executeAt: new Date(Date.now() + CHECKOUT_RETRY_INTERVAL_MS),
      retryPolicy: "once",
      onFailure: "log",
      createdBy: "operations",
    })
    return
  }

  // AC-04: Update listing subscription data
  await db
    .update(listings)
    .set({
      subscriptionTier: event.tier,
      paddleSubscriptionId: event.paddleSubscriptionId,
      paddleCustomerId: event.paddleCustomerId,
      billingCadence: event.billingCadence,
      subscriptionStartDate: new Date(),
      subscriptionEndDate: null,
      updatedAt: new Date(),
    })
    .where(eq(listings.id, event.listingId))

  // Store paddleCustomerId on account profile if first checkout [AC-44]
  const [profile] = await db
    .select({ paddleCustomerId: accountProfiles.paddleCustomerId })
    .from(accountProfiles)
    .where(eq(accountProfiles.accountId, event.accountId))
    .limit(1)

  if (profile && !profile.paddleCustomerId) {
    await db
      .update(accountProfiles)
      .set({ paddleCustomerId: event.paddleCustomerId })
      .where(eq(accountProfiles.accountId, event.accountId))
  }

  // Restore hidden items on re-upgrade from free [AC-23 path]
  if (listing.subscriptionTier === "free") {
    await restoreHiddenItems(db, event.listingId, event.tier)
  }

  // Emit subscription_tier_changed [Ops §1.1]
  await eventBus.emit(
    "subscription_tier_changed",
    {
      _brand: "SubscriptionTierChangedEvent" as const,
      listingId: event.listingId,
      previousTier: listing.subscriptionTier,
      newTier: event.tier,
    },
    waitUntilFn,
  )

  // Decision log
  await logDecision(decisionLogDb, {
    domain: "commercial",
    decisionType: "conversion_trigger_evaluation",
    inputs: {
      listingId: event.listingId,
      previousTier: listing.subscriptionTier,
      newTier: event.tier,
      billingCadence: event.billingCadence,
    },
    output: { action: "checkout_completed" },
    listingId: event.listingId,
    accountId: listing.accountId,
  })
}

/** AC-07: Subscription upgraded — update tier, restore hidden items, emit tier change. */
async function handleSubscriptionUpgraded(
  deps: WebhookHandlerDeps,
  event: Extract<SubscriptionEvent, { type: "subscription_upgraded" }>,
): Promise<void> {
  const { db, eventBus, waitUntilFn } = deps

  await db
    .update(listings)
    .set({ subscriptionTier: event.newTier, updatedAt: new Date() })
    .where(eq(listings.id, event.listingId))

  // Restore hidden items up to new tier limit [AC-23 path]
  await restoreHiddenItems(db, event.listingId, event.newTier)

  // AC-07: Emit subscription_tier_changed with correct previousTier and newTier
  await eventBus.emit(
    "subscription_tier_changed",
    {
      _brand: "SubscriptionTierChangedEvent" as const,
      listingId: event.listingId,
      previousTier: event.previousTier,
      newTier: event.newTier,
    },
    waitUntilFn,
  )
}

/** AC-08: Subscription downgraded — apply downgrade with data preservation, emit tier change. */
async function handleSubscriptionDowngraded(
  deps: WebhookHandlerDeps,
  event: Extract<SubscriptionEvent, { type: "subscription_downgraded" }>,
): Promise<void> {
  const { db, eventBus, waitUntilFn, notificationDb } = deps

  await db
    .update(listings)
    .set({ subscriptionTier: event.newTier, updatedAt: new Date() })
    .where(eq(listings.id, event.listingId))

  // AC-08: applyDowngrade with data preservation (hides excess media/credits, never deletes)
  await applyDowngrade(
    { db, notificationDb },
    {
      listingId: event.listingId,
      previousTier: event.previousTier,
      newTier: event.newTier,
    },
  )

  await eventBus.emit(
    "subscription_tier_changed",
    {
      _brand: "SubscriptionTierChangedEvent" as const,
      listingId: event.listingId,
      previousTier: event.previousTier,
      newTier: event.newTier,
    },
    waitUntilFn,
  )
}

/** Billing cadence changed — listing update only, no domain event [CR §4.5]. */
async function handleBillingCadenceChanged(
  deps: WebhookHandlerDeps,
  event: Extract<SubscriptionEvent, { type: "billing_cadence_changed" }>,
): Promise<void> {
  const { db, decisionLogDb } = deps

  await db
    .update(listings)
    .set({ billingCadence: event.newCadence, updatedAt: new Date() })
    .where(eq(listings.id, event.listingId))

  await logDecision(decisionLogDb, {
    domain: "commercial",
    decisionType: "billing_cadence_tracking",
    inputs: {
      listingId: event.listingId,
      previousCadence: event.previousCadence,
      newCadence: event.newCadence,
    },
    output: { action: "cadence_updated" },
    listingId: event.listingId,
  })
}

/** AC-46, AC-47, AC-49: Subscription cancelled — grace period or immediate finalisation. */
async function handleSubscriptionCancelled(
  deps: WebhookHandlerDeps,
  event: Extract<SubscriptionEvent, { type: "subscription_cancelled" }>,
): Promise<void> {
  const { db, schedulerDb, notificationDb, eventBus, waitUntilFn } = deps

  const listing = await getListingById(db, event.listingId)
  if (!listing || !listing.accountId) return

  const reason = event.reason
  const origin: "paddle" | "archival" | "closure" =
    reason === "listing_archived" ? "archival"
    : reason === "account_closed" ? "closure"
    : "paddle"

  // Grace period for payment_failure and voluntary cancellations [S4 §2.7]
  if (reason === "payment_failure" || reason === "voluntary") {
    await createGracePeriod(
      { db, schedulerDb, notificationDb },
      {
        listingId: listing.id,
        accountId: listing.accountId,
        paddleSubscriptionId: listing.paddleSubscriptionId ?? event.listingId,
        subscriptionTier: listing.subscriptionTier,
        listingName: listing.name,
      },
    )
    return
  }

  // Immediate cancellation (listing_archived, account_closed, paddle_reconciliation)
  // AC-46: listing_archived → reason: "cancellation", origin: "archival"
  // AC-47: paddle_reconciliation → reason: "cancellation", origin: "paddle"
  // AC-49: pending_cancellation reason: "listing_archived" → origin: "archival"
  await finaliseSubscriptionEnd(
    { db, notificationDb, eventBus, waitUntilFn },
    {
      listingId: listing.id,
      accountId: listing.accountId,
      previousTier: listing.subscriptionTier,
      reason,
      origin,
    },
  )
}

/** Renewal failed — notification on first attempt, no domain event [CR §4.5]. */
async function handleRenewalFailed(
  deps: WebhookHandlerDeps,
  event: Extract<SubscriptionEvent, { type: "renewal_failed" }>,
): Promise<void> {
  const { db, notificationDb } = deps

  const listing = await getListingById(db, event.listingId)
  if (!listing?.accountId) return

  // Notify on first attempt only [S4 §2.8]
  if (event.attempt === 1) {
    await createNotification(notificationDb, {
      accountId: listing.accountId,
      type: "subscription_ending",
      title: "Payment issue",
      body: `Your payment for ${listing.name} didn't go through. We'll retry automatically. Update your payment method to avoid interruption.`,
      link: `/dashboard/listings/${listing.id}/subscription`,
    })
  }
}
