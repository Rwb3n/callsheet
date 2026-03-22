// CS-WORK-051: Listing profile page and contact feedback integration tests
// AC-11, AC-12, AC-13, AC-14, AC-17, AC-18, AC-19, AC-42, AC-43, AC-44

import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest"
import { eq } from "drizzle-orm"
import { getTestDb, resetDb, closeTestDb } from "@/db/test-utils"
import {
  seedTestUser,
  makeSession,
  ctx,
  createTestListing,
  createUnclaimedListing,
  emptyConsumerMatrix,
} from "@/db/test-fixtures"
import { listings, verifications, qualityScores } from "@/db/schema/data-and-listings"
import { createListingRouter } from "../listing"
import { InProcessEventBus } from "@/lib/events/bus"
import { createWaitUntilCollector } from "@/lib/events/waitUntil"
import type { AuthSession } from "@/lib/auth"
import type { ListingRouterDeps } from "../listing"
import type { CompaniesHouseService } from "@/lib/services/types"
import { inferSource } from "@/domains/platform/buyer/infer-source"
import { resolveProfileCTA } from "@/domains/platform/buyer/resolve-profile-cta"
import { generateJsonLd } from "@/domains/platform/buyer/generate-json-ld"

let db: ReturnType<typeof getTestDb>
let bus: InProcessEventBus
let waitUntilFn: ReturnType<typeof createWaitUntilCollector>["waitUntilFn"]
let getPromises: ReturnType<typeof createWaitUntilCollector>["getPromises"]

const OWNER_ID = "test-owner-profile"
const BUYER_ID = "test-buyer-profile"

const stubCompaniesHouse: CompaniesHouseService = {
  lookup: async () => ({ found: false }),
}

function makeDeps(): ListingRouterDeps {
  return { db, bus, waitUntilFn, companiesHouse: stubCompaniesHouse }
}

function caller(session: AuthSession | null) {
  return createListingRouter(makeDeps()).createCaller(ctx(session))
}

const buyerSession = makeSession({ accountId: BUYER_ID, email: "buyer@profile.com" })
const ownerSession = makeSession({ accountId: OWNER_ID, email: "owner@profile.com" })

beforeAll(async () => {
  db = getTestDb()
})

beforeEach(async () => {
  await resetDb()
  await seedTestUser(db, OWNER_ID, "owner@profile.com")
  await seedTestUser(db, BUYER_ID, "buyer@profile.com")
  bus = new InProcessEventBus({
    logError: async () => {},
    consumerMatrix: emptyConsumerMatrix,
  })
  const collector = createWaitUntilCollector()
  waitUntilFn = collector.waitUntilFn
  getPromises = collector.getPromises
})

afterAll(async () => {
  await closeTestDb()
})

// --- AC-11: Profile page data loading via getBySlug ---

describe("listing.getBySlug — profile data", () => {
  it("returns listing with verification, quality score, and companion data", async () => {
    const listing = await createTestListing(db, OWNER_ID, {
      claimStatus: "claimed",
      headline: "Camera Operator",
      bio: "Experienced camera operator",
    })

    const result = await caller(null).getBySlug({ slug: listing.slug })

    expect(result.listing.id).toBe(listing.id)
    expect(result.listing.name).toBe("Test Company")
    expect(result.verification).toBeTruthy()
    expect(result.qualityScore).toBeTruthy()
  })
})

// --- AC-12: 404 for non-existent, archived, suspended ---

describe("listing.getBySlug — 404 cases", () => {
  it("returns NOT_FOUND for non-existent slug", async () => {
    await expect(
      caller(null).getBySlug({ slug: "non-existent-slug-xyz" }),
    ).rejects.toThrow()
  })

  it("returns NOT_FOUND for archived listing", async () => {
    const listing = await createTestListing(db, OWNER_ID, {
      lifecycleStatus: "archived",
    })

    await expect(
      caller(null).getBySlug({ slug: listing.slug }),
    ).rejects.toThrow()
  })

  it("returns NOT_FOUND for suspended listing", async () => {
    const listing = await createTestListing(db, OWNER_ID, {
      lifecycleStatus: "suspended",
    })

    await expect(
      caller(null).getBySlug({ slug: listing.slug }),
    ).rejects.toThrow()
  })
})

// --- AC-13: CTA resolution ---

describe("resolveProfileCTA", () => {
  it("returns enquire for claimed listings", () => {
    const cta = resolveProfileCTA(
      { id: "1", claimStatus: "claimed", contactEmail: "test@co.com", contactPhone: null, websiteUrl: null },
      null,
    )
    expect(cta.type).toBe("enquire")
    expect(cta.label).toBe("Send Enquiry")
  })

  it("returns enquire with forwarded variant for unclaimed + email", () => {
    const cta = resolveProfileCTA(
      { id: "1", claimStatus: "unclaimed", contactEmail: "test@co.com", contactPhone: null, websiteUrl: null },
      null,
    )
    expect(cta.type).toBe("enquire")
    expect("variant" in cta && cta.variant).toBe("forwarded")
  })

  it("returns claim CTA for unclaimed + no email + phone (claim takes priority)", () => {
    const cta = resolveProfileCTA(
      { id: "1", claimStatus: "unclaimed", contactEmail: null, contactPhone: "020 7946", websiteUrl: null },
      null,
    )
    expect(cta.type).toBe("claim")
    expect(cta.label).toBe("Is this your business? Claim this listing")
  })

  it("returns enquire with silent_queue for disputed", () => {
    const cta = resolveProfileCTA(
      { id: "1", claimStatus: "disputed", contactEmail: null, contactPhone: null, websiteUrl: null },
      null,
    )
    expect(cta.type).toBe("enquire")
    expect("variant" in cta && cta.variant).toBe("silent_queue")
  })

  it("returns claim CTA for unclaimed + no contact", () => {
    const cta = resolveProfileCTA(
      { id: "abc", claimStatus: "unclaimed", contactEmail: null, contactPhone: null, websiteUrl: null },
      null,
    )
    expect(cta.type).toBe("claim")
    expect("target" in cta && cta.target).toBe("/claim/abc")
  })
})

// --- AC-14: Targeted claim CTA ---

describe("resolveProfileCTA — targeted claim", () => {
  it("returns claim_targeted when user domain matches listing website", () => {
    const cta = resolveProfileCTA(
      { id: "abc", claimStatus: "unclaimed", contactEmail: null, contactPhone: null, websiteUrl: "https://acme.co.uk" },
      { email: "bob@acme.co.uk" },
    )
    expect(cta.type).toBe("claim_targeted")
    expect(cta.label).toContain("claim it in 2 minutes")
  })

  it("returns generic claim when domains do not match (claim takes priority over contact)", () => {
    const cta = resolveProfileCTA(
      { id: "abc", claimStatus: "unclaimed", contactEmail: null, contactPhone: null, websiteUrl: "https://acme.co.uk" },
      { email: "bob@other.com" },
    )
    // Claim CTA always shown for unclaimed — contact info visible in listing body
    expect(cta.type).toBe("claim")
  })

  it("returns generic claim when no contact info and no domain match", () => {
    const cta = resolveProfileCTA(
      { id: "abc", claimStatus: "unclaimed", contactEmail: null, contactPhone: null, websiteUrl: null },
      { email: "bob@other.com" },
    )
    expect(cta.type).toBe("claim")
  })

  it("strips www from website domain for comparison", () => {
    const cta = resolveProfileCTA(
      { id: "abc", claimStatus: "unclaimed", contactEmail: null, contactPhone: null, websiteUrl: "https://www.acme.co.uk" },
      { email: "bob@acme.co.uk" },
    )
    expect(cta.type).toBe("claim_targeted")
  })
})

// --- AC-17: JSON-LD ---

describe("generateJsonLd", () => {
  it("produces LocalBusiness for company", () => {
    const ld = generateJsonLd({
      slug: "acme-ltd",
      name: "Acme Ltd",
      entityType: "company",
      headline: null,
      bio: "Film production company",
      logoUrl: "https://r2.co/logo.jpg",
      headshotUrl: null,
      websiteUrl: "https://acme.co.uk",
      contactPhone: "020 7946 0958",
      baseRegion: "London",
      foundedYear: 2010,
      socialProfiles: [{ platform: "linkedin", url: "https://linkedin.com/company/acme" }],
      taxonomyTags: [],
    })

    expect(ld["@type"]).toBe("LocalBusiness")
    expect(ld.name).toBe("Acme Ltd")
    expect(ld.telephone).toBe("020 7946 0958")
    expect(ld.foundingDate).toBe("2010")
    expect(ld.image).toBe("https://r2.co/logo.jpg")
    expect((ld.sameAs as string[]).length).toBe(2) // website + linkedin
  })

  it("produces Person for freelancer", () => {
    const ld = generateJsonLd({
      slug: "jane-doe",
      name: "Jane Doe",
      entityType: "freelancer",
      headline: "DoP",
      bio: "Experienced DoP",
      logoUrl: null,
      headshotUrl: "https://r2.co/headshot.jpg",
      websiteUrl: null,
      contactPhone: null,
      baseRegion: null,
      foundedYear: null,
      socialProfiles: [],
      taxonomyTags: ["Cinematography", "Steadicam"],
    })

    expect(ld["@type"]).toBe("Person")
    expect(ld.name).toBe("Jane Doe")
    expect(ld.jobTitle).toBe("DoP")
    expect(ld.image).toBe("https://r2.co/headshot.jpg")
    expect(ld.knowsAbout).toEqual(["Cinematography", "Steadicam"])
  })
})

// --- AC-18: profile_viewed event payload ---

describe("profile_viewed event emission", () => {
  it("emits profile_viewed with P1-compliant payload", async () => {
    const listing = await createTestListing(db, OWNER_ID, { claimStatus: "claimed" })

    const emitted: unknown[] = []
    bus.on({
      domain: "data-and-listings",
      eventType: "profile_viewed",
      mode: "async",
      handler: async (payload) => { emitted.push(payload) },
    })

    await bus.emit(
      "profile_viewed",
      {
        _brand: "ProfileViewedEvent" as const,
        listingId: listing.id,
        viewerAccountId: BUYER_ID,
        source: "search" as const,
        timestamp: new Date().toISOString(),
      },
      waitUntilFn,
    )
    await Promise.all(getPromises())

    expect(emitted).toHaveLength(1)
    const payload = emitted[0] as Record<string, unknown>
    expect(payload.listingId).toBe(listing.id)
    expect(payload.viewerAccountId).toBe(BUYER_ID)
    expect(payload.source).toBe("search")
    expect(payload.timestamp).toBeTruthy()
  })

  it("accepts null viewerAccountId for anonymous views", async () => {
    const listing = await createTestListing(db, OWNER_ID)

    const emitted: unknown[] = []
    bus.on({
      domain: "data-and-listings",
      eventType: "profile_viewed",
      mode: "async",
      handler: async (payload) => { emitted.push(payload) },
    })

    await bus.emit(
      "profile_viewed",
      {
        _brand: "ProfileViewedEvent" as const,
        listingId: listing.id,
        viewerAccountId: null,
        source: "direct" as const,
        timestamp: new Date().toISOString(),
      },
      waitUntilFn,
    )
    await Promise.all(getPromises())

    expect(emitted).toHaveLength(1)
    expect((emitted[0] as Record<string, unknown>).viewerAccountId).toBeNull()
  })
})

// --- AC-42: Feedback buttons visibility guard ---

describe("listing.reportContactAttempt — visibility guard", () => {
  it("accepts report for unclaimed listing without email", async () => {
    const listing = await createUnclaimedListing(db, {
      contactEmail: null,
      contactPhone: "020 7946 0958",
    })

    const result = await caller(null).reportContactAttempt({
      listingId: listing.id,
      result: "reached",
    })

    expect(result.success).toBe(true)
  })

  it("rejects report for claimed listing", async () => {
    const listing = await createTestListing(db, OWNER_ID, { claimStatus: "claimed" })

    await expect(
      caller(null).reportContactAttempt({ listingId: listing.id, result: "reached" }),
    ).rejects.toThrow("Feedback only available")
  })

  it("rejects report for unclaimed listing WITH email", async () => {
    const listing = await createUnclaimedListing(db, {
      contactEmail: "has@email.com",
    })

    await expect(
      caller(null).reportContactAttempt({ listingId: listing.id, result: "reached" }),
    ).rejects.toThrow("Feedback only available")
  })

  it("rejects report for non-existent listing", async () => {
    await expect(
      caller(null).reportContactAttempt({
        listingId: "00000000-0000-4000-8000-000000000099",
        result: "reached",
      }),
    ).rejects.toThrow()
  })

  it("rejects report for archived listing", async () => {
    const listing = await createUnclaimedListing(db, {
      contactEmail: null,
      lifecycleStatus: "archived",
    })

    await expect(
      caller(null).reportContactAttempt({ listingId: listing.id, result: "reached" }),
    ).rejects.toThrow()
  })
})

// --- AC-43: contact_attempt event payload ---

describe("listing.reportContactAttempt — event emission", () => {
  it('emits contact_attempt with result: "reached"', async () => {
    const listing = await createUnclaimedListing(db, {
      contactEmail: null,
      contactPhone: "020 7946 0958",
    })

    const emitted: unknown[] = []
    bus.on({
      domain: "data-and-listings",
      eventType: "contact_attempt",
      mode: "async",
      handler: async (payload) => { emitted.push(payload) },
    })

    await caller(null).reportContactAttempt({ listingId: listing.id, result: "reached" })
    await Promise.all(getPromises())

    expect(emitted).toHaveLength(1)
    const payload = emitted[0] as Record<string, unknown>
    expect(payload.listingId).toBe(listing.id)
    expect(payload.result).toBe("reached")
    expect(payload.timestamp).toBeTruthy()
  })

  it('emits contact_attempt with result: "unreachable"', async () => {
    const listing = await createUnclaimedListing(db, {
      contactEmail: null,
      contactPhone: "020 7946 0958",
    })

    const emitted: unknown[] = []
    bus.on({
      domain: "data-and-listings",
      eventType: "contact_attempt",
      mode: "async",
      handler: async (payload) => { emitted.push(payload) },
    })

    await caller(null).reportContactAttempt({ listingId: listing.id, result: "unreachable" })
    await Promise.all(getPromises())

    expect(emitted).toHaveLength(1)
    expect((emitted[0] as Record<string, unknown>).result).toBe("unreachable")
  })

  it("emits with reporterAccountId when authenticated", async () => {
    const listing = await createUnclaimedListing(db, {
      contactEmail: null,
      contactPhone: "020 7946 0958",
    })

    const emitted: unknown[] = []
    bus.on({
      domain: "data-and-listings",
      eventType: "contact_attempt",
      mode: "async",
      handler: async (payload) => { emitted.push(payload) },
    })

    await caller(buyerSession).reportContactAttempt({ listingId: listing.id, result: "reached" })
    await Promise.all(getPromises())

    expect(emitted).toHaveLength(1)
    expect((emitted[0] as Record<string, unknown>).reporterAccountId).toBe(BUYER_ID)
  })

  it("emits with reporterAccountId: null for anonymous", async () => {
    const listing = await createUnclaimedListing(db, {
      contactEmail: null,
      contactPhone: "020 7946 0958",
    })

    const emitted: unknown[] = []
    bus.on({
      domain: "data-and-listings",
      eventType: "contact_attempt",
      mode: "async",
      handler: async (payload) => { emitted.push(payload) },
    })

    await caller(null).reportContactAttempt({ listingId: listing.id, result: "reached" })
    await Promise.all(getPromises())

    expect(emitted).toHaveLength(1)
    expect((emitted[0] as Record<string, unknown>).reporterAccountId).toBeNull()
  })
})

// --- AC-15: Verification badge display logic ---

describe("verification badge display", () => {
  it("returns correct tier from getBySlug for verified listing", async () => {
    const listing = await createTestListing(db, OWNER_ID, { claimStatus: "claimed" })
    await db
      .update(verifications)
      .set({ tier: "verified" })
      .where(eq(verifications.listingId, listing.id))

    const result = await caller(null).getBySlug({ slug: listing.slug })
    expect(result.verification.tier).toBe("verified")
  })

  it("returns unclaimed tier for seeded listing", async () => {
    const listing = await createUnclaimedListing(db)

    const result = await caller(null).getBySlug({ slug: listing.slug })
    expect(result.verification.tier).toBe("unclaimed")
  })
})

// --- Quality score display (AC-15 extension) ---

describe("quality score display", () => {
  it("returns quality score data from getBySlug", async () => {
    const listing = await createTestListing(db, OWNER_ID, { qualityComposite: 75 })

    const result = await caller(null).getBySlug({ slug: listing.slug })
    expect(result.qualityScore.composite).toBe(75)
  })
})
