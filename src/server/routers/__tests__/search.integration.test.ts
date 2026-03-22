// S6 search router integration tests — AC-2 through AC-10
// Tests run against local Supabase Postgres with pg_trgm, tsvector trigger, and GIN index.

import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest"
import { eq, sql } from "drizzle-orm"
import { getTestDb, resetDb, closeTestDb } from "@/db/test-utils"
import {
  createTestListing,
  seedTestUser,
  seedTaxonomy,
  setQuality,
  makeSession,
  ctx,
  emptyConsumerMatrix,
} from "@/db/test-fixtures"
import {
  listings,
  zeroResultQueries,
  searchSynonyms,
  verifications,
} from "@/db/schema/data-and-listings"
import { savedSearches, searchHistory } from "@/db/schema/accounts"
import { createSearchRouter } from "@/server/routers/search"
import { InProcessEventBus } from "@/lib/events/bus"
import { createWaitUntilCollector } from "@/lib/events/waitUntil"

let db: ReturnType<typeof getTestDb>

const BUYER_ID = "buyer-search-test-01"
const BUYER_SESSION = makeSession({ accountId: BUYER_ID })

function makeBus() {
  return new InProcessEventBus({
    logError: async () => {},
    consumerMatrix: emptyConsumerMatrix,
  })
}

function createRouter(bus?: InProcessEventBus) {
  const eventBus = bus ?? makeBus()
  const { waitUntilFn } = createWaitUntilCollector()
  return createSearchRouter({ db, bus: eventBus, waitUntilFn }).createCaller
}

beforeAll(async () => {
  db = getTestDb()
})

beforeEach(async () => {
  await resetDb()
  await seedTestUser(db, BUYER_ID)
})

afterAll(async () => {
  await closeTestDb()
})

// --- AC-2: Query parameters round-trip ---

describe("AC-2: query parameter round-trip", () => {
  it("returns results when query matches listing name via FTS", async () => {
    const taxonomy = await seedTaxonomy(db)
    await createTestListing(db, BUYER_ID, { name: "Steadicam Operator London" })
    await createTestListing(db, BUYER_ID, { name: "Sound Mixer Manchester" })

    const caller = createRouter()(ctx(null))
    const result = await caller.query({ query: "steadicam" })

    expect(result.results.length).toBeGreaterThanOrEqual(1)
    expect(result.results.some((r) => r.name === "Steadicam Operator London")).toBe(true)
  })

  it("returns all active listings when no query or filters", async () => {
    await createTestListing(db, BUYER_ID, { name: "Company A" })
    await createTestListing(db, BUYER_ID, { name: "Company B" })

    const caller = createRouter()(ctx(null))
    const result = await caller.query({})

    expect(result.totalCount).toBe(2)
    expect(result.results).toHaveLength(2)
  })

  it("silently drops invalid filter slugs", async () => {
    await seedTaxonomy(db)
    await createTestListing(db, BUYER_ID, { name: "Valid Listing" })

    const caller = createRouter()(ctx(null))
    // "nonexistent" slug resolves to [] IDs, effectively no filter
    const result = await caller.query({ filters: { sectors: ["nonexistent"] } })

    // No taxonomy filter applied since slug didn't resolve — returns all active
    expect(result.totalCount).toBe(1)
  })
})

// --- AC-3: Ranking formula ---

describe("AC-3: ranking formula", () => {
  it("ranks higher quality listings above lower quality for same relevance", async () => {
    const l1 = await createTestListing(db, BUYER_ID, { name: "Camera Operator Alpha" })
    const l2 = await createTestListing(db, BUYER_ID, { name: "Camera Operator Beta" })
    await setQuality(db, l1.id, 85)
    await setQuality(db, l2.id, 20)

    const caller = createRouter()(ctx(null))
    const result = await caller.query({ query: "camera operator" })

    // With significant quality difference, l1 should rank higher most of the time
    // (jitter ±3 may occasionally flip, but 85 vs 20 is a ~29 point gap in quality component)
    const idx1 = result.results.findIndex((r) => r.slug === l1.slug)
    const idx2 = result.results.findIndex((r) => r.slug === l2.slug)
    expect(idx1).toBeLessThan(idx2)
  })

  it("imports TIER_LIMITS rankingBoost from CR (P4 compliance)", async () => {
    const free = await createTestListing(db, BUYER_ID, { name: "Camera Op Free", subscriptionTier: "free" })
    const premium = await createTestListing(db, BUYER_ID, { name: "Camera Op Premium", subscriptionTier: "premium" })
    await setQuality(db, free.id, 50)
    await setQuality(db, premium.id, 50)

    const caller = createRouter()(ctx(null))
    const result = await caller.query({ query: "camera op" })

    // Premium has +25 boost vs free's 0 — at equal quality, premium should rank higher
    const premIdx = result.results.findIndex((r) => r.slug === premium.slug)
    const freeIdx = result.results.findIndex((r) => r.slug === free.slug)
    expect(premIdx).toBeLessThan(freeIdx)
  })
})

// --- AC-4: Facet counts ---

describe("AC-4: facet counts", () => {
  it("returns sector and service area facets with counts", async () => {
    const taxonomy = await seedTaxonomy(db)
    const l1 = await createTestListing(db, BUYER_ID, { name: "Camera Co" })
    const l2 = await createTestListing(db, BUYER_ID, { name: "Sound Co" })

    await db.insert(
      (await import("@/db/schema/data-and-listings")).listingTaxonomyTags,
    ).values([
      { listingId: l1.id, sectorId: taxonomy.camera.id, serviceAreaId: taxonomy.cinematography.id },
      { listingId: l2.id, sectorId: taxonomy.sound.id, serviceAreaId: taxonomy.soundRecording.id },
    ])

    const caller = createRouter()(ctx(null))
    const result = await caller.query({})

    expect(result.facets.sectors.length).toBeGreaterThanOrEqual(2)
    const cameraFacet = result.facets.sectors.find((f) => f.slug === "camera")
    expect(cameraFacet).toBeDefined()
    expect(cameraFacet!.count).toBe(1)
  })

  it("returns location facets", async () => {
    await createTestListing(db, BUYER_ID, { name: "London Co", baseRegion: "London" })
    await createTestListing(db, BUYER_ID, { name: "Manchester Co", baseRegion: "Manchester" })

    const caller = createRouter()(ctx(null))
    const result = await caller.query({})

    expect(result.facets.locations.length).toBe(2)
    const londonFacet = result.facets.locations.find((f) => f.slug === "London")
    expect(londonFacet).toBeDefined()
    expect(londonFacet!.count).toBe(1)
  })
})

// --- AC-5: Sponsored results ---

describe("AC-5: sponsored results", () => {
  it("returns premium/partner listings in sponsored section, max 3", async () => {
    await createTestListing(db, BUYER_ID, { name: "Premium Camera", subscriptionTier: "premium" })
    await createTestListing(db, BUYER_ID, { name: "Partner Sound", subscriptionTier: "partner" })
    await createTestListing(db, BUYER_ID, { name: "Free Lighting", subscriptionTier: "free" })

    const caller = createRouter()(ctx(null))
    const result = await caller.query({})

    expect(result.sponsoredResults.length).toBe(2)
    expect(result.sponsoredResults.every((r) => r.isSponsored)).toBe(true)
    // Free listing not in sponsored
    expect(result.sponsoredResults.find((r) => r.name === "Free Lighting")).toBeUndefined()
  })

  it("sponsored listings also appear in organic results (dual placement)", async () => {
    await createTestListing(db, BUYER_ID, { name: "Premium Camera", subscriptionTier: "premium" })

    const caller = createRouter()(ctx(null))
    const result = await caller.query({})

    // In sponsored
    expect(result.sponsoredResults.some((r) => r.name === "Premium Camera")).toBe(true)
    // Also in organic
    expect(result.results.some((r) => r.name === "Premium Camera")).toBe(true)
  })
})

// --- AC-6: Autocomplete ---

describe("AC-6: search.suggest autocomplete", () => {
  it("returns taxonomy terms matching prefix", async () => {
    await seedTaxonomy(db)

    const caller = createRouter()(ctx(null))
    const result = await caller.suggest({ prefix: "Ca" })

    expect(result.length).toBeGreaterThanOrEqual(1)
    expect(result.some((r) => r.toLowerCase().startsWith("ca"))).toBe(true)
  })

  it("returns max 10 results", async () => {
    await seedTaxonomy(db)

    const caller = createRouter()(ctx(null))
    const result = await caller.suggest({ prefix: "So" })

    expect(result.length).toBeLessThanOrEqual(10)
  })

  it("includes synonym matches", async () => {
    await db.insert(searchSynonyms).values({
      term: "cameraman",
      synonym: "Camera Operator",
      weight: 0.9,
    })

    const caller = createRouter()(ctx(null))
    const result = await caller.suggest({ prefix: "ca" })

    expect(result.some((r) => r === "Camera Operator")).toBe(true)
  })
})

// --- AC-7: Zero-result handling ---

describe("AC-7: zero-result handling", () => {
  it("inserts zero_result_queries row and returns suggestions on zero results", async () => {
    const caller = createRouter()(ctx(null))
    const result = await caller.query({ query: "completely_nonexistent_query_xyz" })

    expect(result.totalCount).toBe(0)

    const rows = await db.select().from(zeroResultQueries)
    expect(rows).toHaveLength(1)
    expect(rows[0].query).toBe("completely_nonexistent_query_xyz")

    // suggestedFilters may be empty if no filters were applied
    expect(result.suggestedFilters).toBeDefined()
    expect(result.zeroResultSuggestions).toBeDefined()
  })
})

// --- AC-8: search_performed event emission ---

describe("AC-8: search_performed event", () => {
  it("emits with correct payload including sessionId for authenticated user", async () => {
    const emitted: unknown[] = []
    const bus = new InProcessEventBus({
      logError: async () => {},
      consumerMatrix: {
        ...emptyConsumerMatrix,
        search_performed: [{
          consumer: "test.capture",
          domain: "platform" as const,
          mode: "async" as const,
        }],
      },
    })
    bus.on({
      domain: "platform",
      eventType: "search_performed",
      mode: "async",
      handler: async (payload) => { emitted.push(payload) },
    })
    const { waitUntilFn, getPromises } = createWaitUntilCollector()
    const searchRouter = createSearchRouter({ db, bus, waitUntilFn })
    const caller = searchRouter.createCaller(ctx(BUYER_SESSION))

    await createTestListing(db, BUYER_ID, { name: "Test Listing" })
    await caller.query({ query: "test" })
    await Promise.all(getPromises())

    expect(emitted).toHaveLength(1)
    const event = emitted[0] as Record<string, unknown>
    expect(event._brand).toBe("SearchPerformedEvent")
    expect(event.query).toBe("test")
    expect(event.sessionId).toBe(BUYER_ID)
    expect(event.timestamp).toBeDefined()
    expect(typeof event.resultCount).toBe("number")
  })

  it("emits with sessionId null for anonymous user", async () => {
    const emitted: unknown[] = []
    const bus = new InProcessEventBus({
      logError: async () => {},
      consumerMatrix: {
        ...emptyConsumerMatrix,
        search_performed: [{
          consumer: "test.capture",
          domain: "platform" as const,
          mode: "async" as const,
        }],
      },
    })
    bus.on({
      domain: "platform",
      eventType: "search_performed",
      mode: "async",
      handler: async (payload) => { emitted.push(payload) },
    })
    const { waitUntilFn, getPromises } = createWaitUntilCollector()
    const searchRouter = createSearchRouter({ db, bus, waitUntilFn })
    const caller = searchRouter.createCaller(ctx(null))

    await createTestListing(db, BUYER_ID, { name: "Test Listing" })
    await caller.query({ query: "test" })
    await Promise.all(getPromises())

    expect(emitted).toHaveLength(1)
    const event = emitted[0] as Record<string, unknown>
    expect(event.sessionId).toBeNull()
  })

  it("emits query as empty string for filter-only searches, not undefined", async () => {
    const emitted: unknown[] = []
    const bus = new InProcessEventBus({
      logError: async () => {},
      consumerMatrix: {
        ...emptyConsumerMatrix,
        search_performed: [{
          consumer: "test.capture",
          domain: "platform" as const,
          mode: "async" as const,
        }],
      },
    })
    bus.on({
      domain: "platform",
      eventType: "search_performed",
      mode: "async",
      handler: async (payload) => { emitted.push(payload) },
    })
    const { waitUntilFn, getPromises } = createWaitUntilCollector()
    const searchRouter = createSearchRouter({ db, bus, waitUntilFn })
    const caller = searchRouter.createCaller(ctx(null))

    await createTestListing(db, BUYER_ID, { name: "Any Co", baseRegion: "London" })
    await caller.query({ filters: { location: "London" } })
    await Promise.all(getPromises())

    const event = emitted[0] as Record<string, unknown>
    expect(event.query).toBe("")
    expect(typeof event.query).toBe("string")
  })
})

// --- AC-9: Search history recording ---

describe("AC-9: search history for authenticated users", () => {
  it("inserts search_history row for authenticated user", async () => {
    const bus = makeBus()
    const { waitUntilFn } = createWaitUntilCollector()
    const searchRouter = createSearchRouter({ db, bus, waitUntilFn })
    const caller = searchRouter.createCaller(ctx(BUYER_SESSION))

    await createTestListing(db, BUYER_ID, { name: "Test Co" })
    await caller.query({ query: "test" })

    const rows = await db.select().from(searchHistory)
    expect(rows).toHaveLength(1)
    expect(rows[0].accountId).toBe(BUYER_ID)
    expect(rows[0].query).toBe("test")
    expect(typeof rows[0].resultCount).toBe("number")
  })

  it("does NOT insert search_history for anonymous user", async () => {
    const bus = makeBus()
    const { waitUntilFn } = createWaitUntilCollector()
    const searchRouter = createSearchRouter({ db, bus, waitUntilFn })
    const caller = searchRouter.createCaller(ctx(null))

    await createTestListing(db, BUYER_ID, { name: "Test Co" })
    await caller.query({ query: "test" })

    const rows = await db.select().from(searchHistory)
    expect(rows).toHaveLength(0)
  })
})

// --- AC-10: Active-only + no subscriptionTier in response ---

describe("AC-10: active-only results, no subscriptionTier in response", () => {
  it("excludes archived and suspended listings", async () => {
    await createTestListing(db, BUYER_ID, { name: "Active Co" })
    await createTestListing(db, BUYER_ID, { name: "Archived Co", lifecycleStatus: "archived" })
    await createTestListing(db, BUYER_ID, { name: "Suspended Co", lifecycleStatus: "suspended" })

    const caller = createRouter()(ctx(null))
    const result = await caller.query({})

    expect(result.totalCount).toBe(1)
    expect(result.results[0].name).toBe("Active Co")
  })

  it("subscriptionTier is never in the response payload [PP-33]", async () => {
    await createTestListing(db, BUYER_ID, { name: "Premium Co", subscriptionTier: "premium" })

    const caller = createRouter()(ctx(null))
    const result = await caller.query({})

    expect(result.results).toHaveLength(1)
    // Verify subscriptionTier is not a key on the returned object
    const keys = Object.keys(result.results[0])
    expect(keys).not.toContain("subscriptionTier")
  })
})
