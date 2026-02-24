// AC-31, AC-32, AC-33: Archival path subscription cancellation
// AC-37: Ops pending_cancellation_created consumer (store + cancel)

import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest"
import { eq } from "drizzle-orm"
import { getTestDb, resetDb, closeTestDb } from "@/db/test-utils"
import {
  createTestListing,
  seedTestUser,
  makeSession,
  makeUUID,
  ctx,
  emptyConsumerMatrix,
} from "@/db/test-fixtures"
import { pendingCancellations } from "@/db/schema/operations"
import { listings } from "@/db/schema/data-and-listings"
import { InProcessEventBus } from "@/lib/events/bus"
import { createTestMatrix } from "@/lib/events/test-helpers"
import { createWaitUntilCollector } from "@/lib/events/waitUntil"
import { InMemoryCompaniesHouseService, InMemoryPaymentService } from "@/lib/services/mocks"
import { createListingRouter } from "@/server/routers/listing"
import { pendingCancellationCreatedHandler } from "../consumers"
import type { EventConsumerError, EventType } from "@/lib/events/types"

let db: ReturnType<typeof getTestDb>

const ACCOUNT_ID = makeUUID("041a")

beforeAll(() => { db = getTestDb() })
beforeEach(async () => { await resetDb(); await seedTestUser(db, ACCOUNT_ID) })
afterAll(async () => { await closeTestDb() })

describe("listing.archive archival path", () => {
  // AC-31: paid listing emits pending_cancellation_created with reason "listing_archived"
  it("emits pending_cancellation_created for paid listing with reason listing_archived", async () => {
    const listing = await createTestListing(db, ACCOUNT_ID, {
      subscriptionTier: "premium",
      paddleSubscriptionId: "sub_test_archive_1",
    })

    const emitted: Array<{ type: EventType; payload: unknown }> = []
    const testMatrix = createTestMatrix({
      listing_archived: [
        { consumer: "testCapture", domain: "platform" as const, mode: "async" as const },
      ],
      pending_cancellation_created: [
        { consumer: "testCapture", domain: "platform" as const, mode: "async" as const },
      ],
    })

    const bus = new InProcessEventBus({
      logError: vi.fn<(err: EventConsumerError) => Promise<void>>().mockResolvedValue(undefined),
      consumerMatrix: testMatrix,
    })

    for (const eventType of ["listing_archived", "pending_cancellation_created"] as const) {
      bus.on({
        domain: "platform",
        eventType,
        mode: "async",
        handler: async (payload) => { emitted.push({ type: eventType, payload }) },
      })
    }

    const { waitUntilFn, getPromises } = createWaitUntilCollector()
    const router = createListingRouter({
      db,
      bus,
      waitUntilFn,
      companiesHouse: new InMemoryCompaniesHouseService(),
    })
    const caller = router.createCaller(ctx(makeSession({ accountId: ACCOUNT_ID })))

    await caller.archive({ listingId: listing.id })
    await Promise.all(getPromises())

    expect(emitted).toHaveLength(2)
    expect(emitted[0].type).toBe("listing_archived")
    expect(emitted[1].type).toBe("pending_cancellation_created")

    const pcPayload = emitted[1].payload as {
      paddleSubscriptionId: string
      reason: string
      listingId: string
      timestamp: string
    }
    expect(pcPayload.paddleSubscriptionId).toBe("sub_test_archive_1")
    expect(pcPayload.reason).toBe("listing_archived")
    expect(pcPayload.listingId).toBe(listing.id)
    expect(pcPayload.timestamp).toBeTruthy()
  })

  // AC-32: paid listing does NOT emit subscription_ended directly
  it("does not emit subscription_ended directly for paid listing", async () => {
    const listing = await createTestListing(db, ACCOUNT_ID, {
      subscriptionTier: "standard",
      paddleSubscriptionId: "sub_test_archive_2",
    })

    const emittedTypes: EventType[] = []
    const testMatrix = createTestMatrix({
      listing_archived: [
        { consumer: "testCapture", domain: "platform" as const, mode: "async" as const },
      ],
      pending_cancellation_created: [
        { consumer: "testCapture", domain: "platform" as const, mode: "async" as const },
      ],
      subscription_ended: [
        { consumer: "testCapture", domain: "platform" as const, mode: "async" as const },
      ],
    })

    const bus = new InProcessEventBus({
      logError: vi.fn<(err: EventConsumerError) => Promise<void>>().mockResolvedValue(undefined),
      consumerMatrix: testMatrix,
    })

    for (const eventType of ["listing_archived", "pending_cancellation_created", "subscription_ended"] as const) {
      bus.on({
        domain: "platform",
        eventType,
        mode: "async",
        handler: async () => { emittedTypes.push(eventType) },
      })
    }

    const { waitUntilFn, getPromises } = createWaitUntilCollector()
    const router = createListingRouter({
      db,
      bus,
      waitUntilFn,
      companiesHouse: new InMemoryCompaniesHouseService(),
    })
    const caller = router.createCaller(ctx(makeSession({ accountId: ACCOUNT_ID })))

    await caller.archive({ listingId: listing.id })
    await Promise.all(getPromises())

    expect(emittedTypes).not.toContain("subscription_ended")
  })

  // AC-33: free listing emits no subscription events
  it("emits no subscription events for free listing", async () => {
    const listing = await createTestListing(db, ACCOUNT_ID, {
      subscriptionTier: "free",
    })

    const emitted: EventType[] = []
    const testMatrix = createTestMatrix({
      listing_archived: [
        { consumer: "testCapture", domain: "platform" as const, mode: "async" as const },
      ],
      pending_cancellation_created: [
        { consumer: "testCapture", domain: "platform" as const, mode: "async" as const },
      ],
    })

    const bus = new InProcessEventBus({
      logError: vi.fn<(err: EventConsumerError) => Promise<void>>().mockResolvedValue(undefined),
      consumerMatrix: testMatrix,
    })

    for (const eventType of ["listing_archived", "pending_cancellation_created"] as const) {
      bus.on({
        domain: "platform",
        eventType,
        mode: "async",
        handler: async () => { emitted.push(eventType) },
      })
    }

    const { waitUntilFn, getPromises } = createWaitUntilCollector()
    const router = createListingRouter({
      db,
      bus,
      waitUntilFn,
      companiesHouse: new InMemoryCompaniesHouseService(),
    })
    const caller = router.createCaller(ctx(makeSession({ accountId: ACCOUNT_ID })))

    await caller.archive({ listingId: listing.id })
    await Promise.all(getPromises())

    expect(emitted).toEqual(["listing_archived"])
  })
})

describe("Ops pending_cancellation_created consumer", () => {
  it("stores pending cancellation and calls PaymentService.cancelSubscription", async () => {
    const listing = await createTestListing(db, ACCOUNT_ID, {
      paddleSubscriptionId: "sub_ops_test_1",
    })

    const payment = new InMemoryPaymentService()
    const handler = pendingCancellationCreatedHandler({ db, payment })

    await handler.handler({
      _brand: "PendingCancellationCreatedEvent" as const,
      paddleSubscriptionId: "sub_ops_test_1",
      listingId: listing.id,
      reason: "listing_archived",
      timestamp: new Date().toISOString(),
    })

    // Verify pending cancellation stored
    const rows = await db.select().from(pendingCancellations)
      .where(eq(pendingCancellations.paddleSubscriptionId, "sub_ops_test_1"))
    expect(rows).toHaveLength(1)
    expect(rows[0].reason).toBe("listing_archived")
    expect(rows[0].listingId).toBe(listing.id)

    // Verify PaymentService.cancelSubscription called
    expect(payment.wasCalledWith("cancelSubscription", {
      paddleSubscriptionId: "sub_ops_test_1",
      reason: "listing_archived",
      effectiveFrom: "immediately",
    })).toBe(true)
  })
})
