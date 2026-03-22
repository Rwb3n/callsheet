// CS-WORK-053 AC-28 through AC-32: Shortlist management integration tests
// Tests call shortlist router via createCaller() against real Postgres.

import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest"
import { eq } from "drizzle-orm"
import { getTestDb, resetDb, closeTestDb } from "@/db/test-utils"
import {
  seedTestUser,
  makeSession,
  ctx,
  createTestListing,
  emptyConsumerMatrix,
} from "@/db/test-fixtures"
import { shortlists, shortlistItems } from "@/db/schema/accounts"
import { listings, verifications } from "@/db/schema/data-and-listings"
import { createShortlistRouter } from "../shortlist"
import { InProcessEventBus } from "@/lib/events/bus"
import { createWaitUntilCollector } from "@/lib/events/waitUntil"
import type { AuthSession } from "@/lib/auth"
import type { ShortlistRouterDeps } from "../shortlist"

let db: ReturnType<typeof getTestDb>
let bus: InProcessEventBus
let waitUntilFn: ReturnType<typeof createWaitUntilCollector>["waitUntilFn"]
let getPromises: ReturnType<typeof createWaitUntilCollector>["getPromises"]

const BUYER_ID = "test-shortlist-buyer"
const OTHER_ID = "test-shortlist-other"

function makeDeps(): ShortlistRouterDeps {
  return { db, bus, waitUntilFn }
}

function caller(session: AuthSession) {
  const router = createShortlistRouter(makeDeps())
  return router.createCaller(ctx(session))
}

const buyerSession = makeSession({ accountId: BUYER_ID })
const otherSession = makeSession({ accountId: OTHER_ID })

beforeAll(async () => {
  db = getTestDb()
})

beforeEach(async () => {
  await resetDb()
  await seedTestUser(db, BUYER_ID)
  await seedTestUser(db, OTHER_ID)
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

// --- AC-28: shortlist.create creates a shortlist; rejects at 10 ---

describe("shortlist.create", () => {
  it("creates a shortlist with given name", async () => {
    const result = await caller(buyerSession).create({ name: "Cameras" })

    expect(result.id).toBeDefined()
    expect(result.name).toBe("Cameras")
    expect(result.createdAt).toBeDefined()

    const [row] = await db
      .select()
      .from(shortlists)
      .where(eq(shortlists.id, result.id))
    expect(row.accountId).toBe(BUYER_ID)
    expect(row.name).toBe("Cameras")
  })

  it("rejects when account has 10 shortlists", async () => {
    for (let i = 0; i < 10; i++) {
      await caller(buyerSession).create({ name: `List ${i}` })
    }

    await expect(
      caller(buyerSession).create({ name: "Eleventh" }),
    ).rejects.toThrow("Maximum 10 shortlists per account")
  })
})

// --- AC-29: shortlist.addItem + shortlist_added event ---

describe("shortlist.addItem", () => {
  it("adds listing to shortlist with status active, emits shortlist_added", async () => {
    const sl = await caller(buyerSession).create({ name: "Test" })
    const listing = await createTestListing(db, OTHER_ID)

    const emitted: Array<{ type: string; payload: unknown }> = []
    bus.on({
      domain: "platform",
      eventType: "shortlist_added",
      mode: "async",
      handler: async (payload) => { emitted.push({ type: "shortlist_added", payload }) },
    })

    await caller(buyerSession).addItem({
      shortlistId: sl.id,
      listingId: listing.id,
    })

    // Verify DB row
    const [item] = await db
      .select()
      .from(shortlistItems)
      .where(eq(shortlistItems.shortlistId, sl.id))
    expect(item.listingId).toBe(listing.id)
    expect(item.status).toBe("active")

    // Verify event
    await Promise.all(getPromises())
    expect(emitted).toHaveLength(1)
    expect(emitted[0].payload).toMatchObject({
      listingId: listing.id,
      accountId: BUYER_ID,
    })
  })

  it("rejects duplicate listing (unique constraint)", async () => {
    const sl = await caller(buyerSession).create({ name: "Test" })
    const listing = await createTestListing(db, OTHER_ID)

    await caller(buyerSession).addItem({ shortlistId: sl.id, listingId: listing.id })

    await expect(
      caller(buyerSession).addItem({ shortlistId: sl.id, listingId: listing.id }),
    ).rejects.toThrow("Listing already in shortlist")
  })

  it("rejects at 50 items", async () => {
    const sl = await caller(buyerSession).create({ name: "Full" })

    // Bulk-insert 50 listings + shortlist items
    for (let i = 0; i < 50; i++) {
      const listing = await createTestListing(db, OTHER_ID)
      await db.insert(shortlistItems).values({
        shortlistId: sl.id,
        listingId: listing.id,
        status: "active",
      })
    }

    const extraListing = await createTestListing(db, OTHER_ID)

    await expect(
      caller(buyerSession).addItem({ shortlistId: sl.id, listingId: extraListing.id }),
    ).rejects.toThrow("Maximum 50 items per shortlist")
  })

  it("rejects when shortlist belongs to another user", async () => {
    const sl = await caller(otherSession).create({ name: "Other's list" })
    const listing = await createTestListing(db, OTHER_ID)

    await expect(
      caller(buyerSession).addItem({ shortlistId: sl.id, listingId: listing.id }),
    ).rejects.toThrow("NOT_FOUND")
  })
})

// --- AC-30: removeItem soft deletes; delete cascade-deletes ---

describe("shortlist.removeItem", () => {
  it("sets status to removed (soft delete)", async () => {
    const sl = await caller(buyerSession).create({ name: "Test" })
    const listing = await createTestListing(db, OTHER_ID)
    await caller(buyerSession).addItem({ shortlistId: sl.id, listingId: listing.id })

    await caller(buyerSession).removeItem({ shortlistId: sl.id, listingId: listing.id })

    const [item] = await db
      .select()
      .from(shortlistItems)
      .where(eq(shortlistItems.shortlistId, sl.id))
    expect(item.status).toBe("removed")
  })

  it("returns NOT_FOUND for non-existent item", async () => {
    const sl = await caller(buyerSession).create({ name: "Test" })
    const listing = await createTestListing(db, OTHER_ID)

    await expect(
      caller(buyerSession).removeItem({ shortlistId: sl.id, listingId: listing.id }),
    ).rejects.toThrow("NOT_FOUND")
  })
})

describe("shortlist.delete", () => {
  it("deletes shortlist and cascade-deletes items", async () => {
    const sl = await caller(buyerSession).create({ name: "Test" })
    const listing = await createTestListing(db, OTHER_ID)
    await caller(buyerSession).addItem({ shortlistId: sl.id, listingId: listing.id })

    await caller(buyerSession).delete({ shortlistId: sl.id })

    const slRows = await db.select().from(shortlists).where(eq(shortlists.id, sl.id))
    expect(slRows).toHaveLength(0)

    const itemRows = await db.select().from(shortlistItems).where(eq(shortlistItems.shortlistId, sl.id))
    expect(itemRows).toHaveLength(0)
  })

  it("rejects delete of non-owned shortlist", async () => {
    const sl = await caller(otherSession).create({ name: "Other's" })

    await expect(
      caller(buyerSession).delete({ shortlistId: sl.id }),
    ).rejects.toThrow("NOT_FOUND")
  })
})

// --- AC-31: getItems returns listing display data via single JOIN ---
// --- Filter: WHERE si.status != 'removed' (not = 'active') [S6-ST-1] ---

describe("shortlist.getItems", () => {
  it("returns items with listing display data, excludes removed", async () => {
    const sl = await caller(buyerSession).create({ name: "Test" })
    const listing = await createTestListing(db, OTHER_ID, {
      name: "Camera Corp",
      headline: "Best cameras",
      entityType: "company",
      baseRegion: "London",
    })

    // Set verification tier to "verified" for the listing
    await db
      .update(verifications)
      .set({ tier: "verified" })
      .where(eq(verifications.listingId, listing.id))

    await caller(buyerSession).addItem({ shortlistId: sl.id, listingId: listing.id })

    const result = await caller(buyerSession).getItems({ shortlistId: sl.id })

    expect(result.items).toHaveLength(1)
    const item = result.items[0]
    expect(item.listingId).toBe(listing.id)
    expect(item.status).toBe("active")
    expect(item.listing.name).toBe("Camera Corp")
    expect(item.listing.headline).toBe("Best cameras")
    expect(item.listing.entityType).toBe("company")
    expect(item.listing.baseRegion).toBe("London")
    expect(item.listing.verificationTier).toBe("verified")
  })

  it("includes archived/suspended items (filter != removed, not = active) [S6-ST-1]", async () => {
    const sl = await caller(buyerSession).create({ name: "Mixed" })
    const listing1 = await createTestListing(db, OTHER_ID, { name: "Active Listing" })
    const listing2 = await createTestListing(db, OTHER_ID, { name: "Archived Listing" })
    const listing3 = await createTestListing(db, OTHER_ID, { name: "Suspended Listing" })
    const listing4 = await createTestListing(db, OTHER_ID, { name: "Removed Listing" })

    // Add all to shortlist manually with different statuses
    await db.insert(shortlistItems).values([
      { shortlistId: sl.id, listingId: listing1.id, status: "active" },
      { shortlistId: sl.id, listingId: listing2.id, status: "archived" },
      { shortlistId: sl.id, listingId: listing3.id, status: "suspended" },
      { shortlistId: sl.id, listingId: listing4.id, status: "removed" },
    ])

    const result = await caller(buyerSession).getItems({ shortlistId: sl.id })

    // Should include active, archived, suspended — not removed
    expect(result.items).toHaveLength(3)
    const statuses = result.items.map((i) => i.status)
    expect(statuses).toContain("active")
    expect(statuses).toContain("archived")
    expect(statuses).toContain("suspended")
    expect(statuses).not.toContain("removed")
  })

  it("paginates with cursor (20 per page)", async () => {
    const sl = await caller(buyerSession).create({ name: "Paged" })
    const listingIds: string[] = []

    for (let i = 0; i < 25; i++) {
      const listing = await createTestListing(db, OTHER_ID, { name: `Listing ${i}` })
      listingIds.push(listing.id)
      await db.insert(shortlistItems).values({
        shortlistId: sl.id,
        listingId: listing.id,
        status: "active",
        addedAt: new Date(Date.now() - (25 - i) * 60000),
      })
    }

    const page1 = await caller(buyerSession).getItems({ shortlistId: sl.id })
    expect(page1.items).toHaveLength(20)
    expect(page1.nextCursor).toBeTruthy()

    const page2 = await caller(buyerSession).getItems({
      shortlistId: sl.id,
      cursor: page1.nextCursor!,
    })
    expect(page2.items).toHaveLength(5)
    expect(page2.nextCursor).toBeNull()
  })

  it("rejects access to non-owned shortlist", async () => {
    const sl = await caller(otherSession).create({ name: "Other's" })

    await expect(
      caller(buyerSession).getItems({ shortlistId: sl.id }),
    ).rejects.toThrow("NOT_FOUND")
  })
})

// --- AC-32: archived/suspended display from shortlist_items.status ---

describe("shortlist lifecycle display [AC-32]", () => {
  it("renders archived items from shortlist_items.status, not listings.lifecycleStatus", async () => {
    const sl = await caller(buyerSession).create({ name: "Lifecycle" })
    const listing = await createTestListing(db, OTHER_ID, { name: "Corp" })

    // Add to shortlist, then simulate PP consumer writing archived status
    await db.insert(shortlistItems).values({
      shortlistId: sl.id,
      listingId: listing.id,
      status: "archived",
    })

    // The listing itself is still "active" in listings table
    const [listingRow] = await db
      .select({ lifecycleStatus: listings.lifecycleStatus })
      .from(listings)
      .where(eq(listings.id, listing.id))
    expect(listingRow.lifecycleStatus).toBe("active")

    // But getItems reads shortlist_items.status, not listings.lifecycleStatus
    const result = await caller(buyerSession).getItems({ shortlistId: sl.id })
    expect(result.items).toHaveLength(1)
    expect(result.items[0].status).toBe("archived")
  })

  it("erased listings cascade-delete shortlist items (no stale references)", async () => {
    const sl = await caller(buyerSession).create({ name: "Erasure" })
    const listing = await createTestListing(db, OTHER_ID, { name: "To Erase" })

    await caller(buyerSession).addItem({ shortlistId: sl.id, listingId: listing.id })

    // Simulate erasure: delete the listing row (FK cascade deletes shortlist_items)
    await db.delete(listings).where(eq(listings.id, listing.id))

    const result = await caller(buyerSession).getItems({ shortlistId: sl.id })
    expect(result.items).toHaveLength(0)
  })
})

// --- shortlist.list ---

describe("shortlist.list", () => {
  it("returns shortlists with active item counts", async () => {
    const sl = await caller(buyerSession).create({ name: "My List" })
    const listing1 = await createTestListing(db, OTHER_ID)
    const listing2 = await createTestListing(db, OTHER_ID)

    await caller(buyerSession).addItem({ shortlistId: sl.id, listingId: listing1.id })
    await caller(buyerSession).addItem({ shortlistId: sl.id, listingId: listing2.id })

    // Remove one
    await caller(buyerSession).removeItem({ shortlistId: sl.id, listingId: listing1.id })

    const result = await caller(buyerSession).list()
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe("My List")
    // Only the active item should count
    expect(result[0].itemCount).toBe(1)
  })

  it("returns empty array for new accounts", async () => {
    const result = await caller(buyerSession).list()
    expect(result).toHaveLength(0)
  })
})

// --- shortlist.rename ---

describe("shortlist.rename", () => {
  it("renames an owned shortlist", async () => {
    const sl = await caller(buyerSession).create({ name: "Old Name" })
    await caller(buyerSession).rename({ shortlistId: sl.id, name: "New Name" })

    const [row] = await db.select().from(shortlists).where(eq(shortlists.id, sl.id))
    expect(row.name).toBe("New Name")
  })

  it("rejects rename of non-owned shortlist", async () => {
    const sl = await caller(otherSession).create({ name: "Other's" })

    await expect(
      caller(buyerSession).rename({ shortlistId: sl.id, name: "Hijacked" }),
    ).rejects.toThrow("NOT_FOUND")
  })
})
