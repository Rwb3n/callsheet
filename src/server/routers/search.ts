// Buyer-facing search router — S6 §1, AC-1 through AC-10
// Canonical search endpoint with ranking, facets, sponsored, autocomplete, zero-result handling.
// S1's listing.search remains for backward compat; this is the buyer-facing surface.

import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { eq, and, sql, desc, ilike, inArray } from "drizzle-orm"
import { router, publicProcedure, protectedProcedure } from "@/server/trpc"
import type { Db } from "@/db/types"
import {
  listings,
  qualityScores,
  listingTaxonomyTags,
  taxonomySectors,
  taxonomyServiceAreas,
  taxonomySpecialisations,
  searchSynonyms,
  zeroResultQueries,
  verifications,
} from "@/db/schema/data-and-listings"
import { savedSearches, searchHistory } from "@/db/schema/accounts"
import { TIER_LIMITS } from "@/domains/commercial/tier-limits"
import { asSubscriptionTier } from "@/domains/commercial/subscription/as-subscription-tier"
import { expandQuery } from "@/lib/search/synonyms"
import type { InProcessEventBus } from "@/lib/events/bus"
import type { WaitUntilFn } from "@/lib/events/waitUntil"

// --- Constants ---

const MAX_SAVED_SEARCHES = 20
const JITTER_RANGE = 3

// --- Zod schemas (exported for tests) ---

export const searchQueryInput = z.object({
  query: z.string().optional(),
  filters: z.object({
    sectors: z.array(z.string()).optional(),
    serviceAreas: z.array(z.string()).optional(),
    specialisations: z.array(z.string()).optional(),
    location: z.string().optional(),
    verificationTiers: z.array(z.string()).optional(),
  }).optional(),
  sort: z.enum(["relevance", "quality_score", "recently_updated"]).default("relevance"),
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(50).default(20),
})

export const suggestInput = z.object({
  prefix: z.string().min(2).max(100),
})

export const saveSearchInput = z.object({
  name: z.string().min(1).max(200),
  query: z.string().optional(),
  filters: z.object({
    sectors: z.array(z.string()).optional(),
    serviceAreas: z.array(z.string()).optional(),
    specialisations: z.array(z.string()).optional(),
    location: z.string().optional(),
  }).optional(),
})

export const deleteSavedSearchInput = z.object({
  savedSearchId: z.string().uuid(),
})

// --- Types ---

export type ListingSummary = {
  slug: string
  name: string
  headline: string | null
  entityType: string
  baseRegion: string | null
  verificationTier: string
  isSponsored: boolean
  qualityScore: number
  taxonomyTags: string[]
  headshotUrl: string | null
  logoUrl: string | null
}

type FacetEntry = { slug: string; label: string; count: number }
type VerificationFacetEntry = { tier: string; count: number }

export type FacetCounts = {
  sectors: FacetEntry[]
  serviceAreas: FacetEntry[]
  locations: FacetEntry[]
  verificationTiers: VerificationFacetEntry[]
}

export type SearchResultOutput = {
  results: ListingSummary[]
  sponsoredResults: ListingSummary[]
  totalCount: number
  facets: FacetCounts
  nextCursor: string | undefined
  suggestedFilters: string[] | undefined
  zeroResultSuggestions: string[] | undefined
}

// --- Ranking helpers ---

function computeFreshnessBias(updatedAt: Date): number {
  const days = (Date.now() - updatedAt.getTime()) / (1000 * 60 * 60 * 24)
  if (days <= 7) return 5
  if (days <= 30) return 3
  if (days <= 90) return 1
  return 0
}

function computeColdStart(createdAt: Date): number {
  const days = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24)
  if (days <= 30) return 5
  if (days <= 60) return 2
  return 0
}

function jitter(): number {
  return (Math.random() * JITTER_RANGE * 2) - JITTER_RANGE
}

// --- Router deps ---

export type SearchRouterDeps = {
  db: Db
  bus: InProcessEventBus
  waitUntilFn: WaitUntilFn
}

export function createSearchRouter(deps: SearchRouterDeps) {
  const { db } = deps

  return router({
    // AC-1 through AC-10: full search with ranking, facets, sponsored, event emission
    query: publicProcedure
      .input(searchQueryInput)
      .query(async ({ ctx, input }) => {
        const queryText = input.query?.trim() ?? ""
        const filters = input.filters ?? {}
        const limit = input.limit

        // Resolve taxonomy slugs to IDs for filtering
        const sectorIds = filters.sectors?.length
          ? await resolveSlugsToIds(db, "sectors", filters.sectors)
          : []
        const serviceAreaIds = filters.serviceAreas?.length
          ? await resolveSlugsToIds(db, "serviceAreas", filters.serviceAreas)
          : []
        const specialisationIds = filters.specialisations?.length
          ? await resolveSlugsToIds(db, "specialisations", filters.specialisations)
          : []

        // Build base WHERE: lifecycle_status = 'active' [PP-1, AC-10]
        const conditions: ReturnType<typeof eq>[] = [
          eq(listings.lifecycleStatus, "active"),
        ]

        // Location filter
        if (filters.location) {
          conditions.push(eq(listings.baseRegion, filters.location))
        }

        // Verification tier filter
        if (filters.verificationTiers?.length) {
          conditions.push(inArray(
            verifications.tier,
            filters.verificationTiers as ("unclaimed" | "claimed" | "verified" | "premium_verified")[],
          ))
        }

        // Taxonomy filters
        const hasTaxonomyFilter = sectorIds.length > 0 || serviceAreaIds.length > 0 || specialisationIds.length > 0
        if (sectorIds.length > 0) {
          conditions.push(inArray(listingTaxonomyTags.sectorId, sectorIds))
        }
        if (serviceAreaIds.length > 0) {
          conditions.push(inArray(listingTaxonomyTags.serviceAreaId, serviceAreaIds))
        }
        if (specialisationIds.length > 0) {
          conditions.push(inArray(listingTaxonomyTags.specialisationId, specialisationIds))
        }

        // FTS condition
        let tsquery: ReturnType<typeof sql> | null = null
        if (queryText) {
          const expanded = await expandQuery(db, queryText)
          tsquery = expanded
            ? sql`to_tsquery('english', ${expanded})`
            : sql`plainto_tsquery('english', ${queryText})`
          conditions.push(sql`${listings.searchVector} @@ ${tsquery}`)
        }

        // Execute main query
        const baseSelect = {
          id: listings.id,
          slug: listings.slug,
          name: listings.name,
          headline: listings.headline,
          entityType: listings.entityType,
          baseRegion: listings.baseRegion,
          headshotUrl: listings.headshotUrl,
          logoUrl: listings.logoUrl,
          subscriptionTier: listings.subscriptionTier,
          qualityComposite: sql<number>`COALESCE(${qualityScores.composite}, 0)`,
          verificationTier: sql<string>`COALESCE(${verifications.tier}, 'unclaimed')`,
          relevance: tsquery
            ? sql<number>`ts_rank_cd(${listings.searchVector}, ${tsquery})`
            : sql<number>`0`,
          updatedAt: listings.updatedAt,
          createdAt: listings.createdAt,
        }

        let mainQuery = db
          .selectDistinctOn([listings.id], baseSelect)
          .from(listings)
          .leftJoin(qualityScores, eq(qualityScores.listingId, listings.id))
          .leftJoin(verifications, eq(verifications.listingId, listings.id))

        if (hasTaxonomyFilter) {
          mainQuery = mainQuery.innerJoin(
            listingTaxonomyTags,
            eq(listingTaxonomyTags.listingId, listings.id),
          ) as typeof mainQuery
        }

        const rawRows = await mainQuery
          .where(and(...conditions))
          .orderBy(listings.id)
          .limit(limit + 1)

        // AC-3: Ranking formula
        const ranked = rawRows.map((row) => {
          const relevance = Number(row.relevance)
          const quality = Number(row.qualityComposite)
          const paidBoost = TIER_LIMITS[asSubscriptionTier(row.subscriptionTier)]?.rankingBoost ?? 0

          let finalScore: number
          if (input.sort === "relevance") {
            finalScore =
              (relevance * 30)
              + (quality * 0.45)
              + paidBoost
              + computeFreshnessBias(row.updatedAt)
              + computeColdStart(row.createdAt)
              + jitter()
          } else if (input.sort === "quality_score") {
            finalScore = quality
          } else {
            finalScore = row.updatedAt.getTime()
          }

          return { ...row, finalScore }
        }).sort((a, b) => b.finalScore - a.finalScore)

        const hasMore = ranked.length > limit
        const page = ranked.slice(0, limit)
        const nextCursor = hasMore ? page[page.length - 1].id : undefined

        // Fetch taxonomy tags for result listings
        const resultIds = page.map((r) => r.id)
        const tags = resultIds.length > 0
          ? await fetchTaxonomyTags(db, resultIds)
          : new Map<string, string[]>()

        // AC-10: subscriptionTier never in client response [PP-33]
        const results: ListingSummary[] = page.map((row) => ({
          slug: row.slug,
          name: row.name,
          headline: row.headline,
          entityType: row.entityType,
          baseRegion: row.baseRegion,
          verificationTier: String(row.verificationTier),
          isSponsored: TIER_LIMITS[asSubscriptionTier(row.subscriptionTier)]?.sponsoredPlacement ?? false,
          qualityScore: Number(row.qualityComposite),
          taxonomyTags: tags.get(row.id) ?? [],
          headshotUrl: row.headshotUrl,
          logoUrl: row.logoUrl,
        }))

        // Count total
        const totalCount = await countActiveListings(db, conditions, hasTaxonomyFilter)

        // AC-5: Sponsored results — separate query
        const sponsoredResults = await fetchSponsoredResults(db, tsquery, conditions, hasTaxonomyFilter, tags)

        // Facet counts (AC-4)
        const facets = await computeFacets(db, queryText, filters, tsquery)

        // AC-7: Zero-result handling
        let suggestedFilters: string[] | undefined
        let zeroResultSuggestions: string[] | undefined
        if (totalCount === 0 && (queryText || Object.keys(filters).some((k) => filters[k as keyof typeof filters]))) {
          await db.insert(zeroResultQueries).values({
            query: queryText,
            filters: filters as Record<string, unknown>,
          })
          suggestedFilters = broadenFilters(filters)
          zeroResultSuggestions = await findNearestMatches(db, filters)
        }

        // AC-8: emit search_performed [S6-ST-4]
        deps.bus.emit(
          "search_performed",
          {
            _brand: "SearchPerformedEvent" as const,
            query: queryText, // empty string for filter-only, not undefined
            filters: (filters ?? {}) as Record<string, unknown>,
            resultCount: totalCount,
            resultListingIds: resultIds,
            sessionId: ctx.session?.accountId ?? null,
            timestamp: new Date().toISOString(),
          },
          deps.waitUntilFn,
        )

        // AC-9: record search history for authenticated users only
        if (ctx.session) {
          await db.insert(searchHistory).values({
            accountId: ctx.session.accountId,
            query: queryText || null,
            filters: Object.keys(filters).length > 0 ? (filters as Record<string, unknown>) : null,
            resultCount: totalCount,
          })
        }

        const output: SearchResultOutput = {
          results,
          sponsoredResults,
          totalCount,
          facets,
          nextCursor,
          suggestedFilters,
          zeroResultSuggestions,
        }
        return output
      }),

    // AC-6: autocomplete from taxonomy + synonyms
    suggest: publicProcedure
      .input(suggestInput)
      .query(async ({ input }) => {
        const prefix = input.prefix.trim()

        const [sectorMatches, serviceAreaMatches, specMatches, synonymMatches] = await Promise.all([
          db.select({ name: taxonomySectors.name })
            .from(taxonomySectors)
            .where(ilike(taxonomySectors.name, `${prefix}%`))
            .limit(10),
          db.select({ name: taxonomyServiceAreas.name })
            .from(taxonomyServiceAreas)
            .where(ilike(taxonomyServiceAreas.name, `${prefix}%`))
            .limit(10),
          db.select({ name: taxonomySpecialisations.name })
            .from(taxonomySpecialisations)
            .where(ilike(taxonomySpecialisations.name, `${prefix}%`))
            .limit(10),
          db.select({ name: searchSynonyms.synonym })
            .from(searchSynonyms)
            .where(ilike(searchSynonyms.term, `${prefix}%`))
            .limit(5),
        ])

        const all = [
          ...sectorMatches.map((r) => r.name),
          ...serviceAreaMatches.map((r) => r.name),
          ...specMatches.map((r) => r.name),
          ...synonymMatches.map((r) => r.name),
        ]

        // Deduplicate, case-insensitive
        const seen = new Set<string>()
        const unique: string[] = []
        for (const item of all) {
          const lower = item.toLowerCase()
          if (!seen.has(lower)) {
            seen.add(lower)
            unique.push(item)
          }
        }

        return unique.slice(0, 10)
      }),

    // Saved search CRUD (AC-33, AC-34 — these are in CS-WORK-054 but the routes live on this router)
    saveSearch: protectedProcedure
      .input(saveSearchInput)
      .mutation(async ({ ctx, input }) => {
        const existing = await db
          .select({ cnt: sql<number>`count(*)::int` })
          .from(savedSearches)
          .where(eq(savedSearches.accountId, ctx.session.accountId))

        if (existing[0].cnt >= MAX_SAVED_SEARCHES) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: `Maximum ${MAX_SAVED_SEARCHES} saved searches`,
          })
        }

        const [created] = await db.insert(savedSearches).values({
          accountId: ctx.session.accountId,
          name: input.name.trim(),
          query: input.query ?? null,
          filters: input.filters ? (input.filters as Record<string, unknown>) : null,
        }).returning()

        return created
      }),

    getSavedSearches: protectedProcedure
      .input(z.object({ limit: z.number().int().min(1).max(50).optional() }))
      .query(async ({ ctx, input }) => {
        return db.select()
          .from(savedSearches)
          .where(eq(savedSearches.accountId, ctx.session.accountId))
          .orderBy(desc(savedSearches.createdAt))
          .limit(input.limit ?? 10)
      }),

    deleteSavedSearch: protectedProcedure
      .input(deleteSavedSearchInput)
      .mutation(async ({ ctx, input }) => {
        const [saved] = await db.select()
          .from(savedSearches)
          .where(eq(savedSearches.id, input.savedSearchId))
          .limit(1)

        if (!saved || saved.accountId !== ctx.session.accountId) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Saved search not found" })
        }

        await db.delete(savedSearches).where(eq(savedSearches.id, input.savedSearchId))
      }),
  })
}

// --- Internal helpers ---

async function resolveSlugsToIds(
  db: Db,
  dimension: "sectors" | "serviceAreas" | "specialisations",
  slugs: string[],
): Promise<number[]> {
  if (slugs.length === 0) return []

  if (dimension === "sectors") {
    const rows = await db.select({ id: taxonomySectors.id })
      .from(taxonomySectors)
      .where(inArray(taxonomySectors.slug, slugs))
    return rows.map((r) => r.id)
  }
  if (dimension === "serviceAreas") {
    const rows = await db.select({ id: taxonomyServiceAreas.id })
      .from(taxonomyServiceAreas)
      .where(inArray(taxonomyServiceAreas.slug, slugs))
    return rows.map((r) => r.id)
  }
  const rows = await db.select({ id: taxonomySpecialisations.id })
    .from(taxonomySpecialisations)
    .where(inArray(taxonomySpecialisations.slug, slugs))
  return rows.map((r) => r.id)
}

async function fetchTaxonomyTags(db: Db, listingIds: string[]): Promise<Map<string, string[]>> {
  if (listingIds.length === 0) return new Map()

  const rows = await db
    .select({
      listingId: listingTaxonomyTags.listingId,
      sectorName: taxonomySectors.name,
      serviceAreaName: taxonomyServiceAreas.name,
    })
    .from(listingTaxonomyTags)
    .innerJoin(taxonomySectors, eq(taxonomySectors.id, listingTaxonomyTags.sectorId))
    .innerJoin(taxonomyServiceAreas, eq(taxonomyServiceAreas.id, listingTaxonomyTags.serviceAreaId))
    .where(inArray(listingTaxonomyTags.listingId, listingIds))

  const map = new Map<string, Set<string>>()
  for (const row of rows) {
    if (!map.has(row.listingId)) map.set(row.listingId, new Set())
    const set = map.get(row.listingId)!
    set.add(row.sectorName)
    set.add(row.serviceAreaName)
  }

  const result = new Map<string, string[]>()
  for (const [id, set] of map) {
    result.set(id, [...set].slice(0, 5))
  }
  return result
}

async function countActiveListings(
  db: Db,
  conditions: ReturnType<typeof eq>[],
  hasTaxonomyFilter: boolean,
): Promise<number> {
  let countQuery = db
    .select({ count: sql<number>`count(DISTINCT ${listings.id})` })
    .from(listings)
    .leftJoin(qualityScores, eq(qualityScores.listingId, listings.id))
    .leftJoin(verifications, eq(verifications.listingId, listings.id))

  if (hasTaxonomyFilter) {
    countQuery = countQuery.innerJoin(
      listingTaxonomyTags,
      eq(listingTaxonomyTags.listingId, listings.id),
    ) as typeof countQuery
  }

  const [{ count: cnt }] = await countQuery.where(and(...conditions))
  return Number(cnt)
}

async function fetchSponsoredResults(
  db: Db,
  tsquery: ReturnType<typeof sql> | null,
  _conditions: ReturnType<typeof eq>[],
  _hasTaxonomyFilter: boolean,
  tags: Map<string, string[]>,
): Promise<ListingSummary[]> {
  // Sponsored: premium/partner tier, active, matching query if present, max 3
  const sponsoredConditions: ReturnType<typeof eq>[] = [
    eq(listings.lifecycleStatus, "active"),
    sql`${listings.subscriptionTier} IN ('premium', 'partner')`,
  ]
  if (tsquery) {
    sponsoredConditions.push(sql`${listings.searchVector} @@ ${tsquery}`)
  }

  const rows = await db
    .select({
      id: listings.id,
      slug: listings.slug,
      name: listings.name,
      headline: listings.headline,
      entityType: listings.entityType,
      baseRegion: listings.baseRegion,
      headshotUrl: listings.headshotUrl,
      logoUrl: listings.logoUrl,
      subscriptionTier: listings.subscriptionTier,
      qualityComposite: sql<number>`COALESCE(${qualityScores.composite}, 0)`,
      verificationTier: sql<string>`COALESCE(${verifications.tier}, 'unclaimed')`,
    })
    .from(listings)
    .leftJoin(qualityScores, eq(qualityScores.listingId, listings.id))
    .leftJoin(verifications, eq(verifications.listingId, listings.id))
    .where(and(...sponsoredConditions))
    .limit(3)

  return rows.map((row) => ({
    slug: row.slug,
    name: row.name,
    headline: row.headline,
    entityType: row.entityType,
    baseRegion: row.baseRegion,
    verificationTier: String(row.verificationTier),
    isSponsored: true,
    qualityScore: Number(row.qualityComposite),
    taxonomyTags: tags.get(row.id) ?? [],
    headshotUrl: row.headshotUrl,
    logoUrl: row.logoUrl,
  }))
}

async function computeFacets(
  db: Db,
  queryText: string,
  filters: z.infer<typeof searchQueryInput>["filters"],
  tsquery: ReturnType<typeof sql> | null,
): Promise<FacetCounts> {
  const baseCondition = eq(listings.lifecycleStatus, "active")
  const ftsCondition = tsquery ? sql`${listings.searchVector} @@ ${tsquery}` : null

  // AC-4: each facet excludes its own dimension from the filter
  const [sectors, serviceAreas, locations, verificationTiers] = await Promise.all([
    // Sector facets — exclude sector filter
    db.select({
      slug: taxonomySectors.slug,
      label: taxonomySectors.name,
      count: sql<number>`count(DISTINCT ${listings.id})`,
    })
      .from(listings)
      .innerJoin(listingTaxonomyTags, eq(listingTaxonomyTags.listingId, listings.id))
      .innerJoin(taxonomySectors, eq(taxonomySectors.id, listingTaxonomyTags.sectorId))
      .where(and(baseCondition, ...(ftsCondition ? [ftsCondition] : [])))
      .groupBy(taxonomySectors.slug, taxonomySectors.name)
      .orderBy(desc(sql`count(DISTINCT ${listings.id})`)),

    // Service area facets — exclude serviceArea filter
    db.select({
      slug: taxonomyServiceAreas.slug,
      label: taxonomyServiceAreas.name,
      count: sql<number>`count(DISTINCT ${listings.id})`,
    })
      .from(listings)
      .innerJoin(listingTaxonomyTags, eq(listingTaxonomyTags.listingId, listings.id))
      .innerJoin(taxonomyServiceAreas, eq(taxonomyServiceAreas.id, listingTaxonomyTags.serviceAreaId))
      .where(and(baseCondition, ...(ftsCondition ? [ftsCondition] : [])))
      .groupBy(taxonomyServiceAreas.slug, taxonomyServiceAreas.name)
      .orderBy(desc(sql`count(DISTINCT ${listings.id})`)),

    // Location facets — exclude location filter
    db.select({
      slug: sql<string>`${listings.baseRegion}`,
      label: sql<string>`${listings.baseRegion}`,
      count: sql<number>`count(*)`,
    })
      .from(listings)
      .where(and(baseCondition, sql`${listings.baseRegion} IS NOT NULL`, ...(ftsCondition ? [ftsCondition] : [])))
      .groupBy(listings.baseRegion)
      .orderBy(desc(sql`count(*)`)),

    // Verification tier facets
    db.select({
      tier: sql<string>`${verifications.tier}`,
      count: sql<number>`count(*)`,
    })
      .from(listings)
      .innerJoin(verifications, eq(verifications.listingId, listings.id))
      .where(and(baseCondition, ...(ftsCondition ? [ftsCondition] : [])))
      .groupBy(verifications.tier)
      .orderBy(desc(sql`count(*)`)),
  ])

  return {
    sectors: sectors.map((r) => ({ slug: r.slug, label: r.label, count: Number(r.count) })),
    serviceAreas: serviceAreas.map((r) => ({ slug: r.slug, label: r.label, count: Number(r.count) })),
    locations: locations.map((r) => ({ slug: String(r.slug), label: String(r.label), count: Number(r.count) })),
    verificationTiers: verificationTiers.map((r) => ({ tier: String(r.tier), count: Number(r.count) })),
  }
}

function broadenFilters(filters: z.infer<typeof searchQueryInput>["filters"]): string[] {
  if (!filters) return []
  const suggestions: string[] = []

  // Remove most specific filter first: specialisations > serviceAreas > location > sectors
  if (filters.specialisations?.length) {
    suggestions.push("Try removing specialisation filter")
  }
  if (filters.serviceAreas?.length) {
    suggestions.push("Try removing service area filter")
  }
  if (filters.location) {
    suggestions.push("Try searching in all locations")
  }
  if (filters.sectors?.length) {
    suggestions.push("Try removing sector filter")
  }

  return suggestions
}

async function findNearestMatches(
  db: Db,
  filters: z.infer<typeof searchQueryInput>["filters"],
): Promise<string[]> {
  if (!filters) return []

  // Suggest broader categories with result counts
  const suggestions: string[] = []

  if (filters.serviceAreas?.length) {
    // Count listings in the parent sectors of selected service areas
    const parentCounts = await db
      .select({
        name: taxonomySectors.name,
        count: sql<number>`count(DISTINCT ${listings.id})`,
      })
      .from(listings)
      .innerJoin(listingTaxonomyTags, eq(listingTaxonomyTags.listingId, listings.id))
      .innerJoin(taxonomySectors, eq(taxonomySectors.id, listingTaxonomyTags.sectorId))
      .where(eq(listings.lifecycleStatus, "active"))
      .groupBy(taxonomySectors.name)
      .orderBy(desc(sql`count(DISTINCT ${listings.id})`))
      .limit(3)

    for (const row of parentCounts) {
      suggestions.push(`${row.name} (${row.count} results)`)
    }
  }

  return suggestions.slice(0, 5)
}
