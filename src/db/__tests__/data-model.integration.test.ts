// CS-WORK-007: Data model schema and seed — AC-01 through AC-10
// All 10 AC are integration tests against local Supabase Postgres.

import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { getTestDb, resetDb, closeTestDb } from "@/db/test-utils"
import { eq, count } from "drizzle-orm"
import {
  listings,
  verifications,
  qualityScores,
  engagements,
  qualityScoreExplanations,
  credits,
  mediaItems,
  socialProfiles,
  accreditations,
  pendingEnquiries,
  preClaimSnapshots,
  listingTaxonomyTags,
  taxonomySectors,
  taxonomyServiceAreas,
  taxonomySpecialisations,
  additionalLocations,
} from "@/db/schema/data-and-listings"
import { accountProfiles } from "@/db/schema/accounts"
import { seedTaxonomy } from "@/db/seed/taxonomy"
import { createTestMedia, createTestCredit } from "@/db/test-fixtures"
import { user } from "@/db/schema/auth"

afterAll(async () => {
  await closeTestDb()
})

// Helper: create a test user (Better Auth user table)
async function createTestUser(id: string, email: string) {
  const db = getTestDb()
  await db.insert(user).values({
    id,
    name: "Test User",
    email,
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  })
  return id
}

// Helper: create a listing with required fields
async function createTestListing(overrides: Partial<typeof listings.$inferInsert> = {}) {
  const db = getTestDb()
  const slug = `test-listing-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const [row] = await db
    .insert(listings)
    .values({
      entityType: "company",
      slug,
      name: "Test Listing",
      ...overrides,
    })
    .returning()
  return row
}

// Helper: create listing + zero-initialised one-to-one rows (two-phase pattern, S1 §10)
async function createListingWithRelations(overrides: Partial<typeof listings.$inferInsert> = {}) {
  const listing = await createTestListing(overrides)
  const db = getTestDb()
  await db.insert(verifications).values({ listingId: listing.id })
  await db.insert(qualityScores).values({ listingId: listing.id })
  await db.insert(qualityScoreExplanations).values({
    listingId: listing.id,
    explanation: { composite: 0, dimensions: [], topImprovements: [] },
  })
  await db.insert(engagements).values({ listingId: listing.id })
  return listing
}

describe("CS-WORK-007: Data model schema and seed", () => {
  beforeEach(async () => {
    await resetDb()
  })

  // --- AC-01 ---
  it("AC-01: Listing created with all required fields; claimStatus defaults to unclaimed, subscriptionTier to free", async () => {
    const listing = await createTestListing()

    expect(listing.claimStatus).toBe("unclaimed")
    expect(listing.subscriptionTier).toBe("free")
    expect(listing.lifecycleStatus).toBe("active")
    expect(listing.entityType).toBe("company")
    expect(listing.slug).toBeDefined()
    expect(listing.name).toBe("Test Listing")
    expect(listing.id).toBeDefined()
    expect(listing.createdAt).toBeInstanceOf(Date)
    expect(listing.updatedAt).toBeInstanceOf(Date)
  })

  // --- AC-02 ---
  it("AC-02: Listing with accountId = null (unclaimed) persists and queries correctly", async () => {
    const listing = await createTestListing({ accountId: null })

    expect(listing.accountId).toBeNull()

    const db = getTestDb()
    const [fetched] = await db
      .select()
      .from(listings)
      .where(eq(listings.id, listing.id))

    expect(fetched.accountId).toBeNull()
    expect(fetched.claimStatus).toBe("unclaimed")
  })

  // --- AC-03 ---
  it("AC-03: Verification table created with listing; defaults to tier = unclaimed, verificationScore = 0", async () => {
    const listing = await createTestListing()
    const db = getTestDb()

    await db.insert(verifications).values({ listingId: listing.id })

    const [v] = await db
      .select()
      .from(verifications)
      .where(eq(verifications.listingId, listing.id))

    expect(v.tier).toBe("unclaimed")
    expect(v.verificationScore).toBe(0)
    expect(v.claimedAt).toBeNull()
    expect(v.verifiedAt).toBeNull()
    expect(v.verificationMethods).toEqual([])
  })

  // --- AC-04 ---
  it("AC-04: Quality score table created with listing; all dimensions default to 0, composite = 0", async () => {
    const listing = await createTestListing()
    const db = getTestDb()

    await db.insert(qualityScores).values({ listingId: listing.id })

    const [qs] = await db
      .select()
      .from(qualityScores)
      .where(eq(qualityScores.listingId, listing.id))

    expect(qs.completeness).toBe(0)
    expect(qs.freshness).toBe(0)
    expect(qs.accuracy).toBe(0)
    expect(qs.richness).toBe(0)
    expect(qs.verification).toBe(0)
    expect(qs.composite).toBe(0)
  })

  // --- AC-05 ---
  it("AC-05: Engagement counters table created with listing; all counters default to 0", async () => {
    const listing = await createTestListing()
    const db = getTestDb()

    await db.insert(engagements).values({ listingId: listing.id })

    const [e] = await db
      .select()
      .from(engagements)
      .where(eq(engagements.listingId, listing.id))

    expect(e.profileViews).toBe(0)
    expect(e.searchAppearances).toBe(0)
    expect(e.enquiriesReceived).toBe(0)
    expect(e.enquiryResponseRate).toBeNull()
    expect(e.enquiryResponseTime).toBeNull()
  })

  // --- AC-06 ---
  it("AC-06: Account profile created on signup; email preferences default to all-true", async () => {
    const userId = await createTestUser("user-ac06", "ac06@test.com")
    const db = getTestDb()

    await db.insert(accountProfiles).values({
      accountId: userId,
      fullName: "Test User",
    })

    const [profile] = await db
      .select()
      .from(accountProfiles)
      .where(eq(accountProfiles.accountId, userId))

    expect(profile.emailPreferences).toEqual({
      enquiry_notification: true,
      listing_status: true,
      profile_nudge: true,
      conversion_marketing: true,
    })
  })

  // --- AC-07 ---
  it("AC-07: Taxonomy hierarchy seed: 7 sectors, ~64 service areas, ~269 specialisations", async () => {
    const db = getTestDb()
    await seedTaxonomy(db)

    const [sectorCount] = await db.select({ value: count() }).from(taxonomySectors)
    const [saCount] = await db.select({ value: count() }).from(taxonomyServiceAreas)
    const [specCount] = await db.select({ value: count() }).from(taxonomySpecialisations)

    expect(sectorCount.value).toBe(7)
    expect(saCount.value).toBeGreaterThanOrEqual(51)
    expect(specCount.value).toBeGreaterThanOrEqual(209)
  })

  // --- AC-08 ---
  it("AC-08: Taxonomy seed is idempotent (ON CONFLICT DO NOTHING)", async () => {
    const db = getTestDb()

    // Seed twice — counts must be identical
    await seedTaxonomy(db)
    await seedTaxonomy(db)

    const [sectorCount] = await db.select({ value: count() }).from(taxonomySectors)
    const [saCount] = await db.select({ value: count() }).from(taxonomyServiceAreas)
    const [specCount] = await db.select({ value: count() }).from(taxonomySpecialisations)

    expect(sectorCount.value).toBe(7)
    expect(saCount.value).toBeGreaterThanOrEqual(51)
    expect(specCount.value).toBeGreaterThanOrEqual(209)
  })

  // --- AC-09 ---
  it("AC-09: listings.companiesHouseNumber index supports < 10ms lookup", async () => {
    const db = getTestDb()

    // Insert listings with CH numbers
    for (let i = 0; i < 100; i++) {
      await createTestListing({
        companiesHouseNumber: `${10000000 + i}`,
        slug: `ch-test-${i}`,
      })
    }

    const start = performance.now()
    const result = await db
      .select()
      .from(listings)
      .where(eq(listings.companiesHouseNumber, "10000050"))
    const elapsed = performance.now() - start

    expect(result).toHaveLength(1)
    expect(elapsed).toBeLessThan(10)
  })

  // --- AC-10 ---
  it("AC-10: Cascade delete: listing deletion cascades to verification, quality score, engagement, taxonomy tags, credits, media, social profiles, accreditations, pending enquiries, pre-claim snapshot", async () => {
    const db = getTestDb()

    // Seed taxonomy for tag insertion
    const [sector] = await db
      .insert(taxonomySectors)
      .values({ name: "Test Sector", slug: "test-sector" })
      .returning()
    const [sa] = await db
      .insert(taxonomyServiceAreas)
      .values({ sectorId: sector.id, name: "Test SA", slug: "test-sa" })
      .returning()

    // Create listing with all related rows
    const listing = await createListingWithRelations()

    await db.insert(listingTaxonomyTags).values({
      listingId: listing.id,
      sectorId: sector.id,
      serviceAreaId: sa.id,
    })
    await createTestCredit(db, listing.id, { projectName: "Test Project", roleProvided: "DoP", year: 2024 })
    await createTestMedia(db, listing.id, { type: "logo", url: "https://example.com/logo.png" })
    await db.insert(socialProfiles).values({
      listingId: listing.id,
      platform: "linkedin",
      url: "https://linkedin.com/test",
    })
    await db.insert(accreditations).values({
      listingId: listing.id,
      body: "BECTU",
    })
    await db.insert(pendingEnquiries).values({
      listingId: listing.id,
      enquiryId: "00000000-0000-0000-0000-000000000001",
      expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
    })
    await db.insert(preClaimSnapshots).values({
      listingId: listing.id,
      snapshot: { name: listing.name },
    })
    await db.insert(additionalLocations).values({
      listingId: listing.id,
      name: "Secondary Office",
    })

    // Delete the listing
    await db.delete(listings).where(eq(listings.id, listing.id))

    // Verify all related rows are gone
    const [vCount] = await db.select({ value: count() }).from(verifications).where(eq(verifications.listingId, listing.id))
    const [qsCount] = await db.select({ value: count() }).from(qualityScores).where(eq(qualityScores.listingId, listing.id))
    const [eCount] = await db.select({ value: count() }).from(engagements).where(eq(engagements.listingId, listing.id))
    const [tagCount] = await db.select({ value: count() }).from(listingTaxonomyTags).where(eq(listingTaxonomyTags.listingId, listing.id))
    const [creditCount] = await db.select({ value: count() }).from(credits).where(eq(credits.listingId, listing.id))
    const [mediaCount] = await db.select({ value: count() }).from(mediaItems).where(eq(mediaItems.listingId, listing.id))
    const [socialCount] = await db.select({ value: count() }).from(socialProfiles).where(eq(socialProfiles.listingId, listing.id))
    const [accredCount] = await db.select({ value: count() }).from(accreditations).where(eq(accreditations.listingId, listing.id))
    const [peCount] = await db.select({ value: count() }).from(pendingEnquiries).where(eq(pendingEnquiries.listingId, listing.id))
    const [snapCount] = await db.select({ value: count() }).from(preClaimSnapshots).where(eq(preClaimSnapshots.listingId, listing.id))
    const [locCount] = await db.select({ value: count() }).from(additionalLocations).where(eq(additionalLocations.listingId, listing.id))
    const [qseCount] = await db.select({ value: count() }).from(qualityScoreExplanations).where(eq(qualityScoreExplanations.listingId, listing.id))

    expect(vCount.value).toBe(0)
    expect(qsCount.value).toBe(0)
    expect(eCount.value).toBe(0)
    expect(tagCount.value).toBe(0)
    expect(creditCount.value).toBe(0)
    expect(mediaCount.value).toBe(0)
    expect(socialCount.value).toBe(0)
    expect(accredCount.value).toBe(0)
    expect(peCount.value).toBe(0)
    expect(snapCount.value).toBe(0)
    expect(locCount.value).toBe(0)
    expect(qseCount.value).toBe(0)
  })
})
