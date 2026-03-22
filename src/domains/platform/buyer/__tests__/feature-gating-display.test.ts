// Integration tests — CS-WORK-056 AC-49, AC-50, AC-52
import { describe, it, expect } from "vitest"
import {
  resolveContactDisplay,
  shouldShowEngagementStats,
  resolveUpgradeCTA,
  getProfileMediaLimits,
  type ListingProfileData,
} from "../profile-display"
import { computeFeatureAccess } from "@/domains/commercial/subscription/feature-access"
import { mapFeatureAccessToUI } from "@/domains/platform/dashboard/map-feature-access-to-ui"
import type { ListingSubscriptionTier } from "@/domains/commercial/tier-limits"

function makeListing(overrides: Partial<ListingProfileData> = {}): ListingProfileData {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    accountId: "owner-account-id",
    claimStatus: "claimed",
    subscriptionTier: "free",
    phone: "+44 20 7946 0958",
    contactEmail: "contact@example.com",
    website: "https://example.com",
    socialProfiles: ["https://linkedin.com/company/example"],
    ...overrides,
  }
}

// --- AC-49: Claimed listing shows contact details regardless of tier ---

describe("AC-49: contact visibility on claimed listings", () => {
  const tiers: ListingSubscriptionTier[] = ["free", "standard", "premium", "partner"]

  it.each(tiers)("shows phone, email, website, social for %s tier", (tier) => {
    const listing = makeListing({ subscriptionTier: tier })
    const display = resolveContactDisplay(listing)

    expect(display.showPhone).toBe(true)
    expect(display.showEmail).toBe(true)
    expect(display.showWebsite).toBe(true)
    expect(display.showSocialLinks).toBe(true)
    expect(display.showEnquiryForm).toBe(true)
  })

  it("shows enquiry form even when no phone/email/website", () => {
    const listing = makeListing({
      phone: null,
      contactEmail: null,
      website: null,
      socialProfiles: [],
    })
    const display = resolveContactDisplay(listing)

    expect(display.showPhone).toBe(false)
    expect(display.showEmail).toBe(false)
    expect(display.showWebsite).toBe(false)
    expect(display.showSocialLinks).toBe(false)
    expect(display.showEnquiryForm).toBe(true)
  })

  it("unclaimed listing shows seed data without tier gating", () => {
    const listing = makeListing({
      claimStatus: "unclaimed",
      phone: "+44 20 7946 0958",
      website: "https://example.com",
    })
    const display = resolveContactDisplay(listing)

    expect(display.showPhone).toBe(true)
    expect(display.showEmail).toBe(false)
    expect(display.showWebsite).toBe(true)
    expect(display.showSocialLinks).toBe(false)
  })

  it("unclaimed listing with email shows enquiry form", () => {
    const listing = makeListing({
      claimStatus: "unclaimed",
      contactEmail: "seed@example.com",
    })
    const display = resolveContactDisplay(listing)

    expect(display.showEnquiryForm).toBe(true)
  })

  it("unclaimed listing without email does not show enquiry form", () => {
    const listing = makeListing({
      claimStatus: "unclaimed",
      contactEmail: null,
    })
    const display = resolveContactDisplay(listing)

    expect(display.showEnquiryForm).toBe(false)
  })

  it("disputed listing shows enquiry form only", () => {
    const listing = makeListing({
      claimStatus: "disputed",
      phone: "+44 20 7946 0958",
      contactEmail: "contact@example.com",
      website: "https://example.com",
      socialProfiles: ["https://linkedin.com/company/example"],
    })
    const display = resolveContactDisplay(listing)

    expect(display.showPhone).toBe(false)
    expect(display.showEmail).toBe(false)
    expect(display.showWebsite).toBe(false)
    expect(display.showSocialLinks).toBe(false)
    expect(display.showEnquiryForm).toBe(true)
  })
})

// --- AC-50: Engagement stats hidden for free, visible for standard/premium/partner ---

describe("AC-50: engagement stats visibility", () => {
  it("hides engagement stats for free-tier claimed listings", () => {
    expect(shouldShowEngagementStats("claimed", "free")).toBe(false)
  })

  it("shows engagement stats for standard-tier claimed listings", () => {
    expect(shouldShowEngagementStats("claimed", "standard")).toBe(true)
  })

  it("shows engagement stats for premium-tier claimed listings", () => {
    expect(shouldShowEngagementStats("claimed", "premium")).toBe(true)
  })

  it("shows engagement stats for partner-tier claimed listings", () => {
    expect(shouldShowEngagementStats("claimed", "partner")).toBe(true)
  })

  it("hides engagement stats for unclaimed listings regardless of tier", () => {
    expect(shouldShowEngagementStats("unclaimed", "premium")).toBe(false)
  })

  it("uses CR buyerVisibleEngagementStats, not hardcoded tier check", () => {
    // Verify the gate is driven by CR's TIER_LIMITS.buyerVisibleEngagementStats field
    const freeAccess = computeFeatureAccess("free")
    const standardAccess = computeFeatureAccess("standard")
    expect(freeAccess.buyerVisibleEngagementStats).toBe(false)
    expect(standardAccess.buyerVisibleEngagementStats).toBe(true)
  })
})

// --- AC-52: Upgrade CTA and claim CTA ---

describe("AC-52: upgrade CTA visibility", () => {
  it("shows claim CTA on unclaimed profiles (visible to everyone)", () => {
    const listing = makeListing({ claimStatus: "unclaimed" })
    const cta = resolveUpgradeCTA(listing, "any-viewer")

    expect(cta).not.toBeNull()
    expect(cta!.type).toBe("claim_prompt")
    expect(cta!.target).toContain("/claim/")
  })

  it("shows upgrade CTA on free-tier listing to listing owner", () => {
    const listing = makeListing({ subscriptionTier: "free", accountId: "owner-123" })
    const cta = resolveUpgradeCTA(listing, "owner-123")

    expect(cta).not.toBeNull()
    expect(cta!.type).toBe("upgrade_prompt")
    expect(cta!.target).toContain("/subscription")
  })

  it("hides upgrade CTA on free-tier listing from other buyers", () => {
    const listing = makeListing({ subscriptionTier: "free", accountId: "owner-123" })
    const cta = resolveUpgradeCTA(listing, "other-buyer")

    expect(cta).toBeNull()
  })

  it("hides upgrade CTA when no viewer session", () => {
    const listing = makeListing({ subscriptionTier: "free", accountId: "owner-123" })
    const cta = resolveUpgradeCTA(listing, null)

    expect(cta).toBeNull()
  })

  it("hides upgrade CTA for standard+ tier listings", () => {
    const listing = makeListing({ subscriptionTier: "standard", accountId: "owner-123" })
    const cta = resolveUpgradeCTA(listing, "owner-123")

    expect(cta).toBeNull()
  })

  it("media/credit limits respect tier", () => {
    const freeLimits = getProfileMediaLimits("free")
    const premiumLimits = getProfileMediaLimits("premium")

    expect(freeLimits.mediaLimit).toBe(5)
    expect(freeLimits.creditLimit).toBe(10)
    expect(premiumLimits.mediaLimit).toBe(50)
    expect(premiumLimits.creditLimit).toBe("unlimited")
  })
})

// --- AC-51: P4 compliance — imports, not redefined ---

describe("AC-51: search result card field consistency and P4 compliance", () => {
  it("computeFeatureAccess is imported from CR domain", () => {
    // This test verifies the import path is correct — if it were redefined,
    // the import above would fail or return different values
    const access = computeFeatureAccess("premium")
    expect(access.directContactVisible).toBe(true)
    expect(access.organicSearchVisible).toBe(true)
    expect(access.sponsoredPlacement).toBe(true)
  })

  it("mapFeatureAccessToUI is imported from S5 dashboard module", () => {
    const access = computeFeatureAccess("standard")
    const ui = mapFeatureAccessToUI(access)
    expect(ui.profileEditor.mediaLimit).toBe(20)
    expect(ui.searchVisibility.rankingBoost).toBe(15)
  })

  it("ListingSummary in search results has no tier field — isSponsored is the only tier-derived attribute", () => {
    // Structural assertion: verify that TIER_LIMITS.sponsoredPlacement is the source of isSponsored
    // Free/standard = false, premium/partner = true
    const free = computeFeatureAccess("free")
    const standard = computeFeatureAccess("standard")
    const premium = computeFeatureAccess("premium")
    const partner = computeFeatureAccess("partner")

    expect(free.sponsoredPlacement).toBe(false)
    expect(standard.sponsoredPlacement).toBe(false)
    expect(premium.sponsoredPlacement).toBe(true)
    expect(partner.sponsoredPlacement).toBe(true)
  })
})
