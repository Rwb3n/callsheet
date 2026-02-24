// Subscription pricing — CR §4.3, S4 §6.3
// Platform imports for pricing page. Operations imports for principal briefing.

import type { SubscriptionTier } from "@/lib/events/types"

export type TierPricing = {
  tier: SubscriptionTier
  annualPrice: number   // GBP, ex-VAT
  monthlyPrice: number  // GBP, ex-VAT
  targetPersona: string
}

export const PRICING: TierPricing[] = [
  { tier: "free", annualPrice: 0, monthlyPrice: 0, targetPersona: "Directory population. Buyer-satisfying base." },
  { tier: "standard", annualPrice: 199, monthlyPrice: 19, targetPersona: "Sole traders, emerging freelancers" },
  { tier: "premium", annualPrice: 399, monthlyPrice: 39, targetPersona: "Established freelancers, small companies" },
  { tier: "partner", annualPrice: 699, monthlyPrice: 69, targetPersona: "Established companies, facilities, post houses" },
]

export const LAUNCH_DISCOUNT = {
  eligibleTier: "standard" as const,
  discountedAnnualPrice: 99,
  fullPrice: 199,
  couponCode: "LAUNCH2026",
  maxRedemptions: 500,
  restrictions: "annual_only" as const,
  displayBadge: "Launch offer: £99/year (normally £199)",
} as const
