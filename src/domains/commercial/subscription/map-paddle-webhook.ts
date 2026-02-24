// Paddle webhook → internal SubscriptionEvent mapping — CR §4.4–§4.5, S4 §2
// CR-owned logic, imported by Operations' webhook handler (P4).

import type { PaddleWebhookEvent } from "@/domains/operations/paddle/types"
import type { SubscriptionEvent, BillingCadence, CancellationReason } from "./types"
import { PADDLE_PRICE_MAP, TIER_RANK } from "./types"
import type { SubscriptionTier } from "@/lib/events/types"

export function mapPaddleWebhook(
  event: PaddleWebhookEvent,
  pendingCancellation: { reason: string } | null,
  currentListing: { subscriptionTier: SubscriptionTier; billingCadence: string | null } | null,
): SubscriptionEvent | null {
  const { event_type, data } = event

  switch (event_type) {
    case "transaction.completed":
      return mapCheckoutCompleted(data)

    case "subscription.updated":
      return mapSubscriptionUpdated(data, currentListing)

    case "subscription.canceled":
      return mapSubscriptionCancelled(data, pendingCancellation)

    case "subscription.past_due":
      return mapRenewalFailed(data)

    default:
      return null
  }
}

function mapCheckoutCompleted(data: PaddleWebhookEvent["data"]): SubscriptionEvent | null {
  const listingId = data.custom_data?.listing_id
  const accountId = data.custom_data?.account_id
  if (!listingId || !accountId) return null

  const item = data.items?.[0]
  if (!item) return null

  const tier = PADDLE_PRICE_MAP[item.price.id]
  if (!tier) return null

  const billingCadence: BillingCadence =
    item.price.billing_cycle?.interval === "month" ? "monthly" : "annual"

  return {
    type: "checkout_completed",
    listingId,
    accountId,
    tier,
    billingCadence,
    paddleSubscriptionId: data.id,
    paddleCustomerId: data.customer_id,
  }
}

function mapSubscriptionUpdated(
  data: PaddleWebhookEvent["data"],
  currentListing: { subscriptionTier: SubscriptionTier; billingCadence: string | null } | null,
): SubscriptionEvent | null {
  const listingId = data.custom_data?.listing_id
  if (!listingId || !currentListing) return null

  const item = data.items?.[0]
  if (!item) return null

  const newTier = PADDLE_PRICE_MAP[item.price.id]
  if (!newTier) return null

  const previousTier = currentListing.subscriptionTier

  // Cadence change (same tier, different billing interval)
  const newCadence: BillingCadence =
    item.price.billing_cycle?.interval === "month" ? "monthly" : "annual"
  const previousCadence = currentListing.billingCadence as BillingCadence | null

  if (newTier === previousTier && previousCadence && newCadence !== previousCadence) {
    return {
      type: "billing_cadence_changed",
      listingId,
      tier: newTier,
      previousCadence,
      newCadence,
    }
  }

  // Tier change
  if (newTier !== previousTier) {
    const isUpgrade = TIER_RANK[newTier] > TIER_RANK[previousTier]
    return {
      type: isUpgrade ? "subscription_upgraded" : "subscription_downgraded",
      listingId,
      previousTier,
      newTier,
    }
  }

  return null
}

function mapSubscriptionCancelled(
  data: PaddleWebhookEvent["data"],
  pendingCancellation: { reason: string } | null,
): SubscriptionEvent | null {
  const listingId = data.custom_data?.listing_id
  if (!listingId) return null

  const item = data.items?.[0]
  const tier = item ? (PADDLE_PRICE_MAP[item.price.id] ?? "standard") : "standard"
  const reason = inferCancellationReason(pendingCancellation)
  const effectiveAt = data.canceled_at ?? new Date().toISOString()

  return {
    type: "subscription_cancelled",
    listingId,
    tier: tier as SubscriptionTier,
    reason,
    effectiveAt,
  }
}

function mapRenewalFailed(data: PaddleWebhookEvent["data"]): SubscriptionEvent | null {
  const listingId = data.custom_data?.listing_id
  if (!listingId) return null

  const item = data.items?.[0]
  const tier = item ? (PADDLE_PRICE_MAP[item.price.id] ?? "standard") : "standard"

  return {
    type: "renewal_failed",
    listingId,
    tier: tier as SubscriptionTier,
    attempt: 1, // Paddle doesn't expose attempt count; tracked locally in handler
  }
}

/** Use stored reason from pending_cancellation registry if available [CR-X-4, AC-10]. */
export function inferCancellationReason(
  pendingCancellation: { reason: string } | null,
): CancellationReason {
  if (pendingCancellation) {
    return pendingCancellation.reason as CancellationReason
  }
  // No pending record — Paddle-initiated (e.g. failed payments exhausted retry)
  return "payment_failure"
}
