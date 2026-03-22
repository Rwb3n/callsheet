// Integration tests for revenue perception — AC-39 through AC-44, AC-46

import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { getTestDb, resetDb, closeTestDb } from "@/db/test-utils"
import {
  makeUUID,
  makeSession,
  makeAdminSession,
  ctx,
  seedTestUser,
  createTestListing,
  expectTRPCError,
  createDecisionLogDb,
  createTestBus,
} from "@/db/test-fixtures"
import { createCommercialRouter, type CommercialRouterDeps } from "@/server/routers/commercial"
import { InMemoryEmailService } from "@/lib/email/transport"
import { churnAnalysisLog } from "@/db/schema/commercial"
import { listings } from "@/db/schema/data-and-listings"
import { eq, sql } from "drizzle-orm"
import { computeRevenuePerception } from "@/domains/commercial/revenue-perception"

const db = getTestDb()

const OWNER = makeUUID("rv1")
const NON_ADMIN = makeUUID("rv2")

const adminSession = makeAdminSession(OWNER)
const userSession = makeSession({ accountId: NON_ADMIN })

function makeDeps(): CommercialRouterDeps {
  return {
    db,
    decisionLogDb: createDecisionLogDb(db),
    emailService: new InMemoryEmailService(),
    bus: createTestBus(),
    waitUntilFn: (p) => { p.catch(() => {}) },
  }
}

function makeCaller(s = adminSession) {
  const router = createCommercialRouter(makeDeps())
  return router.createCaller(ctx(s))
}

beforeEach(async () => {
  await resetDb()
  await seedTestUser(db, OWNER)
  await seedTestUser(db, NON_ADMIN, "nonadmin@test.com")
})

afterAll(async () => {
  await closeTestDb()
})

async function setTierAndCadence(listingId: string, tier: "free" | "standard" | "premium" | "partner", cadence: string | null) {
  await db
    .update(listings)
    .set({ subscriptionTier: tier, billingCadence: cadence })
    .where(eq(listings.id, listingId))
}

async function insertChurnLog(
  listingId: string,
  eventType: string,
  annualRevenue: number | null = null,
  daysAgo = 0,
) {
  await db.insert(churnAnalysisLog).values({
    listingId,
    accountId: OWNER,
    eventType,
    annualRevenue,
    createdAt: sql`now() - interval '${sql.raw(String(daysAgo))} days'`,
  })
}

describe("computeRevenuePerception", () => {
  it("computes MRR from PRICING × billing cadence (AC-39)", async () => {
    // 3 Standard annual + 1 Premium monthly
    const l1 = await createTestListing(db, OWNER, { name: "Std1" })
    const l2 = await createTestListing(db, OWNER, { name: "Std2" })
    const l3 = await createTestListing(db, OWNER, { name: "Std3" })
    const l4 = await createTestListing(db, OWNER, { name: "Prem1" })

    await setTierAndCadence(l1.id, "standard", "annual")
    await setTierAndCadence(l2.id, "standard", "annual")
    await setTierAndCadence(l3.id, "standard", "annual")
    await setTierAndCadence(l4.id, "premium", "monthly")

    const result = await computeRevenuePerception(db)

    // MRR = (3 × 199/12) + 39 = 49.75 + 39 = 88.75
    const expectedMRR = 3 * (199 / 12) + 39
    expect(result.mrr).toBeCloseTo(expectedMRR, 2)
  })

  it("computes ARR = MRR × 12 (AC-40)", async () => {
    const l1 = await createTestListing(db, OWNER, { name: "Ann1" })
    await setTierAndCadence(l1.id, "standard", "annual")

    const result = await computeRevenuePerception(db)
    expect(result.arr).toBeCloseTo(result.mrr * 12, 2)
  })

  it("returns tierDistribution with all 4 tiers summing to total active listings (AC-41)", async () => {
    const l1 = await createTestListing(db, OWNER, { name: "Free1" })
    const l2 = await createTestListing(db, OWNER, { name: "Std1" })
    const l3 = await createTestListing(db, OWNER, { name: "Prem1" })
    const l4 = await createTestListing(db, OWNER, { name: "Part1" })

    await setTierAndCadence(l2.id, "standard", "annual")
    await setTierAndCadence(l3.id, "premium", "annual")
    await setTierAndCadence(l4.id, "partner", "annual")

    const result = await computeRevenuePerception(db)

    expect(result.tierDistribution).toEqual({
      free: 1,
      standard: 1,
      premium: 1,
      partner: 1,
    })

    const total = Object.values(result.tierDistribution).reduce((a, b) => a + b, 0)
    expect(total).toBe(4)
  })

  it("computes churnRate30d and churnRate90d (AC-42)", async () => {
    // 5 current paid listings
    for (let i = 0; i < 5; i++) {
      const l = await createTestListing(db, OWNER, { name: `Paid${i}` })
      await setTierAndCadence(l.id, "standard", "annual")
    }

    // 5 churn events in last 30 days
    const churnListings = []
    for (let i = 0; i < 5; i++) {
      const l = await createTestListing(db, OWNER, { name: `Churned${i}` })
      churnListings.push(l)
    }

    for (const l of churnListings) {
      await insertChurnLog(l.id, "churn", -199, 10)
    }

    const result = await computeRevenuePerception(db)

    // paidAtStart = 5 (current paid) + 5 (churns) = 10
    // churnRate30d = (5 / 10) * 100 = 50%
    expect(result.churnRate30d).toBeCloseTo(50, 1)
  })

  it("returns 0 churn rate when no paid listings exist (AC-42)", async () => {
    const result = await computeRevenuePerception(db)
    expect(result.churnRate30d).toBe(0)
    expect(result.churnRate90d).toBe(0)
  })

  it("computes conversionRate30d (AC-43)", async () => {
    // 3 conversion events in last 30 days
    const convListings = []
    for (let i = 0; i < 3; i++) {
      const l = await createTestListing(db, OWNER, { name: `Conv${i}` })
      await setTierAndCadence(l.id, "standard", "annual")
      convListings.push(l)
    }
    for (const l of convListings) {
      await insertChurnLog(l.id, "conversion", 199, 5)
    }

    // 6 free claimed listings
    for (let i = 0; i < 6; i++) {
      await createTestListing(db, OWNER, { name: `Free${i}` })
    }

    const result = await computeRevenuePerception(db)

    // conversionRate = (3 / 6) * 100 = 50%
    expect(result.conversionRate30d).toBeCloseTo(50, 1)
  })

  it("excludes unclaimed listings from conversion denominator (AC-43)", async () => {
    const l = await createTestListing(db, OWNER, { name: "Unclaimed" })
    await db.update(listings).set({ accountId: null }).where(eq(listings.id, l.id))

    const result = await computeRevenuePerception(db)
    expect(result.conversionRate30d).toBe(0)
  })

  it("computes netRevenueRetention (AC-44)", async () => {
    // Premium annual listing → MRR = 399/12
    const l1 = await createTestListing(db, OWNER, { name: "Base1" })
    await setTierAndCadence(l1.id, "premium", "annual")

    // Standard annual listing
    const l2 = await createTestListing(db, OWNER, { name: "Upgr" })
    await setTierAndCadence(l2.id, "standard", "annual")

    // Upgrade event: +2400 annual
    await insertChurnLog(l2.id, "upgrade", 2400, 5)

    const result = await computeRevenuePerception(db)

    // startMRR = (399/12 + 199/12) = 49.83
    // monthlyUpgrades = 2400/12 = 200
    // NRR = ((49.83 + 200) / 49.83) * 100 > 100%
    expect(result.netRevenueRetention).toBeGreaterThan(100)
  })

  it("returns 0 NRR when MRR is 0 (AC-44)", async () => {
    const result = await computeRevenuePerception(db)
    expect(result.netRevenueRetention).toBe(0)
  })
})

describe("commercial.getRevenuePerception route", () => {
  it("returns 403 for non-admin sessions (AC-46)", async () => {
    const caller = makeCaller(userSession)
    await expectTRPCError(caller.getRevenuePerception(), "FORBIDDEN")
  })

  it("returns the full RevenuePerception type for admin sessions (AC-46)", async () => {
    const l1 = await createTestListing(db, OWNER, { name: "AdminTest" })
    await setTierAndCadence(l1.id, "standard", "annual")

    const caller = makeCaller(adminSession)
    const result = await caller.getRevenuePerception()

    expect(result).toHaveProperty("mrr")
    expect(result).toHaveProperty("arr")
    expect(result).toHaveProperty("tierDistribution")
    expect(result).toHaveProperty("churnRate30d")
    expect(result).toHaveProperty("churnRate90d")
    expect(result).toHaveProperty("conversionRate30d")
    expect(result).toHaveProperty("netRevenueRetention")
    expect(result).toHaveProperty("averageRevenuePerListing")
    expect(typeof result.mrr).toBe("number")
    expect(result.tierDistribution).toHaveProperty("free")
    expect(result.tierDistribution).toHaveProperty("standard")
    expect(result.tierDistribution).toHaveProperty("premium")
    expect(result.tierDistribution).toHaveProperty("partner")
  })
})
