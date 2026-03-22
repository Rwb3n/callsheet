// CS-WORK-064: Admin friction router integration tests
// AC-12.1 (router level), AC-12.2, AC-12.3

import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { getTestDb, resetDb, closeTestDb } from "@/db/test-utils"
import { makeUUID, makeAdminSession, makeSession, ctx, seedTestUser } from "@/db/test-fixtures"
import { createAdminFrictionRouter } from "@/server/routers/admin/friction"
import { supportTickets } from "@/db/schema/operations"

const db = getTestDb()
const router = createAdminFrictionRouter({ db })

const ADMIN_ID = makeUUID("adm-fric1")

beforeEach(async () => {
  await resetDb()
  await seedTestUser(db, ADMIN_ID, "admin-friction@callsheet.test")
})

afterAll(async () => {
  await closeTestDb()
})

describe("admin.friction.getSummary auth guard", () => {
  it("rejects unauthenticated requests", async () => {
    const caller = router.createCaller(ctx(null))
    await expect(caller.getSummary({ period: "30d" })).rejects.toThrow("Authentication required")
  })

  it("rejects non-admin users", async () => {
    const userId = makeUUID("usr-fric1")
    await seedTestUser(db, userId, "user@callsheet.test")
    const caller = router.createCaller(ctx(makeSession({ accountId: userId, role: "user" })))
    await expect(caller.getSummary({ period: "30d" })).rejects.toThrow("Admin access required")
  })
})

describe("AC-12.1: returns friction ratios via tRPC", () => {
  it("returns empty gates on empty table", async () => {
    const caller = router.createCaller(ctx(makeAdminSession(ADMIN_ID)))
    const result = await caller.getSummary({ period: "30d" })

    expect(result.period).toBe("30d")
    expect(result.gates).toEqual([])
  })

  it("returns grouped friction data", async () => {
    await db.insert(supportTickets).values([
      {
        accountId: ADMIN_ID,
        category: "feature_gating_confusion",
        priority: "normal",
        status: "open",
        subject: "Can't see trend analytics",
        details: { gate: "trendAnalytics" },
      },
      {
        accountId: ADMIN_ID,
        category: "feature_gating_confusion",
        priority: "normal",
        status: "open",
        subject: "Can't see demographics",
        details: { gate: "viewerDemographics" },
      },
      {
        accountId: ADMIN_ID,
        category: "billing_support",
        priority: "normal",
        status: "open",
        subject: "Billing question",
      },
    ])

    const caller = router.createCaller(ctx(makeAdminSession(ADMIN_ID)))
    const result = await caller.getSummary({ period: "30d" })

    expect(result.gates).toHaveLength(2)
    expect(result.gates[0].totalTickets).toBe(3)
  })
})

describe("AC-12.3: return type matches FeatureGateFrictionSummary", () => {
  it("has period and gates array with correct fields", async () => {
    await db.insert(supportTickets).values({
      accountId: ADMIN_ID,
      category: "feature_gating_confusion",
      priority: "normal",
      status: "open",
      subject: "Feature confusion",
      details: { gate: "maxMedia" },
    })

    const caller = router.createCaller(ctx(makeAdminSession(ADMIN_ID)))
    const result = await caller.getSummary({ period: "90d" })

    expect(result).toHaveProperty("period", "90d")
    expect(result).toHaveProperty("gates")
    expect(result.gates[0]).toHaveProperty("gateName", "maxMedia")
    expect(result.gates[0]).toHaveProperty("ticketCount")
    expect(result.gates[0]).toHaveProperty("totalTickets")
    expect(result.gates[0]).toHaveProperty("frictionRatio")
  })
})

describe("input validation", () => {
  it("rejects invalid period values", async () => {
    const caller = router.createCaller(ctx(makeAdminSession(ADMIN_ID)))
    // @ts-expect-error — testing invalid input
    await expect(caller.getSummary({ period: "7d" })).rejects.toThrow()
  })

  it("accepts all valid period values", async () => {
    const caller = router.createCaller(ctx(makeAdminSession(ADMIN_ID)))

    for (const period of ["30d", "90d", "365d"] as const) {
      const result = await caller.getSummary({ period })
      expect(result.period).toBe(period)
    }
  })
})
