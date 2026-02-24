// AC-11 through AC-15: Subscription checkout + upgrade integration tests
// Tests call subscription router via createCaller() against real Postgres.

import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest"
import { getTestDb, resetDb, closeTestDb } from "@/db/test-utils"
import { createTestListing, seedTestUser, makeSession, ctx } from "@/db/test-fixtures"
import { InMemoryPaymentService } from "@/lib/services/mocks"
import type { AuthSession } from "@/lib/auth"
import { createSubscriptionRouter } from "../subscription"

let db: ReturnType<typeof getTestDb>
let payment: InMemoryPaymentService

const ACCOUNT_ID = "test-sub-owner"
const OTHER_ACCOUNT = "test-sub-other"

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

// --- AC-11: createCheckout returns Paddle checkout URL for claimed listing ---

describe("subscription.createCheckout", () => {
  it("returns checkout URL for claimed listing at free tier", async () => {
    const listing = await createTestListing(db, ACCOUNT_ID, {
      claimStatus: "claimed",
      subscriptionTier: "free",
    })

    const result = await caller(ownerSession).createCheckout({
      listingId: listing.id,
      tier: "standard",
      billingCadence: "annual",
    })

    expect(result.checkoutUrl).toBe("https://checkout.paddle.test/session-1")
    expect(payment.wasCalledWith("createCheckoutSession", {
      listingId: listing.id,
      tier: "standard",
      billingCadence: "annual",
    })).toBe(true)
  })

  it("passes couponCode and paddleCustomerId when present", async () => {
    const listing = await createTestListing(db, ACCOUNT_ID, {
      claimStatus: "claimed",
      subscriptionTier: "free",
    })

    // Set paddleCustomerId on account profile
    const { eq } = await import("drizzle-orm")
    const { accountProfiles } = await import("@/db/schema/accounts")
    await db.update(accountProfiles).set({
      paddleCustomerId: "ctm_existing_123",
    }).where(eq(accountProfiles.accountId, ACCOUNT_ID))

    const result = await caller(ownerSession).createCheckout({
      listingId: listing.id,
      tier: "premium",
      couponCode: "LAUNCH2026",
    })

    expect(result.checkoutUrl).toBeTruthy()
    expect(payment.wasCalledWith("createCheckoutSession", {
      paddleCustomerId: "ctm_existing_123",
      couponCode: "LAUNCH2026",
    })).toBe(true)
  })

  it("rejects non-owner with FORBIDDEN", async () => {
    const listing = await createTestListing(db, ACCOUNT_ID, {
      claimStatus: "claimed",
      subscriptionTier: "free",
    })

    await expect(
      caller(otherSession).createCheckout({
        listingId: listing.id,
        tier: "standard",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
  })

  // --- AC-12: createCheckout on unclaimed listing returns BAD_REQUEST ---

  it("rejects unclaimed listing with BAD_REQUEST", async () => {
    const listing = await createTestListing(db, ACCOUNT_ID, {
      claimStatus: "unclaimed",
      subscriptionTier: "free",
    })

    await expect(
      caller(ownerSession).createCheckout({
        listingId: listing.id,
        tier: "standard",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" })
  })

  it("rejects pending_review listing with BAD_REQUEST", async () => {
    const listing = await createTestListing(db, ACCOUNT_ID, {
      claimStatus: "pending_review",
      subscriptionTier: "free",
    })

    await expect(
      caller(ownerSession).createCheckout({
        listingId: listing.id,
        tier: "standard",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" })
  })

  // --- AC-13: createCheckout on listing with active subscription returns BAD_REQUEST ---

  it("rejects listing with active subscription with BAD_REQUEST", async () => {
    const listing = await createTestListing(db, ACCOUNT_ID, {
      claimStatus: "claimed",
      subscriptionTier: "standard",
      paddleSubscriptionId: "sub_existing_123",
    })

    await expect(
      caller(ownerSession).createCheckout({
        listingId: listing.id,
        tier: "premium",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" })
  })

  it("returns NOT_FOUND for nonexistent listing", async () => {
    await expect(
      caller(ownerSession).createCheckout({
        listingId: "00000000-0000-0000-0000-000000000000",
        tier: "standard",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" })
  })
})

// --- AC-14: upgrade on free listing returns BAD_REQUEST ---

describe("subscription.upgrade", () => {
  it("rejects free listing with BAD_REQUEST", async () => {
    const listing = await createTestListing(db, ACCOUNT_ID, {
      claimStatus: "claimed",
      subscriptionTier: "free",
    })

    await expect(
      caller(ownerSession).upgrade({
        listingId: listing.id,
        newTier: "premium",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" })
  })

  it("rejects listing without paddleSubscriptionId with BAD_REQUEST", async () => {
    const listing = await createTestListing(db, ACCOUNT_ID, {
      claimStatus: "claimed",
      subscriptionTier: "standard",
      // no paddleSubscriptionId
    })

    await expect(
      caller(ownerSession).upgrade({
        listingId: listing.id,
        newTier: "premium",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" })
  })

  // --- AC-15: upgrade to lower tier returns BAD_REQUEST ---

  it("rejects downgrade with BAD_REQUEST", async () => {
    const listing = await createTestListing(db, ACCOUNT_ID, {
      claimStatus: "claimed",
      subscriptionTier: "premium",
      paddleSubscriptionId: "sub_active_123",
    })

    await expect(
      caller(ownerSession).upgrade({
        listingId: listing.id,
        newTier: "standard",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" })
  })

  it("rejects same-tier upgrade with BAD_REQUEST", async () => {
    const listing = await createTestListing(db, ACCOUNT_ID, {
      claimStatus: "claimed",
      subscriptionTier: "premium",
      paddleSubscriptionId: "sub_active_123",
    })

    await expect(
      caller(ownerSession).upgrade({
        listingId: listing.id,
        newTier: "premium",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" })
  })

  it("returns checkout URL for valid upgrade", async () => {
    const listing = await createTestListing(db, ACCOUNT_ID, {
      claimStatus: "claimed",
      subscriptionTier: "standard",
      paddleSubscriptionId: "sub_active_456",
    })

    const result = await caller(ownerSession).upgrade({
      listingId: listing.id,
      newTier: "premium",
    })

    expect(result.checkoutUrl).toBe("https://checkout.paddle.test/session-1")
    expect(payment.wasCalledWith("createCheckoutSession", {
      existingSubscriptionId: "sub_active_456",
      tier: "premium",
    })).toBe(true)
  })

  it("rejects non-owner with FORBIDDEN", async () => {
    const listing = await createTestListing(db, ACCOUNT_ID, {
      claimStatus: "claimed",
      subscriptionTier: "standard",
      paddleSubscriptionId: "sub_active_789",
    })

    await expect(
      caller(otherSession).upgrade({
        listingId: listing.id,
        newTier: "premium",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
  })
})

// --- getSubscriptionStatus ---

describe("subscription.getSubscriptionStatus", () => {
  it("returns tier, feature access, and null grace period for active listing", async () => {
    const listing = await createTestListing(db, ACCOUNT_ID, {
      claimStatus: "claimed",
      subscriptionTier: "premium",
      billingCadence: "annual",
      paddleSubscriptionId: "sub_status_123",
    })

    const result = await caller(ownerSession).getSubscriptionStatus({
      listingId: listing.id,
    })

    expect(result.tier).toBe("premium")
    expect(result.billingCadence).toBe("annual")
    expect(result.featureAccess.directContactVisible).toBe(true)
    expect(result.gracePeriod).toBeNull()
  })

  it("returns grace period when active", async () => {
    const listing = await createTestListing(db, ACCOUNT_ID, {
      claimStatus: "claimed",
      subscriptionTier: "free",
      paddleSubscriptionId: "sub_grace_123",
    })

    // Insert a grace period row directly
    const { gracePeriods } = await import("@/db/schema/commercial")
    const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
    await db.insert(gracePeriods).values({
      listingId: listing.id,
      paddleSubscriptionId: "sub_grace_123",
      previousTier: "premium",
      expiresAt,
    })

    const result = await caller(ownerSession).getSubscriptionStatus({
      listingId: listing.id,
    })

    expect(result.gracePeriod).not.toBeNull()
    expect(result.gracePeriod!.previousTier).toBe("premium")
  })

  it("rejects non-owner with FORBIDDEN", async () => {
    const listing = await createTestListing(db, ACCOUNT_ID, {
      claimStatus: "claimed",
      subscriptionTier: "standard",
    })

    await expect(
      caller(otherSession).getSubscriptionStatus({
        listingId: listing.id,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
  })
})
