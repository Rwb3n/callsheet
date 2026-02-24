// Profile strength unit tests — AC-29, AC-30, AC-31

import { describe, it, expect } from "vitest"
import {
  computeProfileStrength,
  computeFallbackProfileStrength,
  identifyMissingFields,
  identifyMissingFieldsFallback,
  FIELD_WEIGHT_MAP,
  FIELD_DISPLAY_MAP,
  FIELD_TIME_MAP,
} from "../profile-strength"
import type { ListingForFallback } from "../profile-strength"

// --- Helpers ---

function fullListing(overrides: Partial<ListingForFallback> = {}): ListingForFallback {
  return {
    headline: "Award-winning DOP",
    bio: "15 years experience in broadcast",
    headshotUrl: "https://cdn.example.com/headshot.jpg",
    logoUrl: null,
    websiteUrl: "https://example.com",
    contactEmail: "jane@example.com",
    entityType: "freelancer",
    ...overrides,
  }
}

function emptyListing(overrides: Partial<ListingForFallback> = {}): ListingForFallback {
  return {
    headline: null,
    bio: null,
    headshotUrl: null,
    logoUrl: null,
    websiteUrl: null,
    contactEmail: null,
    entityType: "freelancer",
    ...overrides,
  }
}

// --- AC-29: Profile strength computed from quality score completeness (0-25 → 0-100%) ---

describe("computeProfileStrength", () => {
  it("maps completeness 0 to 0% Getting Started", () => {
    const result = computeProfileStrength(0, [])
    expect(result.percentage).toBe(0)
    expect(result.level).toBe("Getting Started")
  })

  it("maps completeness 25 to 100% Excellent", () => {
    const result = computeProfileStrength(25, [])
    expect(result.percentage).toBe(100)
    expect(result.level).toBe("Excellent")
  })

  it("maps completeness 5 to 20% Getting Started", () => {
    const result = computeProfileStrength(5, [])
    expect(result.percentage).toBe(20)
    expect(result.level).toBe("Getting Started")
  })

  it("maps completeness 6 to 24% Basic", () => {
    const result = computeProfileStrength(6, [])
    expect(result.percentage).toBe(24)
    expect(result.level).toBe("Basic")
  })

  it("maps completeness 10 to 40% Basic", () => {
    const result = computeProfileStrength(10, [])
    expect(result.percentage).toBe(40)
    expect(result.level).toBe("Basic")
  })

  it("maps completeness 15 to 60% Good", () => {
    const result = computeProfileStrength(15, [])
    expect(result.percentage).toBe(60)
    expect(result.level).toBe("Good")
  })

  it("maps completeness 20 to 80% Strong", () => {
    const result = computeProfileStrength(20, [])
    expect(result.percentage).toBe(80)
    expect(result.level).toBe("Strong")
  })

  it("maps completeness 21 to 84% Excellent", () => {
    const result = computeProfileStrength(21, [])
    expect(result.percentage).toBe(84)
    expect(result.level).toBe("Excellent")
  })

  it("rounds fractional percentages", () => {
    // 7 / 25 * 100 = 28
    const result = computeProfileStrength(7, [])
    expect(result.percentage).toBe(28)
  })

  it("shows low-strength visibility note below 60%", () => {
    const result = computeProfileStrength(14, [])
    expect(result.percentage).toBe(56)
    expect(result.searchVisibilityNote).toBe(
      "Profiles above 60% appear in 3x more search results",
    )
  })

  it("shows high-strength visibility note at 60% and above", () => {
    const result = computeProfileStrength(15, [])
    expect(result.percentage).toBe(60)
    expect(result.searchVisibilityNote).toBe(
      "Your profile is performing well in search",
    )
  })
})

// --- AC-30: Missing field identification returns ranked actions with impact estimates ---

describe("identifyMissingFields", () => {
  it("maps quality score explanation factors to missing fields", () => {
    const factors = ["missing_headline", "missing_bio", "missing_website"]
    const result = identifyMissingFields(factors)

    expect(result).toHaveLength(3)
    expect(result[0]).toEqual({
      fieldId: "missing_headline",
      displayName: "a headline",
      completenessWeight: 8,
      estimatedTime: "~1 minute",
    })
    expect(result[1]).toEqual({
      fieldId: "missing_bio",
      displayName: "a bio or description",
      completenessWeight: 12,
      estimatedTime: "~3 minutes",
    })
  })

  it("uses defaults for unknown factors", () => {
    const result = identifyMissingFields(["missing_unknown_field"])
    expect(result[0].displayName).toBe("missing_unknown_field")
    expect(result[0].completenessWeight).toBe(2)
    expect(result[0].estimatedTime).toBe("~2 minutes")
  })

  it("returns empty array for no factors", () => {
    expect(identifyMissingFields([])).toEqual([])
  })
})

describe("computeProfileStrength next actions", () => {
  it("ranks next actions by impact weight descending", () => {
    const factors = ["missing_headline", "missing_bio", "missing_website"]
    const missingFields = identifyMissingFields(factors)
    const result = computeProfileStrength(5, missingFields)

    expect(result.nextActions[0].field).toBe("missing_bio")         // weight 12
    expect(result.nextActions[1].field).toBe("missing_headline")    // weight 8
    expect(result.nextActions[2].field).toBe("missing_website")     // weight 4
  })

  it("limits next actions to 3", () => {
    const factors = [
      "missing_headline", "missing_bio", "missing_headshot",
      "missing_credits", "missing_website",
    ]
    const missingFields = identifyMissingFields(factors)
    const result = computeProfileStrength(3, missingFields)

    expect(result.nextActions).toHaveLength(3)
  })

  it("formats impact as percentage points [S2-ST-8]", () => {
    const missingFields = identifyMissingFields(["missing_bio"])
    const result = computeProfileStrength(10, missingFields)

    expect(result.nextActions[0].impactEstimate).toBe("+12pp profile strength")
  })

  it("formats labels with Add prefix", () => {
    const missingFields = identifyMissingFields(["missing_headshot"])
    const result = computeProfileStrength(10, missingFields)

    expect(result.nextActions[0].label).toBe("Add a profile photo")
  })

  it("includes time estimates", () => {
    const missingFields = identifyMissingFields(["missing_credits"])
    const result = computeProfileStrength(10, missingFields)

    expect(result.nextActions[0].timeEstimate).toBe("~5 minutes")
  })
})

// --- AC-31: Fallback field-presence check works when quality score explanations absent ---

describe("identifyMissingFieldsFallback", () => {
  it("returns no missing fields for complete freelancer listing", () => {
    const result = identifyMissingFieldsFallback(fullListing())
    expect(result).toEqual([])
  })

  it("returns all missing fields for empty freelancer listing", () => {
    const result = identifyMissingFieldsFallback(emptyListing())
    expect(result).toHaveLength(5)
    const fieldIds = result.map((f) => f.fieldId)
    expect(fieldIds).toContain("missing_headline")
    expect(fieldIds).toContain("missing_bio")
    expect(fieldIds).toContain("missing_website")
    expect(fieldIds).toContain("missing_contact_email")
    expect(fieldIds).toContain("missing_headshot")
  })

  it("checks headshot for freelancers, logo for companies", () => {
    const freelancerResult = identifyMissingFieldsFallback(emptyListing({ entityType: "freelancer" }))
    const companyResult = identifyMissingFieldsFallback(emptyListing({ entityType: "company" }))

    const freelancerIds = freelancerResult.map((f) => f.fieldId)
    const companyIds = companyResult.map((f) => f.fieldId)

    expect(freelancerIds).toContain("missing_headshot")
    expect(freelancerIds).not.toContain("missing_logo")
    expect(companyIds).toContain("missing_logo")
    expect(companyIds).not.toContain("missing_headshot")
  })

  it("provides display names, weights, and time estimates", () => {
    const result = identifyMissingFieldsFallback(emptyListing())
    const headline = result.find((f) => f.fieldId === "missing_headline")

    expect(headline).toBeDefined()
    expect(headline!.displayName).toBe("a headline")
    expect(headline!.completenessWeight).toBe(8)
    expect(headline!.estimatedTime).toBe("~1 minute")
  })
})

describe("computeFallbackProfileStrength", () => {
  it("returns 100% Excellent for complete freelancer listing", () => {
    const result = computeFallbackProfileStrength(fullListing())
    expect(result.percentage).toBe(100)
    expect(result.level).toBe("Excellent")
    expect(result.nextActions).toEqual([])
  })

  it("returns 0% Getting Started for empty listing", () => {
    const result = computeFallbackProfileStrength(emptyListing())
    expect(result.percentage).toBe(0)
    expect(result.level).toBe("Getting Started")
    expect(result.nextActions).toHaveLength(3)
  })

  it("computes percentage from present/total field ratio", () => {
    // 3 of 5 fields present = 60%
    const result = computeFallbackProfileStrength(fullListing({
      websiteUrl: null,
      contactEmail: null,
    }))
    expect(result.percentage).toBe(60)
    expect(result.level).toBe("Good")
  })

  it("returns ranked next actions for missing fields", () => {
    const result = computeFallbackProfileStrength(emptyListing())
    // Top 3 by weight: bio (12), headshot (8), headline (8) or contact_email (6) or website (4)
    expect(result.nextActions[0].field).toBe("missing_bio")
  })

  it("returns company-appropriate fields for company listings", () => {
    const result = computeFallbackProfileStrength(emptyListing({ entityType: "company" }))
    const fields = result.nextActions.map((a) => a.field)
    expect(fields).not.toContain("missing_headshot")
  })

  it("shows low-strength visibility note for incomplete profiles", () => {
    const result = computeFallbackProfileStrength(emptyListing())
    expect(result.searchVisibilityNote).toBe(
      "Profiles above 60% appear in 3x more search results",
    )
  })

  it("shows high-strength visibility note for complete profiles", () => {
    const result = computeFallbackProfileStrength(fullListing())
    expect(result.searchVisibilityNote).toBe(
      "Your profile is performing well in search",
    )
  })
})
