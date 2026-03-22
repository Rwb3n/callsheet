// CS-WORK-055 AC-38 through AC-41: Buyer dashboard integration tests
// Verifies parallel data loading and auth-only access (no provider requirement).

import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest"
import { getTestDb, resetDb, closeTestDb } from "@/db/test-utils"
import {
  seedTestUser,
  makeSession,
  ctx,
  createTestListing,
  createSchedulerDb,
  emptyConsumerMatrix,
} from "@/db/test-fixtures"
import { enquiryRecords, shortlists, shortlistItems, savedSearches, searchHistory } from "@/db/schema/accounts"
import { createEnquiryRouter } from "../enquiry"
import { createShortlistRouter } from "../shortlist"
import { createSearchRouter } from "../search"
import { createSearchHistoryRouter } from "../search-history"
import { InProcessEventBus } from "@/lib/events/bus"
import { InMemoryEmailService } from "@/lib/email/transport"
import { createWaitUntilCollector } from "@/lib/events/waitUntil"
import {
  registerNewEnquiryTemplate,
  registerEnquiryResponseTemplate,
  registerEnquiryReminderTemplate,
} from "@/domains/platform/enquiry/email-templates"
import { registerEnquiryForwardedTemplate } from "@/lib/onboarding/email-templates"

let db: ReturnType<typeof getTestDb>

// Pure buyer — no listings, no provider facet
const BUYER_ID = "buyer-dash-buyer"
const PROVIDER_ID = "buyer-dash-provider"

beforeAll(async () => {
  db = getTestDb()
  registerNewEnquiryTemplate()
  registerEnquiryResponseTemplate()
  registerEnquiryReminderTemplate()
  registerEnquiryForwardedTemplate()
})

beforeEach(async () => {
  await resetDb()
  await seedTestUser(db, BUYER_ID)
  await seedTestUser(db, PROVIDER_ID)
})

afterAll(async () => {
  await closeTestDb()
})

function makeBus() {
  return new InProcessEventBus({
    logError: async () => {},
    consumerMatrix: emptyConsumerMatrix,
  })
}

function makeEnquiryCaller(accountId: string) {
  const { waitUntilFn } = createWaitUntilCollector()
  const router = createEnquiryRouter({
    db,
    emailService: new InMemoryEmailService(),
    bus: makeBus(),
    waitUntilFn,
    schedulerDb: createSchedulerDb(db),
  })
  return router.createCaller(ctx(makeSession({ accountId })))
}

function makeShortlistCaller(accountId: string) {
  const { waitUntilFn } = createWaitUntilCollector()
  const router = createShortlistRouter({ db, bus: makeBus(), waitUntilFn })
  return router.createCaller(ctx(makeSession({ accountId })))
}

function makeSearchCaller(accountId: string) {
  const { waitUntilFn } = createWaitUntilCollector()
  const router = createSearchRouter({ db, bus: makeBus(), waitUntilFn })
  return router.createCaller(ctx(makeSession({ accountId })))
}

function makeHistoryCaller(accountId: string) {
  const router = createSearchHistoryRouter({ db })
  return router.createCaller(ctx(makeSession({ accountId })))
}

// --- AC-38: Enquiries sent with status indicators ---

describe("AC-38: /dashboard/enquiries-sent", () => {
  it("displays sent enquiries with status indicators (unread, responded, stale)", async () => {
    const listing = await createTestListing(db, PROVIDER_ID, { name: "Camera Crew Ltd" })

    // Seed enquiry records with all three statuses
    await db.insert(enquiryRecords).values([
      {
        senderAccountId: BUYER_ID,
        listingId: listing.id,
        subject: "Buyer Name",
        body: "Enquiry about camera services",
        status: "unread",
        sentAt: new Date("2026-02-20T10:00:00Z"),
      },
      {
        senderAccountId: BUYER_ID,
        listingId: listing.id,
        subject: "Buyer Name",
        body: "Follow-up enquiry about lighting",
        status: "responded",
        sentAt: new Date("2026-02-18T10:00:00Z"),
        respondedAt: new Date("2026-02-19T14:00:00Z"),
      },
      {
        senderAccountId: BUYER_ID,
        listingId: listing.id,
        subject: "Buyer Name",
        body: "Old enquiry with no response",
        status: "stale",
        sentAt: new Date("2026-02-10T10:00:00Z"),
      },
    ])

    const caller = makeEnquiryCaller(BUYER_ID)
    const result = await caller.listSent({ limit: 10 })

    expect(result.enquiries).toHaveLength(3)

    // Ordered by sentAt desc
    expect(result.enquiries[0].status).toBe("unread")
    expect(result.enquiries[1].status).toBe("responded")
    expect(result.enquiries[1].respondedAt).toBe("2026-02-19T14:00:00.000Z")
    expect(result.enquiries[2].status).toBe("stale")

    // Each enquiry has listing name and message preview
    expect(result.enquiries[0].listingName).toBe("Camera Crew Ltd")
    expect(result.enquiries[0].message).toBe("Enquiry about camera services")
  })
})

// --- AC-39: Shortlist summary cards ---

describe("AC-39: /dashboard/shortlists", () => {
  it("displays shortlist summary cards with active item count and most recent addition", async () => {
    const listing1 = await createTestListing(db, PROVIDER_ID, { name: "Camera Crew" })
    const listing2 = await createTestListing(db, PROVIDER_ID, { name: "Sound Team" })

    const [sl] = await db.insert(shortlists).values({
      accountId: BUYER_ID,
      name: "Top Camera Providers",
    }).returning()

    await db.insert(shortlistItems).values([
      {
        shortlistId: sl.id,
        listingId: listing1.id,
        status: "active",
        addedAt: new Date("2026-02-20T10:00:00Z"),
      },
      {
        shortlistId: sl.id,
        listingId: listing2.id,
        status: "active",
        addedAt: new Date("2026-02-22T10:00:00Z"),
      },
    ])

    const caller = makeShortlistCaller(BUYER_ID)
    const result = await caller.list()

    expect(result).toHaveLength(1)
    expect(result[0].name).toBe("Top Camera Providers")
    expect(result[0].itemCount).toBe(2)
    expect(result[0].lastAddedAt).toBe("2026-02-22T10:00:00.000Z")
  })
})

// --- AC-40: Recent searches and saved searches ---

describe("AC-40: /dashboard/searches", () => {
  it("renders recent searches (last 5) and saved searches with re-run data", async () => {
    // Seed search history
    for (let i = 0; i < 7; i++) {
      await db.insert(searchHistory).values({
        accountId: BUYER_ID,
        query: `query ${i}`,
        filters: { sectors: ["camera"] },
        resultCount: 10 + i,
        createdAt: new Date(`2026-02-${15 + i}T10:00:00Z`),
      })
    }

    // Seed saved searches
    await db.insert(savedSearches).values([
      {
        accountId: BUYER_ID,
        name: "London Camera Crews",
        query: "camera crew",
        filters: { sectors: ["camera"], location: "london" },
      },
      {
        accountId: BUYER_ID,
        name: "Sound Recordists",
        query: "sound recording",
        filters: { sectors: ["sound"] },
      },
    ])

    const historyCaller = makeHistoryCaller(BUYER_ID)
    const searchCaller = makeSearchCaller(BUYER_ID)

    const [recentSearches, savedResult] = await Promise.all([
      historyCaller.list({ limit: 5 }),
      searchCaller.getSavedSearches({ limit: 10 }),
    ])

    // Recent history returns 5 (not all 7)
    expect(recentSearches).toHaveLength(5)
    // Ordered desc by createdAt — most recent first
    expect(recentSearches[0].query).toBe("query 6")
    expect(recentSearches[0].resultCount).toBe(16)

    // Saved searches return with re-run data
    expect(savedResult).toHaveLength(2)
    expect(savedResult[0]).toHaveProperty("name")
    expect(savedResult[0]).toHaveProperty("query")
    expect(savedResult[0]).toHaveProperty("filters")
  })
})

// --- AC-41: Parallel loading + auth-only access ---

describe("AC-41: parallel loading, buyer sections visible to all authenticated accounts", () => {
  it("loads all four buyer data sources in parallel via Promise.all", async () => {
    const listing = await createTestListing(db, PROVIDER_ID, { name: "Test Listing" })

    // Seed minimal data across all four sources
    await db.insert(enquiryRecords).values({
      senderAccountId: BUYER_ID,
      listingId: listing.id,
      subject: "Buyer",
      body: "Test enquiry message body for parallel test",
      status: "unread",
      sentAt: new Date(),
    })
    await db.insert(shortlists).values({ accountId: BUYER_ID, name: "My Shortlist" })
    await db.insert(searchHistory).values({
      accountId: BUYER_ID,
      query: "camera",
      resultCount: 5,
    })
    await db.insert(savedSearches).values({
      accountId: BUYER_ID,
      name: "Saved Camera Search",
      query: "camera",
    })

    // Parallel loading — mirrors the page-level Promise.all pattern
    const [enquiries, shortlistList, history, saved] = await Promise.all([
      makeEnquiryCaller(BUYER_ID).listSent({ limit: 5 }),
      makeShortlistCaller(BUYER_ID).list(),
      makeHistoryCaller(BUYER_ID).list({ limit: 5 }),
      makeSearchCaller(BUYER_ID).getSavedSearches({ limit: 10 }),
    ])

    expect(enquiries.enquiries).toHaveLength(1)
    expect(shortlistList).toHaveLength(1)
    expect(history).toHaveLength(1)
    expect(saved).toHaveLength(1)
  })

  it("buyer sections accessible to accounts without provider listings", async () => {
    // BUYER_ID has no listings (pure buyer, no provider facet)
    const enquiryCaller = makeEnquiryCaller(BUYER_ID)
    const shortlistCaller = makeShortlistCaller(BUYER_ID)
    const historyCaller = makeHistoryCaller(BUYER_ID)
    const searchCaller = makeSearchCaller(BUYER_ID)

    // All queries succeed even without listing ownership
    const [enquiries, shortlistList, history, saved] = await Promise.all([
      enquiryCaller.listSent({ limit: 5 }),
      shortlistCaller.list(),
      historyCaller.list({ limit: 5 }),
      searchCaller.getSavedSearches({ limit: 10 }),
    ])

    expect(enquiries.enquiries).toEqual([])
    expect(shortlistList).toEqual([])
    expect(history).toEqual([])
    expect(saved).toEqual([])
  })

  it("rejects unauthenticated access to all buyer routes", async () => {
    const noAuth = ctx(null)

    const enquiryRouter = createEnquiryRouter({
      db,
      emailService: new InMemoryEmailService(),
      bus: makeBus(),
      waitUntilFn: createWaitUntilCollector().waitUntilFn,
      schedulerDb: createSchedulerDb(db),
    })
    const shortlistRouter = createShortlistRouter({
      db,
      bus: makeBus(),
      waitUntilFn: createWaitUntilCollector().waitUntilFn,
    })
    const historyRouter = createSearchHistoryRouter({ db })
    const searchRouter = createSearchRouter({
      db,
      bus: makeBus(),
      waitUntilFn: createWaitUntilCollector().waitUntilFn,
    })

    await expect(
      enquiryRouter.createCaller(noAuth).listSent({ limit: 5 }),
    ).rejects.toThrow("Authentication required")

    await expect(
      shortlistRouter.createCaller(noAuth).list(),
    ).rejects.toThrow("Authentication required")

    await expect(
      historyRouter.createCaller(noAuth).list({ limit: 5 }),
    ).rejects.toThrow("Authentication required")

    await expect(
      searchRouter.createCaller(noAuth).getSavedSearches({ limit: 10 }),
    ).rejects.toThrow("Authentication required")
  })
})
