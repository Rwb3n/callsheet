// Search term aggregation + zero-result detection + taxonomy gap identification
// S9 §3.1 — AC-37, AC-38, AC-39, AC-50

import { eq, and, sql, gte, lte } from "drizzle-orm"
import type { Db } from "@/db/types"
import { perceptionAggregates } from "@/db/schema/intelligence"
import {
  zeroResultQueries,
  taxonomyServiceAreas,
  taxonomySpecialisations,
} from "@/db/schema/data-and-listings"
import {
  getWeeklyPeriod,
  ANALYTICS_CONSTANTS,
} from "./types"
import type { SearchTermsData, SearchTermEntry, UnmatchedTerm } from "./types"

/**
 * AC-37: Aggregate a search term for a specific listing.
 * Upserts into perception_aggregates with aggregateType = "search_terms".
 * Increments count for existing terms, appends new terms.
 */
export async function aggregateSearchTerm(
  db: Db,
  listingId: string,
  term: string,
  now: Date = new Date(),
): Promise<void> {
  const normalised = term.trim().toLowerCase()
  if (!normalised) return

  const period = getWeeklyPeriod(now)
  const isoNow = now.toISOString()

  // Try to find existing row for this listing + week
  const existing = await db
    .select()
    .from(perceptionAggregates)
    .where(
      and(
        eq(perceptionAggregates.listingId, listingId),
        eq(perceptionAggregates.aggregateType, "search_terms"),
        eq(perceptionAggregates.periodStart, period.start),
      ),
    )
    .limit(1)

  if (existing.length > 0) {
    const row = existing[0]
    const data = row.data as unknown as SearchTermsData

    // Find matching term
    const termIndex = data.terms.findIndex(
      (t: SearchTermEntry) => t.term === normalised,
    )

    if (termIndex >= 0) {
      data.terms[termIndex].count += 1
      data.terms[termIndex].lastSeen = isoNow
    } else {
      data.terms.push({ term: normalised, count: 1, lastSeen: isoNow })
    }

    await db
      .update(perceptionAggregates)
      .set({
        data: data as unknown as Record<string, unknown>,
        computedAt: now,
        sampleSize: row.sampleSize + 1,
      })
      .where(eq(perceptionAggregates.id, row.id))
  } else {
    // Insert new row
    const data: SearchTermsData = {
      terms: [{ term: normalised, count: 1, lastSeen: isoNow }],
      zeroResultTerms: [],
      taxonomyGaps: [],
    }

    await db.insert(perceptionAggregates).values({
      listingId,
      aggregateType: "search_terms",
      periodStart: period.start,
      periodEnd: period.end,
      data: data as unknown as Record<string, unknown>,
      computedAt: now,
      sampleSize: 1,
    })
  }
}

/**
 * AC-38: Handle zero-result search detection.
 * Inserts into zero_result_queries table. Global zero-result data is queryable
 * directly from zero_result_queries — no perception_aggregates sentinel row
 * (perception_aggregates.listingId has a NOT NULL FK to listings).
 */
export async function handleSearchPerformedForZeroResult(
  db: Db,
  query: string,
  resultCount: number,
  filters: Record<string, unknown>,
): Promise<void> {
  if (resultCount !== 0) return

  const normalised = query.trim().toLowerCase()

  await db.insert(zeroResultQueries).values({
    query: normalised,
    filters,
  })
}

/**
 * AC-39: Identify taxonomy gaps from zero-result queries.
 * Queries zero_result_queries in the given period, groups by query text,
 * filters out terms matching existing taxonomy, returns unmatched terms.
 */
export async function identifyTaxonomyGaps(
  db: Db,
  periodStart: Date,
  periodEnd: Date,
): Promise<UnmatchedTerm[]> {
  const minFrequency = ANALYTICS_CONSTANTS.TAXONOMY_GAP_MIN_FREQUENCY

  // Group zero-result queries by query text, having count >= min frequency
  const frequentQueries = await db
    .select({
      query: zeroResultQueries.query,
      frequency: sql<number>`count(*)::int`,
    })
    .from(zeroResultQueries)
    .where(
      and(
        gte(zeroResultQueries.createdAt, periodStart),
        lte(zeroResultQueries.createdAt, periodEnd),
      ),
    )
    .groupBy(zeroResultQueries.query)
    .having(sql`count(*) >= ${minFrequency}`)

  if (frequentQueries.length === 0) return []

  // Fetch existing taxonomy terms for filtering
  const [serviceAreas, specialisations] = await Promise.all([
    db.select({ name: taxonomyServiceAreas.name }).from(taxonomyServiceAreas),
    db
      .select({ name: taxonomySpecialisations.name })
      .from(taxonomySpecialisations),
  ])

  const existingTerms = new Set<string>()
  for (const sa of serviceAreas) {
    existingTerms.add(sa.name.toLowerCase())
  }
  for (const spec of specialisations) {
    existingTerms.add(spec.name.toLowerCase())
  }

  // Filter out terms that match existing taxonomy (case-insensitive)
  const unmatchedTerms: UnmatchedTerm[] = []
  for (const row of frequentQueries) {
    const queryLower = row.query.toLowerCase()
    if (!existingTerms.has(queryLower)) {
      unmatchedTerms.push({
        term: row.query,
        frequency: row.frequency,
        // V1: no automatic sector/service area matching
        potentialSector: undefined,
        potentialServiceArea: undefined,
      })
    }
  }

  return unmatchedTerms
}
