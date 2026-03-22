// CS-WORK-049 AC-42, AC-46: mapFeatureAccessToUI unit tests

import { describe, it, expect } from "vitest"
import { mapFeatureAccessToUI } from "../map-feature-access-to-ui"
import { computeFeatureAccess } from "@/domains/commercial/subscription/feature-access"

// --- AC-42: correct gate states for each tier ---

describe("mapFeatureAccessToUI", () => {
  it("maps free tier — all analytics locked, base limits", () => {
    const access = computeFeatureAccess("free")
    const ui = mapFeatureAccessToUI(access)

    expect(ui.analyticsPanel.trendChart).toBe("locked")
    expect(ui.analyticsPanel.searchTerms).toBe("locked")
    expect(ui.analyticsPanel.viewerDemographics).toBe("locked")
    expect(ui.analyticsPanel.competitorBenchmarking).toBe("locked")
    expect(ui.analyticsPanel.enquiryResponseInsights).toBe("locked")

    expect(ui.profileEditor.mediaLimit).toBe(5)
    expect(ui.profileEditor.creditLimit).toBe(10)
    expect(ui.profileEditor.customTags).toBe("locked")

    expect(ui.searchVisibility.rankingBoost).toBe(0)
    expect(ui.searchVisibility.sponsoredPlacementEligible).toBe(false)

    expect(ui.support.prioritySupport).toBe("locked")
  })

  it("maps standard tier — trends + search terms available, demographics locked", () => {
    const access = computeFeatureAccess("standard")
    const ui = mapFeatureAccessToUI(access)

    expect(ui.analyticsPanel.trendChart).toBe("available")
    expect(ui.analyticsPanel.searchTerms).toBe("available")
    expect(ui.analyticsPanel.viewerDemographics).toBe("locked")
    expect(ui.analyticsPanel.competitorBenchmarking).toBe("locked")
    expect(ui.analyticsPanel.enquiryResponseInsights).toBe("locked")

    expect(ui.profileEditor.mediaLimit).toBe(20)
    expect(ui.profileEditor.creditLimit).toBe(50)
    expect(ui.profileEditor.customTags).toBe("available")

    expect(ui.searchVisibility.rankingBoost).toBe(15)
    expect(ui.searchVisibility.sponsoredPlacementEligible).toBe(false)

    expect(ui.support.prioritySupport).toBe("locked")
  })

  it("maps premium tier — all analytics available, no priority support", () => {
    const access = computeFeatureAccess("premium")
    const ui = mapFeatureAccessToUI(access)

    expect(ui.analyticsPanel.trendChart).toBe("available")
    expect(ui.analyticsPanel.searchTerms).toBe("available")
    expect(ui.analyticsPanel.viewerDemographics).toBe("available")
    expect(ui.analyticsPanel.competitorBenchmarking).toBe("available")
    expect(ui.analyticsPanel.enquiryResponseInsights).toBe("available")

    expect(ui.profileEditor.mediaLimit).toBe(50)
    expect(ui.profileEditor.creditLimit).toBe("unlimited")
    expect(ui.profileEditor.customTags).toBe("available")

    expect(ui.searchVisibility.rankingBoost).toBe(25)
    expect(ui.searchVisibility.sponsoredPlacementEligible).toBe(true)

    expect(ui.support.prioritySupport).toBe("locked")
  })

  // AC-46: prioritySupport maps correctly — Partner only [S5-ST-8]
  it("maps partner tier — priority support available", () => {
    const access = computeFeatureAccess("partner")
    const ui = mapFeatureAccessToUI(access)

    expect(ui.analyticsPanel.trendChart).toBe("available")
    expect(ui.analyticsPanel.searchTerms).toBe("available")
    expect(ui.analyticsPanel.viewerDemographics).toBe("available")
    expect(ui.analyticsPanel.competitorBenchmarking).toBe("available")
    expect(ui.analyticsPanel.enquiryResponseInsights).toBe("available")

    expect(ui.profileEditor.mediaLimit).toBe(50)
    expect(ui.profileEditor.creditLimit).toBe("unlimited")
    expect(ui.profileEditor.customTags).toBe("available")

    expect(ui.searchVisibility.rankingBoost).toBe(25)
    expect(ui.searchVisibility.sponsoredPlacementEligible).toBe(true)

    expect(ui.support.prioritySupport).toBe("available")
  })

  it("only partner tier has prioritySupport available", () => {
    const tiers = ["free", "standard", "premium", "partner"] as const
    const results = tiers.map((t) => ({
      tier: t,
      support: mapFeatureAccessToUI(computeFeatureAccess(t)).support.prioritySupport,
    }))

    expect(results).toEqual([
      { tier: "free", support: "locked" },
      { tier: "standard", support: "locked" },
      { tier: "premium", support: "locked" },
      { tier: "partner", support: "available" },
    ])
  })
})
