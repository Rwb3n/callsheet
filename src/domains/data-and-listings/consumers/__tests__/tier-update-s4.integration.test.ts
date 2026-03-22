// AC-41: D&L subscription_tier_changed consumer calls restoreHiddenItems on upgrade

import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest"
import { eq, and } from "drizzle-orm"
import { getTestDb, resetDb, closeTestDb } from "@/db/test-utils"
import { createTestListing, seedTestUser, makeUUID } from "@/db/test-fixtures"
import { mediaItems, credits } from "@/db/schema/data-and-listings"
import { InProcessEventBus } from "@/lib/events/bus"
import { EVENT_CONSUMER_MATRIX } from "@/lib/events/types"
import { createWaitUntilCollector } from "@/lib/events/waitUntil"
import { registerDataAndListingsConsumers } from "../index"
import { createSchedulerDb } from "@/db/test-fixtures"
import type { EventConsumerError } from "@/lib/events/types"

let db: ReturnType<typeof getTestDb>

const ACCOUNT_ID = makeUUID("041b")

beforeAll(() => { db = getTestDb() })
beforeEach(async () => { await resetDb(); await seedTestUser(db, ACCOUNT_ID) })
afterAll(async () => { await closeTestDb() })

function createBusWithConsumers() {
  const bus = new InProcessEventBus({
    logError: vi.fn<(err: EventConsumerError) => Promise<void>>().mockResolvedValue(undefined),
    consumerMatrix: EVENT_CONSUMER_MATRIX,
  })
  registerDataAndListingsConsumers(bus, { db, schedulerDb: createSchedulerDb(db) })
  return bus
}

describe("subscription_tier_changed consumer — restore on upgrade", () => {
  // AC-41: restoreHiddenItems called on upgrade (newTier rank > previousTier rank)
  it("restores hidden media items when tier is upgraded", async () => {
    const listing = await createTestListing(db, ACCOUNT_ID, {
      subscriptionTier: "free",
    })

    // Insert 3 media items: 1 visible, 2 hidden (simulating prior downgrade)
    await db.insert(mediaItems).values([
      { listingId: listing.id, type: "portfolio" as const, url: "https://example.com/1.jpg", visibility: "visible" as const, sortOrder: 1 },
      { listingId: listing.id, type: "portfolio" as const, url: "https://example.com/2.jpg", visibility: "hidden" as const, sortOrder: 2 },
      { listingId: listing.id, type: "portfolio" as const, url: "https://example.com/3.jpg", visibility: "hidden" as const, sortOrder: 3 },
    ])

    const bus = createBusWithConsumers()
    const { waitUntilFn, getPromises } = createWaitUntilCollector()

    // Upgrade from free to premium — should restore hidden items
    await bus.emit("subscription_tier_changed", {
      _brand: "SubscriptionTierChangedEvent" as const,
      listingId: listing.id,
      accountId: ACCOUNT_ID,
      previousTier: "free",
      newTier: "premium",
    }, waitUntilFn)
    await Promise.all(getPromises())

    // All media should now be visible
    const media = await db.select().from(mediaItems)
      .where(eq(mediaItems.listingId, listing.id))
    const visible = media.filter((m) => m.visibility === "visible")
    expect(visible).toHaveLength(3)
  })

  it("does not restore hidden items on downgrade", async () => {
    const listing = await createTestListing(db, ACCOUNT_ID, {
      subscriptionTier: "premium",
    })

    // Insert 2 hidden media items
    await db.insert(mediaItems).values([
      { listingId: listing.id, type: "portfolio" as const, url: "https://example.com/1.jpg", visibility: "hidden" as const, sortOrder: 1 },
      { listingId: listing.id, type: "portfolio" as const, url: "https://example.com/2.jpg", visibility: "hidden" as const, sortOrder: 2 },
    ])

    const bus = createBusWithConsumers()
    const { waitUntilFn, getPromises } = createWaitUntilCollector()

    // Downgrade from premium to standard — should NOT restore
    await bus.emit("subscription_tier_changed", {
      _brand: "SubscriptionTierChangedEvent" as const,
      listingId: listing.id,
      accountId: ACCOUNT_ID,
      previousTier: "premium",
      newTier: "standard",
    }, waitUntilFn)
    await Promise.all(getPromises())

    const media = await db.select().from(mediaItems)
      .where(and(eq(mediaItems.listingId, listing.id), eq(mediaItems.visibility, "hidden")))
    expect(media).toHaveLength(2)
  })

  it("restores hidden credits on upgrade", async () => {
    const listing = await createTestListing(db, ACCOUNT_ID, {
      subscriptionTier: "free",
    })

    await db.insert(credits).values([
      {
        listingId: listing.id,
        projectName: "Film A",
        roleProvided: "DOP",
        year: 2024,
        format: "feature" as const,
        visibility: "visible" as const,
      },
      {
        listingId: listing.id,
        projectName: "Film B",
        roleProvided: "DOP",
        year: 2023,
        format: "feature" as const,
        visibility: "hidden" as const,
      },
    ])

    const bus = createBusWithConsumers()
    const { waitUntilFn, getPromises } = createWaitUntilCollector()

    await bus.emit("subscription_tier_changed", {
      _brand: "SubscriptionTierChangedEvent" as const,
      listingId: listing.id,
      accountId: ACCOUNT_ID,
      previousTier: "free",
      newTier: "partner",
    }, waitUntilFn)
    await Promise.all(getPromises())

    const allCredits = await db.select().from(credits)
      .where(eq(credits.listingId, listing.id))
    const visible = allCredits.filter((c) => c.visibility === "visible")
    expect(visible).toHaveLength(2)
  })
})
