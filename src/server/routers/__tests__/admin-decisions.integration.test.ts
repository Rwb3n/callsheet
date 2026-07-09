// Admin decisions router integration tests — CS-WORK-094

import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { getTestDb, resetDb, closeTestDb } from "@/db/test-utils"
import {
  makeUUID,
  makeAdminSession,
  makeSession,
  ctx,
  seedTestUser,
} from "@/db/test-fixtures"
import { createAdminDecisionsRouter } from "@/server/routers/admin/decisions"
import { decisionLogs } from "@/db/schema/shared"

const db = getTestDb()
const adminId = makeUUID("admin001")

const router = createAdminDecisionsRouter({ db })
const caller = router.createCaller(ctx(makeAdminSession(adminId)))
const userCaller = router.createCaller(ctx(makeSession({ accountId: makeUUID("user001") })))

async function insertDecision(overrides: Partial<{
  domain: "data-and-listings" | "operations" | "platform" | "commercial" | "cross-domain"
  decisionType: string
  listingId: string | null
  accountId: string | null
  confidence: number | null
}> = {}) {
  const [row] = await db
    .insert(decisionLogs)
    .values({
      domain: overrides.domain ?? "operations",
      decisionType: overrides.decisionType ?? "compliance_scheduling",
      inputs: { test: true },
      output: { action: "approved" },
      confidence: overrides.confidence ?? null,
      listingId: overrides.listingId ?? null,
      accountId: overrides.accountId ?? null,
    })
    .returning()
  return row
}

beforeEach(async () => {
  await resetDb()
  await seedTestUser(db, adminId)
})

afterAll(async () => {
  await closeTestDb()
})

describe("admin.decisions.search", () => {
  it("AC-1: returns decision logs filterable by domain, decisionType, listingId, accountId", async () => {
    await insertDecision({ domain: "operations", decisionType: "compliance_scheduling" })
    await insertDecision({ domain: "data-and-listings", decisionType: "quality_scoring", listingId: makeUUID("list0001") })
    await insertDecision({ domain: "operations", decisionType: "flow_step_retry", accountId: makeUUID("acct0001") })

    const all = await caller.search({ limit: 20 })
    expect(all.items).toHaveLength(3)

    const opsOnly = await caller.search({ domain: "operations", limit: 20 })
    expect(opsOnly.items).toHaveLength(2)
    expect(opsOnly.items.every((i) => i.domain === "operations")).toBe(true)

    const byType = await caller.search({ decisionType: "quality_scoring", limit: 20 })
    expect(byType.items).toHaveLength(1)
    expect(byType.items[0].decisionType).toBe("quality_scoring")

    const byListing = await caller.search({ listingId: makeUUID("list0001"), limit: 20 })
    expect(byListing.items).toHaveLength(1)

    const byAccount = await caller.search({ accountId: makeUUID("acct0001"), limit: 20 })
    expect(byAccount.items).toHaveLength(1)
  })

  it("AC-1: filters by date range", async () => {
    await insertDecision()

    const futureFrom = new Date(Date.now() + 86400000).toISOString()
    const empty = await caller.search({ fromDate: futureFrom, limit: 20 })
    expect(empty.items).toHaveLength(0)

    const pastFrom = new Date(Date.now() - 86400000).toISOString()
    const found = await caller.search({ fromDate: pastFrom, limit: 20 })
    expect(found.items).toHaveLength(1)
  })

  it("AC-2: cursor-based pagination", async () => {
    await insertDecision()
    await insertDecision()
    await insertDecision()

    const page1 = await caller.search({ limit: 2 })
    expect(page1.items).toHaveLength(2)
    expect(page1.nextCursor).toBeDefined()

    const page2 = await caller.search({ limit: 2, cursor: page1.nextCursor! })
    expect(page2.items).toHaveLength(1)
    expect(page2.nextCursor).toBeUndefined()
  })

  it("AC-3: returns full row including inputs/output JSONB", async () => {
    const row = await insertDecision({
      domain: "commercial",
      decisionType: "conversion_evaluation",
      confidence: 85,
      listingId: makeUUID("list0001"),
      accountId: makeUUID("acct0001"),
    })

    const result = await caller.search({ limit: 20 })
    const item = result.items[0]

    expect(item.id).toBe(row.id)
    expect(item.domain).toBe("commercial")
    expect(item.decisionType).toBe("conversion_evaluation")
    expect(item.inputs).toEqual({ test: true })
    expect(item.output).toEqual({ action: "approved" })
    expect(item.confidence).toBe(85)
    expect(item.listingId).toBe(makeUUID("list0001"))
    expect(item.accountId).toBe(makeUUID("acct0001"))
    expect(item.createdAt).toBeDefined()
  })
})

describe("AC-4: admin auth enforcement", () => {
  it("search requires adminProcedure", async () => {
    await expect(userCaller.search({ limit: 20 }))
      .rejects.toThrow("Admin access required")
  })
})
