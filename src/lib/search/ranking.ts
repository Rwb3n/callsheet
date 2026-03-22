// Search ranking — S1 §3.2, AC-12
// ts_rank_cd(search_vector, query) * (1 + quality_boost + paid_boost)
// quality_boost = composite / 100 * 0.5  (max 0.5)
// paid_boost = TIER_LIMITS[tier].rankingBoost / 100  (0 / 0.15 / 0.25 / 0.25) — P4 import from CR §4.1

import { sql, eq, and, inArray, type SQL } from "drizzle-orm"
import {
  listings,
  qualityScores,
  listingTaxonomyTags,
} from "@/db/schema/data-and-listings"
import { TIER_LIMITS } from "@/domains/commercial/tier-limits"
import { asSubscriptionTier } from "@/domains/commercial/subscription/as-subscription-tier"
import type { Db } from "@/db/types"
import { expandQuery } from "./synonyms"

export type SearchFilters = {
  sectorId?: number
  serviceAreaId?: number
  specialisationId?: number
  entityType?: string[]
  verificationTier?: string[]
  subscriptionTier?: string[]
}

export type SearchParams = {
  query?: string
  filters?: SearchFilters
  page?: number
  limit?: number
}

export type SearchResultItem = {
  id: string
  name: string
  slug: string
  headline: string | null
  bio: string | null
  baseRegion: string | null
  entityType: string
  lifecycleStatus: string
  subscriptionTier: string
  qualityComposite: number
  rank: number
}

export type SearchResult = {
  items: SearchResultItem[]
  total: number
  page: number
  limit: number
}

const QUALITY_BOOST_FACTOR = 0.5
const TRIGRAM_THRESHOLD = 0.3

/** Build paid boost value from subscription tier. */
function paidBoost(tier: string): number {
  const limits = TIER_LIMITS[asSubscriptionTier(tier)]
  if (!limits) return 0
  return limits.rankingBoost / 100
}

/**
 * Build the composite ranking SQL expression for FTS results.
 * ts_rank_cd(vector, query) * (1 + quality_boost + paid_boost)
 * sql.raw() inlines numeric literals to avoid Drizzle parameterising floats
 * in CASE branches. Safe: values come from const QUALITY_BOOST_FACTOR and TIER_LIMITS.
 */
function buildRankExpression(tsquery: SQL): SQL<number> {
  return sql<number>`
    ts_rank_cd(${listings.searchVector}, ${tsquery})
    * (1.0 + COALESCE(${qualityScores.composite}, 0)::float / 100.0 * ${sql.raw(String(QUALITY_BOOST_FACTOR))}
       + CASE ${listings.subscriptionTier}
           WHEN 'free' THEN ${sql.raw(String(paidBoost("free")))}::float
           WHEN 'standard' THEN ${sql.raw(String(paidBoost("standard")))}::float
           WHEN 'premium' THEN ${sql.raw(String(paidBoost("premium")))}::float
           WHEN 'partner' THEN ${sql.raw(String(paidBoost("partner")))}::float
           ELSE 0.0
         END)
  `
}

/**
 * Full-text search with ranking, synonym expansion, taxonomy filtering.
 * AC-12: ranked by ts_rank_cd * (1 + quality_boost + paid_boost)
 * AC-13: trigram fallback when FTS returns no results
 * AC-14: taxonomy tag filtering via WHERE on listingTaxonomyTags
 * AC-15: empty query → all active listings sorted by composite quality
 */
export async function executeSearch(db: Db, params: SearchParams): Promise<SearchResult> {
  const page = params.page ?? 1
  const limit = params.limit ?? 20
  const offset = (page - 1) * limit
  const filters = params.filters ?? {}
  const query = params.query?.trim() ?? ""

  // AC-15: empty query → all active sorted by composite quality
  if (!query) {
    return executeEmptySearch(db, filters, page, limit, offset)
  }

  // Synonym expansion
  const expandedQuery = await expandQuery(db, query)
  const tsquery = expandedQuery
    ? sql`to_tsquery('english', ${expandedQuery})`
    : sql`plainto_tsquery('english', ${query})`

  // Build WHERE conditions
  const conditions = buildFilterConditions(filters)
  conditions.push(eq(listings.lifecycleStatus, "active"))

  const rankExpr = buildRankExpression(tsquery)

  // Add FTS match condition
  conditions.push(sql`${listings.searchVector} @@ ${tsquery}`)

  const hasTaxonomyFilter = filters.sectorId || filters.serviceAreaId || filters.specialisationId

  const baseQuery = db
    .selectDistinctOn([listings.id], {
      id: listings.id,
      name: listings.name,
      slug: listings.slug,
      headline: listings.headline,
      bio: listings.bio,
      baseRegion: listings.baseRegion,
      entityType: listings.entityType,
      lifecycleStatus: listings.lifecycleStatus,
      subscriptionTier: listings.subscriptionTier,
      qualityComposite: sql<number>`COALESCE(${qualityScores.composite}, 0)`.as("quality_composite"),
      rank: rankExpr.as("rank"),
    })
    .from(listings)
    .leftJoin(qualityScores, eq(qualityScores.listingId, listings.id))

  const withTaxonomy = hasTaxonomyFilter
    ? baseQuery.innerJoin(listingTaxonomyTags, eq(listingTaxonomyTags.listingId, listings.id))
    : baseQuery

  const ftsRows = await withTaxonomy
    .where(and(...conditions))
    .orderBy(listings.id)
    .limit(limit + 1)
    .offset(offset)

  // Re-sort by rank (selectDistinctOn requires ordering by the distinct column)
  const sorted = [...ftsRows].sort((a, b) => b.rank - a.rank)

  if (sorted.length > 0) {
    const items = sorted.slice(0, limit)

    // Count query
    const countResult = await countMatches(db, conditions, hasTaxonomyFilter)
    return { items, total: countResult, page, limit }
  }

  // AC-13: trigram fallback
  return executeTrigramSearch(db, query, filters, page, limit, offset)
}

async function executeEmptySearch(
  db: Db,
  filters: SearchFilters,
  page: number,
  limit: number,
  offset: number,
): Promise<SearchResult> {
  const conditions = buildFilterConditions(filters)
  conditions.push(eq(listings.lifecycleStatus, "active"))

  const hasTaxonomyFilter = filters.sectorId || filters.serviceAreaId || filters.specialisationId

  const baseQuery = db
    .selectDistinctOn([listings.id], {
      id: listings.id,
      name: listings.name,
      slug: listings.slug,
      headline: listings.headline,
      bio: listings.bio,
      baseRegion: listings.baseRegion,
      entityType: listings.entityType,
      lifecycleStatus: listings.lifecycleStatus,
      subscriptionTier: listings.subscriptionTier,
      qualityComposite: sql<number>`COALESCE(${qualityScores.composite}, 0)`.as("quality_composite"),
      rank: sql<number>`COALESCE(${qualityScores.composite}, 0)`.as("rank"),
    })
    .from(listings)
    .leftJoin(qualityScores, eq(qualityScores.listingId, listings.id))

  const withTaxonomy = hasTaxonomyFilter
    ? baseQuery.innerJoin(listingTaxonomyTags, eq(listingTaxonomyTags.listingId, listings.id))
    : baseQuery

  const rows = await withTaxonomy
    .where(and(...conditions))
    .orderBy(listings.id)
    .limit(limit + 1)
    .offset(offset)

  const sorted = [...rows].sort((a, b) => b.rank - a.rank)
  const items = sorted.slice(0, limit)
  const countResult = await countMatches(db, conditions, hasTaxonomyFilter)
  return { items, total: countResult, page, limit }
}

async function executeTrigramSearch(
  db: Db,
  query: string,
  filters: SearchFilters,
  page: number,
  limit: number,
  offset: number,
): Promise<SearchResult> {
  const conditions = buildFilterConditions(filters)
  conditions.push(eq(listings.lifecycleStatus, "active"))
  conditions.push(sql`similarity(${listings.name}, ${query}) > ${TRIGRAM_THRESHOLD}`)

  const hasTaxonomyFilter = filters.sectorId || filters.serviceAreaId || filters.specialisationId

  const similarityRank = sql<number>`similarity(${listings.name}, ${query})`

  const baseQuery = db
    .selectDistinctOn([listings.id], {
      id: listings.id,
      name: listings.name,
      slug: listings.slug,
      headline: listings.headline,
      bio: listings.bio,
      baseRegion: listings.baseRegion,
      entityType: listings.entityType,
      lifecycleStatus: listings.lifecycleStatus,
      subscriptionTier: listings.subscriptionTier,
      qualityComposite: sql<number>`COALESCE(${qualityScores.composite}, 0)`.as("quality_composite"),
      rank: similarityRank.as("rank"),
    })
    .from(listings)
    .leftJoin(qualityScores, eq(qualityScores.listingId, listings.id))

  const withTaxonomy = hasTaxonomyFilter
    ? baseQuery.innerJoin(listingTaxonomyTags, eq(listingTaxonomyTags.listingId, listings.id))
    : baseQuery

  const rows = await withTaxonomy
    .where(and(...conditions))
    .orderBy(listings.id)
    .limit(limit + 1)
    .offset(offset)

  const sorted = [...rows].sort((a, b) => b.rank - a.rank)
  const items = sorted.slice(0, limit)
  const countResult = await countMatches(db, conditions, hasTaxonomyFilter)
  return { items, total: countResult, page, limit }
}

function buildFilterConditions(filters: SearchFilters): SQL[] {
  const conditions: SQL[] = []
  if (filters.sectorId) {
    conditions.push(eq(listingTaxonomyTags.sectorId, filters.sectorId))
  }
  if (filters.serviceAreaId) {
    conditions.push(eq(listingTaxonomyTags.serviceAreaId, filters.serviceAreaId))
  }
  if (filters.specialisationId) {
    conditions.push(sql`${listingTaxonomyTags.specialisationId} = ${filters.specialisationId}`)
  }
  if (filters.entityType && filters.entityType.length > 0) {
    conditions.push(inArray(
      listings.entityType,
      filters.entityType as ("freelancer" | "company" | "education" | "industry_body" | "public_sector" | "non_profit")[],
    ))
  }
  if (filters.subscriptionTier && filters.subscriptionTier.length > 0) {
    conditions.push(inArray(
      listings.subscriptionTier,
      filters.subscriptionTier as ("free" | "standard" | "premium" | "partner")[],
    ))
  }
  return conditions
}

async function countMatches(
  db: Db,
  conditions: SQL[],
  hasTaxonomyFilter: boolean | number | undefined,
): Promise<number> {
  const countQuery = db
    .select({ count: sql<number>`count(DISTINCT ${listings.id})` })
    .from(listings)
    .leftJoin(qualityScores, eq(qualityScores.listingId, listings.id))

  const withTaxonomy = hasTaxonomyFilter
    ? countQuery.innerJoin(listingTaxonomyTags, eq(listingTaxonomyTags.listingId, listings.id))
    : countQuery

  const [{ count }] = await withTaxonomy.where(and(...conditions))
  return Number(count)
}
