// Webhook integration tests — all 11 AC for CS-WORK-035

import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { eq } from "drizzle-orm"
import { getTestDb, resetDb, closeTestDb } from "@/db/test-utils"
import { seedTestUser, createTestListing, InMemoryNotificationDb, createSchedulerDb, createDecisionLogDb, createTestBus } from "@/db/test-fixtures"
import { processedPaddleEvents, pendingCancellations } from "@/db/schema/operations"
import { listings } from "@/db/schema/data-and-listings"
import { accountProfiles } from "@/db/schema/accounts"
import {
  verifyPaddleSignature,
  isEventProcessed,
  markEventProcessed,
  cleanupProcessedEvents,
  processPaddleWebhook,
} from "../webhook-handler"
import type { WebhookHandlerDeps } from "../webhook-handler"
import {
  storePendingCancellation,
  lookupPendingCancellation,
  cleanupStalePendingCancellations,
} from "../pending-cancellations"
import type { PaddleWebhookEvent } from "../types"
import { createHmac } from "crypto"

const db = getTestDb()
const SECRET = "test-webhook-secret-pdl_123456"

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

beforeEach(async () => { await resetDb() })
afterAll(async () => { await closeTestDb() })

function makeSignature(body: string, secret: string): string {
  const ts = Math.floor(Date.now() / 1000).toString()
  const h1 = createHmac("sha256", secret).update(`${ts}:${body}`).digest("hex")
  return `ts=${ts};h1=${h1}`
}

function makeCheckoutEvent(overrides?: Partial<PaddleWebhookEvent>): PaddleWebhookEvent {
  return {
    event_id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    event_type: "transaction.completed",
    occurred_at: new Date().toISOString(),
    data: {
      id: "sub_checkout_1",
      status: "active",
      customer_id: "ctm_test_1",
      custom_data: { listing_id: "PLACEHOLDER", account_id: "PLACEHOLDER" },
      items: [{
        price: { id: "pri_standard_annual", product_id: "pro_1", billing_cycle: { interval: "year", frequency: 1 } },
        quantity: 1,
      }],
    },
    ...overrides,
  }
}

describe("Paddle Webhook Handler", () => {
  // AC-01: Valid signature returns 200
  it("verifyPaddleSignature accepts valid signature", () => {
    const body = '{"test":"data"}'
    const sig = makeSignature(body, SECRET)
    expect(verifyPaddleSignature(body, sig, SECRET)).toBe(true)
  })

  // AC-02: Invalid signature returns 401
  it("verifyPaddleSignature rejects invalid signature", () => {
    const body = '{"test":"data"}'
    const badSig = makeSignature(body, "wrong-secret")
    expect(verifyPaddleSignature(body, badSig, SECRET)).toBe(false)
  })

  it("verifyPaddleSignature rejects null signature header", () => {
    expect(verifyPaddleSignature('{"test":"data"}', null, SECRET)).toBe(false)
  })

  it("verifyPaddleSignature rejects malformed signature header", () => {
    expect(verifyPaddleSignature('{"test":"data"}', "garbage", SECRET)).toBe(false)
  })

  // AC-03: Duplicate event ID returns 200 without reprocessing
  it("isEventProcessed returns false for new event, true after marking", async () => {
    expect(await isEventProcessed(db, "evt_new")).toBe(false)
    await markEventProcessed(db, "evt_new")
    expect(await isEventProcessed(db, "evt_new")).toBe(true)
  })

  it("markEventProcessed is idempotent (duplicate insert throws, caught by caller)", async () => {
    await markEventProcessed(db, "evt_dup")
    // Second insert should throw (PK constraint)
    await expect(markEventProcessed(db, "evt_dup")).rejects.toThrow()
  })

  // AC-09: billing_cadence_changed updates without domain event
  it("billing_cadence_changed maps correctly from subscription.updated", async () => {
    await seedTestUser(db, "acc-bc")
    const listing = await createTestListing(db, "acc-bc", {
      subscriptionTier: "standard",
      billingCadence: "annual",
      paddleSubscriptionId: "sub_bc_1",
    })

    const event: PaddleWebhookEvent = {
      event_id: "evt_bc_1",
      event_type: "subscription.updated",
      occurred_at: new Date().toISOString(),
      data: {
        id: "sub_bc_1",
        status: "active",
        customer_id: "ctm_bc",
        custom_data: { listing_id: listing.id, account_id: "acc-bc" },
        items: [{
          price: { id: "pri_standard_monthly", product_id: "pro_1", billing_cycle: { interval: "month", frequency: 1 } },
          quantity: 1,
        }],
      },
    }

    await processPaddleWebhook(makeDeps(), event)

    // Verify listing billing cadence was updated
    const [updated] = await db.select().from(listings).where(eq(listings.id, listing.id))
    expect(updated.billingCadence).toBe("monthly")
  })

  // AC-10: subscription_cancelled uses stored reason from pending_cancellation
  it("subscription_cancelled uses pending cancellation reason for immediate finalisation", async () => {
    await seedTestUser(db, "acc-cancel")
    const listing = await createTestListing(db, "acc-cancel", {
      subscriptionTier: "standard",
      paddleSubscriptionId: "sub_cancel_1",
    })

    await storePendingCancellation(db, {
      paddleSubscriptionId: "sub_cancel_1",
      listingId: listing.id,
      reason: "account_closed",
    })

    const event: PaddleWebhookEvent = {
      event_id: "evt_cancel_1",
      event_type: "subscription.canceled",
      occurred_at: new Date().toISOString(),
      data: {
        id: "sub_cancel_1",
        status: "canceled",
        customer_id: "ctm_cancel",
        custom_data: { listing_id: listing.id },
        canceled_at: new Date().toISOString(),
        items: [{
          price: { id: "pri_standard_annual", product_id: "pro_1" },
          quantity: 1,
        }],
      },
    }

    await processPaddleWebhook(makeDeps(), event)

    // account_closed reason → immediate finalisation → tier becomes free
    const [updated] = await db.select().from(listings).where(eq(listings.id, listing.id))
    expect(updated.subscriptionTier).toBe("free")
  })

  // AC-37: pending_cancellation_created consumer stores record
  it("storePendingCancellation stores and lookupPendingCancellation retrieves", async () => {
    await seedTestUser(db, "acc-pc")
    const listing = await createTestListing(db, "acc-pc")

    await storePendingCancellation(db, {
      paddleSubscriptionId: "sub_pc_1",
      listingId: listing.id,
      reason: "voluntary",
    })

    const found = await lookupPendingCancellation(db, "sub_pc_1")
    expect(found).toEqual({ listingId: listing.id, reason: "voluntary" })
  })

  // AC-38: Webhook handler matches by paddleSubscriptionId
  it("lookupPendingCancellation returns null for unknown subscription", async () => {
    const found = await lookupPendingCancellation(db, "sub_unknown")
    expect(found).toBeNull()
  })

  // AC-39: Records older than 24h cleaned up during webhook processing
  it("cleanupStalePendingCancellations removes records older than 24h", async () => {
    await seedTestUser(db, "acc-cleanup")
    const listing = await createTestListing(db, "acc-cleanup")

    // Insert a stale record (26 hours ago)
    await db.insert(pendingCancellations).values({
      paddleSubscriptionId: "sub_stale",
      listingId: listing.id,
      reason: "voluntary",
      createdAt: new Date(Date.now() - 26 * 60 * 60 * 1000),
    })

    // Insert a fresh record
    await storePendingCancellation(db, {
      paddleSubscriptionId: "sub_fresh",
      listingId: listing.id,
      reason: "payment_failure",
    })

    await cleanupStalePendingCancellations(db)

    expect(await lookupPendingCancellation(db, "sub_stale")).toBeNull()
    expect(await lookupPendingCancellation(db, "sub_fresh")).not.toBeNull()
  })

  // AC-44: Second listing checkout reuses paddleCustomerId
  // AC-45: First listing checkout stores paddleCustomerId on both
  it("checkout_completed stores paddleCustomerId on profile and listing", async () => {
    const accId = "a0000000-0000-0000-0000-000000000c01"
    await seedTestUser(db, accId)
    const listing = await createTestListing(db, accId, { claimStatus: "claimed" })

    const event = makeCheckoutEvent()
    event.data.custom_data = { listing_id: listing.id, account_id: accId }

    await processPaddleWebhook(makeDeps(), event)

    // Check listing was updated
    const [updatedListing] = await db
      .select()
      .from(listings)
      .where(eq(listings.id, listing.id))
    expect(updatedListing.paddleCustomerId).toBe("ctm_test_1")
    expect(updatedListing.paddleSubscriptionId).toBe("sub_checkout_1")
    expect(updatedListing.subscriptionTier).toBe("standard")
    expect(updatedListing.billingCadence).toBe("annual")
    expect(updatedListing.subscriptionStartDate).toBeTruthy()

    // Check account profile was updated (first checkout)
    const [profile] = await db
      .select()
      .from(accountProfiles)
      .where(eq(accountProfiles.accountId, accId))
    expect(profile.paddleCustomerId).toBe("ctm_test_1")
  })

  it("checkout_completed does not overwrite existing paddleCustomerId on profile", async () => {
    const accId = "a0000000-0000-0000-0000-000000000c02"
    await seedTestUser(db, accId)
    // Pre-set paddleCustomerId
    await db
      .update(accountProfiles)
      .set({ paddleCustomerId: "ctm_existing_999" })
      .where(eq(accountProfiles.accountId, accId))

    const listing = await createTestListing(db, accId, { claimStatus: "claimed" })
    const event = makeCheckoutEvent()
    event.data.custom_data = { listing_id: listing.id, account_id: accId }

    await processPaddleWebhook(makeDeps(), event)

    // Profile should retain existing customer ID
    const [profile] = await db
      .select()
      .from(accountProfiles)
      .where(eq(accountProfiles.accountId, accId))
    expect(profile.paddleCustomerId).toBe("ctm_existing_999")
  })

  // AC-48: processedPaddleEvents older than 30 days cleaned up
  it("cleanupProcessedEvents removes records older than 30 days", async () => {
    // Insert a stale record (35 days ago)
    await db.insert(processedPaddleEvents).values({
      eventId: "evt_old",
      processedAt: new Date(Date.now() - 35 * 24 * 60 * 60 * 1000),
    })

    // Insert a fresh record
    await markEventProcessed(db, "evt_recent")

    await cleanupProcessedEvents(db)

    expect(await isEventProcessed(db, "evt_old")).toBe(false)
    expect(await isEventProcessed(db, "evt_recent")).toBe(true)
  })
})
