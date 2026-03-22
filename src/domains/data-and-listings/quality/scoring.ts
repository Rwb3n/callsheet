// Quality scoring engine — S9 §1.1, AC-1 through AC-7, AC-15, AC-19
// Pure functions: no DB access, no side effects.

import type {
  QualityScoreExplanation,
  QualityScoreExplanationFactor,
  QualityScoreExplanationDimension,
} from "@/db/schema/data-and-listings"

// --- Types ---

export type QualityScoreInput = {
  listing: {
    name: string | null
    headline: string | null
    bio: string | null
    baseRegion: string | null
    contactEmail: string | null
    contactPhone: string | null
    websiteUrl: string | null
    updatedAt: Date
    createdAt: Date
  }
  taxonomyTagCount: number
  creditCount: number
  mediaItemCount: number
  socialProfileCount: number
  accreditationCount: number
  verification: {
    tier: "unclaimed" | "claimed" | "verified" | "premium_verified"
  }
  engagements: {
    profileViews: number
    lastProfileViewAt: Date | null
    lastEnquiryAt: Date | null
  }
  activeDecaySignalCount: number
  activeDecaySignals: { signalType: string }[]
}

export type QualityScore = {
  completeness: number
  freshness: number
  accuracy: number
  richness: number
  verification: number
  composite: number
}

export type QualityBand = "poor" | "fair" | "good" | "excellent"

export type Improvement = {
  factor: string
  dimension: string
  potentialGain: number
  detail: string
}

// --- Band ordering ---

export const BAND_ORDER: Record<QualityBand, number> = {
  poor: 0,
  fair: 1,
  good: 2,
  excellent: 3,
}

// --- Dimension 1: Completeness (0-25) [AC-2, AC-3] ---

export function scoreCompleteness(input: QualityScoreInput): number {
  let score = 0

  // Mandatory fields - 3 points each (max 15)
  if (input.listing.name) score += 3
  if (input.listing.bio) score += 3  // spec says "description" which maps to bio
  if (input.listing.baseRegion) score += 3  // spec says "location"
  if (input.taxonomyTagCount >= 1) score += 3
  if (input.creditCount >= 1) score += 3

  // Important fields - 2 points each (max 6)
  if (input.listing.headline) score += 2
  if (input.listing.contactEmail) score += 2
  if (input.listing.websiteUrl) score += 2

  // Enriching fields - 1 point each (max 4)
  // bio scores separately here as enriching bonus on top of mandatory (spec §1.1)
  if (input.listing.bio) score += 1
  if (input.listing.contactPhone) score += 1
  if (input.taxonomyTagCount >= 2) score += 1
  if (input.creditCount >= 3) score += 1

  return Math.min(score, 25)
}

// --- Dimension 2: Freshness (0-25) [AC-4] ---

function daysSince(date: Date | null, now: Date): number {
  if (!date) return Infinity
  return Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))
}

export function scoreFreshness(input: QualityScoreInput, now: Date = new Date()): number {
  const lastEditDays = daysSince(input.listing.updatedAt, now)

  const lastEngagement = laterDate(
    input.engagements.lastProfileViewAt,
    input.engagements.lastEnquiryAt,
  ) ?? input.listing.createdAt

  const lastEngagementDays = daysSince(lastEngagement, now)

  // Use the more recent of edit or engagement
  const daysSinceActivity = Math.min(lastEditDays, lastEngagementDays)

  if (daysSinceActivity <= 30) return 25
  if (daysSinceActivity <= 60) return 20
  if (daysSinceActivity <= 90) return 13
  if (daysSinceActivity <= 120) return 8
  if (daysSinceActivity <= 180) return 4
  return 2
}

function laterDate(a: Date | null, b: Date | null): Date | null {
  if (!a) return b
  if (!b) return a
  return a > b ? a : b
}

// --- Dimension 3: Accuracy (0-20) [AC-5] ---

const ACCURACY_TIER_BASE: Record<string, number> = {
  unclaimed: 0,
  claimed: 5,
  verified: 12,
  premium_verified: 20,
}

export function scoreAccuracy(input: QualityScoreInput): number {
  const tierBase = ACCURACY_TIER_BASE[input.verification.tier] ?? 0
  const deductions = input.activeDecaySignalCount * 3
  return Math.max(tierBase - deductions, 0)
}

// --- Dimension 4: Richness (0-15) [AC-6] ---

export function scoreRichness(input: QualityScoreInput): number {
  let score = 0

  // Media: 1 point each, max 4
  score += Math.min(input.mediaItemCount, 4)

  // Credits: 1 point each, max 4
  score += Math.min(input.creditCount, 4)

  // Social profiles: 1 point each, max 3
  score += Math.min(input.socialProfileCount, 3)

  // Accreditations: 1 point each, max 2
  score += Math.min(input.accreditationCount, 2)

  // Perception signal: above-median profile views get +1
  // siteMedianProfileViews() hardcoded to 0 for V1 (§3 analytics pipeline not yet built)
  const siteMedian = 0
  if (input.engagements.profileViews > siteMedian) {
    score += 1
  }

  return Math.min(score, 15)
}

// --- Dimension 5: Verification (0-15) [AC-7] ---

const VERIFICATION_TIER_MAP: Record<string, number> = {
  unclaimed: 0,
  claimed: 5,
  verified: 10,
  premium_verified: 15,
}

export function scoreVerification(input: QualityScoreInput): number {
  return VERIFICATION_TIER_MAP[input.verification.tier] ?? 0
}

// --- Composite score [AC-1] ---

export function computeQualityScore(input: QualityScoreInput, now: Date = new Date()): QualityScore {
  const completeness = scoreCompleteness(input)
  const freshness = scoreFreshness(input, now)
  const accuracy = scoreAccuracy(input)
  const richness = scoreRichness(input)
  const verification = scoreVerification(input)
  const composite = completeness + freshness + accuracy + richness + verification

  return { completeness, freshness, accuracy, richness, verification, composite }
}

// --- Band assignment ---

export function assignBand(composite: number): QualityBand {
  if (composite >= 80) return "excellent"
  if (composite >= 60) return "good"
  if (composite >= 40) return "fair"
  return "poor"
}

// --- Top improvements [AC-15] ---

export function computeTopImprovements(
  explanation: QualityScoreExplanation,
  count: number,
): Improvement[] {
  // Compute gap per dimension, sort largest first
  const gaps = explanation.dimensions
    .map((dim) => ({
      dimension: dim.name,
      gap: dim.maxScore - dim.score,
      factors: dim.factors.filter((f) => f.impact === "negative" || f.impact === "neutral"),
    }))
    .sort((a, b) => b.gap - a.gap)

  const improvements: Improvement[] = []
  for (const dimGap of gaps) {
    for (const factor of dimGap.factors) {
      if (improvements.length >= count) break
      improvements.push({
        factor: factor.factor,
        dimension: dimGap.dimension,
        potentialGain: estimateGain(dimGap.dimension, factor),
        detail: factor.detail,
      })
    }
    if (improvements.length >= count) break
  }

  return improvements
}

function estimateGain(dimension: string, factor: QualityScoreExplanationFactor): number {
  // Simple heuristic: mandatory field gaps are worth more than enriching ones
  if (dimension === "completeness") return factor.factor.startsWith("missing_") ? 3 : 1
  if (dimension === "verification") return 5
  if (dimension === "accuracy") return 3
  return 2
}

// --- Build explanation ---

export function buildExplanation(
  input: QualityScoreInput,
  score: QualityScore,
): QualityScoreExplanation {
  const dimensions: QualityScoreExplanationDimension[] = [
    {
      name: "completeness",
      score: score.completeness,
      maxScore: 25,
      factors: buildCompletenessFactors(input),
    },
    {
      name: "freshness",
      score: score.freshness,
      maxScore: 25,
      factors: buildFreshnessFactors(input),
    },
    {
      name: "accuracy",
      score: score.accuracy,
      maxScore: 20,
      factors: buildAccuracyFactors(input),
    },
    {
      name: "richness",
      score: score.richness,
      maxScore: 15,
      factors: buildRichnessFactors(input),
    },
    {
      name: "verification",
      score: score.verification,
      maxScore: 15,
      factors: [
        {
          factor: "verification_tier",
          impact: input.verification.tier === "unclaimed" ? "negative" as const : "positive" as const,
          detail: `Tier: ${input.verification.tier}`,
        },
      ],
    },
  ]

  const explanation: QualityScoreExplanation = {
    composite: score.composite,
    dimensions,
    topImprovements: [],
  }

  // Compute top improvements and store as detail strings
  explanation.topImprovements = computeTopImprovements(explanation, 3).map((i) => i.detail)

  return explanation
}

// --- Factor builders ---

function buildCompletenessFactors(input: QualityScoreInput): QualityScoreExplanationFactor[] {
  const factors: QualityScoreExplanationFactor[] = []

  // Mandatory fields
  factors.push(fieldFactor("name", !!input.listing.name, 3))
  factors.push(fieldFactor("description", !!input.listing.bio, 3))
  factors.push(fieldFactor("location", !!input.listing.baseRegion, 3))
  factors.push(tagFactor("taxonomy_tag", input.taxonomyTagCount >= 1, 3))
  factors.push(tagFactor("credit", input.creditCount >= 1, 3))

  // Important fields
  factors.push(fieldFactor("headline", !!input.listing.headline, 2))
  factors.push(fieldFactor("contact_email", !!input.listing.contactEmail, 2))
  factors.push(fieldFactor("website", !!input.listing.websiteUrl, 2))

  // Enriching fields (bio bonus is additive on top of mandatory description check)
  factors.push(fieldFactor("bio_enriching", !!input.listing.bio, 1))
  factors.push(fieldFactor("phone", !!input.listing.contactPhone, 1))
  factors.push(tagFactor("taxonomy_tag_2plus", input.taxonomyTagCount >= 2, 1))
  factors.push(tagFactor("credit_3plus", input.creditCount >= 3, 1))

  return factors
}

function fieldFactor(name: string, present: boolean, weight: number): QualityScoreExplanationFactor {
  return {
    factor: present ? name : `missing_${name}`,
    impact: present ? "positive" : "negative",
    detail: present ? `${name} present (+${weight})` : `Missing ${name} (0/${weight})`,
  }
}

function tagFactor(name: string, met: boolean, weight: number): QualityScoreExplanationFactor {
  return {
    factor: met ? name : `missing_${name}`,
    impact: met ? "positive" : "negative",
    detail: met ? `${name} threshold met (+${weight})` : `${name} threshold not met (0/${weight})`,
  }
}

function buildFreshnessFactors(input: QualityScoreInput): QualityScoreExplanationFactor[] {
  const now = new Date()
  const editDays = daysSince(input.listing.updatedAt, now)
  const engagementDate = laterDate(
    input.engagements.lastProfileViewAt,
    input.engagements.lastEnquiryAt,
  )
  const engagementDays = engagementDate ? daysSince(engagementDate, now) : null

  return [
    {
      factor: "last_edit_recency",
      impact: editDays <= 90 ? "positive" : "negative",
      detail: `${editDays} days since last edit`,
    },
    {
      factor: "engagement_recency",
      impact: engagementDays !== null && engagementDays <= 90 ? "positive" : "neutral",
      detail: engagementDays !== null
        ? `${engagementDays} days since last engagement`
        : "No engagement activity recorded",
    },
  ]
}

function buildAccuracyFactors(input: QualityScoreInput): QualityScoreExplanationFactor[] {
  const factors: QualityScoreExplanationFactor[] = [
    {
      factor: "verification_tier",
      impact: input.verification.tier === "unclaimed" ? "negative" : "positive",
      detail: `Tier: ${input.verification.tier}`,
    },
  ]

  for (const signal of input.activeDecaySignals) {
    factors.push({
      factor: `decay_signal_${signal.signalType}`,
      impact: "negative",
      detail: `Active decay signal: ${signal.signalType} (-3)`,
    })
  }

  return factors
}

function buildRichnessFactors(input: QualityScoreInput): QualityScoreExplanationFactor[] {
  return [
    {
      factor: "media_items",
      impact: input.mediaItemCount > 0 ? "positive" : "negative",
      detail: `${Math.min(input.mediaItemCount, 4)} media items (max 4)`,
    },
    {
      factor: "credits",
      impact: input.creditCount > 0 ? "positive" : "negative",
      detail: `${Math.min(input.creditCount, 4)} credits (max 4)`,
    },
    {
      factor: "social_profiles",
      impact: input.socialProfileCount > 0 ? "positive" : "neutral",
      detail: `${Math.min(input.socialProfileCount, 3)} social profiles (max 3)`,
    },
    {
      factor: "accreditations",
      impact: input.accreditationCount > 0 ? "positive" : "neutral",
      detail: `${Math.min(input.accreditationCount, 2)} accreditations (max 2)`,
    },
  ]
}
