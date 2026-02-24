// CS-WORK-043: Dashboard router unit tests — type validation + error paths
// Uses mock DB (not real Postgres). Integration tests in dashboard.integration.test.ts.

import { describe, it, expect } from "vitest"
import { createDashboardRouter } from "../dashboard"
import { makeSession, ctx, InMemoryNotificationDb } from "@/db/test-fixtures"
import { TRPCError } from "@trpc/server"

// Minimal mock DB that returns empty arrays for select queries
function mockDb() {
  const selectResult = {
    from: () => selectResult,
    leftJoin: () => selectResult,
    where: () => selectResult,
    limit: () => Promise.resolve([]),
    then: (resolve: (v: unknown[]) => void) => resolve([]),
    [Symbol.iterator]: function* () { /* empty */ },
  }
  return {
    select: () => selectResult,
  } as unknown as import("@/db/types").Db
}

const notificationDb = new InMemoryNotificationDb()

function caller(session: import("@/lib/auth").AuthSession | null) {
  const router = createDashboardRouter({ db: mockDb(), notificationDb })
  return router.createCaller(ctx(session))
}

describe("dashboard.getOverview", () => {
  it("rejects unauthenticated access", async () => {
    await expect(caller(null).getOverview()).rejects.toThrow(TRPCError)
  })
})

describe("dashboard.getListingContext", () => {
  it("rejects unauthenticated access", async () => {
    await expect(
      caller(null).getListingContext({ listingId: "a0000000-0000-4000-8000-000000000001" }),
    ).rejects.toThrow(TRPCError)
  })

  it("rejects invalid UUID input", async () => {
    const session = makeSession({ accountId: "test-user" })
    await expect(
      caller(session).getListingContext({ listingId: "not-a-uuid" }),
    ).rejects.toThrow()
  })
})
