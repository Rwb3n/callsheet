// CS-WORK-044 AC-6 through AC-15: Analytics display + quality score integration tests
// Tests call dashboard router via createCaller() against real Postgres.

import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest"
import { getTestDb, resetDb, closeTestDb } from "@/db/test-utils"
import {
  createTestListing,
  seedTestUser,
  makeSession,
  ctx,
  InMemoryNotificationDb,
} from "@/db/test-fixtures"
import { eq } from "drizzle-orm"
import { qualityScores, qualityScoreExplanations, engagements } from "@/db/schema/data-and-listings"
import { notifications } from "@/db/schema/shared"
import type { AuthSession } from "@/lib/auth"
import type { QualityScoreExplanation } from "@/db/schema/data-and-listings"
import { createDashboardRouter } from "../dashboard"

let db: ReturnType<typeof getTestDb>
let notificationDb: InMemoryNotificationDb

const ACCOUNT_ID = "test-analytics-owner"
const OTHER_ACCOUNT = "test-analytics-other"

function caller(session: AuthSession) {
  const router = createDashboardRouter({ db, notificationDb })
  return router.createCaller(ctx(session))
}

const ownerSession = makeSession({ accountId: ACCOUNT_ID })
const otherSession = makeSession({ accountId: OTHER_ACCOUNT })

beforeAll(async () => {
  db = getTestDb()
})

beforeEach(async () => {
  await resetDb()
  notificationDb = new InMemoryNotificationDb()
  await seedTestUser(db, ACCOUNT_ID)
  await seedTestUser(db, OTHER_ACCOUNT)
})

afterAll(async () => {
  await closeTestDb()
})

// --- AC-6: Free tier — all-time totals only, no trend chart, no search terms ---

describe("dashboard.getListingDashboard — free tier (AC-6)", () => {
  it("returns all-time totals only", async () => {
    const listing = await createTestListing(db, ACCOUNT_ID, {
      subscriptionTier: "free",
    })
    await db.update(engagements).set({
      profileViews: 50,
      searchAppearances: 200,
      enquiriesReceived: 5,
    }).where(eq(engagements.listingId, listing.id))

    const result = await caller(ownerSession).getListingDashboard({
      listingId: listing.id,
    })

    expect(result.analytics.totalProfileViews).toBe(50)
    expect(result.analytics.totalSearchAppearances).toBe(200)
    expect(result.analytics.totalEnquiriesReceived).toBe(5)
    expect(result.analytics.trendData).toBeUndefined()
    expect(result.analytics.topSearchTerms).toBeUndefined()
  })
})

// --- AC-7: Standard tier — 30d trend + search terms placeholder ---

describe("dashboard.getListingDashboard — standard tier (AC-7)", () => {
  it("includes search terms placeholder for standard tier", async () => {
    const listing = await createTestListing(db, ACCOUNT_ID, {
      subscriptionTier: "standard",
    })

    const result = await caller(ownerSession).getListingDashboard({
      listingId: listing.id,
    })

    // topSearchTerms present but null (S9 not yet populated)
    expect(result.analytics.topSearchTerms).toBeNull()
    // Premium features excluded
    expect(result.analytics.viewerDemographics).toBeUndefined()
    expect(result.analytics.competitorBenchmarking).toBeUndefined()
  })
})

// --- AC-8: Premium tier — full analytics placeholders ---

describe("dashboard.getListingDashboard — premium tier (AC-8)", () => {
  it("includes all premium analytics placeholders", async () => {
    const listing = await createTestListing(db, ACCOUNT_ID, {
      subscriptionTier: "premium",
    })
    await db.update(engagements).set({
      enquiryResponseRate: 0.9,
      enquiryResponseTime: 60,
    }).where(eq(engagements.listingId, listing.id))

    const result = await caller(ownerSession).getListingDashboard({
      listingId: listing.id,
    })

    expect(result.analytics.topSearchTerms).toBeNull()
    expect(result.analytics.viewerDemographics).toBeNull()
    expect(result.analytics.competitorBenchmarking).toBeNull()
    expect(result.analytics.enquiryResponseInsights).toEqual({
      responseRate: expect.closeTo(0.9, 1),
      avgResponseTime: expect.closeTo(60, 1),
    })
  })
})

// --- AC-9: Period clamping for standard tier ---

describe("dashboard.getListingDashboard — period clamping (AC-9)", () => {
  it("accepts 30d period for standard tier", async () => {
    const listing = await createTestListing(db, ACCOUNT_ID, {
      subscriptionTier: "standard",
    })

    // No error — 30d is within standard tier limit
    const result = await caller(ownerSession).getListingDashboard({
      listingId: listing.id,
      analyticsPeriod: "30d",
    })
    expect(result.analytics).toBeDefined()
  })

  it("accepts 7d period for standard tier", async () => {
    const listing = await createTestListing(db, ACCOUNT_ID, {
      subscriptionTier: "standard",
    })

    const result = await caller(ownerSession).getListingDashboard({
      listingId: listing.id,
      analyticsPeriod: "7d",
    })
    expect(result.analytics).toBeDefined()
  })

  it("clamps 90d to 30d for standard tier (returns data, no error)", async () => {
    const listing = await createTestListing(db, ACCOUNT_ID, {
      subscriptionTier: "standard",
    })

    // 90d requested but tier max is 30d — clamped silently
    const result = await caller(ownerSession).getListingDashboard({
      listingId: listing.id,
      analyticsPeriod: "90d",
    })
    expect(result.analytics).toBeDefined()
    expect(result.featureAccess.trendAnalytics).toBe("30d")
  })

  it("allows 90d for premium tier", async () => {
    const listing = await createTestListing(db, ACCOUNT_ID, {
      subscriptionTier: "premium",
    })

    const result = await caller(ownerSession).getListingDashboard({
      listingId: listing.id,
      analyticsPeriod: "90d",
    })
    expect(result.analytics).toBeDefined()
    expect(result.featureAccess.trendAnalytics).toBe("90d")
  })
})

// --- AC-10: Performance — structural test (single query pattern) ---

describe("dashboard.getListingDashboard — performance (AC-10)", () => {
  it("returns within reasonable time for a single listing", async () => {
    const listing = await createTestListing(db, ACCOUNT_ID, {
      subscriptionTier: "premium",
    })

    const start = Date.now()
    await caller(ownerSession).getListingDashboard({ listingId: listing.id })
    const duration = Date.now() - start

    // Structural: <200ms p95 target. Allow 500ms for CI variability.
    expect(duration).toBeLessThan(500)
  })
})

// --- AC-11: Feature access returned for upgrade CTA rendering ---

describe("dashboard.getListingDashboard — upgrade CTA (AC-11)", () => {
  it("returns featureAccess so locked sections can render upgrade CTA", async () => {
    const listing = await createTestListing(db, ACCOUNT_ID, {
      subscriptionTier: "free",
    })

    const result = await caller(ownerSession).getListingDashboard({
      listingId: listing.id,
    })

    expect(result.featureAccess.trendAnalytics).toBe("none")
    expect(result.featureAccess.topSearchTerms).toBe(false)
    expect(result.featureAccess.viewerDemographics).toBe(false)
    expect(result.featureAccess.competitorBenchmarking).toBe(false)
    expect(result.featureAccess.enquiryResponseInsights).toBe(false)
  })
})

// --- AC-12, AC-13: Quality score panel ---

describe("dashboard.getQualityExplanation (AC-12, AC-13)", () => {
  it("returns composite score and 5-dimension breakdown", async () => {
    const listing = await createTestListing(db, ACCOUNT_ID)

    await db.update(qualityScores).set({
      composite: 62,
      completeness: 18,
      freshness: 20,
      accuracy: 12,
      richness: 5,
      verification: 7,
    }).where(eq(qualityScores.listingId, listing.id))

    const result = await caller(ownerSession).getQualityExplanation({
      listingId: listing.id,
    })

    expect(result).not.toBeNull()
    expect(result!.composite).toBe(62)
    expect(result!.dimensions.completeness).toEqual({ score: 18, maxScore: 25 })
    expect(result!.dimensions.freshness).toEqual({ score: 20, maxScore: 25 })
    expect(result!.dimensions.accuracy).toEqual({ score: 12, maxScore: 20 })
    expect(result!.dimensions.richness).toEqual({ score: 5, maxScore: 15 })
    expect(result!.dimensions.verification).toEqual({ score: 7, maxScore: 15 })
  })

  it("returns explanation with suggestions for improvement links", async () => {
    const listing = await createTestListing(db, ACCOUNT_ID)

    const explanation: QualityScoreExplanation = {
      composite: 53,
      dimensions: [
        { name: "completeness", score: 10, maxScore: 25, factors: [{ factor: "missing_headline", impact: "negative", detail: "Missing headline (0/2)" }, { factor: "missing_description", impact: "negative", detail: "Missing bio (0/3)" }] },
        { name: "freshness", score: 25, maxScore: 25, factors: [{ factor: "last_edit_recency", impact: "positive", detail: "2 days since last edit" }] },
        { name: "accuracy", score: 15, maxScore: 20, factors: [{ factor: "verification_tier", impact: "positive", detail: "Tier: verified" }] },
        { name: "richness", score: 3, maxScore: 15, factors: [{ factor: "media_items", impact: "negative", detail: "0 media items (max 4)" }] },
        { name: "verification", score: 0, maxScore: 15, factors: [{ factor: "verification_tier", impact: "negative", detail: "Tier: unclaimed" }] },
      ],
      topImprovements: [
        "Missing headline (0/2)",
        "Missing bio (0/3)",
        "Tier: unclaimed",
      ],
    }

    await db.update(qualityScoreExplanations).set({
      explanation,
    }).where(eq(qualityScoreExplanations.listingId, listing.id))

    const result = await caller(ownerSession).getQualityExplanation({
      listingId: listing.id,
    })

    expect(result!.explanation).not.toBeNull()
    expect(result!.explanation!.topImprovements).toHaveLength(3)
    expect(result!.explanation!.topImprovements[0]).toBe("Missing headline (0/2)")
  })

  it("returns null for nonexistent listing", async () => {
    await expect(
      caller(ownerSession).getQualityExplanation({
        listingId: "a0000000-0000-4000-8000-000000000099",
      }),
    ).rejects.toThrow("Listing not found")
  })

  it("returns NOT_FOUND for listing owned by another account", async () => {
    const otherListing = await createTestListing(db, OTHER_ACCOUNT)

    await expect(
      caller(ownerSession).getQualityExplanation({ listingId: otherListing.id }),
    ).rejects.toThrow("Listing not found")
  })
})

// --- AC-12: Quality panel via getListingDashboard ---

describe("dashboard.getListingDashboard — quality (AC-12)", () => {
  it("includes quality composite and explanation", async () => {
    const listing = await createTestListing(db, ACCOUNT_ID)
    await db.update(qualityScores).set({ composite: 45 }).where(
      eq(qualityScores.listingId, listing.id),
    )

    const result = await caller(ownerSession).getListingDashboard({
      listingId: listing.id,
    })

    expect(result.quality.composite).toBe(45)
    expect(result.quality.explanation).not.toBeUndefined()
  })
})

// --- AC-14: Decay warning banner ---

describe("dashboard.getListingDashboard — decay warning (AC-14)", () => {
  it("returns decay warning when active notification exists", async () => {
    const listing = await createTestListing(db, ACCOUNT_ID)

    // Insert a decay_warning notification directly
    await db.insert(notifications).values({
      accountId: ACCOUNT_ID,
      type: "decay_warning",
      title: "Listing may be outdated",
      body: "Your listing has not been updated in 6 months",
      dismissed: false,
    })

    const result = await caller(ownerSession).getListingDashboard({
      listingId: listing.id,
    })

    expect(result.decayWarning).not.toBeNull()
    expect(result.decayWarning!.body).toBe(
      "Your listing has not been updated in 6 months",
    )
  })

  it("returns null decay warning when no active notification", async () => {
    const listing = await createTestListing(db, ACCOUNT_ID)

    const result = await caller(ownerSession).getListingDashboard({
      listingId: listing.id,
    })

    expect(result.decayWarning).toBeNull()
  })

  it("excludes dismissed decay warnings", async () => {
    const listing = await createTestListing(db, ACCOUNT_ID)

    await db.insert(notifications).values({
      accountId: ACCOUNT_ID,
      type: "decay_warning",
      title: "Old warning",
      body: "This was dismissed",
      dismissed: true,
    })

    const result = await caller(ownerSession).getListingDashboard({
      listingId: listing.id,
    })

    expect(result.decayWarning).toBeNull()
  })
})

// --- Ownership guard ---

describe("dashboard.getListingDashboard — ownership", () => {
  it("returns NOT_FOUND for listing owned by another account", async () => {
    const otherListing = await createTestListing(db, OTHER_ACCOUNT)

    await expect(
      caller(ownerSession).getListingDashboard({ listingId: otherListing.id }),
    ).rejects.toThrow("Listing not found")
  })

  it("returns NOT_FOUND for nonexistent listing", async () => {
    await expect(
      caller(ownerSession).getListingDashboard({
        listingId: "a0000000-0000-4000-8000-000000000099",
      }),
    ).rejects.toThrow("Listing not found")
  })
})
