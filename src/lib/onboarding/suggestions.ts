// CS-WORK-019: Intelligent taxonomy suggestions — S2 §9, PP §4.5
// AC-36, AC-37, AC-38

import { sql } from "drizzle-orm"
import type { Db } from "@/db/types"
import { rawQuery } from "@/db/raw-query"

// --- Types ---

export type TaxonomyTag = {
  sectorSlug: string
  serviceAreaSlug: string
  specialisationSlug?: string | null
}

type SuggestionRule = {
  trigger: { sectorSlug: string; serviceAreaSlug: string }
  suggestions: { specialisationSlug: string; confidence: number; reasoning: string }[]
}

type SuggestionResult = {
  specialisationSlug: string
  confidence: number
  reasoning: string
  triggerTag: TaxonomyTag
}

type GenericSuggestion = {
  serviceAreaId: number
  serviceAreaName: string
  serviceAreaSlug: string
  listingCount: number
}

// --- Curated suggestion map (S2 §9.1) ---

export const SUGGESTION_MAP: SuggestionRule[] = [
  // Camera
  {
    trigger: { sectorSlug: "camera", serviceAreaSlug: "director-of-photography" },
    suggestions: [
      { specialisationSlug: "drone-operation", confidence: 0.8, reasoning: "80% of DPs also list Drone Operation" },
      { specialisationSlug: "steadicam", confidence: 0.8, reasoning: "Common secondary skill for DPs" },
      { specialisationSlug: "lighting-camera", confidence: 0.8, reasoning: "Frequently paired with DP work" },
    ],
  },
  {
    trigger: { sectorSlug: "camera", serviceAreaSlug: "camera-operator" },
    suggestions: [
      { specialisationSlug: "drone-operation", confidence: 0.7, reasoning: "Growing demand for drone-certified operators" },
      { specialisationSlug: "jimmy-jib", confidence: 0.7, reasoning: "Common specialist equipment skill" },
      { specialisationSlug: "underwater-camera", confidence: 0.7, reasoning: "Niche but highly valued" },
    ],
  },
  // Post-Production
  {
    trigger: { sectorSlug: "post-production", serviceAreaSlug: "offline-editor" },
    suggestions: [
      { specialisationSlug: "online-editing", confidence: 0.6, reasoning: "Many editors work across both stages" },
      { specialisationSlug: "colour-grading", confidence: 0.6, reasoning: "Expanding skillset for editors" },
    ],
  },
  {
    trigger: { sectorSlug: "post-production", serviceAreaSlug: "colourist" },
    suggestions: [
      { specialisationSlug: "online-editing", confidence: 0.7, reasoning: "Often paired with colour work" },
      { specialisationSlug: "hdr-mastering", confidence: 0.7, reasoning: "Growing broadcast requirement" },
    ],
  },
  // Sound
  {
    trigger: { sectorSlug: "sound", serviceAreaSlug: "sound-recordist" },
    suggestions: [
      { specialisationSlug: "boom-operator", confidence: 0.8, reasoning: "Core on-set sound team role" },
      { specialisationSlug: "sound-mixer", confidence: 0.8, reasoning: "Natural progression from recordist" },
    ],
  },
]

const MAX_SUGGESTIONS = 5

function deduplicateBySlug(results: SuggestionResult[]): SuggestionResult[] {
  const seen = new Set<string>()
  return results.filter((r) => {
    if (seen.has(r.specialisationSlug)) return false
    seen.add(r.specialisationSlug)
    return true
  })
}

// AC-36: curated suggestions for Camera, Post-Production, Sound
// AC-37: excludes already-selected tags
export function getSuggestions(selectedTags: TaxonomyTag[]): SuggestionResult[] {
  const results: SuggestionResult[] = []

  for (const tag of selectedTags) {
    const matchingRules = SUGGESTION_MAP.filter(
      (r) => r.trigger.sectorSlug === tag.sectorSlug && r.trigger.serviceAreaSlug === tag.serviceAreaSlug,
    )
    for (const rule of matchingRules) {
      for (const suggestion of rule.suggestions) {
        if (selectedTags.some((t) => t.specialisationSlug === suggestion.specialisationSlug)) continue
        results.push({ ...suggestion, triggerTag: tag })
      }
    }
  }

  return deduplicateBySlug(results)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, MAX_SUGGESTIONS)
}

// AC-38: generic fallback — top 5 service areas by listing count within sector
export async function getGenericSuggestions(db: Db, sectorId: number): Promise<GenericSuggestion[]> {
  return rawQuery<GenericSuggestion>(db, sql`
    SELECT
      ltt.service_area_id AS "serviceAreaId",
      tsa.name AS "serviceAreaName",
      tsa.slug AS "serviceAreaSlug",
      COUNT(*)::int AS "listingCount"
    FROM listing_taxonomy_tags ltt
    JOIN taxonomy_service_areas tsa ON tsa.id = ltt.service_area_id
    WHERE ltt.sector_id = ${sectorId}
    GROUP BY ltt.service_area_id, tsa.name, tsa.slug
    ORDER BY "listingCount" DESC
    LIMIT 5
  `)
}
