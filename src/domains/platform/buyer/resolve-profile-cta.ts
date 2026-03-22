// Profile CTA resolution — S6 §2.4, AC-13, AC-14
// 4-branch decision tree based on claim status + contact info.
// Targeted claim CTA when authenticated user's email domain matches listing website [PP-18].

type ClaimStatus = "unclaimed" | "pending_review" | "claimed" | "disputed"

export type ProfileCTA =
  | { type: "enquire"; label: string; variant?: "forwarded" | "silent_queue" }
  | { type: "contact"; label: string }
  | { type: "claim"; label: string; target: string }
  | { type: "claim_targeted"; label: string; target: string }

type ListingForCTA = {
  id: string
  claimStatus: ClaimStatus
  contactEmail: string | null
  contactPhone: string | null
  websiteUrl: string | null
}

type SessionForCTA = {
  email: string
} | null

export function resolveProfileCTA(listing: ListingForCTA, session: SessionForCTA): ProfileCTA {
  const cs = listing.claimStatus

  if (cs === "claimed") {
    return { type: "enquire", label: "Send Enquiry" }
  }

  if (cs === "disputed") {
    return { type: "enquire", label: "Send Enquiry", variant: "silent_queue" }
  }

  // unclaimed or pending_review
  if (listing.contactEmail) {
    return { type: "enquire", label: "Send Enquiry", variant: "forwarded" }
  }

  // Unclaimed without email — always show claim CTA.
  // AC-14: targeted variant when user email domain matches listing website [PP-18].
  // Contact info (phone/website) is visible in the listing body — CTA drives conversion.
  return resolveClaimCTAVariant(listing, session)
}

function resolveClaimCTAVariant(listing: ListingForCTA, session: SessionForCTA): ProfileCTA {
  if (session) {
    const userDomain = extractDomain(session.email)
    const listingDomain = extractDomain(listing.websiteUrl)
    if (userDomain && listingDomain && userDomain === listingDomain) {
      return {
        type: "claim_targeted",
        label: "This looks like your business \u2014 claim it in 2 minutes",
        target: `/claim/${listing.id}`,
      }
    }
  }

  return {
    type: "claim",
    label: "Is this your business? Claim this listing",
    target: `/claim/${listing.id}`,
  }
}

function extractDomain(input: string | null | undefined): string | null {
  if (!input) return null
  try {
    const url = input.includes("://") ? input : `https://${input}`
    const hostname = new URL(url).hostname.toLowerCase()
    // Strip www prefix for comparison
    return hostname.startsWith("www.") ? hostname.slice(4) : hostname
  } catch {
    // email address case
    const atIdx = input.indexOf("@")
    if (atIdx > 0) return input.slice(atIdx + 1).toLowerCase()
    return null
  }
}
