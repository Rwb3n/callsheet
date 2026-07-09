// AC-32: account_closed consumer suspends enrichment for closed account listings

import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest"
import { eq } from "drizzle-orm"
import { getTestDb, resetDb, closeTestDb } from "@/db/test-utils"
import { seedTestUser, createTestListing, makeUUID } from "@/db/test-fixtures"
import { enrichmentSchedules } from "@/db/schema/intelligence"
import { accountClosedHandler } from "../account-closed"
import type { SchedulerDb } from "@/lib/scheduler/api"
import type { Db } from "@/db/types"

let db: ReturnType<typeof getTestDb>

const ACCOUNT_ID = makeUUID("ac32account")

function createMockSchedulerDb() {
  const cancelled: Array<{
    action: string
    filterParams: Record<string, unknown>
    cancelledBy: string
  }> = []
  return {
    db: {
      insert: async () => "mock-id",
      cancelMatching: async (
        action: string,
        filterParams: Record<string, unknown>,
        cancelledBy: string,
      ) => {
        cancelled.push({ action, filterParams, cancelledBy })
        return 1
      },
      findPending: async () => null,
    } satisfies SchedulerDb,
    getCancelled: () => cancelled,
  }
}

async function insertScheduleRow(
  database: Db,
  listingId: string,
  checkType: "website" | "email" | "ch",
) {
  await database.insert(enrichmentSchedules).values({
    listingId,
    checkType,
    nextCheckAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    cadenceTier: "paid",
  })
}

beforeAll(() => {
  db = getTestDb()
})

beforeEach(async () => {
  await resetDb()
  await seedTestUser(db, ACCOUNT_ID)
})

afterAll(async () => {
  await closeTestDb()
})

describe("account_closed enrichment suspension", () => {
  it("AC-32: cancels pending decay_liveness_check deferred actions for closed account listings", async () => {
    const listing1 = await createTestListing(db, ACCOUNT_ID)
    const listing2 = await createTestListing(db, ACCOUNT_ID)
    await insertScheduleRow(db, listing1.id, "website")
    await insertScheduleRow(db, listing2.id, "email")

    const mock = createMockSchedulerDb()
    const handler = accountClosedHandler({ db, schedulerDb: mock.db })

    await handler.handler({
      _brand: "AccountClosedEvent" as const,
      accountId: ACCOUNT_ID,
      listingsArchived: [listing1.id, listing2.id],
      buyerDataDeleted: false,
      complianceHoldActive: false,
      paddleCancellationsPending: false,
      timestamp: new Date().toISOString(),
    })

    const decayChecks = mock
      .getCancelled()
      .filter((c) => c.action === "decay_liveness_check")
    expect(decayChecks).toHaveLength(2)
    expect(decayChecks.map((c) => c.filterParams.listingId)).toEqual(
      expect.arrayContaining([listing1.id, listing2.id]),
    )
    expect(decayChecks[0].cancelledBy).toBe(
      "account_closed_enrichment_suspension",
    )
  })

  it("AC-32: cancels pending enrichment_full_cycle deferred actions for closed account listings", async () => {
    const listing1 = await createTestListing(db, ACCOUNT_ID)
    const listing2 = await createTestListing(db, ACCOUNT_ID)
    await insertScheduleRow(db, listing1.id, "website")
    await insertScheduleRow(db, listing2.id, "ch")

    const mock = createMockSchedulerDb()
    const handler = accountClosedHandler({ db, schedulerDb: mock.db })

    await handler.handler({
      _brand: "AccountClosedEvent" as const,
      accountId: ACCOUNT_ID,
      listingsArchived: [listing1.id, listing2.id],
      buyerDataDeleted: false,
      complianceHoldActive: false,
      paddleCancellationsPending: false,
      timestamp: new Date().toISOString(),
    })

    const fullCycles = mock
      .getCancelled()
      .filter((c) => c.action === "enrichment_full_cycle")
    expect(fullCycles).toHaveLength(2)
    expect(fullCycles.map((c) => c.filterParams.listingId)).toEqual(
      expect.arrayContaining([listing1.id, listing2.id]),
    )
    expect(fullCycles[0].cancelledBy).toBe(
      "account_closed_enrichment_suspension",
    )
  })

  it("AC-32: deletes all enrichment_schedules rows for closed account listings", async () => {
    const listing = await createTestListing(db, ACCOUNT_ID)
    await insertScheduleRow(db, listing.id, "website")
    await insertScheduleRow(db, listing.id, "email")
    await insertScheduleRow(db, listing.id, "ch")

    const mock = createMockSchedulerDb()
    const handler = accountClosedHandler({ db, schedulerDb: mock.db })

    await handler.handler({
      _brand: "AccountClosedEvent" as const,
      accountId: ACCOUNT_ID,
      listingsArchived: [listing.id],
      buyerDataDeleted: false,
      complianceHoldActive: false,
      paddleCancellationsPending: false,
      timestamp: new Date().toISOString(),
    })

    const remaining = await db
      .select()
      .from(enrichmentSchedules)
      .where(eq(enrichmentSchedules.listingId, listing.id))
    expect(remaining).toHaveLength(0)
  })

  it("does nothing when listingsArchived is empty", async () => {
    const mock = createMockSchedulerDb()
    const handler = accountClosedHandler({ db, schedulerDb: mock.db })

    await handler.handler({
      _brand: "AccountClosedEvent" as const,
      accountId: ACCOUNT_ID,
      listingsArchived: [],
      buyerDataDeleted: false,
      complianceHoldActive: false,
      paddleCancellationsPending: false,
      timestamp: new Date().toISOString(),
    })

    expect(mock.getCancelled()).toHaveLength(0)

    const allSchedules = await db.select().from(enrichmentSchedules)
    expect(allSchedules).toHaveLength(0)
  })
})
