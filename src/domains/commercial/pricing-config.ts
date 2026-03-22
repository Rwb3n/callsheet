// PRICING configuration — S8 §9, CR §4.3
// Authoritative computation lookup: SubscriptionTier → annual/monthly GBP values.
// Used by conversion triggers, churn analysis, revenue perception, refund evaluation.
//
// Separate from subscription/pricing.ts (S4), which is a display-oriented array
// with targetPersona for the pricing page. This module is the Record-typed source
// for all S8+ domain logic that needs tier→price mapping.
//
// AC-60: typed as Record<SubscriptionTier, { annual: number; monthly: number }>
// AC-61: values match spec (free 0/0, standard 199/19, premium 399/39, partner 699/69)
// AC-63: each listing priced independently — no multi-listing discount logic in S8

import type { SubscriptionTier } from "@/lib/events/types"

export const PRICING: Record<SubscriptionTier, { annual: number; monthly: number }> = {
  free: { annual: 0, monthly: 0 },
  standard: { annual: 199, monthly: 19 },
  premium: { annual: 399, monthly: 39 },
  partner: { annual: 699, monthly: 69 },
}
