// Taxonomy suggestions — S9 §3.6 — AC-54
// Data-driven service area suggestions based on co-occurrence in listings.

import { eq, sql, desc } from "drizzle-orm"
import type { Db } from "@/db/types"
import {
  listingTaxonomyTags,
  taxonomySectors,
  taxonomyServiceAreas,
} from "@/db/schema/data-and-listings"
import { ANALYTICS_CONSTANTS } from "./types"
import type { TaxonomySuggestion } from "./types"

/**
 * AC-54: Compute taxonomy suggestions for a given sector.
 * Returns service areas that frequently co-occur with listings in the primary sector,
 * ordered by frequency descending.
 *
 * Returns empty array if sector has fewer than TAXONOMY_SUGGESTIONS_MIN_LISTINGS listings.
 */
export async function computeTaxonomySuggestions(
  db: Db,
  primarySectorSlug: string,
): Promise<TaxonomySuggestion[]> {
  // Resolve sector slug to ID
  const [sector] = await db
    .select({ id: taxonomySectors.id })
    .from(taxonomySectors)
    .where(eq(taxonomySectors.slug, primarySectorSlug))
    .limit(1)

  if (!sector) return []

  // Count distinct listings in this sector
  const [{ count: listingCount }] = await db
    .select({ count: sql<number>`count(DISTINCT ${listingTaxonomyTags.listingId})::int` })
    .from(listingTaxonomyTags)
    .where(eq(listingTaxonomyTags.sectorId, sector.id))

  if (listingCount < ANALYTICS_CONSTANTS.TAXONOMY_SUGGESTIONS_MIN_LISTINGS) {
    return []
  }

  // Self-join: find service areas that co-occur with listings in the primary sector.
  // "primary" = tags in the target sector. "cooccurring" = other tags on the same listings.
  // We want service areas from the co-occurring tags, grouped and counted.
  const cooccurring = await db
    .select({
      serviceAreaName: taxonomyServiceAreas.name,
      frequency: sql<number>`count(DISTINCT ${listingTaxonomyTags.listingId})::int`,
    })
    .from(listingTaxonomyTags)
    .innerJoin(
      taxonomyServiceAreas,
      eq(taxonomyServiceAreas.id, listingTaxonomyTags.serviceAreaId),
    )
    .where(
      sql`${listingTaxonomyTags.listingId} IN (
        SELECT DISTINCT ${listingTaxonomyTags.listingId}
        FROM ${listingTaxonomyTags}
        WHERE ${listingTaxonomyTags.sectorId} = ${sector.id}
      )`,
    )
    .groupBy(taxonomyServiceAreas.name)
    .orderBy(desc(sql`count(DISTINCT ${listingTaxonomyTags.listingId})::int`))
    .limit(ANALYTICS_CONSTANTS.TAXONOMY_SUGGESTIONS_LIMIT)

  return cooccurring.map((row) => ({
    serviceArea: row.serviceAreaName,
    frequency: row.frequency,
    source: "data_driven" as const,
  }))
}
