// AC-34 through AC-41: D&L event consumer integration tests
// Emits events through InProcessEventBus → verifies DB state changes

import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest"
import { eq } from "drizzle-orm"
import { getTestDb, resetDb, closeTestDb } from "@/db/test-utils"
import { createTestListing, seedUsers, makeSession, ctx } from "@/db/test-fixtures"
import {
  engagements,
  pendingEnquiries,
  zeroResultQueries,
  listings,
} from "@/db/schema/data-and-listings"
import { InProcessEventBus } from "@/lib/events/bus"
import { EVENT_CONSUMER_MATRIX } from "@/lib/events/types"
import type { EventConsumerError } from "@/lib/events/types"
import { createWaitUntilCollector } from "@/lib/events/waitUntil"
import { registerDataAndListingsConsumers } from "../index"
import { createSchedulerDb } from "@/db/test-fixtures"
import { createEngagementRouter } from "@/server/routers/engagement"

let db: ReturnType<typeof getTestDb>

const ACCOUNT_ID = "test-consumer-account"
const userSession = makeSession({ accountId: ACCOUNT_ID })

beforeAll(() => {
  db = getTestDb()
})

beforeEach(async () => {
  await resetDb()
  await seedUsers(db, [
    { id: ACCOUNT_ID, name: "Consumer Test User", email: "consumer@test.com" },
  ])
})

afterAll(async () => {
  await closeTestDb()
})

function createBusWithConsumers() {
  const bus = new InProcessEventBus({
    logError: vi.fn<(err: EventConsumerError) => Promise<void>>().mockResolvedValue(undefined),
    consumerMatrix: EVENT_CONSUMER_MATRIX,
  })
  registerDataAndListingsConsumers(bus, { db, schedulerDb: createSchedulerDb(db) })
  return bus
}

// AC-34: profile_viewed increments engagements.profileViews by 1
describe("profile_viewed consumer", () => {
  it("increments profileViews by 1", async () => {
    const listing = await createTestListing(db, ACCOUNT_ID)
    const bus = createBusWithConsumers()
    const { waitUntilFn, getPromises } = createWaitUntilCollector()

    await bus.emit("profile_viewed", {
      _brand: "ProfileViewedEvent" as const,
      listingId: listing.id,
      viewerAccountId: "viewer-1",
      source: "search",
      timestamp: new Date().toISOString(),
    }, waitUntilFn)
    await Promise.all(getPromises())

    const [row] = await db.select().from(engagements)
      .where(eq(engagements.listingId, listing.id))
    expect(row.profileViews).toBe(1)
  })

  // AC-38: Two distinct profile_viewed events produce +2
  it("two events produce +2 (no dedup)", async () => {
    const listing = await createTestListing(db, ACCOUNT_ID)
    const bus = createBusWithConsumers()

    for (let i = 0; i < 2; i++) {
      const { waitUntilFn, getPromises } = createWaitUntilCollector()
      await bus.emit("profile_viewed", {
        _brand: "ProfileViewedEvent" as const,
        listingId: listing.id,
        viewerAccountId: `viewer-${i}`,
        source: "search",
        timestamp: new Date().toISOString(),
      }, waitUntilFn)
      await Promise.all(getPromises())
    }

    const [row] = await db.select().from(engagements)
      .where(eq(engagements.listingId, listing.id))
    expect(row.profileViews).toBe(2)
  })
})

// AC-35: enquiry_submitted increments enquiriesReceived; unclaimed adds pendingEnquiry
describe("enquiry_submitted consumer", () => {
  it("increments enquiriesReceived and creates pendingEnquiry for unclaimed listing", async () => {
    const listing = await createTestListing(db, ACCOUNT_ID, { claimStatus: "unclaimed" })
    const bus = createBusWithConsumers()
    const { waitUntilFn, getPromises } = createWaitUntilCollector()

    await bus.emit("enquiry_submitted", {
      _brand: "EnquirySubmittedEvent" as const,
      enquiryId: "00000000-0000-0000-0000-000000000099",
      listingId: listing.id,
      timestamp: new Date().toISOString(),
    }, waitUntilFn)
    await Promise.all(getPromises())

    const [eng] = await db.select().from(engagements)
      .where(eq(engagements.listingId, listing.id))
    expect(eng.enquiriesReceived).toBe(1)

    const pending = await db.select().from(pendingEnquiries)
      .where(eq(pendingEnquiries.listingId, listing.id))
    expect(pending).toHaveLength(1)
    expect(pending[0].enquiryId).toBe("00000000-0000-0000-0000-000000000099")
  })

  it("increments enquiriesReceived without pendingEnquiry for claimed listing", async () => {
    const listing = await createTestListing(db, ACCOUNT_ID, { claimStatus: "claimed" })
    const bus = createBusWithConsumers()
    const { waitUntilFn, getPromises } = createWaitUntilCollector()

    await bus.emit("enquiry_submitted", {
      _brand: "EnquirySubmittedEvent" as const,
      enquiryId: "00000000-0000-0000-0000-000000000098",
      listingId: listing.id,
      timestamp: new Date().toISOString(),
    }, waitUntilFn)
    await Promise.all(getPromises())

    const [eng] = await db.select().from(engagements)
      .where(eq(engagements.listingId, listing.id))
    expect(eng.enquiriesReceived).toBe(1)

    const pending = await db.select().from(pendingEnquiries)
      .where(eq(pendingEnquiries.listingId, listing.id))
    expect(pending).toHaveLength(0)
  })
})

// AC-36: subscription_tier_changed updates listings.subscriptionTier
describe("subscription_tier_changed consumer", () => {
  it("updates listing subscriptionTier to newTier", async () => {
    const listing = await createTestListing(db, ACCOUNT_ID)
    const bus = createBusWithConsumers()
    const { waitUntilFn, getPromises } = createWaitUntilCollector()

    await bus.emit("subscription_tier_changed", {
      _brand: "SubscriptionTierChangedEvent" as const,
      listingId: listing.id,
      accountId: ACCOUNT_ID,
      newTier: "premium",
      previousTier: "free",
    }, waitUntilFn)
    await Promise.all(getPromises())

    const [row] = await db.select().from(listings)
      .where(eq(listings.id, listing.id))
    expect(row.subscriptionTier).toBe("premium")
  })
})

// AC-37: account_closed consumer registered, executes without error
describe("account_closed consumer", () => {
  it("executes without error (no-op at S1)", async () => {
    const bus = createBusWithConsumers()
    const { waitUntilFn, getPromises } = createWaitUntilCollector()

    await bus.emit("account_closed", {
      _brand: "AccountClosedEvent" as const,
      accountId: ACCOUNT_ID,
      listingsArchived: [],
      buyerDataDeleted: false,
      complianceHoldActive: false,
      paddleCancellationsPending: false,
      timestamp: new Date().toISOString(),
    }, waitUntilFn)
    await Promise.all(getPromises())

    // No error thrown — consumer ran successfully as no-op
  })
})

// AC-41: search_performed with resultCount === 0 creates zero_result_queries entry
describe("search_performed consumer", () => {
  it("inserts zero-result query when resultCount is 0, queryable by date range", async () => {
    const bus = createBusWithConsumers()
    const { waitUntilFn, getPromises } = createWaitUntilCollector()

    await bus.emit("search_performed", {
      _brand: "SearchPerformedEvent" as const,
      query: "underwater cameraman",
      filters: { region: "london" },
      resultCount: 0,
      resultListingIds: [],
      sessionId: null,
      timestamp: new Date().toISOString(),
    }, waitUntilFn)
    await Promise.all(getPromises())

    const rows = await db.select().from(zeroResultQueries)
    expect(rows).toHaveLength(1)
    expect(rows[0].query).toBe("underwater cameraman")
    expect(rows[0].filters).toEqual({ region: "london" })
    const oneMinuteAgo = new Date(Date.now() - 60_000)
    expect(rows[0].createdAt.getTime()).toBeGreaterThan(oneMinuteAgo.getTime())
  })

  it("does not insert when resultCount > 0", async () => {
    const bus = createBusWithConsumers()
    const { waitUntilFn, getPromises } = createWaitUntilCollector()

    await bus.emit("search_performed", {
      _brand: "SearchPerformedEvent" as const,
      query: "camera operator",
      filters: {},
      resultCount: 5,
      resultListingIds: [],
      sessionId: null,
      timestamp: new Date().toISOString(),
    }, waitUntilFn)
    await Promise.all(getPromises())

    const rows = await db.select().from(zeroResultQueries)
    expect(rows).toHaveLength(0)
  })
})

// AC-39: getEngagementCounters returns correct counters
describe("getEngagementCounters via router", () => {
  it("returns correct counters after consumer increments, within 50ms", async () => {
    const listing = await createTestListing(db, ACCOUNT_ID)
    const bus = createBusWithConsumers()

    // Emit 3 profile_viewed + 2 enquiry_submitted
    for (let i = 0; i < 3; i++) {
      const { waitUntilFn, getPromises } = createWaitUntilCollector()
      await bus.emit("profile_viewed", {
        _brand: "ProfileViewedEvent" as const,
        listingId: listing.id,
        viewerAccountId: `v-${i}`,
        source: "search",
        timestamp: new Date().toISOString(),
      }, waitUntilFn)
      await Promise.all(getPromises())
    }
    for (let i = 0; i < 2; i++) {
      const { waitUntilFn, getPromises } = createWaitUntilCollector()
      await bus.emit("enquiry_submitted", {
        _brand: "EnquirySubmittedEvent" as const,
        enquiryId: `00000000-0000-0000-0000-00000000000${i}`,
        listingId: listing.id,
        timestamp: new Date().toISOString(),
      }, waitUntilFn)
      await Promise.all(getPromises())
    }

    const router = createEngagementRouter({ db })
    const caller = router.createCaller(ctx(userSession))

    const start = performance.now()
    const counters = await caller.getCounters({ listingId: listing.id })
    const elapsed = performance.now() - start

    expect(counters.profileViews).toBe(3)
    expect(counters.enquiriesReceived).toBe(2)
    expect(elapsed).toBeLessThan(50)
  })
})
