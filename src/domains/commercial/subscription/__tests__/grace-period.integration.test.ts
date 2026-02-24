// Integration tests — CS-WORK-038: Grace period management
// Tests AC-26 through AC-30 against real Postgres.

import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { eq, and, isNull, sql } from "drizzle-orm"
import { getTestDb, resetDb, closeTestDb } from "@/db/test-utils"
import {
  seedTestUser,
  createTestListing,
  createSchedulerDb,
  InMemoryNotificationDb,
  emptyConsumerMatrix,
} from "@/db/test-fixtures"
import { listings } from "@/db/schema/data-and-listings"
import { gracePeriods } from "@/db/schema/commercial"
import { deferredActions } from "@/db/schema/shared"
import {
  createGracePeriod,
  finaliseSubscriptionEnd,
  GRACE_PERIOD_DAYS,
} from "../grace-period"
import { registerGracePeriodExpiryHandler } from "@/lib/scheduler/handlers/grace-period-expiry"
import { ActionHandlerRegistry } from "@/lib/scheduler"
import { InProcessEventBus } from "@/lib/events/bus"
import type { SubscriptionEndedEvent } from "@/lib/events/types"

const db = getTestDb()

function makeNotificationDb() {
  return new InMemoryNotificationDb()
}

function makeEventBus() {
  return new InProcessEventBus({
    logError: async () => {},
    consumerMatrix: emptyConsumerMatrix,
  })
}

function noOpWaitUntil(p: Promise<void>) {
  p.catch(() => {})
}

beforeEach(async () => {
  await resetDb()
})

afterAll(async () => {
  await closeTestDb()
})

describe("createGracePeriod", () => {
  it("AC-26: payment failure creates grace period (14 days) and notifies provider", async () => {
    await seedTestUser(db, "user-038-1")
    const listing = await createTestListing(db, "user-038-1", {
      subscriptionTier: "standard",
      paddleSubscriptionId: "sub_test_001",
      billingCadence: "annual",
      name: "Acme Films",
    })

    const notificationDb = makeNotificationDb()
    const schedulerDb = createSchedulerDb(db)

    const result = await createGracePeriod(
      { db, schedulerDb, notificationDb },
      {
        listingId: listing.id,
        accountId: "user-038-1",
        paddleSubscriptionId: "sub_test_001",
        subscriptionTier: "standard",
        listingName: "Acme Films",
      },
    )

    // Grace period row created
    const [grace] = await db.select().from(gracePeriods).where(eq(gracePeriods.listingId, listing.id))
    expect(grace).toBeDefined()
    expect(grace.previousTier).toBe("standard")
    expect(grace.paddleSubscriptionId).toBe("sub_test_001")
    expect(grace.resolvedAt).toBeNull()
    expect(grace.resolution).toBeNull()

    // Expires ~14 days from now
    const diffMs = grace.expiresAt.getTime() - Date.now()
    const diffDays = diffMs / (24 * 60 * 60 * 1000)
    expect(diffDays).toBeGreaterThan(GRACE_PERIOD_DAYS - 0.1)
    expect(diffDays).toBeLessThanOrEqual(GRACE_PERIOD_DAYS)

    // Deferred action scheduled
    const [action] = await db
      .select()
      .from(deferredActions)
      .where(eq(deferredActions.action, "grace_period_expiry"))
    expect(action).toBeDefined()
    expect(action.status).toBe("pending")
    expect(action.createdBy).toBe("commercial")

    // Notification sent
    const notifications = notificationDb.getAll()
    expect(notifications).toHaveLength(1)
    expect(notifications[0].type).toBe("subscription_ending")
    expect(notifications[0].title).toBe("Your subscription is ending")
    expect(notifications[0].body).toContain("standard")
    expect(notifications[0].body).toContain("Acme Films")
    expect(notifications[0].body).toContain(`${GRACE_PERIOD_DAYS} days`)
    expect(notifications[0].accountId).toBe("user-038-1")

    // Listing subscriptionEndDate set
    const [updated] = await db
      .select({ subscriptionEndDate: listings.subscriptionEndDate })
      .from(listings)
      .where(eq(listings.id, listing.id))
    expect(updated.subscriptionEndDate).toBeDefined()
    expect(updated.subscriptionEndDate!.getTime()).toBe(result.expiresAt.getTime())
  })

  it("AC-27: voluntary cancellation creates grace period (14 days)", async () => {
    await seedTestUser(db, "user-038-2")
    const listing = await createTestListing(db, "user-038-2", {
      subscriptionTier: "premium",
      paddleSubscriptionId: "sub_test_002",
      billingCadence: "monthly",
      name: "Beta Studios",
    })

    const notificationDb = makeNotificationDb()
    const schedulerDb = createSchedulerDb(db)

    await createGracePeriod(
      { db, schedulerDb, notificationDb },
      {
        listingId: listing.id,
        accountId: "user-038-2",
        paddleSubscriptionId: "sub_test_002",
        subscriptionTier: "premium",
        listingName: "Beta Studios",
      },
    )

    // Grace period row exists with premium previousTier
    const [grace] = await db.select().from(gracePeriods).where(eq(gracePeriods.listingId, listing.id))
    expect(grace).toBeDefined()
    expect(grace.previousTier).toBe("premium")
    expect(grace.resolvedAt).toBeNull()

    // Deferred action scheduled
    const actions = await db
      .select()
      .from(deferredActions)
      .where(eq(deferredActions.action, "grace_period_expiry"))
    expect(actions).toHaveLength(1)
  })
})

describe("grace_period_expiry handler", () => {
  it("AC-28: grace period expiry with no payment recovery finalises cancellation (emits subscription_ended)", async () => {
    await seedTestUser(db, "user-038-3")
    // Listing is already on free tier and paddleSubscriptionId cleared
    // (simulating state after Paddle cancelled the subscription)
    const listing = await createTestListing(db, "user-038-3", {
      subscriptionTier: "free",
      paddleSubscriptionId: null,
      billingCadence: null,
      name: "Gamma Ltd",
    })

    // Insert active grace period
    const [grace] = await db.insert(gracePeriods).values({
      listingId: listing.id,
      paddleSubscriptionId: "sub_test_003",
      previousTier: "standard",
      expiresAt: new Date(Date.now() - 1000), // already expired
    }).returning()

    const notificationDb = makeNotificationDb()
    const eventBus = makeEventBus()

    // Capture subscription_ended events
    const capturedEvents: SubscriptionEndedEvent[] = []
    eventBus.on({
      domain: "commercial",
      eventType: "subscription_ended",
      mode: "async",
      handler: async (payload) => { capturedEvents.push(payload) },
    })

    const registry = new ActionHandlerRegistry()
    registerGracePeriodExpiryHandler(registry, {
      db,
      notificationDb,
      eventBus,
      waitUntilFn: noOpWaitUntil,
    })

    // Execute handler
    const handler = registry.get("grace_period_expiry")!
    await (handler as (p: Record<string, unknown>) => Promise<void>)({
      listingId: listing.id,
      gracePeriodId: grace.id,
    })

    // Grace period resolved as "downgraded"
    const [resolved] = await db.select().from(gracePeriods).where(eq(gracePeriods.id, grace.id))
    expect(resolved.resolvedAt).not.toBeNull()
    expect(resolved.resolution).toBe("downgraded")

    // subscription_ended event emitted
    // Need to flush async handlers
    await new Promise((r) => setTimeout(r, 50))
    expect(capturedEvents).toHaveLength(1)
    expect(capturedEvents[0].reason).toBe("grace_period_expired")
    expect(capturedEvents[0].previousTier).toBe("standard")
    expect(capturedEvents[0].origin).toBe("paddle")
    expect(capturedEvents[0].listingId).toBe(listing.id)
  })

  it("AC-29: payment recovery during grace period resolves grace as payment_recovered", async () => {
    await seedTestUser(db, "user-038-4")
    // Listing still has active subscription (payment recovered via Paddle)
    const listing = await createTestListing(db, "user-038-4", {
      subscriptionTier: "standard",
      paddleSubscriptionId: "sub_test_004",
      billingCadence: "annual",
      name: "Delta Films",
    })

    // Insert active grace period
    const [grace] = await db.insert(gracePeriods).values({
      listingId: listing.id,
      paddleSubscriptionId: "sub_test_004",
      previousTier: "standard",
      expiresAt: new Date(Date.now() + 1000),
    }).returning()

    const notificationDb = makeNotificationDb()
    const eventBus = makeEventBus()

    // Capture events — none should fire
    const capturedEvents: SubscriptionEndedEvent[] = []
    eventBus.on({
      domain: "commercial",
      eventType: "subscription_ended",
      mode: "async",
      handler: async (payload) => { capturedEvents.push(payload) },
    })

    const registry = new ActionHandlerRegistry()
    registerGracePeriodExpiryHandler(registry, {
      db,
      notificationDb,
      eventBus,
      waitUntilFn: noOpWaitUntil,
    })

    const handler = registry.get("grace_period_expiry")!
    await (handler as (p: Record<string, unknown>) => Promise<void>)({
      listingId: listing.id,
      gracePeriodId: grace.id,
    })

    // Grace period resolved as payment_recovered
    const [resolved] = await db.select().from(gracePeriods).where(eq(gracePeriods.id, grace.id))
    expect(resolved.resolvedAt).not.toBeNull()
    expect(resolved.resolution).toBe("payment_recovered")

    // No subscription_ended event
    await new Promise((r) => setTimeout(r, 50))
    expect(capturedEvents).toHaveLength(0)

    // Listing tier unchanged
    const [updated] = await db
      .select({ subscriptionTier: listings.subscriptionTier })
      .from(listings)
      .where(eq(listings.id, listing.id))
    expect(updated.subscriptionTier).toBe("standard")
  })

  it("handler no-ops when grace period already resolved", async () => {
    await seedTestUser(db, "user-038-5")
    const listing = await createTestListing(db, "user-038-5", {
      subscriptionTier: "free",
      paddleSubscriptionId: null,
    })

    // Insert already-resolved grace period
    await db.insert(gracePeriods).values({
      listingId: listing.id,
      paddleSubscriptionId: "sub_test_005",
      previousTier: "standard",
      expiresAt: new Date(Date.now() - 1000),
      resolvedAt: new Date(),
      resolution: "payment_recovered",
    })

    const notificationDb = makeNotificationDb()
    const eventBus = makeEventBus()

    const registry = new ActionHandlerRegistry()
    registerGracePeriodExpiryHandler(registry, {
      db,
      notificationDb,
      eventBus,
      waitUntilFn: noOpWaitUntil,
    })

    const handler = registry.get("grace_period_expiry")!
    await (handler as (p: Record<string, unknown>) => Promise<void>)({
      listingId: listing.id,
      gracePeriodId: "irrelevant",
    })

    // No new resolution — should remain payment_recovered
    const graces = await db.select().from(gracePeriods).where(eq(gracePeriods.listingId, listing.id))
    expect(graces).toHaveLength(1)
    expect(graces[0].resolution).toBe("payment_recovered")
  })
})

describe("immediate cancellation (AC-30)", () => {
  it("AC-30: account_closed/listing_archived cancellation is immediate (no grace period)", async () => {
    await seedTestUser(db, "user-038-6")
    const listing = await createTestListing(db, "user-038-6", {
      subscriptionTier: "standard",
      paddleSubscriptionId: "sub_test_006",
      billingCadence: "annual",
      name: "Epsilon Ltd",
    })

    const notificationDb = makeNotificationDb()
    const eventBus = makeEventBus()

    // Capture subscription_ended events
    const capturedEvents: SubscriptionEndedEvent[] = []
    eventBus.on({
      domain: "commercial",
      eventType: "subscription_ended",
      mode: "async",
      handler: async (payload) => { capturedEvents.push(payload) },
    })

    // Immediate cancellation — directly call finaliseSubscriptionEnd (no grace period)
    await finaliseSubscriptionEnd(
      { db, notificationDb, eventBus, waitUntilFn: noOpWaitUntil },
      {
        listingId: listing.id,
        accountId: "user-038-6",
        previousTier: "standard",
        reason: "account_closed",
        origin: "closure",
      },
    )

    // No grace period created
    const graces = await db.select().from(gracePeriods).where(eq(gracePeriods.listingId, listing.id))
    expect(graces).toHaveLength(0)

    // subscription_ended emitted immediately
    await new Promise((r) => setTimeout(r, 50))
    expect(capturedEvents).toHaveLength(1)
    expect(capturedEvents[0].reason).toBe("account_closure")
    expect(capturedEvents[0].origin).toBe("closure")
    expect(capturedEvents[0].previousTier).toBe("standard")

    // Listing downgraded to free
    const [updated] = await db
      .select({
        subscriptionTier: listings.subscriptionTier,
        paddleSubscriptionId: listings.paddleSubscriptionId,
        billingCadence: listings.billingCadence,
      })
      .from(listings)
      .where(eq(listings.id, listing.id))
    expect(updated.subscriptionTier).toBe("free")
    expect(updated.paddleSubscriptionId).toBeNull()
    expect(updated.billingCadence).toBeNull()
  })

  it("listing_archived immediate cancellation emits with origin=archival", async () => {
    await seedTestUser(db, "user-038-7")
    const listing = await createTestListing(db, "user-038-7", {
      subscriptionTier: "premium",
      paddleSubscriptionId: "sub_test_007",
      billingCadence: "monthly",
    })

    const notificationDb = makeNotificationDb()
    const eventBus = makeEventBus()

    const capturedEvents: SubscriptionEndedEvent[] = []
    eventBus.on({
      domain: "commercial",
      eventType: "subscription_ended",
      mode: "async",
      handler: async (payload) => { capturedEvents.push(payload) },
    })

    await finaliseSubscriptionEnd(
      { db, notificationDb, eventBus, waitUntilFn: noOpWaitUntil },
      {
        listingId: listing.id,
        accountId: "user-038-7",
        previousTier: "premium",
        reason: "listing_archived",
        origin: "archival",
      },
    )

    await new Promise((r) => setTimeout(r, 50))
    expect(capturedEvents).toHaveLength(1)
    expect(capturedEvents[0].reason).toBe("cancellation") // listing_archived → "cancellation" [S4-ST-3]
    expect(capturedEvents[0].origin).toBe("archival")
  })
})
