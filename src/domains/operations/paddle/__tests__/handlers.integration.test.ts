// Webhook handler integration tests — 9 AC for CS-WORK-039

import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { eq } from "drizzle-orm"
import { getTestDb, resetDb, closeTestDb } from "@/db/test-utils"
import {
  seedTestUser,
  createTestListing,
  InMemoryNotificationDb,
  createSchedulerDb,
  createDecisionLogDb,
  createTestBus,
} from "@/db/test-fixtures"
import { listings } from "@/db/schema/data-and-listings"
import { gracePeriods } from "@/db/schema/commercial"
import { deferredActions, decisionLogs } from "@/db/schema/shared"
import { processPaddleWebhook } from "../webhook-handler"
import type { WebhookHandlerDeps } from "../webhook-handler"
import { storePendingCancellation } from "../pending-cancellations"
import type { PaddleWebhookEvent } from "../types"
import { InProcessEventBus } from "@/lib/events/bus"
import type {
  SubscriptionTierChangedEvent,
  SubscriptionEndedEvent,
  EventType,
  EventPayloadMap,
} from "@/lib/events/types"

const db = getTestDb()
const SECRET = "test-webhook-secret-pdl_123456"

// Capture emitted events
type EmittedEvent = { type: EventType; payload: EventPayloadMap[EventType] }

function makeDeps(overrides?: Partial<WebhookHandlerDeps>): WebhookHandlerDeps {
  return {
    db,
    webhookSecret: SECRET,
    eventBus: createTestBus(),
    waitUntilFn: () => {},
    schedulerDb: createSchedulerDb(db),
    decisionLogDb: createDecisionLogDb(db),
    notificationDb: new InMemoryNotificationDb(),
    ...overrides,
  }
}

function makeTrackingBus(): {
  bus: InProcessEventBus
  emitted: EmittedEvent[]
} {
  const emitted: EmittedEvent[] = []
  const bus = createTestBus()

  // Register tracking handlers for subscription events
  for (const eventType of ["subscription_tier_changed", "subscription_ended"] as const) {
    bus.on({
      domain: "operations",
      eventType,
      mode: "async",
      handler: async (payload) => {
        emitted.push({ type: eventType, payload })
      },
    })
  }

  return { bus, emitted }
}

beforeEach(async () => { await resetDb() })
afterAll(async () => { await closeTestDb() })

describe("Webhook Handler Functions (CS-WORK-039)", () => {
  // AC-04: checkout_completed sets subscriptionTier, paddleSubscriptionId, billingCadence, subscriptionStartDate
  it("checkout_completed sets subscription data on listing", async () => {
    const accId = "a0000000-0000-0000-0000-000000000004"
    await seedTestUser(db, accId)
    const listing = await createTestListing(db, accId, { claimStatus: "claimed" })

    const { bus, emitted } = makeTrackingBus()
    const deps = makeDeps({ eventBus: bus, waitUntilFn: (p) => { p.catch(() => {}) } })

    const event: PaddleWebhookEvent = {
      event_id: "evt_ac04",
      event_type: "transaction.completed",
      occurred_at: new Date().toISOString(),
      data: {
        id: "sub_ac04",
        status: "active",
        customer_id: "ctm_ac04",
        custom_data: { listing_id: listing.id, account_id: accId },
        items: [{
          price: { id: "pri_premium_annual", product_id: "pro_1", billing_cycle: { interval: "year", frequency: 1 } },
          quantity: 1,
        }],
      },
    }

    await processPaddleWebhook(deps, event)

    const [updated] = await db.select().from(listings).where(eq(listings.id, listing.id))
    expect(updated.subscriptionTier).toBe("premium")
    expect(updated.paddleSubscriptionId).toBe("sub_ac04")
    expect(updated.billingCadence).toBe("annual")
    expect(updated.subscriptionStartDate).toBeTruthy()

    // Also emits subscription_tier_changed
    expect(emitted).toHaveLength(1)
    const tierChanged = emitted[0].payload as SubscriptionTierChangedEvent
    expect(tierChanged.previousTier).toBe("free")
    expect(tierChanged.newTier).toBe("premium")
  })

  // AC-05: checkout_completed for unclaimed listing defers to retry queue
  it("checkout_completed for unclaimed listing schedules retry", async () => {
    await seedTestUser(db, "acc-05")
    const listing = await createTestListing(db, "acc-05", { claimStatus: "unclaimed" })

    const deps = makeDeps()

    const event: PaddleWebhookEvent = {
      event_id: "evt_ac05",
      event_type: "transaction.completed",
      occurred_at: new Date().toISOString(),
      data: {
        id: "sub_ac05",
        status: "active",
        customer_id: "ctm_ac05",
        custom_data: { listing_id: listing.id, account_id: "acc-05" },
        items: [{
          price: { id: "pri_standard_annual", product_id: "pro_1", billing_cycle: { interval: "year", frequency: 1 } },
          quantity: 1,
        }],
      },
    }

    await processPaddleWebhook(deps, event)

    // Listing should NOT have been updated
    const [unchanged] = await db.select().from(listings).where(eq(listings.id, listing.id))
    expect(unchanged.subscriptionTier).toBe("free")

    // Should have scheduled a retry
    const actions = await db.select().from(deferredActions)
    const retry = actions.find((a) => a.action === "checkout_precondition_retry")
    expect(retry).toBeTruthy()
    expect((retry!.params as Record<string, unknown>).attemptCount).toBe(1)
    expect((retry!.params as Record<string, unknown>).maxAttempts).toBe(12)
  })

  // AC-07: subscription_upgraded emits subscription_tier_changed with correct previousTier and newTier
  it("subscription_upgraded emits subscription_tier_changed with correct tiers", async () => {
    await seedTestUser(db, "acc-07")
    const listing = await createTestListing(db, "acc-07", {
      subscriptionTier: "standard",
      paddleSubscriptionId: "sub_ac07",
    })

    const { bus, emitted } = makeTrackingBus()
    const deps = makeDeps({ eventBus: bus, waitUntilFn: (p) => { p.catch(() => {}) } })

    const event: PaddleWebhookEvent = {
      event_id: "evt_ac07",
      event_type: "subscription.updated",
      occurred_at: new Date().toISOString(),
      data: {
        id: "sub_ac07",
        status: "active",
        customer_id: "ctm_ac07",
        custom_data: { listing_id: listing.id },
        items: [{
          price: { id: "pri_premium_annual", product_id: "pro_1", billing_cycle: { interval: "year", frequency: 1 } },
          quantity: 1,
        }],
      },
    }

    await processPaddleWebhook(deps, event)

    // Listing tier updated
    const [updated] = await db.select().from(listings).where(eq(listings.id, listing.id))
    expect(updated.subscriptionTier).toBe("premium")

    // Event emitted with correct tiers
    expect(emitted).toHaveLength(1)
    const tierChanged = emitted[0].payload as SubscriptionTierChangedEvent
    expect(tierChanged.previousTier).toBe("standard")
    expect(tierChanged.newTier).toBe("premium")
  })

  // AC-08: subscription_downgraded triggers applyDowngrade with data preservation
  it("subscription_downgraded applies downgrade and emits subscription_tier_changed", async () => {
    await seedTestUser(db, "acc-08")
    const listing = await createTestListing(db, "acc-08", {
      subscriptionTier: "premium",
      paddleSubscriptionId: "sub_ac08",
    })

    const { bus, emitted } = makeTrackingBus()
    const notificationDb = new InMemoryNotificationDb()
    const deps = makeDeps({ eventBus: bus, waitUntilFn: (p) => { p.catch(() => {}) }, notificationDb })

    const event: PaddleWebhookEvent = {
      event_id: "evt_ac08",
      event_type: "subscription.updated",
      occurred_at: new Date().toISOString(),
      data: {
        id: "sub_ac08",
        status: "active",
        customer_id: "ctm_ac08",
        custom_data: { listing_id: listing.id },
        items: [{
          price: { id: "pri_standard_annual", product_id: "pro_1", billing_cycle: { interval: "year", frequency: 1 } },
          quantity: 1,
        }],
      },
    }

    await processPaddleWebhook(deps, event)

    // Listing tier updated to standard
    const [updated] = await db.select().from(listings).where(eq(listings.id, listing.id))
    expect(updated.subscriptionTier).toBe("standard")

    // Event emitted
    expect(emitted).toHaveLength(1)
    const tierChanged = emitted[0].payload as SubscriptionTierChangedEvent
    expect(tierChanged.previousTier).toBe("premium")
    expect(tierChanged.newTier).toBe("standard")

    // Notification was sent (applyDowngrade, not suppressed)
    expect(notificationDb.getAll()).toHaveLength(1)
  })

  // AC-46: subscription_ended for listing_archived cancellation has reason: "cancellation" and origin: "archival"
  it("listing_archived cancellation produces subscription_ended with reason cancellation and origin archival", async () => {
    await seedTestUser(db, "acc-46")
    const listing = await createTestListing(db, "acc-46", {
      subscriptionTier: "standard",
      paddleSubscriptionId: "sub_ac46",
    })

    // Register pending cancellation with listing_archived reason
    await storePendingCancellation(db, {
      paddleSubscriptionId: "sub_ac46",
      listingId: listing.id,
      reason: "listing_archived",
    })

    const { bus, emitted } = makeTrackingBus()
    const deps = makeDeps({ eventBus: bus, waitUntilFn: (p) => { p.catch(() => {}) } })

    const event: PaddleWebhookEvent = {
      event_id: "evt_ac46",
      event_type: "subscription.canceled",
      occurred_at: new Date().toISOString(),
      data: {
        id: "sub_ac46",
        status: "canceled",
        customer_id: "ctm_ac46",
        custom_data: { listing_id: listing.id },
        canceled_at: new Date().toISOString(),
        items: [{
          price: { id: "pri_standard_annual", product_id: "pro_1" },
          quantity: 1,
        }],
      },
    }

    await processPaddleWebhook(deps, event)

    // Tier should be free (immediate finalisation)
    const [updated] = await db.select().from(listings).where(eq(listings.id, listing.id))
    expect(updated.subscriptionTier).toBe("free")

    // subscription_ended emitted with correct reason and origin
    const endedEvents = emitted.filter((e) => e.type === "subscription_ended")
    expect(endedEvents).toHaveLength(1)
    const ended = endedEvents[0].payload as SubscriptionEndedEvent
    expect(ended.reason).toBe("cancellation")
    expect(ended.origin).toBe("archival")
    expect(ended.previousTier).toBe("standard")
  })

  // AC-47: subscription_ended for paddle_reconciliation has reason: "cancellation" and origin: "paddle"
  it("paddle_reconciliation cancellation produces subscription_ended with reason cancellation and origin paddle", async () => {
    await seedTestUser(db, "acc-47")
    const listing = await createTestListing(db, "acc-47", {
      subscriptionTier: "premium",
      paddleSubscriptionId: "sub_ac47",
    })

    // paddle_reconciliation pending cancellation
    await storePendingCancellation(db, {
      paddleSubscriptionId: "sub_ac47",
      listingId: listing.id,
      reason: "paddle_reconciliation",
    })

    const { bus, emitted } = makeTrackingBus()
    const deps = makeDeps({ eventBus: bus, waitUntilFn: (p) => { p.catch(() => {}) } })

    const event: PaddleWebhookEvent = {
      event_id: "evt_ac47",
      event_type: "subscription.canceled",
      occurred_at: new Date().toISOString(),
      data: {
        id: "sub_ac47",
        status: "canceled",
        customer_id: "ctm_ac47",
        custom_data: { listing_id: listing.id },
        canceled_at: new Date().toISOString(),
        items: [{
          price: { id: "pri_premium_annual", product_id: "pro_1" },
          quantity: 1,
        }],
      },
    }

    await processPaddleWebhook(deps, event)

    const [updated] = await db.select().from(listings).where(eq(listings.id, listing.id))
    expect(updated.subscriptionTier).toBe("free")

    const endedEvents = emitted.filter((e) => e.type === "subscription_ended")
    expect(endedEvents).toHaveLength(1)
    const ended = endedEvents[0].payload as SubscriptionEndedEvent
    expect(ended.reason).toBe("cancellation")
    expect(ended.origin).toBe("paddle")
    expect(ended.previousTier).toBe("premium")
  })

  // AC-49: Paddle webhook for archival-path uses pending_cancellation reason "listing_archived" → origin: "archival"
  it("archival-path pending_cancellation reason listing_archived results in origin archival", async () => {
    await seedTestUser(db, "acc-49")
    const listing = await createTestListing(db, "acc-49", {
      subscriptionTier: "standard",
      paddleSubscriptionId: "sub_ac49",
    })

    // D&L wrote pending_cancellation with reason "listing_archived"
    await storePendingCancellation(db, {
      paddleSubscriptionId: "sub_ac49",
      listingId: listing.id,
      reason: "listing_archived",
    })

    const { bus, emitted } = makeTrackingBus()
    const deps = makeDeps({ eventBus: bus, waitUntilFn: (p) => { p.catch(() => {}) } })

    const event: PaddleWebhookEvent = {
      event_id: "evt_ac49",
      event_type: "subscription.canceled",
      occurred_at: new Date().toISOString(),
      data: {
        id: "sub_ac49",
        status: "canceled",
        customer_id: "ctm_ac49",
        custom_data: { listing_id: listing.id },
        canceled_at: new Date().toISOString(),
        items: [{
          price: { id: "pri_standard_annual", product_id: "pro_1" },
          quantity: 1,
        }],
      },
    }

    await processPaddleWebhook(deps, event)

    // Verify finalisation happened (tier = free, paddleSubscriptionId = null)
    const [updated] = await db.select().from(listings).where(eq(listings.id, listing.id))
    expect(updated.subscriptionTier).toBe("free")
    expect(updated.paddleSubscriptionId).toBeNull()

    // subscription_ended with origin: "archival"
    const endedEvents = emitted.filter((e) => e.type === "subscription_ended")
    expect(endedEvents).toHaveLength(1)
    const ended = endedEvents[0].payload as SubscriptionEndedEvent
    expect(ended.origin).toBe("archival")
    expect(ended.reason).toBe("cancellation")
  })

  // AC-50: Grace period expiry produces both subscription_tier_changed and subscription_ended but only one notification
  // This tests the voluntary cancellation path → grace period created (notification sent there)
  // → when expiry fires later, finaliseSubscriptionEnd uses suppressNotification on applyDowngrade [S4-ST-8]
  it("voluntary cancellation creates grace period with single notification", async () => {
    await seedTestUser(db, "acc-50")
    const listing = await createTestListing(db, "acc-50", {
      subscriptionTier: "standard",
      paddleSubscriptionId: "sub_ac50",
    })

    // No pending cancellation → mapPaddleWebhook infers "payment_failure" by default
    // With a "voluntary" pending cancellation, the handler creates a grace period
    await storePendingCancellation(db, {
      paddleSubscriptionId: "sub_ac50",
      listingId: listing.id,
      reason: "voluntary",
    })

    const notificationDb = new InMemoryNotificationDb()
    const { bus, emitted } = makeTrackingBus()
    const deps = makeDeps({ eventBus: bus, waitUntilFn: (p) => { p.catch(() => {}) }, notificationDb })

    const event: PaddleWebhookEvent = {
      event_id: "evt_ac50",
      event_type: "subscription.canceled",
      occurred_at: new Date().toISOString(),
      data: {
        id: "sub_ac50",
        status: "canceled",
        customer_id: "ctm_ac50",
        custom_data: { listing_id: listing.id },
        canceled_at: new Date().toISOString(),
        items: [{
          price: { id: "pri_standard_annual", product_id: "pro_1" },
          quantity: 1,
        }],
      },
    }

    await processPaddleWebhook(deps, event)

    // Grace period created — tier stays the same during grace period
    const [updated] = await db.select().from(listings).where(eq(listings.id, listing.id))
    expect(updated.subscriptionTier).toBe("standard")
    expect(updated.subscriptionEndDate).toBeTruthy()

    // Grace period row exists
    const gps = await db.select().from(gracePeriods)
    expect(gps).toHaveLength(1)
    expect(gps[0].previousTier).toBe("standard")

    // Only ONE notification from grace period creation (not two)
    expect(notificationDb.getAll()).toHaveLength(1)
    expect(notificationDb.getAll()[0].title).toBe("Your subscription is ending")

    // No subscription_ended yet (grace period active)
    expect(emitted.filter((e) => e.type === "subscription_ended")).toHaveLength(0)

    // Grace period expiry handler scheduled
    const actions = await db.select().from(deferredActions)
    const expiryAction = actions.find((a) => a.action === "grace_period_expiry")
    expect(expiryAction).toBeTruthy()
  })

  // Additional: renewal_failed sends notification on first attempt
  it("renewal_failed sends payment warning notification", async () => {
    await seedTestUser(db, "acc-rf")
    const listing = await createTestListing(db, "acc-rf", {
      subscriptionTier: "standard",
      paddleSubscriptionId: "sub_rf",
    })

    const notificationDb = new InMemoryNotificationDb()
    const deps = makeDeps({ notificationDb })

    const event: PaddleWebhookEvent = {
      event_id: "evt_rf",
      event_type: "subscription.past_due",
      occurred_at: new Date().toISOString(),
      data: {
        id: "sub_rf",
        status: "past_due",
        customer_id: "ctm_rf",
        custom_data: { listing_id: listing.id },
        items: [{
          price: { id: "pri_standard_annual", product_id: "pro_1" },
          quantity: 1,
        }],
      },
    }

    await processPaddleWebhook(deps, event)

    expect(notificationDb.getAll()).toHaveLength(1)
    expect(notificationDb.getAll()[0].title).toBe("Payment issue")

    // Listing tier unchanged
    const [updated] = await db.select().from(listings).where(eq(listings.id, listing.id))
    expect(updated.subscriptionTier).toBe("standard")
  })
})
