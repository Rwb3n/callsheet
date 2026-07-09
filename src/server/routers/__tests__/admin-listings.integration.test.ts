// Admin listings router integration tests — CS-WORK-097

import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { eq } from "drizzle-orm"
import { getTestDb, resetDb, closeTestDb } from "@/db/test-utils"
import {
  makeUUID,
  makeAdminSession,
  makeSession,
  ctx,
  seedTestUser,
  createTestListing,
  expectTRPCError,
} from "@/db/test-fixtures"
import { createAdminListingsRouter } from "@/server/routers/admin/listings"
import { listings } from "@/db/schema/data-and-listings"

const db = getTestDb()
const adminId = makeUUID("admin001")
const ownerId = makeUUID("owner001")

const router = createAdminListingsRouter({ db })
const caller = router.createCaller(ctx(makeAdminSession(adminId)))
const userCaller = router.createCaller(ctx(makeSession({ accountId: makeUUID("user001") })))

beforeEach(async () => {
  await resetDb()
  await seedTestUser(db, adminId)
  await seedTestUser(db, ownerId, "owner@test.com")
})

afterAll(async () => {
  await closeTestDb()
})

describe("admin.listings.suspend", () => {
  it("AC-1: suspends an active listing", async () => {
    const listing = await createTestListing(db, ownerId)

    const result = await caller.suspend({ listingId: listing.id, reason: "Policy violation" })
    expect(result.status).toBe("suspended")

    const [updated] = await db
      .select({ lifecycleStatus: listings.lifecycleStatus })
      .from(listings)
      .where(eq(listings.id, listing.id))
    expect(updated.lifecycleStatus).toBe("suspended")
  })

  it("AC-1: rejects if already suspended", async () => {
    const listing = await createTestListing(db, ownerId, { lifecycleStatus: "suspended" })

    await expectTRPCError(
      caller.suspend({ listingId: listing.id, reason: "test" }),
      "CONFLICT",
      "already suspended",
    )
  })

  it("AC-1: throws NOT_FOUND for missing listing", async () => {
    await expectTRPCError(
      caller.suspend({ listingId: makeUUID("nonexist"), reason: "test" }),
      "NOT_FOUND",
    )
  })
})

describe("admin.listings.unsuspend", () => {
  it("AC-2: unsuspends a suspended listing", async () => {
    const listing = await createTestListing(db, ownerId, { lifecycleStatus: "suspended" })

    const result = await caller.unsuspend({ listingId: listing.id })
    expect(result.status).toBe("active")

    const [updated] = await db
      .select({ lifecycleStatus: listings.lifecycleStatus })
      .from(listings)
      .where(eq(listings.id, listing.id))
    expect(updated.lifecycleStatus).toBe("active")
  })

  it("AC-2: rejects if not suspended", async () => {
    const listing = await createTestListing(db, ownerId)

    await expectTRPCError(
      caller.unsuspend({ listingId: listing.id }),
      "PRECONDITION_FAILED",
      "not suspended",
    )
  })
})

describe("AC-3: admin auth enforcement", () => {
  it("suspend requires adminProcedure", async () => {
    await expect(userCaller.suspend({ listingId: makeUUID("any00001"), reason: "test" }))
      .rejects.toThrow("Admin access required")
  })

  it("unsuspend requires adminProcedure", async () => {
    await expect(userCaller.unsuspend({ listingId: makeUUID("any00001") }))
      .rejects.toThrow("Admin access required")
  })
})
