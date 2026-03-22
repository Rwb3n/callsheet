// Profile strength calibrated path integration test — AC-14
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest"
import { eq } from "drizzle-orm"
import { getTestDb, resetDb, closeTestDb } from "@/db/test-utils"
import { seedTestUser, createTestListing, makeUUID, makeSession, ctx } from "@/db/test-fixtures"
import { qualityScores, qualityScoreExplanations } from "@/db/schema/data-and-listings"
import type { QualityScoreExplanation } from "@/db/schema/data-and-listings"
import { createProfileStrengthRouter } from "@/server/routers/profile-strength"

let db: ReturnType<typeof getTestDb>

const ACCOUNT_ID = makeUUID("ps-test-001")

function caller(session: ReturnType<typeof makeSession>) {
  const router = createProfileStrengthRouter({ db })
  return router.createCaller(ctx(session))
}

beforeAll(async () => {
  db = getTestDb()
})

beforeEach(async () => {
  await resetDb()
  await seedTestUser(db, ACCOUNT_ID)
})

afterAll(async () => {
  await closeTestDb()
})

describe("profile strength — AC-14 calibrated vs fallback", () => {
  it("AC-14: returns calibrated path when calculatedBy = calibrated", async () => {
    const listing = await createTestListing(db, ACCOUNT_ID, {
      headline: "Test Headline",
      bio: "A bio",
    })

    // Set calculatedBy to calibrated
    await db.update(qualityScores)
      .set({
        calculatedBy: "calibrated",
        completeness: 18,
        composite: 50,
      })
      .where(eq(qualityScores.listingId, listing.id))

    // Set explanation with completeness dimension
    const explanation: QualityScoreExplanation = {
      composite: 50,
      dimensions: [
        {
          name: "completeness",
          score: 18,
          maxScore: 25,
          factors: [
            { factor: "name", impact: "positive", detail: "name present (+3)" },
            { factor: "description", impact: "positive", detail: "description present (+3)" },
            { factor: "missing_location", impact: "negative", detail: "Missing location (0/3)" },
            { factor: "missing_credit", impact: "negative", detail: "Missing credit (0/3)" },
          ],
        },
        { name: "freshness", score: 25, maxScore: 25, factors: [] },
        { name: "accuracy", score: 0, maxScore: 20, factors: [] },
        { name: "richness", score: 0, maxScore: 15, factors: [] },
        { name: "verification", score: 0, maxScore: 15, factors: [] },
      ],
      topImprovements: ["Missing location (0/3)", "Missing credit (0/3)"],
    }

    await db.update(qualityScoreExplanations)
      .set({ explanation })
      .where(eq(qualityScoreExplanations.listingId, listing.id))

    const session = makeSession({ accountId: ACCOUNT_ID })
    const result = await caller(session).get({ listingId: listing.id })

    // Should use calibrated path — percentage based on completeness score
    expect(result.percentage).toBe(Math.round((18 / 25) * 100)) // 72
    // Next actions should come from negative factors
    expect(result.nextActions.length).toBeGreaterThan(0)
    expect(result.nextActions.some((a) => a.field === "missing_location")).toBe(true)
  })

  it("AC-14: falls back to S2 field-presence check when calculatedBy = zero_init", async () => {
    const listing = await createTestListing(db, ACCOUNT_ID, {
      headline: null,
      bio: null,
      websiteUrl: null,
      contactEmail: null,
    })

    // calculatedBy defaults to zero_init — leave as is
    const session = makeSession({ accountId: ACCOUNT_ID })
    const result = await caller(session).get({ listingId: listing.id })

    // Should use fallback path — percentage based on field presence checks
    expect(result.level).toBeDefined()
    expect(result.nextActions.length).toBeGreaterThan(0)
    // Fallback identifies missing fields directly
    expect(result.nextActions.some((a) => a.field === "missing_headline")).toBe(true)
  })
})
