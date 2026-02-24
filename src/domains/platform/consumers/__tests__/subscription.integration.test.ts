// AC-42: PP subscription_ended consumer skips re-subscribe CTA when origin === "closure"

import { describe, it, expect, beforeEach } from "vitest"
import { InMemoryNotificationDb, makeUUID } from "@/db/test-fixtures"
import { subscriptionEndedResubscribeCTAHandler } from "../subscription"

let notificationDb: InMemoryNotificationDb

const ACCOUNT_ID = makeUUID("042a")

beforeEach(() => {
  notificationDb = new InMemoryNotificationDb()
})

describe("subscription_ended resubscribeCTA consumer", () => {
  // AC-42: skips re-subscribe CTA when origin === "closure"
  it("skips re-subscribe CTA when origin is closure", async () => {
    const handler = subscriptionEndedResubscribeCTAHandler({ notificationDb })

    await handler.handler({
      _brand: "SubscriptionEndedEvent" as const,
      listingId: makeUUID("042b"),
      accountId: ACCOUNT_ID,
      previousTier: "premium",
      reason: "account_closure",
      origin: "closure",
      timestamp: new Date().toISOString(),
    })

    expect(notificationDb.getAll()).toHaveLength(0)
  })

  it("creates re-subscribe CTA notification when origin is paddle", async () => {
    const handler = subscriptionEndedResubscribeCTAHandler({ notificationDb })

    await handler.handler({
      _brand: "SubscriptionEndedEvent" as const,
      listingId: makeUUID("042c"),
      accountId: ACCOUNT_ID,
      previousTier: "standard",
      reason: "cancellation",
      origin: "paddle",
      timestamp: new Date().toISOString(),
    })

    const notifications = notificationDb.getAll()
    expect(notifications).toHaveLength(1)
    expect(notifications[0].type).toBe("subscription_ending")
    expect(notifications[0].body).toContain("standard")
    expect(notifications[0].link).toBe("/pricing")
  })

  it("creates re-subscribe CTA notification when origin is archival", async () => {
    const handler = subscriptionEndedResubscribeCTAHandler({ notificationDb })

    await handler.handler({
      _brand: "SubscriptionEndedEvent" as const,
      listingId: makeUUID("042d"),
      accountId: ACCOUNT_ID,
      previousTier: "premium",
      reason: "cancellation",
      origin: "archival",
      timestamp: new Date().toISOString(),
    })

    const notifications = notificationDb.getAll()
    expect(notifications).toHaveLength(1)
  })
})
