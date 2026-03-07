// Commercial intelligence unit tests — AC-80, AC-81
import { describe, it, expect } from "vitest"
import {
  computeRevenueHealthExtended,
  REVENUE_HEALTH_SPEC,
  type RevenueHealthInputs,
} from "../revenue-health-extended"
import {
  analyseSponsoredPlacements,
  INSUFFICIENT_DATA_RESULT,
  SPONSORED_LEARNING_SPEC,
  type PlacementDecisionContext,
} from "../sponsored-learning"

// --- computeRevenueHealthExtended ---

function makeInputs(overrides: Partial<RevenueHealthInputs> = {}): RevenueHealthInputs {
  return {
    churnByTierData: [
      { tier: "free", churnEvents: 0, activeCount: 100 },
      { tier: "standard", churnEvents: 5, activeCount: 50 },
      { tier: "premium", churnEvents: 2, activeCount: 20 },
    ],
    eligibleForRenewal: 30,
    churnedAnnualCount: 3,
    averageRevenuePerListing: 200,
    churnRate30d: 5,
    discountedChurn: 2,
    discountedActive: 10,
    fullPriceChurn: 3,
    fullPriceActive: 40,
    downgrades90d: 4,
    fullChurn90d: 8,
    lifetimeDays: [30, 60, 90, 120, 180],
    secondaryChurnEvents: 1,
    totalSecondaryListings: 10,
    ...overrides,
  }
}

describe("computeRevenueHealthExtended", () => {
  it("AC-80: cac is always 0", () => {
    const result = computeRevenueHealthExtended(makeInputs())
    expect(result.cac).toBe(REVENUE_HEALTH_SPEC.CAC_V1)
    expect(result.cac).toBe(0)
  })

  it("computes churnByTier correctly", () => {
    const result = computeRevenueHealthExtended(makeInputs())
    // standard: (5/50)*100 = 10%
    expect(result.churnByTier.standard).toBe(10)
    // premium: (2/20)*100 = 10%
    expect(result.churnByTier.premium).toBe(10)
    // free: (0/100)*100 = 0%
    expect(result.churnByTier.free).toBe(0)
  })

  it("handles zero active count for a tier without division error", () => {
    const result = computeRevenueHealthExtended(makeInputs({
      churnByTierData: [{ tier: "standard", churnEvents: 5, activeCount: 0 }],
    }))
    expect(result.churnByTier.standard).toBe(0)
  })

  it("LTV calculation with non-zero churn rate", () => {
    // churnRate30d = 5 => monthlyChurnRate = 0.05
    // ltv = averageRevenuePerListing * (1 / monthlyChurnRate) = 200 * 20 = 4000
    const result = computeRevenueHealthExtended(makeInputs({
      averageRevenuePerListing: 200,
      churnRate30d: 5,
    }))
    expect(result.ltv).toBe(4000)
  })

  it("LTV caps at 120 months when churn rate is 0", () => {
    // ltv = averageRevenuePerListing * LTV_CAP_YEARS * 12 = 200 * 10 * 12 = 24000
    const result = computeRevenueHealthExtended(makeInputs({
      averageRevenuePerListing: 200,
      churnRate30d: 0,
    }))
    expect(result.ltv).toBe(200 * REVENUE_HEALTH_SPEC.LTV_CAP_YEARS * 12)
    expect(result.ltv).toBe(24000)
  })

  it("computes annualRenewalRate correctly", () => {
    // (30 - 3) / 30 * 100 = 90%
    const result = computeRevenueHealthExtended(makeInputs())
    expect(result.annualRenewalRate).toBe(90)
  })

  it("annualRenewalRate is 0 when none eligible", () => {
    const result = computeRevenueHealthExtended(makeInputs({
      eligibleForRenewal: 0,
      churnedAnnualCount: 0,
    }))
    expect(result.annualRenewalRate).toBe(0)
  })

  it("computes discountCohortDivergence correctly", () => {
    // discountedChurnRate = 2/10 = 0.2
    // fullPriceChurnRate = 3/40 = 0.075
    // divergence = (0.2 - 0.075) * 100 = 12.5
    const result = computeRevenueHealthExtended(makeInputs())
    expect(result.discountCohortDivergence).toBeCloseTo(12.5, 1)
  })

  it("computes downgradeToPaidChurnRatio correctly", () => {
    // 4 / 8 = 0.5
    const result = computeRevenueHealthExtended(makeInputs())
    expect(result.downgradeToPaidChurnRatio).toBe(0.5)
  })

  it("downgradeToPaidChurnRatio is 0 when no full churn", () => {
    const result = computeRevenueHealthExtended(makeInputs({ fullChurn90d: 0 }))
    expect(result.downgradeToPaidChurnRatio).toBe(0)
  })

  it("median computation for averageSubscriptionLifetimeDays — odd count", () => {
    // [30, 60, 90, 120, 180] => median = 90
    const result = computeRevenueHealthExtended(makeInputs({
      lifetimeDays: [30, 60, 90, 120, 180],
    }))
    expect(result.averageSubscriptionLifetimeDays).toBe(90)
  })

  it("median computation for averageSubscriptionLifetimeDays — even count", () => {
    // [30, 60, 90, 120] => median = (60 + 90) / 2 = 75
    const result = computeRevenueHealthExtended(makeInputs({
      lifetimeDays: [30, 60, 90, 120],
    }))
    expect(result.averageSubscriptionLifetimeDays).toBe(75)
  })

  it("averageSubscriptionLifetimeDays is 0 when no lifetime data", () => {
    const result = computeRevenueHealthExtended(makeInputs({ lifetimeDays: [] }))
    expect(result.averageSubscriptionLifetimeDays).toBe(0)
  })

  it("computes secondaryListingChurnRate correctly", () => {
    // (1/10)*100 = 10%
    const result = computeRevenueHealthExtended(makeInputs())
    expect(result.secondaryListingChurnRate).toBe(10)
  })

  it("secondaryListingChurnRate is 0 when no secondary listings", () => {
    const result = computeRevenueHealthExtended(makeInputs({ totalSecondaryListings: 0 }))
    expect(result.secondaryListingChurnRate).toBe(0)
  })
})

// --- analyseSponsoredPlacements ---

describe("analyseSponsoredPlacements", () => {
  it("AC-81: returns insufficient_data when no decisions", () => {
    const result = analyseSponsoredPlacements([])
    expect(result).toEqual(INSUFFICIENT_DATA_RESULT)
    expect(result.qualityFloorAnalysis.recommendation).toBe("insufficient_data")
    expect(result.fairnessCapAnalysis.recommendation).toBe("insufficient_data")
  })

  it('returns "lower" when floor excludes >50%', () => {
    // 60% of eligible excluded by quality floor => should recommend "lower"
    const decisions: PlacementDecisionContext[] = Array.from({ length: 10 }, (_, i) => ({
      paidAndEligible: true,
      excludedReason: i < 6 ? "quality_below_floor" : undefined,
      serviceArea: "camera",
    }))

    const result = analyseSponsoredPlacements(decisions)
    expect(result.qualityFloorAnalysis.floorHitRate).toBe(0.6)
    expect(result.qualityFloorAnalysis.recommendation).toBe("lower")
  })

  it('returns "raise" when floor excludes <10%', () => {
    // 5% excluded => should recommend "raise"
    const decisions: PlacementDecisionContext[] = Array.from({ length: 20 }, (_, i) => ({
      paidAndEligible: true,
      excludedReason: i === 0 ? "quality_below_floor" : undefined,
      serviceArea: "lighting",
    }))

    const result = analyseSponsoredPlacements(decisions)
    expect(result.qualityFloorAnalysis.floorHitRate).toBe(0.05)
    expect(result.qualityFloorAnalysis.recommendation).toBe("raise")
  })

  it('returns "maintain" when floor excludes between 10-50%', () => {
    // 30% excluded => should recommend "maintain"
    const decisions: PlacementDecisionContext[] = Array.from({ length: 10 }, (_, i) => ({
      paidAndEligible: true,
      excludedReason: i < 3 ? "quality_below_floor" : undefined,
      serviceArea: "sound",
    }))

    const result = analyseSponsoredPlacements(decisions)
    expect(result.qualityFloorAnalysis.floorHitRate).toBe(0.3)
    expect(result.qualityFloorAnalysis.recommendation).toBe("maintain")
  })

  it('returns "tighten" when cap never activates', () => {
    // No fairness cap reached in any service area => "tighten"
    const decisions: PlacementDecisionContext[] = [
      { paidAndEligible: true, serviceArea: "camera", fairnessCapReached: false },
      { paidAndEligible: true, serviceArea: "lighting", fairnessCapReached: false },
      { paidAndEligible: true, serviceArea: "sound", fairnessCapReached: false },
    ]

    const result = analyseSponsoredPlacements(decisions)
    expect(result.fairnessCapAnalysis.capActivationRate).toBe(0)
    expect(result.fairnessCapAnalysis.recommendation).toBe("tighten")
  })

  it('returns "loosen" when cap activates in >80% service areas', () => {
    // 5 out of 5 service areas have cap activated => 100% > 80% => "loosen"
    const decisions: PlacementDecisionContext[] = [
      { paidAndEligible: true, serviceArea: "camera", fairnessCapReached: true },
      { paidAndEligible: true, serviceArea: "lighting", fairnessCapReached: true },
      { paidAndEligible: true, serviceArea: "sound", fairnessCapReached: true },
      { paidAndEligible: true, serviceArea: "grip", fairnessCapReached: true },
      { paidAndEligible: true, serviceArea: "transport", fairnessCapReached: true },
    ]

    const result = analyseSponsoredPlacements(decisions)
    expect(result.fairnessCapAnalysis.capActivationRate).toBe(1.0)
    expect(result.fairnessCapAnalysis.recommendation).toBe("loosen")
  })

  it('returns "maintain" when cap activation between 0 and 80%', () => {
    // 2 out of 4 areas => 50% => "maintain"
    const decisions: PlacementDecisionContext[] = [
      { paidAndEligible: true, serviceArea: "camera", fairnessCapReached: true },
      { paidAndEligible: true, serviceArea: "lighting", fairnessCapReached: true },
      { paidAndEligible: true, serviceArea: "sound", fairnessCapReached: false },
      { paidAndEligible: true, serviceArea: "grip", fairnessCapReached: false },
    ]

    const result = analyseSponsoredPlacements(decisions)
    expect(result.fairnessCapAnalysis.capActivationRate).toBe(0.5)
    expect(result.fairnessCapAnalysis.recommendation).toBe("maintain")
  })

  it("ignores decisions without serviceArea for fairness cap", () => {
    const decisions: PlacementDecisionContext[] = [
      { paidAndEligible: true, fairnessCapReached: true },
      { paidAndEligible: true, serviceArea: "camera", fairnessCapReached: false },
    ]

    const result = analyseSponsoredPlacements(decisions)
    // Only 1 service area ("camera"), 0 cap hits => tighten
    expect(result.fairnessCapAnalysis.totalServiceAreas).toBe(1)
    expect(result.fairnessCapAnalysis.recommendation).toBe("tighten")
  })

  it("correctly counts non-eligible decisions for quality floor", () => {
    const decisions: PlacementDecisionContext[] = [
      { paidAndEligible: false, excludedReason: "quality_below_floor", serviceArea: "camera" },
      { paidAndEligible: true, excludedReason: "quality_below_floor", serviceArea: "camera" },
      { paidAndEligible: true, serviceArea: "camera" },
    ]

    const result = analyseSponsoredPlacements(decisions)
    // Only 2 eligible, 1 excluded => 50% => boundary at HIGH threshold
    expect(result.qualityFloorAnalysis.totalEligibleListings).toBe(2)
    expect(result.qualityFloorAnalysis.excludedByFloor).toBe(1)
    expect(result.qualityFloorAnalysis.floorHitRate).toBe(0.5)
    // 0.5 === QUALITY_FLOOR_EXCLUSION_HIGH (not >) => "maintain"
    expect(result.qualityFloorAnalysis.recommendation).toBe("maintain")
  })

  it("uses exact threshold boundary — 50% is maintain, not lower", () => {
    // Boundary: exactly 50% should be "maintain" (> 0.50 triggers "lower")
    const decisions: PlacementDecisionContext[] = Array.from({ length: 10 }, (_, i) => ({
      paidAndEligible: true,
      excludedReason: i < 5 ? "quality_below_floor" : undefined,
      serviceArea: "camera",
    }))

    const result = analyseSponsoredPlacements(decisions)
    expect(result.qualityFloorAnalysis.floorHitRate).toBe(0.5)
    expect(result.qualityFloorAnalysis.recommendation).toBe("maintain")
  })

  it("uses exact threshold boundary — 10% is maintain, not raise", () => {
    // Boundary: exactly 10% should be "maintain" (< 0.10 triggers "raise")
    const decisions: PlacementDecisionContext[] = Array.from({ length: 10 }, (_, i) => ({
      paidAndEligible: true,
      excludedReason: i === 0 ? "quality_below_floor" : undefined,
      serviceArea: "camera",
    }))

    const result = analyseSponsoredPlacements(decisions)
    expect(result.qualityFloorAnalysis.floorHitRate).toBe(0.1)
    expect(result.qualityFloorAnalysis.recommendation).toBe("maintain")
  })

  it("uses exact threshold boundary — 80% cap activation is maintain, not loosen", () => {
    // 4 out of 5 = 80% => should be "maintain" (> 0.80 triggers "loosen")
    const decisions: PlacementDecisionContext[] = [
      { paidAndEligible: true, serviceArea: "a", fairnessCapReached: true },
      { paidAndEligible: true, serviceArea: "b", fairnessCapReached: true },
      { paidAndEligible: true, serviceArea: "c", fairnessCapReached: true },
      { paidAndEligible: true, serviceArea: "d", fairnessCapReached: true },
      { paidAndEligible: true, serviceArea: "e", fairnessCapReached: false },
    ]

    const result = analyseSponsoredPlacements(decisions)
    expect(result.fairnessCapAnalysis.capActivationRate).toBe(0.8)
    expect(result.fairnessCapAnalysis.recommendation).toBe("maintain")
  })
})
