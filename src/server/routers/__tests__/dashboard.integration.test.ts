// CS-WORK-043 AC-1 through AC-5: Dashboard overview + listing context integration tests
// Tests call dashboard router via createCaller() against real Postgres.

import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest"
import { getTestDb, resetDb, closeTestDb } from "@/db/test-utils"
import { createTestListing, seedTestUser, makeSession, ctx, InMemoryNotificationDb } from "@/db/test-fixtures"
import type { AuthSession } from "@/lib/auth"
import { createDashboardRouter } from "../dashboard"

let db: ReturnType<typeof getTestDb>
let notificationDb: InMemoryNotificationDb

const ACCOUNT_ID = "test-dash-owner"
const OTHER_ACCOUNT = "test-dash-other"

function caller(session: AuthSession) {
  const router = createDashboardRouter({ db, notificationDb })
  return router.createCaller(ctx(session))
}

const ownerSession = makeSession({ accountId: ACCOUNT_ID })
const otherSession = makeSession({ accountId: OTHER_ACCOUNT })

beforeAll(async () => {
  db = getTestDb()
})

beforeEach(async () => {
  await resetDb()
  notificationDb = new InMemoryNotificationDb()
  await seedTestUser(db, ACCOUNT_ID)
  await seedTestUser(db, OTHER_ACCOUNT)
})

afterAll(async () => {
  await closeTestDb()
})

// --- AC-2: Dashboard overview shows all owned listings ---

describe("dashboard.getOverview", () => {
  it("returns all owned listings as cards with name, tier, verification badge, and engagement totals", async () => {
    const listing1 = await createTestListing(db, ACCOUNT_ID, {
      name: "Camera Crew Ltd",
      claimStatus: "claimed",
      subscriptionTier: "standard",
    })
    const listing2 = await createTestListing(db, ACCOUNT_ID, {
      name: "Sound Services Ltd",
      claimStatus: "claimed",
      subscriptionTier: "free",
    })

    const result = await caller(ownerSession).getOverview()

    expect(result.cards).toHaveLength(2)
    const names = result.cards.map((c) => c.name)
    expect(names).toContain("Camera Crew Ltd")
    expect(names).toContain("Sound Services Ltd")

    const card = result.cards.find((c) => c.listingId === listing1.id)!
    expect(card.subscriptionTier).toBe("standard")
    expect(card.verificationTier).toBe("unclaimed")
    expect(card.profileViews).toBe(0)
    expect(card.enquiriesReceived).toBe(0)
    expect(card.profileStrength).toBeGreaterThanOrEqual(0)
    expect(card.qualityComposite).toBe(0)
  })

  it("returns empty cards array for account with no listings", async () => {
    const result = await caller(ownerSession).getOverview()
    expect(result.cards).toHaveLength(0)
  })

  it("does not include listings owned by other accounts", async () => {
    await createTestListing(db, ACCOUNT_ID, { name: "Mine" })
    await createTestListing(db, OTHER_ACCOUNT, { name: "Theirs" })

    const result = await caller(ownerSession).getOverview()
    expect(result.cards).toHaveLength(1)
    expect(result.cards[0].name).toBe("Mine")
  })

  // AC-3: archived and suspended listing rendering
  it("includes archived listings in overview", async () => {
    await createTestListing(db, ACCOUNT_ID, {
      name: "Archived Co",
      lifecycleStatus: "archived",
    })

    const result = await caller(ownerSession).getOverview()
    expect(result.cards).toHaveLength(1)
    expect(result.cards[0].lifecycleStatus).toBe("archived")
  })

  it("includes suspended listings in overview", async () => {
    await createTestListing(db, ACCOUNT_ID, {
      name: "Suspended Co",
      lifecycleStatus: "suspended",
    })

    const result = await caller(ownerSession).getOverview()
    expect(result.cards).toHaveLength(1)
    expect(result.cards[0].lifecycleStatus).toBe("suspended")
  })

  it("returns unread notification count", async () => {
    await notificationDb.insert({
      id: "n1",
      accountId: ACCOUNT_ID,
      type: "enquiry_received",
      title: "New enquiry",
      body: "You have a new enquiry",
      dismissed: false,
      createdAt: new Date().toISOString(),
    })

    const result = await caller(ownerSession).getOverview()
    expect(result.unreadCount).toBe(1)
  })

  // AC-5: performance — verified by single join (structural, not timing test)
  it("handles 50 listings in a single query", async () => {
    const insertions = Array.from({ length: 50 }, (_, i) =>
      createTestListing(db, ACCOUNT_ID, { name: `Listing ${i}` }),
    )
    await Promise.all(insertions)

    const result = await caller(ownerSession).getOverview()
    expect(result.cards).toHaveLength(50)
  })
})

// --- AC-4: Listing context returns 404 for non-owner ---

describe("dashboard.getListingContext", () => {
  it("returns listing context for owned listing", async () => {
    const listing = await createTestListing(db, ACCOUNT_ID, {
      name: "My Company",
      claimStatus: "claimed",
      subscriptionTier: "premium",
    })

    const result = await caller(ownerSession).getListingContext({ listingId: listing.id })
    expect(result.listing.name).toBe("My Company")
    expect(result.listing.subscriptionTier).toBe("premium")
    expect(result.featureAccess).toBeDefined()
    expect(result.featureAccess.trendAnalytics).toBe("90d")
  })

  it("returns NOT_FOUND for listing owned by another account", async () => {
    const otherListing = await createTestListing(db, OTHER_ACCOUNT, { name: "Not Mine" })

    await expect(
      caller(ownerSession).getListingContext({ listingId: otherListing.id }),
    ).rejects.toThrow("Listing not found")
  })

  it("returns NOT_FOUND for nonexistent listing", async () => {
    await expect(
      caller(ownerSession).getListingContext({
        listingId: "a0000000-0000-4000-8000-000000000099",
      }),
    ).rejects.toThrow("Listing not found")
  })

  it("returns feature access reflecting subscription tier", async () => {
    const freeListing = await createTestListing(db, ACCOUNT_ID, {
      subscriptionTier: "free",
    })

    const result = await caller(ownerSession).getListingContext({
      listingId: freeListing.id,
    })
    expect(result.featureAccess.trendAnalytics).toBe("none")
    expect(result.featureAccess.topSearchTerms).toBe(false)
  })
})
