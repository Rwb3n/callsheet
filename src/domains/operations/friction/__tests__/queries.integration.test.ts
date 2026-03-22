// CS-WORK-064: Feature gate friction tracking integration tests
// AC-12.1 through AC-12.4, AC-12.7, AC-12.8

import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { getTestDb, resetDb, closeTestDb } from "@/db/test-utils"
import { seedTestUser, makeUUID } from "@/db/test-fixtures"
import { supportTickets } from "@/db/schema/operations"
import { getFeatureGateFrictionSummary } from "../queries"
import type { FeatureGateFrictionSummary } from "../queries"

const db = getTestDb()
const USER_ID = makeUUID("friction01")

beforeEach(async () => {
  await resetDb()
  await seedTestUser(db, USER_ID, "friction@callsheet.test")
})

afterAll(async () => {
  await closeTestDb()
})

async function insertTicket(opts: {
  category: string
  gate?: string
  createdAt?: Date
}) {
  await db.insert(supportTickets).values({
    accountId: USER_ID,
    category: opts.category,
    priority: "normal",
    status: "open",
    subject: `Test ticket — ${opts.category}`,
    details: opts.gate ? { gate: opts.gate } : undefined,
    createdAt: opts.createdAt ?? new Date(),
  })
}

describe("AC-12.1: getSummary returns friction ratios grouped by gate name", () => {
  it("returns empty gates when no friction tickets exist", async () => {
    const result = await getFeatureGateFrictionSummary(db, "30d")

    expect(result.period).toBe("30d")
    expect(result.gates).toEqual([])
  })

  it("groups by gate name with correct ticket counts", async () => {
    await insertTicket({ category: "feature_gating_confusion", gate: "trendAnalytics" })
    await insertTicket({ category: "feature_gating_confusion", gate: "trendAnalytics" })
    await insertTicket({ category: "feature_gating_confusion", gate: "topSearchTerms" })
    await insertTicket({ category: "billing_support" }) // other category — not counted in gates

    const result = await getFeatureGateFrictionSummary(db, "30d")

    expect(result.gates).toHaveLength(2)
    const trend = result.gates.find((g) => g.gateName === "trendAnalytics")!
    const search = result.gates.find((g) => g.gateName === "topSearchTerms")!

    expect(trend.ticketCount).toBe(2)
    expect(search.ticketCount).toBe(1)
  })

  it("computes frictionRatio as ticketCount / totalTickets", async () => {
    await insertTicket({ category: "feature_gating_confusion", gate: "trendAnalytics" })
    await insertTicket({ category: "billing_support" })
    await insertTicket({ category: "billing_support" })
    await insertTicket({ category: "billing_support" })

    const result = await getFeatureGateFrictionSummary(db, "30d")

    expect(result.gates).toHaveLength(1)
    expect(result.gates[0].ticketCount).toBe(1)
    expect(result.gates[0].totalTickets).toBe(4)
    expect(result.gates[0].frictionRatio).toBeCloseTo(0.25, 2)
  })
})

describe("AC-12.2: query filters by category and details->>'gate'", () => {
  it("excludes tickets without details.gate", async () => {
    await insertTicket({ category: "feature_gating_confusion" }) // no gate
    await insertTicket({ category: "feature_gating_confusion", gate: "maxMedia" })

    const result = await getFeatureGateFrictionSummary(db, "30d")

    expect(result.gates).toHaveLength(1)
    expect(result.gates[0].gateName).toBe("maxMedia")
    expect(result.gates[0].ticketCount).toBe(1)
    // totalTickets includes both (category filter doesn't apply to total)
    expect(result.gates[0].totalTickets).toBe(2)
  })

  it("respects period filter — excludes old tickets", async () => {
    const old = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000) // 60 days ago
    await insertTicket({ category: "feature_gating_confusion", gate: "maxCredits", createdAt: old })
    await insertTicket({ category: "feature_gating_confusion", gate: "maxCredits" })

    const result30 = await getFeatureGateFrictionSummary(db, "30d")
    const result90 = await getFeatureGateFrictionSummary(db, "90d")

    expect(result30.gates).toHaveLength(1)
    expect(result30.gates[0].ticketCount).toBe(1) // only recent

    expect(result90.gates).toHaveLength(1)
    expect(result90.gates[0].ticketCount).toBe(2) // both
  })
})

describe("AC-12.3: return type matches FeatureGateFrictionSummary", () => {
  it("returns correctly shaped object", async () => {
    await insertTicket({ category: "feature_gating_confusion", gate: "sponsoredPlacement" })

    const result: FeatureGateFrictionSummary = await getFeatureGateFrictionSummary(db, "90d")

    expect(typeof result.period).toBe("string")
    expect(Array.isArray(result.gates)).toBe(true)
    expect(typeof result.gates[0].gateName).toBe("string")
    expect(typeof result.gates[0].ticketCount).toBe("number")
    expect(typeof result.gates[0].totalTickets).toBe("number")
    expect(typeof result.gates[0].frictionRatio).toBe("number")
  })
})

describe("AC-12.4: response time <500ms", () => {
  it("completes within 500ms with moderate ticket volume", async () => {
    // Insert 50 tickets across 3 gates
    const gates = ["trendAnalytics", "topSearchTerms", "maxMedia"]
    for (let i = 0; i < 50; i++) {
      await insertTicket({
        category: i < 30 ? "feature_gating_confusion" : "billing_support",
        gate: i < 30 ? gates[i % 3] : undefined,
      })
    }

    const start = Date.now()
    const result = await getFeatureGateFrictionSummary(db, "30d")
    const elapsed = Date.now() - start

    expect(elapsed).toBeLessThan(500)
    expect(result.gates).toHaveLength(3)
  })
})

describe("AC-12.7: gate names correspond to TIER_LIMITS keys", () => {
  it("returns actual gate name values from details JSONB", async () => {
    await insertTicket({ category: "feature_gating_confusion", gate: "trendAnalytics" })
    await insertTicket({ category: "feature_gating_confusion", gate: "viewerDemographics" })

    const result = await getFeatureGateFrictionSummary(db, "30d")

    const names = result.gates.map((g) => g.gateName)
    expect(names).toContain("trendAnalytics")
    expect(names).toContain("viewerDemographics")
  })

  it("includes unrecognized gate names for admin review", async () => {
    await insertTicket({ category: "feature_gating_confusion", gate: "unknownFeature" })

    const result = await getFeatureGateFrictionSummary(db, "30d")

    expect(result.gates).toHaveLength(1)
    expect(result.gates[0].gateName).toBe("unknownFeature")
  })
})

describe("AC-12.8: support_tickets details JSONB column", () => {
  it("stores and retrieves gate from details JSONB", async () => {
    await insertTicket({ category: "feature_gating_confusion", gate: "sponsoredPlacement" })

    const result = await getFeatureGateFrictionSummary(db, "30d")
    expect(result.gates[0].gateName).toBe("sponsoredPlacement")
  })
})
