// Sponsored placement learning — S9 §5.6
// Pure logic module for sponsored placement learning analysis.
// Analyses quality floor exclusion rates and fairness cap activation rates.

export const SPONSORED_LEARNING_SPEC = {
  QUALITY_FLOOR_EXCLUSION_HIGH: 0.50,
  QUALITY_FLOOR_EXCLUSION_LOW: 0.10,
  FAIRNESS_CAP_ACTIVATION_HIGH: 0.80,
}

export type QualityFloorAnalysis = {
  totalEligibleListings: number
  excludedByFloor: number
  floorHitRate: number
  recommendation: "lower" | "maintain" | "raise" | "insufficient_data"
}

export type FairnessCapAnalysis = {
  totalServiceAreas: number
  capsActivated: number
  capActivationRate: number
  recommendation: "tighten" | "maintain" | "loosen" | "insufficient_data"
}

export type SponsoredPlacementLearningResult = {
  qualityFloorAnalysis: QualityFloorAnalysis
  fairnessCapAnalysis: FairnessCapAnalysis
}

export const INSUFFICIENT_DATA_RESULT: SponsoredPlacementLearningResult = {
  qualityFloorAnalysis: { totalEligibleListings: 0, excludedByFloor: 0, floorHitRate: 0, recommendation: "insufficient_data" },
  fairnessCapAnalysis: { totalServiceAreas: 0, capsActivated: 0, capActivationRate: 0, recommendation: "insufficient_data" },
}

// Input: decision logs for "sponsored_placement_selection" from last 30 days
// Each log has inputs.context with { paidAndEligible, excludedReason, serviceArea, fairnessCapReached }
export type PlacementDecisionContext = {
  paidAndEligible: boolean
  excludedReason?: string
  serviceArea?: string
  fairnessCapReached?: boolean
}

export function analyseSponsoredPlacements(decisions: PlacementDecisionContext[]): SponsoredPlacementLearningResult {
  if (decisions.length === 0) return INSUFFICIENT_DATA_RESULT

  // Quality floor analysis
  const totalEligible = decisions.filter(d => d.paidAndEligible).length
  const excludedByFloor = decisions.filter(d => d.paidAndEligible && d.excludedReason === "quality_below_floor").length
  const floorHitRate = totalEligible > 0 ? excludedByFloor / totalEligible : 0

  const qualityFloorRecommendation: QualityFloorAnalysis["recommendation"] =
    floorHitRate > SPONSORED_LEARNING_SPEC.QUALITY_FLOOR_EXCLUSION_HIGH ? "lower" :
    floorHitRate < SPONSORED_LEARNING_SPEC.QUALITY_FLOOR_EXCLUSION_LOW ? "raise" :
    "maintain"

  // Fairness cap analysis
  const byServiceArea = new Map<string, { capHits: number }>()
  for (const d of decisions) {
    if (!d.serviceArea) continue
    const entry = byServiceArea.get(d.serviceArea) ?? { capHits: 0 }
    if (d.fairnessCapReached) entry.capHits += 1
    byServiceArea.set(d.serviceArea, entry)
  }

  let capsActivated = 0
  for (const [, entry] of byServiceArea) {
    if (entry.capHits > 0) capsActivated++
  }
  const capActivationRate = byServiceArea.size > 0 ? capsActivated / byServiceArea.size : 0

  const fairnessCapRecommendation: FairnessCapAnalysis["recommendation"] =
    capActivationRate === 0 ? "tighten" :
    capActivationRate > SPONSORED_LEARNING_SPEC.FAIRNESS_CAP_ACTIVATION_HIGH ? "loosen" :
    "maintain"

  return {
    qualityFloorAnalysis: { totalEligibleListings: totalEligible, excludedByFloor, floorHitRate, recommendation: qualityFloorRecommendation },
    fairnessCapAnalysis: { totalServiceAreas: byServiceArea.size, capsActivated, capActivationRate, recommendation: fairnessCapRecommendation },
  }
}
