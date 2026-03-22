// Profile display gating — S6 §9, CS-WORK-056 AC-49/50/52
// Pure functions for buyer-facing profile page rendering decisions.
// Imports computeFeatureAccess from CR (P4 compliance — AC-51).

import { computeFeatureAccess } from "@/domains/commercial/subscription/feature-access"
import type { ListingSubscriptionTier } from "@/domains/commercial/tier-limits"

type ClaimStatus = "unclaimed" | "pending_review" | "claimed" | "disputed"

export type ListingProfileData = {
  id: string
  accountId: string | null
  claimStatus: ClaimStatus
  subscriptionTier: ListingSubscriptionTier
  phone: string | null
  contactEmail: string | null
  website: string | null
  socialProfiles: string[]
}

export type ProfileContactDisplay = {
  showPhone: boolean
  showEmail: boolean
  showWebsite: boolean
  showSocialLinks: boolean
  showEnquiryForm: boolean
}

export function resolveContactDisplay(listing: ListingProfileData): ProfileContactDisplay {
  if (listing.claimStatus === "unclaimed" || listing.claimStatus === "pending_review") {
    return {
      showPhone: !!listing.phone,
      showEmail: false,
      showWebsite: !!listing.website,
      showSocialLinks: false,
      showEnquiryForm: !!listing.contactEmail,
    }
  }

  if (listing.claimStatus === "disputed") {
    return {
      showPhone: false,
      showEmail: false,
      showWebsite: false,
      showSocialLinks: false,
      showEnquiryForm: true,
    }
  }

  // claimed — full contact details regardless of tier [PP-5]
  return {
    showPhone: !!listing.phone,
    showEmail: !!listing.contactEmail,
    showWebsite: !!listing.website,
    showSocialLinks: listing.socialProfiles.length > 0,
    showEnquiryForm: true,
  }
}

// AC-50: engagement stats gated by buyerVisibleEngagementStats (CR-owned)
export function shouldShowEngagementStats(
  claimStatus: ClaimStatus,
  subscriptionTier: ListingSubscriptionTier,
): boolean {
  if (claimStatus === "unclaimed") return false
  const access = computeFeatureAccess(subscriptionTier)
  return access.buyerVisibleEngagementStats === true
}

// AC-52: upgrade CTA visible only to listing owner, claim CTA on unclaimed
export type UpgradeCTA =
  | { type: "claim_prompt"; label: string; target: string }
  | { type: "upgrade_prompt"; label: string; target: string }

export function resolveUpgradeCTA(
  listing: ListingProfileData,
  viewerAccountId?: string | null,
): UpgradeCTA | null {
  if (listing.claimStatus === "unclaimed") {
    return {
      type: "claim_prompt",
      label: "Claim this listing",
      target: `/claim/${listing.id}`,
    }
  }

  if (
    listing.subscriptionTier === "free" &&
    viewerAccountId &&
    viewerAccountId === listing.accountId
  ) {
    return {
      type: "upgrade_prompt",
      label: "Upgrade to show engagement stats to buyers",
      target: `/dashboard/listings/${listing.id}/subscription`,
    }
  }

  return null
}

// AC-52: media/credit limits for profile page rendering
export function getProfileMediaLimits(tier: ListingSubscriptionTier) {
  const access = computeFeatureAccess(tier)
  return {
    mediaLimit: access.maxMedia,
    creditLimit: access.maxCredits,
  }
}
