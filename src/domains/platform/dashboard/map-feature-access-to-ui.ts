// Feature access → UI gate mapping — S5 §11, CS-WORK-049 AC-42, AC-46
// Pure function. No I/O. Maps CR's FeatureAccess to presentation gate states.

import type { FeatureAccess } from "@/domains/commercial/subscription/feature-access"

export type FeatureGateUIState = "available" | "locked" | "upgrade_prompt"

export type UIFeatureMap = {
  analyticsPanel: {
    trendChart: FeatureGateUIState
    searchTerms: FeatureGateUIState
    viewerDemographics: FeatureGateUIState
    competitorBenchmarking: FeatureGateUIState
    enquiryResponseInsights: FeatureGateUIState
  }
  profileEditor: {
    mediaLimit: number
    creditLimit: number | "unlimited"
    customTags: FeatureGateUIState
  }
  searchVisibility: {
    rankingBoost: number
    sponsoredPlacementEligible: boolean
  }
  support: {
    prioritySupport: FeatureGateUIState
  }
}

export function mapFeatureAccessToUI(access: FeatureAccess): UIFeatureMap {
  return {
    analyticsPanel: {
      trendChart: access.trendAnalytics !== "none" ? "available" : "locked",
      searchTerms: access.topSearchTerms ? "available" : "locked",
      viewerDemographics: access.viewerDemographics ? "available" : "locked",
      competitorBenchmarking: access.competitorBenchmarking ? "available" : "locked",
      enquiryResponseInsights: access.enquiryResponseInsights ? "available" : "locked",
    },
    profileEditor: {
      mediaLimit: access.maxMedia,
      creditLimit: access.maxCredits,
      customTags: access.customTags ? "available" : "locked",
    },
    searchVisibility: {
      rankingBoost: access.rankingBoost,
      sponsoredPlacementEligible: access.sponsoredPlacement,
    },
    support: {
      // AC-46: Partner tier only [S5-ST-8]
      prioritySupport: access.prioritySupport ? "available" : "locked",
    },
  }
}
