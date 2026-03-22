// CS-WORK-044 AC-6 through AC-9, AC-11: Tier-gated analytics mapping unit tests

import { describe, it, expect } from "vitest"
import {
  mapAnalyticsToUI,
  comparePeriods,
  type EngagementCounters,
  type ListingAnalyticsSummary,
} from "../map-analytics"
import { computeFeatureAccess } from "@/domains/commercial/subscription/feature-access"

const COUNTERS: EngagementCounters = {
  profileViews: 150,
  searchAppearances: 400,
  enquiriesReceived: 12,
  enquiryResponseRate: 0.85,
  enquiryResponseTime: 120,
}

const ANALYTICS_30D: ListingAnalyticsSummary = {
  period: "30d",
  views: 42,
  searchAppearances: 110,
  enquiriesReceived: 5,
  viewsTrend: [
    { date: "2026-01-25", views: 14, searchAppearances: 35, enquiriesReceived: 2 },
    { date: "2026-02-01", views: 15, searchAppearances: 40, enquiriesReceived: 1 },
    { date: "2026-02-08", views: 13, searchAppearances: 35, enquiriesReceived: 2 },
  ],
}

// --- AC-6: Free tier — all-time totals only ---

describe("mapAnalyticsToUI — free tier", () => {
  const fa = computeFeatureAccess("free")

  it("shows all-time totals only", () => {
    const result = mapAnalyticsToUI(COUNTERS, ANALYTICS_30D, fa)
    expect(result.totalProfileViews).toBe(150)
    expect(result.totalSearchAppearances).toBe(400)
    expect(result.totalEnquiriesReceived).toBe(12)
  })

  it("excludes trend chart", () => {
    const result = mapAnalyticsToUI(COUNTERS, ANALYTICS_30D, fa)
    expect(result.trendData).toBeUndefined()
  })

  it("excludes search terms", () => {
    const result = mapAnalyticsToUI(COUNTERS, ANALYTICS_30D, fa)
    expect(result.topSearchTerms).toBeUndefined()
  })

  it("excludes premium features", () => {
    const result = mapAnalyticsToUI(COUNTERS, ANALYTICS_30D, fa)
    expect(result.viewerDemographics).toBeUndefined()
    expect(result.competitorBenchmarking).toBeUndefined()
    expect(result.enquiryResponseInsights).toBeUndefined()
  })
})

// --- AC-7: Standard tier — 30d trends + search terms ---

describe("mapAnalyticsToUI — standard tier", () => {
  const fa = computeFeatureAccess("standard")

  it("includes trend data", () => {
    const result = mapAnalyticsToUI(COUNTERS, ANALYTICS_30D, fa)
    expect(result.trendData).toBeDefined()
    expect(result.trendData!.period).toBe("30d")
    expect(result.trendData!.viewsTrend).toHaveLength(3)
  })

  it("includes search terms placeholder", () => {
    const result = mapAnalyticsToUI(COUNTERS, ANALYTICS_30D, fa)
    expect(result.topSearchTerms).toBeNull()
  })

  it("excludes premium features", () => {
    const result = mapAnalyticsToUI(COUNTERS, ANALYTICS_30D, fa)
    expect(result.viewerDemographics).toBeUndefined()
    expect(result.competitorBenchmarking).toBeUndefined()
    expect(result.enquiryResponseInsights).toBeUndefined()
  })

  it("returns null trendData when analytics are null", () => {
    const result = mapAnalyticsToUI(COUNTERS, null, fa)
    expect(result.trendData).toBeUndefined()
    expect(result.totalProfileViews).toBe(150)
  })
})

// --- AC-8: Premium tier — full analytics ---

describe("mapAnalyticsToUI — premium tier", () => {
  const fa = computeFeatureAccess("premium")

  it("includes trend data", () => {
    const result = mapAnalyticsToUI(COUNTERS, ANALYTICS_30D, fa)
    expect(result.trendData).toBeDefined()
  })

  it("includes all premium placeholders", () => {
    const result = mapAnalyticsToUI(COUNTERS, ANALYTICS_30D, fa)
    expect(result.topSearchTerms).toBeNull()
    expect(result.viewerDemographics).toBeNull()
    expect(result.competitorBenchmarking).toBeNull()
  })

  it("includes enquiry response insights from counters", () => {
    const result = mapAnalyticsToUI(COUNTERS, ANALYTICS_30D, fa)
    expect(result.enquiryResponseInsights).toEqual({
      responseRate: 0.85,
      avgResponseTime: 120,
    })
  })

  it("includes null response insights when counters have no data", () => {
    const countersNoResponse: EngagementCounters = {
      ...COUNTERS,
      enquiryResponseRate: null,
      enquiryResponseTime: null,
    }
    const result = mapAnalyticsToUI(countersNoResponse, ANALYTICS_30D, fa)
    expect(result.enquiryResponseInsights).toEqual({
      responseRate: null,
      avgResponseTime: null,
    })
  })
})

// --- AC-8: Partner tier matches premium ---

describe("mapAnalyticsToUI — partner tier", () => {
  const fa = computeFeatureAccess("partner")

  it("includes all premium features", () => {
    const result = mapAnalyticsToUI(COUNTERS, ANALYTICS_30D, fa)
    expect(result.trendData).toBeDefined()
    expect(result.topSearchTerms).toBeNull()
    expect(result.viewerDemographics).toBeNull()
    expect(result.competitorBenchmarking).toBeNull()
    expect(result.enquiryResponseInsights).toBeDefined()
  })
})

// --- AC-9: Period clamping ---

describe("comparePeriods", () => {
  it("allows 7d within 30d max", () => {
    expect(comparePeriods("7d", "30d")).toBe("7d")
  })

  it("allows 30d within 30d max", () => {
    expect(comparePeriods("30d", "30d")).toBe("30d")
  })

  it("clamps 90d to 30d when max is 30d", () => {
    expect(comparePeriods("90d", "30d")).toBe("30d")
  })

  it("allows 7d within 90d max", () => {
    expect(comparePeriods("7d", "90d")).toBe("7d")
  })

  it("allows 30d within 90d max", () => {
    expect(comparePeriods("30d", "90d")).toBe("30d")
  })

  it("allows 90d within 90d max", () => {
    expect(comparePeriods("90d", "90d")).toBe("90d")
  })
})
