// Integration tests — analytics pipeline (AC-37, AC-38, AC-39, AC-41, AC-45, AC-46–49, AC-54)
// Uses real DB against local Supabase Postgres.

import { describe, it, expect, beforeEach } from "vitest"
import { getTestDb, resetDb } from "@/db/test-utils"
import { seedTestUser, makeUUID, createTestListing } from "@/db/test-fixtures"
import { perceptionAggregates } from "@/db/schema/intelligence"
import {
  zeroResultQueries,
  listingTaxonomyTags,
  taxonomySectors,
  taxonomyServiceAreas,
  taxonomySpecialisations,
  engagements,
  qualityScores,
} from "@/db/schema/data-and-listings"
import { enquiryRecords } from "@/db/schema/accounts"
import { eq, and } from "drizzle-orm"
import { aggregateSearchTerm, handleSearchPerformedForZeroResult, identifyTaxonomyGaps } from "../search-terms"
import { aggregateViewerDemographic } from "../viewer-demographics"
import { computeCompetitorBenchmark } from "../competitor-benchmark"
import { computeEnquiryResponseInsights } from "../enquiry-response"
import { computeTaxonomySuggestions } from "../taxonomy-suggestions"
import { computeFeatureAccess } from "@/domains/commercial/subscription/feature-access"
import type { SearchTermsData, ViewerDemographicsData, CompetitorBenchmark, EnquiryResponseInsights } from "../types"

const db = getTestDb()
const ACCOUNT_ID = makeUUID("analytics001")
const LISTING_ID = makeUUID("analytics101")

beforeEach(async () => {
  await resetDb()
  await seedTestUser(db, ACCOUNT_ID)
})

// --- AC-37: search_performed consumer writes per-listing search term frequency ---

describe("AC-37: aggregateSearchTerm", () => {
  it("writes per-listing search term frequency to perception_aggregates", async () => {
    await createTestListing(db, ACCOUNT_ID, { id: LISTING_ID })

    const now = new Date("2026-03-04T10:00:00Z") // Wednesday
    await aggregateSearchTerm(db, LISTING_ID, "camera operator", now)
    await aggregateSearchTerm(db, LISTING_ID, "camera operator", now)
    await aggregateSearchTerm(db, LISTING_ID, "sound recordist", now)

    const [row] = await db
      .select()
      .from(perceptionAggregates)
      .where(
        and(
          eq(perceptionAggregates.listingId, LISTING_ID),
          eq(perceptionAggregates.aggregateType, "search_terms"),
        ),
      )

    expect(row).toBeDefined()
    const data = row.data as unknown as SearchTermsData
    expect(data.terms).toHaveLength(2)

    const cameraTerm = data.terms.find((t) => t.term === "camera operator")
    expect(cameraTerm?.count).toBe(2)

    const soundTerm = data.terms.find((t) => t.term === "sound recordist")
    expect(soundTerm?.count).toBe(1)

    expect(row.sampleSize).toBe(3)
    expect(row.periodStart).toBe("2026-03-02") // Monday of that week
  })
})

// --- AC-38: Zero-result queries written to zero_result_queries ---

describe("AC-38: handleSearchPerformedForZeroResult", () => {
  it("writes to zero_result_queries when resultCount is 0", async () => {
    await handleSearchPerformedForZeroResult(db, "underwater cameraman", 0, { region: "london" })

    const rows = await db.select().from(zeroResultQueries)
    expect(rows).toHaveLength(1)
    expect(rows[0].query).toBe("underwater cameraman")
  })

  it("does not write when resultCount > 0", async () => {
    await handleSearchPerformedForZeroResult(db, "camera operator", 5, {})

    const rows = await db.select().from(zeroResultQueries)
    expect(rows).toHaveLength(0)
  })
})

// --- AC-39: Taxonomy gap identification ---

describe("AC-39: identifyTaxonomyGaps", () => {
  it("identifies unmatched terms with frequency >= 3", async () => {
    // Seed taxonomy
    const [sector] = await db.insert(taxonomySectors).values({ name: "Camera", slug: "camera", sortOrder: 1 }).returning()
    await db.insert(taxonomyServiceAreas).values({ name: "Camera Operator", sectorId: sector.id, slug: "camera-operator", sortOrder: 1 })

    // Insert zero-result queries — "drone pilot" appears 3 times, "gaffer" 2 times
    const now = new Date("2026-03-05T12:00:00Z")
    for (let i = 0; i < 3; i++) {
      await db.insert(zeroResultQueries).values({ query: "drone pilot", createdAt: now })
    }
    for (let i = 0; i < 2; i++) {
      await db.insert(zeroResultQueries).values({ query: "gaffer", createdAt: now })
    }

    const periodStart = new Date("2026-03-01T00:00:00Z")
    const periodEnd = new Date("2026-03-07T23:59:59Z")

    const gaps = await identifyTaxonomyGaps(db, periodStart, periodEnd)

    // "drone pilot" (3 hits) should be a gap, "gaffer" (2 hits) should not
    expect(gaps).toHaveLength(1)
    expect(gaps[0].term).toBe("drone pilot")
    expect(gaps[0].frequency).toBe(3)

    // "camera operator" matches existing taxonomy — should NOT be a gap
    for (let i = 0; i < 5; i++) {
      await db.insert(zeroResultQueries).values({ query: "camera operator", createdAt: now })
    }
    const gaps2 = await identifyTaxonomyGaps(db, periodStart, periodEnd)
    expect(gaps2.find((g) => g.term === "camera operator")).toBeUndefined()
  })
})

// --- AC-41: Viewer demographics from deduplicated events ---

describe("AC-41: aggregateViewerDemographic", () => {
  it("aggregates viewer demographics with correct pct values", async () => {
    await createTestListing(db, ACCOUNT_ID, { id: LISTING_ID })

    const now = new Date("2026-03-04T10:00:00Z")

    // 3 views: 2 from companies, 1 from freelancer
    await aggregateViewerDemographic(db, LISTING_ID, { entityType: "company", sector: "Camera", region: "London" }, now)
    await aggregateViewerDemographic(db, LISTING_ID, { entityType: "company", sector: "Sound", region: "Manchester" }, now)
    await aggregateViewerDemographic(db, LISTING_ID, { entityType: "freelancer", sector: "Camera", region: "London" }, now)

    const [row] = await db
      .select()
      .from(perceptionAggregates)
      .where(
        and(
          eq(perceptionAggregates.listingId, LISTING_ID),
          eq(perceptionAggregates.aggregateType, "viewer_demographics"),
        ),
      )

    expect(row).toBeDefined()
    const data = row.data as unknown as ViewerDemographicsData
    expect(data.totalUniqueViewers).toBe(3)

    // Entity type pct
    const companyBucket = data.entityTypes.find((b) => b.type === "company")
    expect(companyBucket?.count).toBe(2)
    expect(companyBucket?.pct).toBeCloseTo(0.67, 1)

    const freelancerBucket = data.entityTypes.find((b) => b.type === "freelancer")
    expect(freelancerBucket?.count).toBe(1)
    expect(freelancerBucket?.pct).toBeCloseTo(0.33, 1)

    // Sector pct sums to ~1.0
    const sectorPctSum = data.sectors.reduce((s, b) => s + b.pct, 0)
    expect(sectorPctSum).toBeCloseTo(1.0, 1)
  })
})

// --- AC-45: Competitor benchmark cached with 7-day TTL ---

describe("AC-45: computeCompetitorBenchmark cache", () => {
  it("caches result and returns cached data within TTL", async () => {
    await createTestListing(db, ACCOUNT_ID, { id: LISTING_ID })
    const competitorIds = [makeUUID("comp000001"), makeUUID("comp000002"), makeUUID("comp000003")]

    // Seed taxonomy
    const [sector] = await db.insert(taxonomySectors).values({ name: "Camera", slug: "camera", sortOrder: 1 }).returning()
    const [sa1] = await db.insert(taxonomyServiceAreas).values({ name: "Camera Op", sectorId: sector.id, slug: "camera-op", sortOrder: 1 }).returning()
    const [sa2] = await db.insert(taxonomyServiceAreas).values({ name: "DIT", sectorId: sector.id, slug: "dit", sortOrder: 2 }).returning()

    // Tag the target listing with both service areas
    await db.insert(listingTaxonomyTags).values([
      { listingId: LISTING_ID, sectorId: sector.id, serviceAreaId: sa1.id },
      { listingId: LISTING_ID, sectorId: sector.id, serviceAreaId: sa2.id },
    ])

    // Create 3 competitors with overlapping tags
    for (const cId of competitorIds) {
      await seedTestUser(db, cId, `${cId}@test.com`)
      await createTestListing(db, cId, { id: cId })
      await db.insert(listingTaxonomyTags).values([
        { listingId: cId, sectorId: sector.id, serviceAreaId: sa1.id },
        { listingId: cId, sectorId: sector.id, serviceAreaId: sa2.id },
      ])
    }

    const tags = [{ sectorId: sector.id, serviceAreaId: sa1.id }, { sectorId: sector.id, serviceAreaId: sa2.id }]
    const now = new Date("2026-03-04T10:00:00Z")

    // First call — computes and caches
    const result1 = await computeCompetitorBenchmark(db, LISTING_ID, tags, now)
    expect(result1.insufficientData).toBe(false)
    expect(result1.sampleSize).toBe(3)

    // Verify cached in perception_aggregates
    const [cached] = await db
      .select()
      .from(perceptionAggregates)
      .where(
        and(
          eq(perceptionAggregates.listingId, LISTING_ID),
          eq(perceptionAggregates.aggregateType, "competitor_benchmarking"),
        ),
      )
    expect(cached).toBeDefined()

    // Second call within TTL — returns cached
    const result2 = await computeCompetitorBenchmark(db, LISTING_ID, tags, new Date("2026-03-06T10:00:00Z"))
    expect(result2).toEqual(result1)
  })
})

// --- AC-46, 47, 48, 49: Feature gate verification ---

describe("AC-46–49: feature gate analytics fields", () => {
  it("AC-46: competitorBenchmarking false for free and standard", () => {
    expect(computeFeatureAccess("free").competitorBenchmarking).toBe(false)
    expect(computeFeatureAccess("standard").competitorBenchmarking).toBe(false)
    expect(computeFeatureAccess("premium").competitorBenchmarking).toBe(true)
    expect(computeFeatureAccess("partner").competitorBenchmarking).toBe(true)
  })

  it("AC-47: viewerDemographics false for free and standard", () => {
    expect(computeFeatureAccess("free").viewerDemographics).toBe(false)
    expect(computeFeatureAccess("standard").viewerDemographics).toBe(false)
    expect(computeFeatureAccess("premium").viewerDemographics).toBe(true)
  })

  it("AC-48: topSearchTerms true for standard, premium, partner", () => {
    expect(computeFeatureAccess("free").topSearchTerms).toBe(false)
    expect(computeFeatureAccess("standard").topSearchTerms).toBe(true)
    expect(computeFeatureAccess("premium").topSearchTerms).toBe(true)
    expect(computeFeatureAccess("partner").topSearchTerms).toBe(true)
  })

  it("AC-49: enquiryResponseInsights false for free and standard", () => {
    expect(computeFeatureAccess("free").enquiryResponseInsights).toBe(false)
    expect(computeFeatureAccess("standard").enquiryResponseInsights).toBe(false)
    expect(computeFeatureAccess("premium").enquiryResponseInsights).toBe(true)
  })
})

// --- AC-54: computeTaxonomySuggestions ---

describe("AC-54: computeTaxonomySuggestions", () => {
  it("returns data-driven suggestions when >= 10 listings exist in sector", async () => {
    // Seed taxonomy
    const [sector] = await db.insert(taxonomySectors).values({ name: "Camera", slug: "camera", sortOrder: 1 }).returning()
    const [sa1] = await db.insert(taxonomyServiceAreas).values({ name: "Camera Operator", sectorId: sector.id, slug: "camera-operator", sortOrder: 1 }).returning()
    const [sa2] = await db.insert(taxonomyServiceAreas).values({ name: "DIT", sectorId: sector.id, slug: "dit", sortOrder: 2 }).returning()

    // Create 10 listings in the sector
    for (let i = 0; i < 10; i++) {
      const uid = makeUUID(`taxsug${String(i).padStart(4, "0")}`)
      await seedTestUser(db, uid, `taxsug${i}@test.com`)
      await createTestListing(db, uid, { id: uid })
      // All have sa1, 5 also have sa2
      await db.insert(listingTaxonomyTags).values({ listingId: uid, sectorId: sector.id, serviceAreaId: sa1.id })
      if (i < 5) {
        await db.insert(listingTaxonomyTags).values({ listingId: uid, sectorId: sector.id, serviceAreaId: sa2.id })
      }
    }

    const suggestions = await computeTaxonomySuggestions(db, "camera")
    expect(suggestions.length).toBeGreaterThan(0)
    expect(suggestions[0].source).toBe("data_driven")
    // Camera Operator should be most frequent (all 10 listings)
    expect(suggestions[0].serviceArea).toBe("Camera Operator")
    expect(suggestions[0].frequency).toBe(10)
  })

  it("returns empty array when fewer than 10 listings", async () => {
    const [sector] = await db.insert(taxonomySectors).values({ name: "Sound", slug: "sound", sortOrder: 2 }).returning()
    const [sa] = await db.insert(taxonomyServiceAreas).values({ name: "Sound Recordist", sectorId: sector.id, slug: "sound-recordist", sortOrder: 1 }).returning()

    // Only 3 listings
    for (let i = 0; i < 3; i++) {
      const uid = makeUUID(`tsugfew${String(i).padStart(3, "0")}`)
      await seedTestUser(db, uid, `tsugfew${i}@test.com`)
      await createTestListing(db, uid, { id: uid })
      await db.insert(listingTaxonomyTags).values({ listingId: uid, sectorId: sector.id, serviceAreaId: sa.id })
    }

    const suggestions = await computeTaxonomySuggestions(db, "sound")
    expect(suggestions).toEqual([])
  })
})
