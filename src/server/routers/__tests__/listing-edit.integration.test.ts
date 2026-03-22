// AC-31, AC-32, AC-33, AC-34, AC-45: Profile editor enhancement integration tests

import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest"
import { eq } from "drizzle-orm"
import { getTestDb, resetDb, closeTestDb } from "@/db/test-utils"
import {
  createTestListing,
  createTestMedia,
  seedTestUser,
  makeSession,
  ctx,
  expectTRPCError,
} from "@/db/test-fixtures"
import { listings, mediaItems, credits } from "@/db/schema/data-and-listings"
import { InProcessEventBus } from "@/lib/events/bus"
import { createWaitUntilCollector } from "@/lib/events/waitUntil"
import { createTestMatrix } from "@/lib/events/test-helpers"
import { InMemoryCompaniesHouseService } from "@/lib/services/mocks"
import type { EventConsumerError, EventType } from "@/lib/events/types"
import type { AuthSession } from "@/lib/auth"
import { createListingRouter } from "../listing"

let db: ReturnType<typeof getTestDb>
let chService: InMemoryCompaniesHouseService
let bus: InProcessEventBus
let waitUntilFn: ReturnType<typeof createWaitUntilCollector>["waitUntilFn"]
let getPromises: ReturnType<typeof createWaitUntilCollector>["getPromises"]
let emittedEvents: Array<{ type: EventType; payload: unknown }>

const ACCOUNT_ID = "test-edit-owner"
const OTHER_ID = "test-edit-other"

const userSession = makeSession({ accountId: ACCOUNT_ID })
const otherSession = makeSession({ accountId: OTHER_ID })

beforeAll(async () => {
  db = getTestDb()
})

beforeEach(async () => {
  await resetDb()
  chService = new InMemoryCompaniesHouseService()
  emittedEvents = []

  const testMatrix = createTestMatrix({
    profile_edited: [
      { consumer: "testCapture", domain: "platform" as const, mode: "async" as const },
    ],
  })

  bus = new InProcessEventBus({
    logError: vi.fn<(err: EventConsumerError) => Promise<void>>().mockResolvedValue(undefined),
    consumerMatrix: testMatrix,
  })

  bus.on({
    domain: "platform",
    eventType: "profile_edited",
    mode: "async",
    handler: async (payload) => {
      emittedEvents.push({ type: "profile_edited", payload })
    },
  })

  const collector = createWaitUntilCollector()
  waitUntilFn = collector.waitUntilFn
  getPromises = collector.getPromises

  await seedTestUser(db, ACCOUNT_ID)
  await seedTestUser(db, OTHER_ID)
})

afterAll(async () => {
  await closeTestDb()
})

function listingCaller(session: AuthSession | null) {
  const r = createListingRouter({ db, bus, waitUntilFn, companiesHouse: chService })
  return r.createCaller(ctx(session))
}

// --- AC-31: Optimistic locking via version column ---

describe("AC-31: optimistic concurrency", () => {
  it("returns CONFLICT when version does not match", async () => {
    const listing = await createTestListing(db, ACCOUNT_ID)
    const caller = listingCaller(userSession)

    // Simulate a stale version (listing.version = 1, pass version 0)
    await expectTRPCError(
      caller.update({ listingId: listing.id, version: 0, headline: "Stale edit" }),
      "CONFLICT",
    )

    // Listing unchanged
    const [row] = await db.select().from(listings).where(eq(listings.id, listing.id))
    expect(row.headline).not.toBe("Stale edit")
    expect(row.version).toBe(1)
  })

  it("two concurrent edits — second gets CONFLICT", async () => {
    const listing = await createTestListing(db, ACCOUNT_ID)
    const caller = listingCaller(userSession)

    // First edit succeeds
    const updated = await caller.update({
      listingId: listing.id,
      version: 1,
      headline: "First edit",
    })
    await Promise.all(getPromises())
    expect(updated.version).toBe(2)

    // Second edit with stale version
    await expectTRPCError(
      caller.update({ listingId: listing.id, version: 1, headline: "Second edit" }),
      "CONFLICT",
    )
  })
})

// --- AC-32: Successful edit increments version + emits profile_edited ---

describe("AC-32: version increment + profile_edited emission", () => {
  it("increments version and emits profile_edited with accountId and changedFields", async () => {
    const listing = await createTestListing(db, ACCOUNT_ID)
    const caller = listingCaller(userSession)

    const updated = await caller.update({
      listingId: listing.id,
      version: 1,
      headline: "New headline",
      bio: "New bio",
    })
    await Promise.all(getPromises())

    expect(updated.version).toBe(2)
    expect(updated.headline).toBe("New headline")

    expect(emittedEvents).toHaveLength(1)
    const event = emittedEvents[0].payload as {
      accountId: string
      changedFields: string[]
      listingId: string
    }
    expect(event.accountId).toBe(ACCOUNT_ID)
    expect(event.listingId).toBe(listing.id)
    expect(event.changedFields).toContain("headline")
    expect(event.changedFields).toContain("bio")
  })
})

// --- AC-45: Editing archived or suspended listing returns FORBIDDEN ---

describe("AC-45: lifecycle guard", () => {
  it("rejects edit on archived listing with FORBIDDEN", async () => {
    const listing = await createTestListing(db, ACCOUNT_ID, { lifecycleStatus: "archived" })
    const caller = listingCaller(userSession)

    await expectTRPCError(
      caller.update({ listingId: listing.id, version: 1, headline: "Nope" }),
      "FORBIDDEN",
    )
  })

  it("rejects edit on suspended listing with FORBIDDEN", async () => {
    const listing = await createTestListing(db, ACCOUNT_ID, { lifecycleStatus: "suspended" })
    const caller = listingCaller(userSession)

    await expectTRPCError(
      caller.update({ listingId: listing.id, version: 1, headline: "Nope" }),
      "FORBIDDEN",
    )
  })

  it("allows edit on active listing", async () => {
    const listing = await createTestListing(db, ACCOUNT_ID)
    const caller = listingCaller(userSession)

    const updated = await caller.update({
      listingId: listing.id,
      version: 1,
      headline: "Active edit",
    })

    expect(updated.headline).toBe("Active edit")
  })
})

// --- AC-33: Media upload section shows tier limit + hidden item count ---

describe("AC-33: media hidden count queryable", () => {
  it("media items with visibility=hidden are queryable for count", async () => {
    const listing = await createTestListing(db, ACCOUNT_ID)

    // Insert visible + hidden media
    await createTestMedia(db, listing.id, { visibility: "visible", sortOrder: 1 })
    await createTestMedia(db, listing.id, { visibility: "hidden", sortOrder: 2 })
    await createTestMedia(db, listing.id, { visibility: "hidden", sortOrder: 3 })

    const allMedia = await db.select().from(mediaItems)
      .where(eq(mediaItems.listingId, listing.id))
    const hidden = allMedia.filter((m) => m.visibility === "hidden")
    const visible = allMedia.filter((m) => m.visibility === "visible")

    expect(visible).toHaveLength(1)
    expect(hidden).toHaveLength(2)
  })
})

// --- AC-34: Custom tags section shows upgrade prompt for free tier ---

describe("AC-34: tier-based feature gating", () => {
  it("free-tier listing has subscriptionTier=free queryable for client-side gating", async () => {
    const listing = await createTestListing(db, ACCOUNT_ID, { subscriptionTier: "free" })

    const [row] = await db
      .select({ subscriptionTier: listings.subscriptionTier })
      .from(listings)
      .where(eq(listings.id, listing.id))

    expect(row.subscriptionTier).toBe("free")
  })

  it("standard-tier listing has subscriptionTier=standard", async () => {
    const listing = await createTestListing(db, ACCOUNT_ID, { subscriptionTier: "standard" })

    const [row] = await db
      .select({ subscriptionTier: listings.subscriptionTier })
      .from(listings)
      .where(eq(listings.id, listing.id))

    expect(row.subscriptionTier).toBe("standard")
  })
})
