// Profile strength meter — S2 §8, AC-29/AC-30/AC-31
// PP owns UI mapping; D&L owns the quality score.
// Until S9 provides real quality score explanations, fallback checks field presence directly.

// --- Types ---

type ProfileStrengthLevel =
  | "Getting Started"
  | "Basic"
  | "Good"
  | "Strong"
  | "Excellent"

type NextAction = {
  field: string
  label: string
  impactEstimate: string
  timeEstimate: string
}

type ProfileStrength = {
  percentage: number
  level: ProfileStrengthLevel
  nextActions: NextAction[]
  searchVisibilityNote: string
}

type MissingField = {
  fieldId: string
  displayName: string
  completenessWeight: number
  estimatedTime: string
}

// --- Constants ---

export const FIELD_DISPLAY_MAP: Record<string, string> = {
  missing_headline: "a headline",
  missing_bio: "a bio or description",
  missing_headshot: "a profile photo",
  missing_logo: "your company logo",
  missing_credits: "professional credits",
  missing_portfolio: "portfolio work",
  missing_social_links: "social profiles",
  missing_contact_email: "a contact email",
  missing_website: "your website",
}

// Percentage-point estimates (how much the 0–100% bar moves when field is added).
// Completeness is 0–25 points; display is 0–100%. A 5-point completeness gain = +20pp.
// These are approximate and calibrated for the fallback field-presence check.
// S9 replaces with data-driven weights from quality score explanations. [S2-ST-8]
export const FIELD_WEIGHT_MAP: Record<string, number> = {
  missing_headline: 8,
  missing_bio: 12,
  missing_headshot: 8,
  missing_logo: 8,
  missing_credits: 10,
  missing_portfolio: 10,
  missing_social_links: 4,
  missing_contact_email: 6,
  missing_website: 4,
}

export const FIELD_TIME_MAP: Record<string, string> = {
  missing_headline: "~1 minute",
  missing_bio: "~3 minutes",
  missing_headshot: "~2 minutes",
  missing_logo: "~2 minutes",
  missing_credits: "~5 minutes",
  missing_portfolio: "~5 minutes",
  missing_social_links: "~1 minute",
  missing_contact_email: "~1 minute",
  missing_website: "~1 minute",
}

const MAX_NEXT_ACTIONS = 3

// --- Level computation [AC-29] ---

function getLevel(percentage: number): ProfileStrengthLevel {
  if (percentage <= 20) return "Getting Started"
  if (percentage <= 40) return "Basic"
  if (percentage <= 60) return "Good"
  if (percentage <= 80) return "Strong"
  return "Excellent"
}

function getSearchVisibilityNote(percentage: number): string {
  return percentage < 60
    ? "Profiles above 60% appear in 3x more search results"
    : "Your profile is performing well in search"
}

// --- Profile strength from quality score [AC-29] ---

export function computeProfileStrength(
  completeness: number,
  missingFields: MissingField[],
): ProfileStrength {
  const percentage = Math.round((completeness / 25) * 100)

  const nextActions = missingFields
    .sort((a, b) => b.completenessWeight - a.completenessWeight)
    .slice(0, MAX_NEXT_ACTIONS)
    .map((f) => ({
      field: f.fieldId,
      label: `Add ${f.displayName}`,
      impactEstimate: `+${f.completenessWeight}pp profile strength`,
      timeEstimate: f.estimatedTime,
    }))

  return {
    percentage,
    level: getLevel(percentage),
    nextActions,
    searchVisibilityNote: getSearchVisibilityNote(percentage),
  }
}

// --- Missing field identification from quality score explanations [AC-30] ---
// Uses the QualityScoreExplanation.dimensions.completeness.factors array.
// Each factor string is a key like "missing_headline". S9 populates these.

export function identifyMissingFields(
  factors: string[],
): MissingField[] {
  return factors.map((factor) => ({
    fieldId: factor,
    displayName: FIELD_DISPLAY_MAP[factor] ?? factor,
    completenessWeight: FIELD_WEIGHT_MAP[factor] ?? 2,
    estimatedTime: FIELD_TIME_MAP[factor] ?? "~2 minutes",
  }))
}

// --- Fallback field-presence check [AC-31, S2-ST-10] ---
// Pre-S9: quality score explanations are absent. Inspect listing fields directly.

export type ListingForFallback = {
  headline: string | null
  bio: string | null
  headshotUrl: string | null
  logoUrl: string | null
  websiteUrl: string | null
  contactEmail: string | null
  entityType: string
}

type FallbackFieldCheck = {
  fieldId: string
  present: boolean
}

function getFallbackChecks(listing: ListingForFallback): FallbackFieldCheck[] {
  const checks: FallbackFieldCheck[] = [
    { fieldId: "missing_headline", present: !!listing.headline },
    { fieldId: "missing_bio", present: !!listing.bio },
    { fieldId: "missing_website", present: !!listing.websiteUrl },
    { fieldId: "missing_contact_email", present: !!listing.contactEmail },
  ]
  if (listing.entityType === "freelancer") {
    checks.push({ fieldId: "missing_headshot", present: !!listing.headshotUrl })
  } else {
    checks.push({ fieldId: "missing_logo", present: !!listing.logoUrl })
  }
  return checks
}

export function identifyMissingFieldsFallback(listing: ListingForFallback): MissingField[] {
  return getFallbackChecks(listing)
    .filter((c) => !c.present)
    .map((c) => ({
      fieldId: c.fieldId,
      displayName: FIELD_DISPLAY_MAP[c.fieldId] ?? c.fieldId,
      completenessWeight: FIELD_WEIGHT_MAP[c.fieldId] ?? 2,
      estimatedTime: FIELD_TIME_MAP[c.fieldId] ?? "~2 minutes",
    }))
}

export function computeFallbackProfileStrength(listing: ListingForFallback): ProfileStrength {
  const checks = getFallbackChecks(listing)
  const present = checks.filter((c) => c.present).length
  const percentage = Math.round((present / checks.length) * 100)
  const missingFields = identifyMissingFieldsFallback(listing)

  const nextActions = missingFields
    .sort((a, b) => b.completenessWeight - a.completenessWeight)
    .slice(0, MAX_NEXT_ACTIONS)
    .map((f) => ({
      field: f.fieldId,
      label: `Add ${f.displayName}`,
      impactEstimate: `+${f.completenessWeight}pp profile strength`,
      timeEstimate: f.estimatedTime,
    }))

  return {
    percentage,
    level: getLevel(percentage),
    nextActions,
    searchVisibilityNote: getSearchVisibilityNote(percentage),
  }
}
