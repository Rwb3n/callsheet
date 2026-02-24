// AC-11 through AC-15: Full-text search integration tests
// Tests run against local Supabase Postgres with pg_trgm and tsvector trigger.

import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest"
import { eq, sql } from "drizzle-orm"
import { getTestDb, resetDb, closeTestDb } from "@/db/test-utils"
import {
  createTestListing,
  seedUsers,
  seedTaxonomy,
  setQuality,
} from "@/db/test-fixtures"
import {
  listings,
  listingTaxonomyTags,
  searchSynonyms,
} from "@/db/schema/data-and-listings"
import { executeSearch } from "@/lib/search"
import { expandQuery } from "@/lib/search/synonyms"

let db: ReturnType<typeof getTestDb>

const ACCOUNT_ID = "test-account-search"

beforeAll(async () => {
  db = getTestDb()
})

beforeEach(async () => {
  await resetDb()
  await seedUsers(db, [
    { id: ACCOUNT_ID, name: "Search User", email: "search@example.com" },
  ])
})

afterAll(async () => {
  await closeTestDb()
})

// --- AC-11: Search vector auto-updates on name/headline/bio/region change ---

describe("AC-11: search vector trigger", () => {
  it("populates search vector on insert with name", async () => {
    const listing = await createTestListing(db, ACCOUNT_ID, { name: "Steadicam Operator" })

    const [row] = await db
      .select({ match: sql<boolean>`search_vector @@ plainto_tsquery('english', 'steadicam')` })
      .from(listings)
      .where(eq(listings.id, listing.id))

    expect(row.match).toBe(true)
  })

  it("updates search vector when name changes", async () => {
    const listing = await createTestListing(db, ACCOUNT_ID, { name: "Alice Smith" })

    const [before] = await db
      .select({ match: sql<boolean>`search_vector @@ plainto_tsquery('english', 'alice')` })
      .from(listings)
      .where(eq(listings.id, listing.id))
    expect(before.match).toBe(true)

    await db.update(listings).set({ name: "Bob Jones" }).where(eq(listings.id, listing.id))

    const [afterOld] = await db
      .select({ match: sql<boolean>`search_vector @@ plainto_tsquery('english', 'alice')` })
      .from(listings)
      .where(eq(listings.id, listing.id))
    expect(afterOld.match).toBe(false)

    const [afterNew] = await db
      .select({ match: sql<boolean>`search_vector @@ plainto_tsquery('english', 'bob')` })
      .from(listings)
      .where(eq(listings.id, listing.id))
    expect(afterNew.match).toBe(true)
  })

  it("includes headline, bio, and region in search vector", async () => {
    const listing = await createTestListing(db, ACCOUNT_ID, {
      name: "GenericCo",
      headline: "Award-winning cinematography",
      bio: "Specialising in documentary filmmaking",
      baseRegion: "Manchester",
    })

    const checks = ["cinematography", "documentary", "manchester"]
    for (const term of checks) {
      const [row] = await db
        .select({ match: sql<boolean>`search_vector @@ plainto_tsquery('english', ${term})` })
        .from(listings)
        .where(eq(listings.id, listing.id))
      expect(row.match).toBe(true)
    }
  })
})

// --- AC-12: Full-text search ranked by ts_rank_cd * quality/paid boost ---

describe("AC-12: ranked search", () => {
  it("ranks results by ts_rank_cd combined with quality and paid boost", async () => {
    const a = await createTestListing(db, ACCOUNT_ID, { name: "Cinematographer Alpha", subscriptionTier: "free" })
    await setQuality(db, a.id, 30)

    const b = await createTestListing(db, ACCOUNT_ID, { name: "Cinematographer Beta", subscriptionTier: "premium" })
    await setQuality(db, b.id, 80)

    const c = await createTestListing(db, ACCOUNT_ID, { name: "Cinematographer Gamma", subscriptionTier: "standard" })
    await setQuality(db, c.id, 50)

    const result = await executeSearch(db, { query: "cinematographer" })

    expect(result.items.length).toBe(3)
    expect(result.items[0].id).toBe(b.id)
    expect(result.items[1].id).toBe(c.id)
    expect(result.items[2].id).toBe(a.id)

    for (let i = 1; i < result.items.length; i++) {
      expect(result.items[i - 1].rank).toBeGreaterThanOrEqual(result.items[i].rank)
    }
  })

  it("excludes archived listings from search results", async () => {
    await createTestListing(db, ACCOUNT_ID, { name: "Active Cinematographer" })
    await createTestListing(db, ACCOUNT_ID, { name: "Archived Cinematographer", lifecycleStatus: "archived" })

    const result = await executeSearch(db, { query: "cinematographer" })
    expect(result.items.length).toBe(1)
    expect(result.items[0].name).toBe("Active Cinematographer")
  })
})

// --- AC-13: Trigram fuzzy matching ---

describe("AC-13: trigram fuzzy search", () => {
  it("returns fuzzy matches when FTS finds no results via trigram similarity", async () => {
    await createTestListing(db, ACCOUNT_ID, { name: "Steadicam Operator" })

    const result = await executeSearch(db, { query: "Steadycam" })

    expect(result.items.length).toBeGreaterThanOrEqual(1)
    expect(result.items[0].name).toBe("Steadicam Operator")
  })

  it("returns no results when similarity is below threshold", async () => {
    await createTestListing(db, ACCOUNT_ID, { name: "Steadicam Operator" })

    const result = await executeSearch(db, { query: "zzzzxyyy" })
    expect(result.items.length).toBe(0)
  })
})

// --- AC-14: Taxonomy tag filtering ---

describe("AC-14: taxonomy filtering", () => {
  it("filters by sectorId — returns only matching listings", async () => {
    const tax = await seedTaxonomy(db)

    const cameraListing = await createTestListing(db, ACCOUNT_ID, { name: "Camera Person" })
    await db.insert(listingTaxonomyTags).values({
      listingId: cameraListing.id,
      sectorId: tax.camera.id,
      serviceAreaId: tax.cinematography.id,
    })

    const soundListing = await createTestListing(db, ACCOUNT_ID, { name: "Sound Recordist" })
    await db.insert(listingTaxonomyTags).values({
      listingId: soundListing.id,
      sectorId: tax.sound.id,
      serviceAreaId: tax.soundRecording.id,
    })

    const result = await executeSearch(db, {
      query: "",
      filters: { sectorId: tax.camera.id },
    })

    expect(result.items.length).toBe(1)
    expect(result.items[0].id).toBe(cameraListing.id)
  })

  it("filters by serviceAreaId — returns only matching listings", async () => {
    const tax = await seedTaxonomy(db)

    const cameraListing = await createTestListing(db, ACCOUNT_ID, { name: "Cinematographer Expert" })
    await db.insert(listingTaxonomyTags).values({
      listingId: cameraListing.id,
      sectorId: tax.camera.id,
      serviceAreaId: tax.cinematography.id,
    })

    const soundListing = await createTestListing(db, ACCOUNT_ID, { name: "Sound Expert" })
    await db.insert(listingTaxonomyTags).values({
      listingId: soundListing.id,
      sectorId: tax.sound.id,
      serviceAreaId: tax.soundRecording.id,
    })

    const result = await executeSearch(db, {
      query: "",
      filters: { serviceAreaId: tax.soundRecording.id },
    })

    expect(result.items.length).toBe(1)
    expect(result.items[0].id).toBe(soundListing.id)
  })

  it("combines FTS query with taxonomy filter", async () => {
    const tax = await seedTaxonomy(db)

    const match = await createTestListing(db, ACCOUNT_ID, { name: "Expert Cinematographer" })
    await db.insert(listingTaxonomyTags).values({
      listingId: match.id,
      sectorId: tax.camera.id,
      serviceAreaId: tax.cinematography.id,
    })

    const noMatch = await createTestListing(db, ACCOUNT_ID, { name: "Expert Cinematographer Sound" })
    await db.insert(listingTaxonomyTags).values({
      listingId: noMatch.id,
      sectorId: tax.sound.id,
      serviceAreaId: tax.soundRecording.id,
    })

    const result = await executeSearch(db, {
      query: "cinematographer",
      filters: { sectorId: tax.camera.id },
    })

    expect(result.items.length).toBe(1)
    expect(result.items[0].id).toBe(match.id)
  })
})

// --- AC-15: Empty query returns all active sorted by composite quality ---

describe("AC-15: empty query", () => {
  it("returns all active listings sorted by composite quality score descending", async () => {
    const a = await createTestListing(db, ACCOUNT_ID, { name: "Low Quality" })
    await setQuality(db, a.id, 20)

    const b = await createTestListing(db, ACCOUNT_ID, { name: "High Quality" })
    await setQuality(db, b.id, 80)

    const c = await createTestListing(db, ACCOUNT_ID, { name: "Mid Quality" })
    await setQuality(db, c.id, 50)

    const result = await executeSearch(db, { query: "" })

    expect(result.items.length).toBe(3)
    expect(result.items[0].id).toBe(b.id)
    expect(result.items[1].id).toBe(c.id)
    expect(result.items[2].id).toBe(a.id)
  })

  it("excludes archived listings", async () => {
    await createTestListing(db, ACCOUNT_ID, { name: "Active One" })
    await createTestListing(db, ACCOUNT_ID, { name: "Archived One", lifecycleStatus: "archived" })

    const result = await executeSearch(db, { query: "" })
    expect(result.items.length).toBe(1)
    expect(result.items[0].name).toBe("Active One")
  })

  it("returns total count and pagination", async () => {
    for (let i = 0; i < 5; i++) {
      await createTestListing(db, ACCOUNT_ID, { name: `Listing ${i}` })
    }

    const page1 = await executeSearch(db, { query: "", limit: 2, page: 1 })
    expect(page1.items.length).toBe(2)
    expect(page1.total).toBe(5)
    expect(page1.page).toBe(1)

    const page2 = await executeSearch(db, { query: "", limit: 2, page: 2 })
    expect(page2.items.length).toBe(2)
    expect(page2.page).toBe(2)
  })

  it("returns fewer items on last page", async () => {
    for (let i = 0; i < 5; i++) {
      await createTestListing(db, ACCOUNT_ID, { name: `Listing ${i}` })
    }

    const lastPage = await executeSearch(db, { query: "", limit: 2, page: 3 })
    expect(lastPage.items.length).toBe(1)
    expect(lastPage.total).toBe(5)
    expect(lastPage.page).toBe(3)
  })

  it("returns empty items for page beyond total", async () => {
    for (let i = 0; i < 3; i++) {
      await createTestListing(db, ACCOUNT_ID, { name: `Listing ${i}` })
    }

    const beyond = await executeSearch(db, { query: "", limit: 2, page: 10 })
    expect(beyond.items.length).toBe(0)
    expect(beyond.total).toBe(3)
    expect(beyond.page).toBe(10)
  })
})

// --- Synonym expansion ---

describe("synonym expansion", () => {
  it("expands query terms using synonyms table", async () => {
    await db.insert(searchSynonyms).values([
      { term: "gaffer", synonym: "lighting technician", weight: 1.0 },
      { term: "gaffer", synonym: "chief lighting", weight: 0.8 },
    ])

    const expanded = await expandQuery(db, "gaffer")
    expect(expanded).toContain("gaffer")
    expect(expanded).toContain("lighting technician")
    expect(expanded).toContain("chief lighting")
  })

  it("returns original term when no synonyms exist", async () => {
    const expanded = await expandQuery(db, "cinematographer")
    expect(expanded).toBe("cinematographer")
  })

  it("returns empty string for empty query", async () => {
    const expanded = await expandQuery(db, "")
    expect(expanded).toBe("")
  })
})
