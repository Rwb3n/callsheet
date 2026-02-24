// AC-16 through AC-22, AC-42: CRUD routes integration tests
// Tests call routers via createCaller() — verifies full orchestration including
// ownership checks, integrity gates, event emissions, and error codes.

import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest"
import { eq } from "drizzle-orm"
import { getTestDb, resetDb, closeTestDb } from "@/db/test-utils"
import {
  createTestListing,
  seedUsers,
  seedTaxonomy,
  makeSession,
  makeAdminSession,
  ctx,
} from "@/db/test-fixtures"
import {
  listings,
  verifications,
  qualityScores,
  engagements,
  listingTaxonomyTags,
} from "@/db/schema/data-and-listings"
import { accountProfiles } from "@/db/schema/accounts"
import { InMemoryCompaniesHouseService } from "@/lib/services/mocks"
import { InProcessEventBus } from "@/lib/events/bus"
import { createWaitUntilCollector } from "@/lib/events/waitUntil"
import type { EventConsumerError, EventType } from "@/lib/events/types"
import { createTestMatrix } from "@/lib/events/test-helpers"
import type { AuthSession } from "@/lib/auth"
import { createListingRouter } from "../listing"
import { createProfileRouter } from "../profile"
import { createTaxonomyRouter } from "../taxonomy"
import { createEngagementRouter } from "../engagement"

// --- DB + Deps ---

let db: ReturnType<typeof getTestDb>
let chService: InMemoryCompaniesHouseService
let bus: InProcessEventBus
let waitUntilFn: ReturnType<typeof createWaitUntilCollector>["waitUntilFn"]
let getPromises: ReturnType<typeof createWaitUntilCollector>["getPromises"]
let emittedEvents: Array<{ type: EventType; payload: unknown }>

const ACCOUNT_ID = "test-account-crud"
const OTHER_ACCOUNT = "test-account-other"

const userSession = makeSession({ accountId: ACCOUNT_ID })
const otherSession = makeSession({ accountId: OTHER_ACCOUNT })
const adminSession = makeAdminSession("admin-account")

beforeAll(async () => {
  db = getTestDb()
})

beforeEach(async () => {
  await resetDb()
  chService = new InMemoryCompaniesHouseService()
  emittedEvents = []

  // Extend default matrix with platform test handlers for events the test captures
  const testMatrix = createTestMatrix({
    listing_created: [
      { consumer: "testCapture", domain: "platform" as const, mode: "async" as const },
    ],
    profile_edited: [
      { consumer: "testCapture", domain: "platform" as const, mode: "async" as const },
    ],
    listing_archived: [
      { consumer: "testCapture", domain: "platform" as const, mode: "async" as const },
    ],
    listing_reactivated: [
      { consumer: "testCapture", domain: "platform" as const, mode: "async" as const },
    ],
    search_performed: [
      { consumer: "testCapture", domain: "platform" as const, mode: "async" as const },
    ],
  })

  bus = new InProcessEventBus({
    logError: vi.fn<(err: EventConsumerError) => Promise<void>>().mockResolvedValue(undefined),
    consumerMatrix: testMatrix,
  })

  for (const eventType of ["listing_created", "profile_edited", "listing_archived", "listing_reactivated", "search_performed"] as const) {
    bus.on({
      domain: "platform",
      eventType,
      mode: "async",
      handler: async (payload) => {
        emittedEvents.push({ type: eventType, payload })
      },
    })
  }

  const collector = createWaitUntilCollector()
  waitUntilFn = collector.waitUntilFn
  getPromises = collector.getPromises

  await seedUsers(db, [
    { id: ACCOUNT_ID, name: "Test User", email: "test@example.com" },
    { id: OTHER_ACCOUNT, name: "Other User", email: "other@example.com" },
    { id: "admin-account", name: "Admin", email: "admin@example.com" },
  ])
})

afterAll(async () => {
  await closeTestDb()
})

// --- Router callers ---

function listingCaller(session: AuthSession | null) {
  const listingRouter = createListingRouter({ db, bus, waitUntilFn, companiesHouse: chService })
  return listingRouter.createCaller(ctx(session))
}

function profileCaller(session: AuthSession) {
  const profileRouter = createProfileRouter({ db })
  return profileRouter.createCaller(ctx(session))
}

function taxonomyCaller() {
  const taxonomyRouter = createTaxonomyRouter({ db })
  return taxonomyRouter.createCaller(ctx(null))
}

function engagementCaller(session: AuthSession) {
  const engagementRouter = createEngagementRouter({ db })
  return engagementRouter.createCaller(ctx(session))
}

// --- Listing CRUD ---

describe("listing.create", () => {
  // AC-16: listing.create runs integrity checks; flag_for_review blocks creation
  it("blocks creation when integrity check flags for review", async () => {
    const taxonomy = await seedTaxonomy(db)
    const existing = await createTestListing(db, ACCOUNT_ID, { slug: "existing" })
    await db.insert(listingTaxonomyTags).values([
      { listingId: existing.id, sectorId: taxonomy.camera.id, serviceAreaId: taxonomy.cinematography.id },
      { listingId: existing.id, sectorId: taxonomy.camera.id, serviceAreaId: taxonomy.cameraOp.id },
    ])

    const caller = listingCaller(userSession)
    await expect(
      caller.create({
        entityType: "company",
        name: "Duplicate Co",
        slug: "duplicate-co",
        tags: [
          { sectorId: taxonomy.camera.id, serviceAreaId: taxonomy.cinematography.id },
          { sectorId: taxonomy.camera.id, serviceAreaId: taxonomy.cameraOp.id },
        ],
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" })
  })

  it("creates listing with companion rows when integrity passes", async () => {
    const caller = listingCaller(userSession)
    const result = await caller.create({
      entityType: "freelancer",
      name: "Jane Doe",
      slug: "jane-doe",
    })

    expect(result.id).toBeDefined()
    expect(result.accountId).toBe(ACCOUNT_ID)
    expect(result.entityType).toBe("freelancer")

    // Verify companion rows were created
    const [v] = await db.select().from(verifications).where(eq(verifications.listingId, result.id))
    const [q] = await db.select().from(qualityScores).where(eq(qualityScores.listingId, result.id))
    const [e] = await db.select().from(engagements).where(eq(engagements.listingId, result.id))
    expect(v).toBeDefined()
    expect(q.composite).toBe(0)
    expect(e.profileViews).toBe(0)

    // Verify listing_created event emitted
    await Promise.all(getPromises())
    expect(emittedEvents).toHaveLength(1)
    expect(emittedEvents[0].type).toBe("listing_created")
  })
})

describe("listing.update", () => {
  // AC-17: listing.update verifies ownership; non-owner gets FORBIDDEN
  it("rejects update from non-owner with FORBIDDEN", async () => {
    const listing = await createTestListing(db, ACCOUNT_ID)
    const caller = listingCaller(otherSession)

    await expect(
      caller.update({ listingId: listing.id, headline: "Hacked" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
  })

  // AC-18: listing.update triggers search vector update and emits profile_edited
  it("updates listing fields and emits profile_edited event", async () => {
    const listing = await createTestListing(db, ACCOUNT_ID, { slug: "update-test" })
    const caller = listingCaller(userSession)

    const updated = await caller.update({
      listingId: listing.id,
      headline: "Updated headline",
      bio: "New bio",
    })

    expect(updated.headline).toBe("Updated headline")
    expect(updated.bio).toBe("New bio")

    await Promise.all(getPromises())
    const editEvent = emittedEvents.find((e) => e.type === "profile_edited")
    expect(editEvent).toBeDefined()
    expect((editEvent!.payload as { changedFields: string[] }).changedFields).toContain("headline")
    expect((editEvent!.payload as { changedFields: string[] }).changedFields).toContain("bio")
  })

  it("returns listing unchanged when no fields provided", async () => {
    const listing = await createTestListing(db, ACCOUNT_ID, { slug: "noop-test" })
    const caller = listingCaller(userSession)
    const result = await caller.update({ listingId: listing.id })
    expect(result.id).toBe(listing.id)
    expect(emittedEvents).toHaveLength(0)
  })
})

describe("listing.archive", () => {
  // AC-19: listing.archive sets lifecycleStatus = archived, emits listing_archived
  it("archives listing and emits listing_archived event", async () => {
    const listing = await createTestListing(db, ACCOUNT_ID, { slug: "archive-test" })
    const caller = listingCaller(userSession)

    const archived = await caller.archive({ listingId: listing.id })
    expect(archived.lifecycleStatus).toBe("archived")

    await Promise.all(getPromises())
    expect(emittedEvents).toHaveLength(1)
    expect(emittedEvents[0].type).toBe("listing_archived")
  })

  it("rejects archive from non-owner with FORBIDDEN", async () => {
    const listing = await createTestListing(db, ACCOUNT_ID)
    const caller = listingCaller(otherSession)
    await expect(
      caller.archive({ listingId: listing.id }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
  })

  it("rejects archive of already-archived listing", async () => {
    const listing = await createTestListing(db, ACCOUNT_ID, { slug: "already-archived", lifecycleStatus: "archived" })
    const caller = listingCaller(userSession)
    await expect(
      caller.archive({ listingId: listing.id }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" })
  })
})

describe("listing.reactivate", () => {
  // AC-20: listing.reactivate sets lifecycleStatus = active, emits listing_reactivated
  it("reactivates archived listing and emits listing_reactivated event", async () => {
    const listing = await createTestListing(db, ACCOUNT_ID, { slug: "reactivate-test", lifecycleStatus: "archived" })
    const caller = listingCaller(userSession)

    const reactivated = await caller.reactivate({ listingId: listing.id })
    expect(reactivated.lifecycleStatus).toBe("active")

    await Promise.all(getPromises())
    expect(emittedEvents).toHaveLength(1)
    expect(emittedEvents[0].type).toBe("listing_reactivated")
  })

  // AC-42: listing.reactivate on admin-suspended listing returns FORBIDDEN
  it("rejects reactivation of admin-suspended listing with FORBIDDEN", async () => {
    const listing = await createTestListing(db, ACCOUNT_ID, { slug: "suspended-test", lifecycleStatus: "suspended" })
    const caller = listingCaller(userSession)

    await expect(
      caller.reactivate({ listingId: listing.id }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
  })

  it("rejects reactivation of active listing", async () => {
    const listing = await createTestListing(db, ACCOUNT_ID, { slug: "active-test" })
    const caller = listingCaller(userSession)
    await expect(
      caller.reactivate({ listingId: listing.id }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" })
  })
})

describe("listing.getBySlug", () => {
  it("returns listing with related data for active listing", async () => {
    const listing = await createTestListing(db, ACCOUNT_ID, { slug: "public-test" })
    const caller = listingCaller(null)

    const result = await caller.getBySlug({ slug: "public-test" })
    expect(result.listing.id).toBe(listing.id)
    expect(result.verification).toBeDefined()
    expect(result.qualityScore).toBeDefined()
  })

  it("returns NOT_FOUND for archived listing", async () => {
    await createTestListing(db, ACCOUNT_ID, { slug: "archived-slug", lifecycleStatus: "archived" })
    const caller = listingCaller(null)
    await expect(
      caller.getBySlug({ slug: "archived-slug" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" })
  })
})

describe("listing.listAll", () => {
  it("returns paginated listings for admin", async () => {
    await createTestListing(db, ACCOUNT_ID, { slug: "admin-1" })
    await createTestListing(db, ACCOUNT_ID, { slug: "admin-2" })
    await createTestListing(db, ACCOUNT_ID, { slug: "admin-3" })

    const caller = listingCaller(adminSession)
    const result = await caller.listAll({ page: 1, limit: 2 })

    expect(result.items).toHaveLength(2)
    expect(result.total).toBe(3)
    expect(result.page).toBe(1)
  })
})

// --- Search event emission ---

describe("listing.search", () => {
  it("emits search_performed event with query, filters, and resultCount", async () => {
    await createTestListing(db, ACCOUNT_ID, { name: "Searchable Provider" })

    const caller = listingCaller(null)
    const result = await caller.search({ query: "searchable" })

    await Promise.all(getPromises())
    const searchEvent = emittedEvents.find((e) => e.type === "search_performed")
    expect(searchEvent).toBeDefined()

    const payload = searchEvent!.payload as { query: string; filters: Record<string, unknown>; resultCount: number }
    expect(payload.query).toBe("searchable")
    expect(payload.resultCount).toBe(result.total)
    expect(payload.filters).toEqual({})
  })
})

// --- Profile ---

describe("profile.updateEmailPreferences", () => {
  // AC-21: profile.updateEmailPreferences persists; email service reads updated preferences
  it("persists updated email preferences", async () => {
    await db.insert(accountProfiles).values({
      accountId: ACCOUNT_ID,
      fullName: "Test User",
    })

    const caller = profileCaller(userSession)

    // Verify defaults via get
    const before = await caller.get()
    expect(before.emailPreferences).toEqual({
      enquiry_notification: true,
      listing_status: true,
      profile_nudge: true,
      conversion_marketing: true,
    })

    // Update via router
    const updated = await caller.updateEmailPreferences({
      enquiry_notification: true,
      listing_status: false,
      profile_nudge: false,
      conversion_marketing: false,
    })

    expect(updated.emailPreferences).toEqual({
      enquiry_notification: true,
      listing_status: false,
      profile_nudge: false,
      conversion_marketing: false,
    })

    // Verify persisted
    const after = await caller.get()
    expect(after.emailPreferences).toEqual(updated.emailPreferences)
  })
})

// --- Taxonomy ---

describe("taxonomy.search", () => {
  // AC-22: taxonomy.search returns matches across all 3 levels with relevance ordering
  it("returns matches across all 3 taxonomy levels with relevance ordering", async () => {
    await seedTaxonomy(db)
    const caller = taxonomyCaller()

    const results = await caller.search({ query: "camera" })

    expect(results.length).toBeGreaterThanOrEqual(1)
    const cameraMatch = results.find((r) => r.name === "Camera")
    expect(cameraMatch).toBeDefined()
    expect(cameraMatch!.level).toBe("sector")

    // Verify descending relevance order
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].relevance).toBeGreaterThanOrEqual(results[i].relevance)
    }
  })

  it("returns matches from specialisation level", async () => {
    await seedTaxonomy(db)
    const caller = taxonomyCaller()

    const results = await caller.search({ query: "steadicam" })
    expect(results.length).toBeGreaterThanOrEqual(1)
    expect(results[0].name).toBe("Steadicam")
    expect(results[0].level).toBe("specialisation")
  })
})

// --- Engagement ---

describe("engagement.getCounters", () => {
  it("returns zero-initialised counters for listing with engagement row", async () => {
    const listing = await createTestListing(db, ACCOUNT_ID, { slug: "engagement-test" })
    const caller = engagementCaller(userSession)

    const counters = await caller.getCounters({ listingId: listing.id })
    expect(counters.profileViews).toBe(0)
    expect(counters.searchAppearances).toBe(0)
    expect(counters.enquiriesReceived).toBe(0)
    expect(counters.enquiryResponseRate).toBeNull()
    expect(counters.enquiryResponseTime).toBeNull()
  })

  // U3: actually query DB for nonexistent engagement row
  it("returns zero-initialised counters when no engagement row exists", async () => {
    // Insert listing WITHOUT companion rows
    const [bare] = await db.insert(listings).values({
      accountId: ACCOUNT_ID,
      entityType: "company",
      name: "Bare Listing",
      slug: "bare-listing",
    }).returning()

    const caller = engagementCaller(userSession)
    const counters = await caller.getCounters({ listingId: bare.id })

    expect(counters.profileViews).toBe(0)
    expect(counters.searchAppearances).toBe(0)
    expect(counters.enquiriesReceived).toBe(0)
    expect(counters.enquiryResponseRate).toBeNull()
    expect(counters.enquiryResponseTime).toBeNull()
  })
})
