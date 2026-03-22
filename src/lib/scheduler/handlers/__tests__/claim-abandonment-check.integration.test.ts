// claim_abandonment_check handler integration test — AC-12/13/21
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest"
import { eq } from "drizzle-orm"
import { getTestDb, resetDb, closeTestDb } from "@/db/test-utils"
import { seedTestUser, createTestListing, makeUUID } from "@/db/test-fixtures"
import { listings, preClaimSnapshots } from "@/db/schema/data-and-listings"
import { ActionHandlerRegistry } from "@/lib/scheduler"
import { invokeHandler } from "./invoke-handler"
import { registerClaimAbandonmentCheckHandler } from "../claim-abandonment-check"

let db: ReturnType<typeof getTestDb>

const ACCOUNT_ID = makeUUID("abandon-001")

function createMockSchedulerDb() {
  const scheduled: Array<{
    action: string
    params: Record<string, unknown>
    executeAt: Date
  }> = []

  return {
    db: {
      insert: async (row: Record<string, unknown>) => {
        scheduled.push({
          action: row.action as string,
          params: row.params as Record<string, unknown>,
          executeAt: row.executeAt as Date,
        })
        return "mock-id"
      },
      cancelMatching: async () => 0,
      findPending: async () => null,
    },
    getScheduled: () => scheduled,
  }
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

describe("claim_abandonment_check handler", () => {
  it("AC-12: reverts pending_review > 90 days to unclaimed", async () => {
    const now = new Date()
    const ninetyOneDaysAgo = new Date(now.getTime() - 91 * 24 * 60 * 60 * 1000)

    const listing = await createTestListing(db, ACCOUNT_ID, {
      claimStatus: "pending_review",
      claimSubmittedAt: ninetyOneDaysAgo,
    })

    const mockScheduler = createMockSchedulerDb()
    const registry = new ActionHandlerRegistry()
    registerClaimAbandonmentCheckHandler(registry, { db, schedulerDb: mockScheduler.db })

    await invokeHandler(registry, "claim_abandonment_check", {} as Record<string, never>)

    const [updated] = await db
      .select({ claimStatus: listings.claimStatus, accountId: listings.accountId })
      .from(listings)
      .where(eq(listings.id, listing.id))

    expect(updated.claimStatus).toBe("unclaimed")
    expect(updated.accountId).toBeNull()
  })

  it("AC-12: does NOT revert pending_review < 90 days", async () => {
    const now = new Date()
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

    const listing = await createTestListing(db, ACCOUNT_ID, {
      claimStatus: "pending_review",
      claimSubmittedAt: thirtyDaysAgo,
    })

    const mockScheduler = createMockSchedulerDb()
    const registry = new ActionHandlerRegistry()
    registerClaimAbandonmentCheckHandler(registry, { db, schedulerDb: mockScheduler.db })

    await invokeHandler(registry, "claim_abandonment_check", {} as Record<string, never>)

    const [updated] = await db
      .select({ claimStatus: listings.claimStatus, accountId: listings.accountId })
      .from(listings)
      .where(eq(listings.id, listing.id))

    expect(updated.claimStatus).toBe("pending_review")
    expect(updated.accountId).toBe(ACCOUNT_ID)
  })

  it("AC-13: schedules pre_claim_snapshot_cleanup for each reverted listing", async () => {
    const ninetyOneDaysAgo = new Date(Date.now() - 91 * 24 * 60 * 60 * 1000)

    const listing = await createTestListing(db, ACCOUNT_ID, {
      claimStatus: "pending_review",
      claimSubmittedAt: ninetyOneDaysAgo,
    })

    const mockScheduler = createMockSchedulerDb()
    const registry = new ActionHandlerRegistry()
    registerClaimAbandonmentCheckHandler(registry, { db, schedulerDb: mockScheduler.db })

    await invokeHandler(registry, "claim_abandonment_check", {} as Record<string, never>)

    const scheduled = mockScheduler.getScheduled()

    // Should schedule: pre_claim_snapshot_cleanup + quality_score_recalculation + self-perpetuation
    const snapshotCleanups = scheduled.filter((s) => s.action === "pre_claim_snapshot_cleanup")
    expect(snapshotCleanups).toHaveLength(1)
    expect(snapshotCleanups[0].params).toEqual({ listingId: listing.id })

    const recalcs = scheduled.filter((s) => s.action === "quality_score_recalculation")
    expect(recalcs).toHaveLength(1)
    expect(recalcs[0].params).toEqual({ listingId: listing.id })
  })

  it("AC-21: self-perpetuates by scheduling next run 24h later", async () => {
    const mockScheduler = createMockSchedulerDb()
    const registry = new ActionHandlerRegistry()
    registerClaimAbandonmentCheckHandler(registry, { db, schedulerDb: mockScheduler.db })

    const beforeExec = Date.now()
    await invokeHandler(registry, "claim_abandonment_check", {} as Record<string, never>)
    const afterExec = Date.now()

    const scheduled = mockScheduler.getScheduled()
    const selfSchedule = scheduled.filter((s) => s.action === "claim_abandonment_check")
    expect(selfSchedule).toHaveLength(1)
    expect(selfSchedule[0].params).toEqual({})

    // Verify next execution is ~24h from now
    const nextExecMs = selfSchedule[0].executeAt.getTime()
    const expectedMs = 24 * 60 * 60 * 1000
    expect(nextExecMs).toBeGreaterThanOrEqual(beforeExec + expectedMs)
    expect(nextExecMs).toBeLessThanOrEqual(afterExec + expectedMs)
  })

  it("handles multiple abandoned listings", async () => {
    const ninetyOneDaysAgo = new Date(Date.now() - 91 * 24 * 60 * 60 * 1000)

    await createTestListing(db, ACCOUNT_ID, {
      claimStatus: "pending_review",
      claimSubmittedAt: ninetyOneDaysAgo,
    })
    await createTestListing(db, ACCOUNT_ID, {
      claimStatus: "pending_review",
      claimSubmittedAt: ninetyOneDaysAgo,
    })

    const mockScheduler = createMockSchedulerDb()
    const registry = new ActionHandlerRegistry()
    registerClaimAbandonmentCheckHandler(registry, { db, schedulerDb: mockScheduler.db })

    await invokeHandler(registry, "claim_abandonment_check", {} as Record<string, never>)

    // 2 listings × (snapshot cleanup + recalculation) + 1 self-perpetuation = 5
    const scheduled = mockScheduler.getScheduled()
    expect(scheduled.filter((s) => s.action === "pre_claim_snapshot_cleanup")).toHaveLength(2)
    expect(scheduled.filter((s) => s.action === "quality_score_recalculation")).toHaveLength(2)
    expect(scheduled.filter((s) => s.action === "claim_abandonment_check")).toHaveLength(1)
  })
})
