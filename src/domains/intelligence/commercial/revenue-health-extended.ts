// Revenue health extended — S9 §5.5
// Pure logic module for computing 8 S9 revenue health extension fields.
// Called by revenue_health_extended ceremony handler with pre-queried DB inputs.

import type { RevenueHealthExtended } from "@/db/schema/commercial"

export const REVENUE_HEALTH_SPEC = {
  CAC_V1: 0,
  LTV_CAP_YEARS: 10, // 120 months if churn rate = 0
}

// Type for the data the handler will pass in after querying the DB
export type RevenueHealthInputs = {
  churnByTierData: { tier: string; churnEvents: number; activeCount: number }[]
  eligibleForRenewal: number
  churnedAnnualCount: number
  averageRevenuePerListing: number
  churnRate30d: number // from S8 RevenuePerception
  discountedChurn: number
  discountedActive: number
  fullPriceChurn: number
  fullPriceActive: number
  downgrades90d: number
  fullChurn90d: number
  lifetimeDays: number[] // sorted array of subscription lifetime days for churned accounts
  secondaryChurnEvents: number
  totalSecondaryListings: number
}

export function computeRevenueHealthExtended(inputs: RevenueHealthInputs): RevenueHealthExtended {
  // churnByTier
  const churnByTier: Record<string, number> = { free: 0 }
  for (const { tier, churnEvents, activeCount } of inputs.churnByTierData) {
    churnByTier[tier] = activeCount > 0 ? (churnEvents / activeCount) * 100 : 0
  }

  // annualRenewalRate
  const annualRenewalRate = inputs.eligibleForRenewal > 0
    ? ((inputs.eligibleForRenewal - inputs.churnedAnnualCount) / inputs.eligibleForRenewal) * 100
    : 0

  // ltv
  const monthlyChurnRate = inputs.churnRate30d / 100
  const ltv = monthlyChurnRate > 0
    ? inputs.averageRevenuePerListing * (1 / monthlyChurnRate)
    : inputs.averageRevenuePerListing * REVENUE_HEALTH_SPEC.LTV_CAP_YEARS * 12

  // cac
  const cac = REVENUE_HEALTH_SPEC.CAC_V1

  // discountCohortDivergence
  const discountedChurnRate = inputs.discountedActive > 0 ? inputs.discountedChurn / inputs.discountedActive : 0
  const fullPriceChurnRate = inputs.fullPriceActive > 0 ? inputs.fullPriceChurn / inputs.fullPriceActive : 0
  const discountCohortDivergence = (discountedChurnRate - fullPriceChurnRate) * 100

  // downgradeToPaidChurnRatio
  const downgradeToPaidChurnRatio = inputs.fullChurn90d > 0
    ? inputs.downgrades90d / inputs.fullChurn90d
    : 0

  // averageSubscriptionLifetimeDays (median)
  const averageSubscriptionLifetimeDays = inputs.lifetimeDays.length > 0
    ? median(inputs.lifetimeDays)
    : 0

  // secondaryListingChurnRate
  const secondaryListingChurnRate = inputs.totalSecondaryListings > 0
    ? (inputs.secondaryChurnEvents / inputs.totalSecondaryListings) * 100
    : 0

  return {
    churnByTier,
    annualRenewalRate,
    ltv,
    cac,
    discountCohortDivergence,
    downgradeToPaidChurnRatio,
    averageSubscriptionLifetimeDays,
    secondaryListingChurnRate,
  }
}

function median(sorted: number[]): number {
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2
}
