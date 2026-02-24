// Progressive action completion check — S2 §7, AC-32
// Determines whether the profile action a progressive email would nudge
// has already been completed, making the email irrelevant.

type ListingFields = {
  headline: string | null
  bio: string | null
  headshotUrl: string | null
  logoUrl: string | null
  websiteUrl: string | null
  contactEmail: string | null
  entityType: string
}

// Each template nudges a specific set of fields. If all are present, skip the email.
// profile_day1: headline + bio (core identity)
// profile_day3: headshot/logo + website (visual + web presence)
// profile_day7: contact email (reachability)
const TEMPLATE_FIELD_CHECKS: Record<string, (listing: ListingFields) => boolean> = {
  profile_day1: (l) => !!l.headline && !!l.bio,
  profile_day3: (l) => {
    const hasImage = l.entityType === "freelancer" ? !!l.headshotUrl : !!l.logoUrl
    return hasImage && !!l.websiteUrl
  },
  profile_day7: (l) => !!l.contactEmail,
}

export function isProgressiveActionComplete(
  listing: ListingFields,
  template: string,
): boolean {
  const check = TEMPLATE_FIELD_CHECKS[template]
  if (!check) return false
  return check(listing)
}
