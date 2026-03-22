// CS-WORK-047 AC-27 through AC-30: Subscription management panel integration tests
// getSubscriptionStatus covers AC-27 (tier, cadence, dates, feature access) and AC-28 (grace period).
// getPortalUrl covers AC-30 (Paddle portal link).
// AC-29 (upgrade CTA routing) is structural — verified by upgrade procedure existence (S4 tests).

import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest"
import { getTestDb, resetDb, closeTestDb } from "@/db/test-utils"
import { createTestListing, seedTestUser, makeSession, ctx, expectTRPCError } from "@/db/test-fixtures"
import { InMemoryPaymentService } from "@/lib/services/mocks"
import type { AuthSession } from "@/lib/auth"
import { createSubscriptionRouter } from "../subscription"

let db: ReturnType<typeof getTestDb>
let payment: InMemoryPaymentService

const ACCOUNT_ID = "test-subpanel-owner"
const OTHER_ACCOUNT = "test-subpanel-other"

function caller(session: AuthSession) {
  const router = createSubscriptionRouter({ db, payment })
  return router.createCaller(ctx(session))
}

const ownerSession = makeSession({ accountId: ACCOUNT_ID })
const otherSession = makeSession({ accountId: OTHER_ACCOUNT })

beforeAll(async () => {
  db = getTestDb()
})

beforeEach(async () => {
  await resetDb()
  payment = new InMemoryPaymentService()
  await seedTestUser(db, ACCOUNT_ID)
  await seedTestUser(db, OTHER_ACCOUNT)
})

afterAll(async () => {
  await closeTestDb()
})

// --- AC-27: Subscription panel shows tier, billing cadence, start date, feature access ---

describe("subscription.getSubscriptionStatus (AC-27)", () => {
  it("returns tier, billing cadence, start date, and feature access for paid listing", async () => {
    const startDate = new Date("2026-01-15T00:00:00Z")
    const listing = await createTestListing(db, ACCOUNT_ID, {
      claimStatus: "claimed",
      subscriptionTier: "standard",
      billingCadence: "annual",
      paddleSubscriptionId: "sub_panel_123",
      subscriptionStartDate: startDate,
    })

    const result = await caller(ownerSession).getSubscriptionStatus({
      listingId: listing.id,
    })

    expect(result.tier).toBe("standard")
    expect(result.billingCadence).toBe("annual")
    expect(result.subscriptionStartDate).toEqual(startDate)
    expect(result.featureAccess.maxMedia).toBe(20)
    expect(result.featureAccess.maxCredits).toBe(50)
    expect(result.featureAccess.trendAnalytics).toBe("30d")
    expect(result.featureAccess.topSearchTerms).toBe(true)
  })

  it("returns free tier feature access with null billing details", async () => {
    const listing = await createTestListing(db, ACCOUNT_ID, {
      claimStatus: "claimed",
      subscriptionTier: "free",
    })

    const result = await caller(ownerSession).getSubscriptionStatus({
      listingId: listing.id,
    })

    expect(result.tier).toBe("free")
    expect(result.billingCadence).toBeNull()
    expect(result.subscriptionStartDate).toBeNull()
    expect(result.featureAccess.maxMedia).toBe(5)
    expect(result.featureAccess.maxCredits).toBe(10)
    expect(result.featureAccess.trendAnalytics).toBe("none")
  })
})

// --- AC-28: Grace period warning displays expiry date and previous tier ---

describe("subscription.getSubscriptionStatus (AC-28 — grace period)", () => {
  it("returns grace period with expiry date and previous tier when active", async () => {
    const listing = await createTestListing(db, ACCOUNT_ID, {
      claimStatus: "claimed",
      subscriptionTier: "free",
      paddleSubscriptionId: "sub_grace_panel",
    })

    const { gracePeriods } = await import("@/db/schema/commercial")
    const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
    await db.insert(gracePeriods).values({
      listingId: listing.id,
      paddleSubscriptionId: "sub_grace_panel",
      previousTier: "premium",
      expiresAt,
    })

    const result = await caller(ownerSession).getSubscriptionStatus({
      listingId: listing.id,
    })

    expect(result.gracePeriod).not.toBeNull()
    expect(result.gracePeriod!.previousTier).toBe("premium")
    expect(result.gracePeriod!.expiresAt).toEqual(expiresAt)
  })

  it("returns null grace period when none active", async () => {
    const listing = await createTestListing(db, ACCOUNT_ID, {
      claimStatus: "claimed",
      subscriptionTier: "standard",
      paddleSubscriptionId: "sub_no_grace",
    })

    const result = await caller(ownerSession).getSubscriptionStatus({
      listingId: listing.id,
    })

    expect(result.gracePeriod).toBeNull()
  })

  it("returns null grace period when grace period is resolved", async () => {
    const listing = await createTestListing(db, ACCOUNT_ID, {
      claimStatus: "claimed",
      subscriptionTier: "standard",
      paddleSubscriptionId: "sub_resolved_grace",
    })

    const { gracePeriods } = await import("@/db/schema/commercial")
    await db.insert(gracePeriods).values({
      listingId: listing.id,
      paddleSubscriptionId: "sub_resolved_grace",
      previousTier: "premium",
      expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      resolvedAt: new Date(),
      resolution: "payment_recovered",
    })

    const result = await caller(ownerSession).getSubscriptionStatus({
      listingId: listing.id,
    })

    expect(result.gracePeriod).toBeNull()
  })
})

// --- AC-30: Paddle portal link opens customer billing management ---

describe("subscription.getPortalUrl (AC-30)", () => {
  it("returns portal URL when account has paddleCustomerId", async () => {
    const listing = await createTestListing(db, ACCOUNT_ID, {
      claimStatus: "claimed",
      subscriptionTier: "standard",
      paddleSubscriptionId: "sub_portal_123",
    })

    const { eq } = await import("drizzle-orm")
    const { accountProfiles } = await import("@/db/schema/accounts")
    await db.update(accountProfiles).set({
      paddleCustomerId: "ctm_portal_456",
    }).where(eq(accountProfiles.accountId, ACCOUNT_ID))

    const result = await caller(ownerSession).getPortalUrl({
      listingId: listing.id,
    })

    expect(result.portalUrl).toBe("https://portal.paddle.test/customer-1")
    expect(payment.wasCalledWith("getCustomerPortalUrl", {
      paddleCustomerId: "ctm_portal_456",
    })).toBe(true)
  })

  it("returns configurable portal URL from mock", async () => {
    const listing = await createTestListing(db, ACCOUNT_ID, {
      claimStatus: "claimed",
      subscriptionTier: "premium",
    })

    const { eq } = await import("drizzle-orm")
    const { accountProfiles } = await import("@/db/schema/accounts")
    await db.update(accountProfiles).set({
      paddleCustomerId: "ctm_custom_789",
    }).where(eq(accountProfiles.accountId, ACCOUNT_ID))

    payment.setPortalUrl("https://portal.paddle.test/custom-url")

    const result = await caller(ownerSession).getPortalUrl({
      listingId: listing.id,
    })

    expect(result.portalUrl).toBe("https://portal.paddle.test/custom-url")
  })

  it("returns null portalUrl when no paddleCustomerId", async () => {
    const listing = await createTestListing(db, ACCOUNT_ID, {
      claimStatus: "claimed",
      subscriptionTier: "free",
    })

    const result = await caller(ownerSession).getPortalUrl({
      listingId: listing.id,
    })

    expect(result.portalUrl).toBeNull()
    expect(payment.wasCalledWith("getCustomerPortalUrl")).toBe(false)
  })

  it("rejects non-owner with FORBIDDEN", async () => {
    const listing = await createTestListing(db, ACCOUNT_ID, {
      claimStatus: "claimed",
      subscriptionTier: "standard",
    })

    await expectTRPCError(
      caller(otherSession).getPortalUrl({ listingId: listing.id }),
      "FORBIDDEN",
    )
  })

  it("returns NOT_FOUND for nonexistent listing", async () => {
    await expectTRPCError(
      caller(ownerSession).getPortalUrl({ listingId: "a0000000-0000-4000-8000-000000000099" }),
      "NOT_FOUND",
    )
  })
})
