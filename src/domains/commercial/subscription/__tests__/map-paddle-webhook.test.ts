// Unit tests for mapPaddleWebhook — CR §4.4, S4 §2

import { describe, it, expect } from "vitest"
import { mapPaddleWebhook, inferCancellationReason } from "../map-paddle-webhook"
import type { PaddleWebhookEvent } from "@/domains/operations/paddle/types"

function makeEvent(overrides: Partial<PaddleWebhookEvent> & { event_type: PaddleWebhookEvent["event_type"] }): PaddleWebhookEvent {
  return {
    event_id: `evt_${Date.now()}`,
    occurred_at: new Date().toISOString(),
    data: {
      id: "sub_123",
      status: "active",
      customer_id: "ctm_456",
      custom_data: { listing_id: "lst-1", account_id: "acc-1" },
      items: [{
        price: {
          id: "pri_standard_annual",
          product_id: "pro_1",
          billing_cycle: { interval: "year", frequency: 1 },
        },
        quantity: 1,
      }],
    },
    ...overrides,
  }
}

describe("mapPaddleWebhook", () => {
  it("maps transaction.completed to checkout_completed", () => {
    const event = makeEvent({ event_type: "transaction.completed" })
    const result = mapPaddleWebhook(event, null, null)

    expect(result).toEqual({
      type: "checkout_completed",
      listingId: "lst-1",
      accountId: "acc-1",
      tier: "standard",
      billingCadence: "annual",
      paddleSubscriptionId: "sub_123",
      paddleCustomerId: "ctm_456",
    })
  })

  it("returns null for transaction.completed without listing_id", () => {
    const event = makeEvent({ event_type: "transaction.completed" })
    event.data.custom_data = {}
    expect(mapPaddleWebhook(event, null, null)).toBeNull()
  })

  it("returns null for unknown price ID", () => {
    const event = makeEvent({ event_type: "transaction.completed" })
    event.data.items![0].price.id = "pri_unknown"
    expect(mapPaddleWebhook(event, null, null)).toBeNull()
  })

  it("maps monthly billing cycle correctly", () => {
    const event = makeEvent({ event_type: "transaction.completed" })
    event.data.items![0].price.id = "pri_premium_monthly"
    event.data.items![0].price.billing_cycle = { interval: "month", frequency: 1 }
    const result = mapPaddleWebhook(event, null, null)

    expect(result).toMatchObject({
      type: "checkout_completed",
      tier: "premium",
      billingCadence: "monthly",
    })
  })

  it("maps subscription.updated to subscription_upgraded", () => {
    const event = makeEvent({ event_type: "subscription.updated" })
    event.data.items![0].price.id = "pri_premium_annual"
    const currentListing = { subscriptionTier: "standard" as const, billingCadence: "annual" }
    const result = mapPaddleWebhook(event, null, currentListing)

    expect(result).toEqual({
      type: "subscription_upgraded",
      listingId: "lst-1",
      previousTier: "standard",
      newTier: "premium",
    })
  })

  it("maps subscription.updated to subscription_downgraded", () => {
    const event = makeEvent({ event_type: "subscription.updated" })
    event.data.items![0].price.id = "pri_standard_annual"
    const currentListing = { subscriptionTier: "premium" as const, billingCadence: "annual" }
    const result = mapPaddleWebhook(event, null, currentListing)

    expect(result).toEqual({
      type: "subscription_downgraded",
      listingId: "lst-1",
      previousTier: "premium",
      newTier: "standard",
    })
  })

  // AC-09
  it("maps subscription.updated to billing_cadence_changed when tier unchanged", () => {
    const event = makeEvent({ event_type: "subscription.updated" })
    event.data.items![0].price.id = "pri_standard_monthly"
    event.data.items![0].price.billing_cycle = { interval: "month", frequency: 1 }
    const currentListing = { subscriptionTier: "standard" as const, billingCadence: "annual" }
    const result = mapPaddleWebhook(event, null, currentListing)

    expect(result).toEqual({
      type: "billing_cadence_changed",
      listingId: "lst-1",
      tier: "standard",
      previousCadence: "annual",
      newCadence: "monthly",
    })
  })

  it("returns null for subscription.updated with no tier or cadence change", () => {
    const event = makeEvent({ event_type: "subscription.updated" })
    const currentListing = { subscriptionTier: "standard" as const, billingCadence: "annual" }
    expect(mapPaddleWebhook(event, null, currentListing)).toBeNull()
  })

  it("maps subscription.canceled to subscription_cancelled", () => {
    const event = makeEvent({ event_type: "subscription.canceled" })
    event.data.canceled_at = "2026-03-01T00:00:00Z"
    const result = mapPaddleWebhook(event, null, null)

    expect(result).toMatchObject({
      type: "subscription_cancelled",
      listingId: "lst-1",
      reason: "payment_failure", // no pending cancellation → inferred
      effectiveAt: "2026-03-01T00:00:00Z",
    })
  })

  // AC-10
  it("uses stored reason from pending cancellation registry", () => {
    const event = makeEvent({ event_type: "subscription.canceled" })
    const pending = { reason: "account_closed" }
    const result = mapPaddleWebhook(event, pending, null)

    expect(result).toMatchObject({
      type: "subscription_cancelled",
      reason: "account_closed",
    })
  })

  it("maps subscription.past_due to renewal_failed", () => {
    const event = makeEvent({ event_type: "subscription.past_due" })
    const result = mapPaddleWebhook(event, null, null)

    expect(result).toMatchObject({
      type: "renewal_failed",
      listingId: "lst-1",
      attempt: 1,
    })
  })

  it("returns null for subscription.created (not handled)", () => {
    const event = makeEvent({ event_type: "subscription.created" })
    expect(mapPaddleWebhook(event, null, null)).toBeNull()
  })
})

describe("inferCancellationReason", () => {
  it("returns stored reason when pending cancellation exists", () => {
    expect(inferCancellationReason({ reason: "voluntary" })).toBe("voluntary")
    expect(inferCancellationReason({ reason: "listing_archived" })).toBe("listing_archived")
  })

  it("defaults to payment_failure when no pending cancellation", () => {
    expect(inferCancellationReason(null)).toBe("payment_failure")
  })
})
