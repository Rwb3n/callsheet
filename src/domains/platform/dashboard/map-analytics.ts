// Analytics tier gating — S5 §3.1, §3.3, CS-WORK-044 AC-6 through AC-9
// Pure functions. No I/O. Maps raw engagement/analytics data to tier-appropriate UI shape.

import type { FeatureAccess } from "@/domains/commercial/subscription/feature-access"

// --- Types ---

export type AnalyticsPeriod = "7d" | "30d" | "90d"

export type EngagementCounters = {
  profileViews: number
  searchAppearances: number
  enquiriesReceived: number
  enquiryResponseRate: number | null
  enquiryResponseTime: number | null
}

export type TrendDataPoint = {
  date: string
  views: number
  searchAppearances: number
  enquiriesReceived: number
}

export type ListingAnalyticsSummary = {
  period: AnalyticsPeriod
  views: number
  searchAppearances: number
  enquiriesReceived: number
  viewsTrend: TrendDataPoint[]
}

export type AnalyticsDisplayData = {
  totalProfileViews: number
  totalSearchAppearances: number
  totalEnquiriesReceived: number
  trendData?: {
    period: AnalyticsPeriod
    views: number
    searchAppearances: number
    enquiriesReceived: number
    viewsTrend: TrendDataPoint[]
  }
  topSearchTerms?: string[] | null
  viewerDemographics?: Record<string, number> | null
  competitorBenchmarking?: Record<string, unknown> | null
  enquiryResponseInsights?: {
    responseRate: number | null
    avgResponseTime: number | null
  } | null
}

// --- Period comparison ---

const PERIOD_RANK = { "7d": 1, "30d": 2, "90d": 3 } as const

export function comparePeriods(
  requested: AnalyticsPeriod,
  max: "30d" | "90d",
): AnalyticsPeriod {
  return PERIOD_RANK[requested] <= PERIOD_RANK[max] ? requested : max
}

// --- Tier-gated mapping ---

export function mapAnalyticsToUI(
  counters: EngagementCounters,
  analytics: ListingAnalyticsSummary | null,
  featureAccess: FeatureAccess,
): AnalyticsDisplayData {
  const base: AnalyticsDisplayData = {
    totalProfileViews: counters.profileViews,
    totalSearchAppearances: counters.searchAppearances,
    totalEnquiriesReceived: counters.enquiriesReceived,
  }

  if (featureAccess.trendAnalytics !== "none" && analytics) {
    base.trendData = {
      period: analytics.period,
      views: analytics.views,
      searchAppearances: analytics.searchAppearances,
      enquiriesReceived: analytics.enquiriesReceived,
      viewsTrend: analytics.viewsTrend,
    }
  }

  // S9 provides data; S5 renders placeholder [S1-4]
  if (featureAccess.topSearchTerms) {
    base.topSearchTerms = null
  }

  if (featureAccess.viewerDemographics) {
    base.viewerDemographics = null
  }

  if (featureAccess.competitorBenchmarking) {
    base.competitorBenchmarking = null
  }

  if (featureAccess.enquiryResponseInsights) {
    base.enquiryResponseInsights = {
      responseRate: counters.enquiryResponseRate,
      avgResponseTime: counters.enquiryResponseTime,
    }
  }

  return base
}
