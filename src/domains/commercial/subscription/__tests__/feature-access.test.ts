import { describe, it, expect } from "vitest"
import { computeFeatureAccess } from "../feature-access"
import type { FeatureAccess } from "../feature-access"
import { enforceFeatureGate, checkFeatureAccess } from "@/lib/feature-gate"
import { isPremiumVerificationEligible } from "@/domains/data-and-listings/verification/premium-gate"
import { PRICING, LAUNCH_DISCOUNT } from "../pricing"
import type { SubscriptionTier } from "@/lib/events/types"
import { TRPCError } from "@trpc/server"

// --- AC-16: computeFeatureAccess("free") returns correct limits ---

describe("computeFeatureAccess", () => {
  it("returns correct limits for free tier", () => {
    const access = computeFeatureAccess("free")

    expect(access.maxMedia).toBe(5)
    expect(access.maxCredits).toBe(10)
    expect(access.customTags).toBe(false)
    expect(access.trendAnalytics).toBe("none")
    expect(access.topSearchTerms).toBe(false)
    expect(access.rankingBoost).toBe(0)
    expect(access.viewerDemographics).toBe(false)
    expect(access.competitorBenchmarking).toBe(false)
    expect(access.sponsoredPlacement).toBe(false)
    expect(access.enquiryResponseInsights).toBe(false)
    expect(access.prioritySupport).toBe(false)
    expect(access.buyerVisibleEngagementStats).toBe(false)
  })

  it("returns base boolean fields as true for all tiers", () => {
    const tiers: SubscriptionTier[] = ["free", "standard", "premium", "partner"]
    for (const tier of tiers) {
      const access = computeFeatureAccess(tier)
      expect(access.directContactVisible).toBe(true)
      expect(access.organicSearchVisible).toBe(true)
      expect(access.enquiriesEnabled).toBe(true)
      expect(access.basicAnalytics).toBe(true)
    }
  })

  it("returns correct limits for standard tier", () => {
    const access = computeFeatureAccess("standard")

    expect(access.maxMedia).toBe(20)
    expect(access.maxCredits).toBe(50)
    expect(access.customTags).toBe(true)
    expect(access.trendAnalytics).toBe("30d")
    expect(access.topSearchTerms).toBe(true)
    expect(access.rankingBoost).toBe(15)
    expect(access.viewerDemographics).toBe(false)
    expect(access.buyerVisibleEngagementStats).toBe(true)
  })

  it("returns correct limits for premium tier", () => {
    const access = computeFeatureAccess("premium")

    expect(access.maxMedia).toBe(50)
    expect(access.maxCredits).toBe("unlimited")
    expect(access.trendAnalytics).toBe("90d")
    expect(access.viewerDemographics).toBe(true)
    expect(access.competitorBenchmarking).toBe(true)
    expect(access.sponsoredPlacement).toBe(true)
    expect(access.enquiryResponseInsights).toBe(true)
    expect(access.prioritySupport).toBe(false)
  })

  // --- AC-17: computeFeatureAccess("partner") returns prioritySupport: true ---

  it("returns prioritySupport true for partner tier", () => {
    const access = computeFeatureAccess("partner")

    expect(access.prioritySupport).toBe(true)
    expect(access.maxMedia).toBe(50)
    expect(access.maxCredits).toBe("unlimited")
    expect(access.sponsoredPlacement).toBe(true)
    expect(access.buyerVisibleEngagementStats).toBe(true)
  })
})

// --- AC-18: enforceFeatureGate throws FORBIDDEN for gated feature on free tier ---

describe("enforceFeatureGate", () => {
  it("throws FORBIDDEN for boolean-gated feature on free tier", () => {
    expect(() => enforceFeatureGate("free", "customTags")).toThrow(TRPCError)
    try {
      enforceFeatureGate("free", "customTags")
    } catch (err) {
      expect((err as TRPCError).code).toBe("FORBIDDEN")
      expect((err as TRPCError).message).toContain("customTags")
    }
  })

  it("throws FORBIDDEN for numeric-gated feature (rankingBoost: 0) on free tier", () => {
    expect(() => enforceFeatureGate("free", "rankingBoost")).toThrow(TRPCError)
  })

  it("throws FORBIDDEN for string-gated feature (trendAnalytics: none) on free tier", () => {
    expect(() => enforceFeatureGate("free", "trendAnalytics")).toThrow(TRPCError)
  })

  it("does not throw for allowed feature on free tier", () => {
    expect(() => enforceFeatureGate("free", "maxMedia")).not.toThrow()
  })

  it("does not throw for paid feature on standard tier", () => {
    expect(() => enforceFeatureGate("standard", "customTags")).not.toThrow()
  })

  it("does not throw for premium feature on premium tier", () => {
    expect(() => enforceFeatureGate("premium", "viewerDemographics")).not.toThrow()
  })

  it("throws FORBIDDEN for prioritySupport on premium tier", () => {
    expect(() => enforceFeatureGate("premium", "prioritySupport")).toThrow(TRPCError)
  })

  it("does not throw for prioritySupport on partner tier", () => {
    expect(() => enforceFeatureGate("partner", "prioritySupport")).not.toThrow()
  })
})

// --- AC-19: checkFeatureAccess returns true for paid tier features ---

describe("checkFeatureAccess", () => {
  it("returns false for gated feature on free tier", () => {
    expect(checkFeatureAccess("free", "customTags")).toBe(false)
    expect(checkFeatureAccess("free", "rankingBoost")).toBe(false)
    expect(checkFeatureAccess("free", "trendAnalytics")).toBe(false)
  })

  it("returns true for allowed feature on free tier", () => {
    expect(checkFeatureAccess("free", "maxMedia")).toBe(true)
  })

  it("returns true for paid tier features on standard", () => {
    expect(checkFeatureAccess("standard", "customTags")).toBe(true)
    expect(checkFeatureAccess("standard", "topSearchTerms")).toBe(true)
    expect(checkFeatureAccess("standard", "rankingBoost")).toBe(true)
    expect(checkFeatureAccess("standard", "trendAnalytics")).toBe(true)
  })

  it("returns false for premium-only features on standard", () => {
    expect(checkFeatureAccess("standard", "viewerDemographics")).toBe(false)
    expect(checkFeatureAccess("standard", "competitorBenchmarking")).toBe(false)
  })

  it("returns true for all features on partner", () => {
    expect(checkFeatureAccess("partner", "prioritySupport")).toBe(true)
    expect(checkFeatureAccess("partner", "sponsoredPlacement")).toBe(true)
    expect(checkFeatureAccess("partner", "viewerDemographics")).toBe(true)
  })
})

// --- AC-40: isPremiumVerificationEligible ---

describe("isPremiumVerificationEligible", () => {
  it("returns false for free tier", () => {
    expect(isPremiumVerificationEligible("free")).toBe(false)
  })

  it("returns true for standard tier", () => {
    expect(isPremiumVerificationEligible("standard")).toBe(true)
  })

  it("returns true for premium tier", () => {
    expect(isPremiumVerificationEligible("premium")).toBe(true)
  })

  it("returns true for partner tier", () => {
    expect(isPremiumVerificationEligible("partner")).toBe(true)
  })
})

// --- PRICING and LAUNCH_DISCOUNT consts ---

describe("PRICING", () => {
  it("defines 4 tiers", () => {
    expect(PRICING).toHaveLength(4)
  })

  it("has correct annual prices", () => {
    const prices = Object.fromEntries(PRICING.map(p => [p.tier, p.annualPrice]))
    expect(prices).toEqual({ free: 0, standard: 199, premium: 399, partner: 699 })
  })

  it("has correct monthly prices", () => {
    const prices = Object.fromEntries(PRICING.map(p => [p.tier, p.monthlyPrice]))
    expect(prices).toEqual({ free: 0, standard: 19, premium: 39, partner: 69 })
  })
})

describe("LAUNCH_DISCOUNT", () => {
  it("targets standard tier annual only", () => {
    expect(LAUNCH_DISCOUNT.eligibleTier).toBe("standard")
    expect(LAUNCH_DISCOUNT.restrictions).toBe("annual_only")
    expect(LAUNCH_DISCOUNT.discountedAnnualPrice).toBe(99)
    expect(LAUNCH_DISCOUNT.fullPrice).toBe(199)
    expect(LAUNCH_DISCOUNT.couponCode).toBe("LAUNCH2026")
  })
})
