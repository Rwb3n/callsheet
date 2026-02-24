// Subscription domain types — CR §4.4, S4 §2
// Internal event types produced by mapPaddleWebhook().

import type { SubscriptionTier } from "@/lib/events/types"

export type CancellationReason =
  | "voluntary"
  | "payment_failure"
  | "paddle_reconciliation"
  | "account_closed"
  | "listing_archived"

export type BillingCadence = "annual" | "monthly"

export type SubscriptionEvent =
  | {
      type: "checkout_completed"
      listingId: string
      accountId: string
      tier: SubscriptionTier
      billingCadence: BillingCadence
      paddleSubscriptionId: string
      paddleCustomerId: string
    }
  | {
      type: "subscription_upgraded"
      listingId: string
      previousTier: SubscriptionTier
      newTier: SubscriptionTier
    }
  | {
      type: "subscription_downgraded"
      listingId: string
      previousTier: SubscriptionTier
      newTier: SubscriptionTier
    }
  | {
      type: "billing_cadence_changed"
      listingId: string
      tier: SubscriptionTier
      previousCadence: BillingCadence
      newCadence: BillingCadence
    }
  | {
      type: "subscription_cancelled"
      listingId: string
      tier: SubscriptionTier
      reason: CancellationReason
      effectiveAt: string
    }
  | {
      type: "renewal_failed"
      listingId: string
      tier: SubscriptionTier
      attempt: number
    }

// Paddle price ID → SubscriptionTier mapping
// Configured via env vars in production; hardcoded for test/dev.
type PaddlePriceMapping = Record<string, SubscriptionTier>

export const PADDLE_PRICE_MAP: PaddlePriceMapping = {
  // Populated from PADDLE_PRICE_MAP_JSON env var at runtime.
  // Fallback for dev/test — IDs are Paddle sandbox values.
  "pri_standard_monthly": "standard",
  "pri_standard_annual": "standard",
  "pri_premium_monthly": "premium",
  "pri_premium_annual": "premium",
  "pri_partner_monthly": "partner",
  "pri_partner_annual": "partner",
}

export const TIER_RANK: Record<SubscriptionTier, number> = {
  free: 0,
  standard: 1,
  premium: 2,
  partner: 3,
}
