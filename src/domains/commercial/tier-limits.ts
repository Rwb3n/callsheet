// TIER_LIMITS — CR §4.1 (P4: import from owner, never copy)
// Authoritative feature limits per subscription tier.

export type ListingSubscriptionTier = "free" | "standard" | "premium" | "partner"

export type TierLimits = {
  maxMedia: number
  maxCredits: number | "unlimited"
  customTags: boolean
  trendAnalytics: "none" | "30d" | "90d"
  topSearchTerms: boolean
  rankingBoost: number
  viewerDemographics: boolean
  competitorBenchmarking: boolean
  sponsoredPlacement: boolean
  enquiryResponseInsights: boolean
  prioritySupport: boolean
  buyerVisibleEngagementStats: boolean
}

export const TIER_LIMITS: Record<ListingSubscriptionTier, TierLimits> = {
  free:     { maxMedia: 5,  maxCredits: 10,          customTags: false, trendAnalytics: "none", topSearchTerms: false, rankingBoost: 0,  viewerDemographics: false, competitorBenchmarking: false, sponsoredPlacement: false, enquiryResponseInsights: false, prioritySupport: false, buyerVisibleEngagementStats: false },
  standard: { maxMedia: 20, maxCredits: 50,          customTags: true,  trendAnalytics: "30d",  topSearchTerms: true,  rankingBoost: 15, viewerDemographics: false, competitorBenchmarking: false, sponsoredPlacement: false, enquiryResponseInsights: false, prioritySupport: false, buyerVisibleEngagementStats: true },
  premium:  { maxMedia: 50, maxCredits: "unlimited", customTags: true,  trendAnalytics: "90d",  topSearchTerms: true,  rankingBoost: 25, viewerDemographics: true,  competitorBenchmarking: true,  sponsoredPlacement: true,  enquiryResponseInsights: true,  prioritySupport: false, buyerVisibleEngagementStats: true },
  partner:  { maxMedia: 50, maxCredits: "unlimited", customTags: true,  trendAnalytics: "90d",  topSearchTerms: true,  rankingBoost: 25, viewerDemographics: true,  competitorBenchmarking: true,  sponsoredPlacement: true,  enquiryResponseInsights: true,  prioritySupport: true,  buyerVisibleEngagementStats: true },
}
