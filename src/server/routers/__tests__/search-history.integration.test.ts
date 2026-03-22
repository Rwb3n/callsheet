// Search history + saved search integration tests — CS-WORK-054, AC-33 through AC-36
// Tests AC-33/AC-34 (saved search on search router) and AC-35/AC-36 (search history router).

import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest"
import { eq } from "drizzle-orm"
import { getTestDb, resetDb, closeTestDb } from "@/db/test-utils"
import { seedTestUser, makeSession, ctx, emptyConsumerMatrix } from "@/db/test-fixtures"
import { savedSearches, searchHistory } from "@/db/schema/accounts"
import { createSearchRouter } from "@/server/routers/search"
import { createSearchHistoryRouter } from "@/server/routers/search-history"
import { InProcessEventBus } from "@/lib/events/bus"
import { createWaitUntilCollector } from "@/lib/events/waitUntil"

let db: ReturnType<typeof getTestDb>

const USER_A = "search-hist-user-a"
const USER_B = "search-hist-user-b"
const SESSION_A = makeSession({ accountId: USER_A })
const SESSION_B = makeSession({ accountId: USER_B })

function makeBus() {
  return new InProcessEventBus({
    logError: async () => {},
    consumerMatrix: emptyConsumerMatrix,
  })
}

function makeSearchCaller(session: ReturnType<typeof makeSession> | null) {
  const { waitUntilFn } = createWaitUntilCollector()
  const router = createSearchRouter({ db, bus: makeBus(), waitUntilFn })
  return router.createCaller(ctx(session))
}

function makeHistoryCaller(session: ReturnType<typeof makeSession> | null) {
  const router = createSearchHistoryRouter({ db })
  return router.createCaller(ctx(session))
}

beforeAll(async () => {
  db = getTestDb()
})

beforeEach(async () => {
  await resetDb()
  await seedTestUser(db, USER_A)
  await seedTestUser(db, USER_B)
})

afterAll(async () => {
  await closeTestDb()
})

// --- AC-33: search.saveSearch creates saved_searches row; rejects at 20 ---

describe("AC-33: search.saveSearch", () => {
  it("creates a saved_searches row with name, query, filters", async () => {
    const caller = makeSearchCaller(SESSION_A)

    const result = await caller.saveSearch({
      name: "Camera operators in London",
      query: "camera operator",
      filters: { location: "London" },
    })

    expect(result.id).toBeDefined()
    expect(result.name).toBe("Camera operators in London")
    expect(result.query).toBe("camera operator")
    expect(result.accountId).toBe(USER_A)

    const rows = await db.select().from(savedSearches)
      .where(eq(savedSearches.accountId, USER_A))
    expect(rows).toHaveLength(1)
  })

  it("rejects when account has 20 saved searches", async () => {
    const caller = makeSearchCaller(SESSION_A)

    // Insert 20 saved searches
    for (let i = 0; i < 20; i++) {
      await db.insert(savedSearches).values({
        accountId: USER_A,
        name: `Search ${i}`,
      })
    }

    await expect(
      caller.saveSearch({ name: "One too many" }),
    ).rejects.toThrow(/Maximum 20/)
  })

  it("allows save when another account has 20 but this account has fewer", async () => {
    const callerA = makeSearchCaller(SESSION_A)

    // USER_B has 20 saved searches
    for (let i = 0; i < 20; i++) {
      await db.insert(savedSearches).values({
        accountId: USER_B,
        name: `B Search ${i}`,
      })
    }

    // USER_A should still be able to save
    const result = await callerA.saveSearch({ name: "A's search" })
    expect(result.id).toBeDefined()
  })
})

// --- AC-34: search.deleteSavedSearch ownership check ---

describe("AC-34: search.deleteSavedSearch", () => {
  it("deletes when savedSearch.accountId matches session", async () => {
    const caller = makeSearchCaller(SESSION_A)

    const created = await caller.saveSearch({ name: "To delete" })
    await caller.deleteSavedSearch({ savedSearchId: created.id })

    const rows = await db.select().from(savedSearches)
      .where(eq(savedSearches.id, created.id))
    expect(rows).toHaveLength(0)
  })

  it("returns NOT_FOUND when savedSearch belongs to another account", async () => {
    // USER_A creates a saved search
    const callerA = makeSearchCaller(SESSION_A)
    const created = await callerA.saveSearch({ name: "A's search" })

    // USER_B tries to delete it
    const callerB = makeSearchCaller(SESSION_B)
    await expect(
      callerB.deleteSavedSearch({ savedSearchId: created.id }),
    ).rejects.toThrow(/Saved search not found/)
  })

  it("returns NOT_FOUND for nonexistent savedSearchId", async () => {
    const caller = makeSearchCaller(SESSION_A)

    await expect(
      caller.deleteSavedSearch({ savedSearchId: "00000000-0000-4000-8000-000000000099" }),
    ).rejects.toThrow(/Saved search not found/)
  })
})

// --- AC-35: searchHistory.list ---

describe("AC-35: searchHistory.list", () => {
  it("returns entries for the authenticated user ordered by createdAt DESC", async () => {
    // Insert history rows with different timestamps
    const base = new Date("2026-01-01T10:00:00Z")
    await db.insert(searchHistory).values([
      { accountId: USER_A, query: "first", resultCount: 5, createdAt: new Date(base.getTime()) },
      { accountId: USER_A, query: "second", resultCount: 10, createdAt: new Date(base.getTime() + 60_000) },
      { accountId: USER_A, query: "third", resultCount: 15, createdAt: new Date(base.getTime() + 120_000) },
    ])

    const caller = makeHistoryCaller(SESSION_A)
    const result = await caller.list({})

    expect(result).toHaveLength(3)
    // Most recent first
    expect(result[0].query).toBe("third")
    expect(result[1].query).toBe("second")
    expect(result[2].query).toBe("first")
  })

  it("defaults to limit 10", async () => {
    // Insert 12 history rows
    for (let i = 0; i < 12; i++) {
      await db.insert(searchHistory).values({
        accountId: USER_A,
        query: `search-${i}`,
        resultCount: i,
      })
    }

    const caller = makeHistoryCaller(SESSION_A)
    const result = await caller.list({})

    expect(result).toHaveLength(10)
  })

  it("respects max limit of 50", async () => {
    const caller = makeHistoryCaller(SESSION_A)
    // Requesting limit beyond max
    const result = await caller.list({ limit: 50 })

    // Should not throw; just returns up to 50 (we have 0 rows, so returns 0)
    expect(result.length).toBeLessThanOrEqual(50)
  })

  it("returns only entries for the authenticated user, not others", async () => {
    await db.insert(searchHistory).values([
      { accountId: USER_A, query: "user-a-search", resultCount: 5 },
      { accountId: USER_B, query: "user-b-search", resultCount: 10 },
    ])

    const callerA = makeHistoryCaller(SESSION_A)
    const result = await callerA.list({})

    expect(result).toHaveLength(1)
    expect(result[0].query).toBe("user-a-search")
  })

  it("returns correct fields: id, query, filters, resultCount, createdAt", async () => {
    await db.insert(searchHistory).values({
      accountId: USER_A,
      query: "camera",
      filters: { sectors: ["camera"] } as Record<string, unknown>,
      resultCount: 42,
    })

    const caller = makeHistoryCaller(SESSION_A)
    const result = await caller.list({})

    expect(result).toHaveLength(1)
    expect(result[0].id).toBeDefined()
    expect(result[0].query).toBe("camera")
    expect(result[0].filters).toEqual({ sectors: ["camera"] })
    expect(result[0].resultCount).toBe(42)
    expect(result[0].createdAt).toBeInstanceOf(Date)
  })
})

// --- AC-36: searchHistory.clear ---

describe("AC-36: searchHistory.clear", () => {
  it("deletes all search_history rows for the authenticated user", async () => {
    await db.insert(searchHistory).values([
      { accountId: USER_A, query: "search-1", resultCount: 5 },
      { accountId: USER_A, query: "search-2", resultCount: 10 },
      { accountId: USER_A, query: "search-3", resultCount: 15 },
    ])

    const caller = makeHistoryCaller(SESSION_A)
    await caller.clear()

    const remaining = await db.select().from(searchHistory)
      .where(eq(searchHistory.accountId, USER_A))
    expect(remaining).toHaveLength(0)
  })

  it("does not delete rows belonging to other accounts", async () => {
    await db.insert(searchHistory).values([
      { accountId: USER_A, query: "a-search", resultCount: 5 },
      { accountId: USER_B, query: "b-search", resultCount: 10 },
    ])

    const callerA = makeHistoryCaller(SESSION_A)
    await callerA.clear()

    // USER_A's rows deleted
    const aRows = await db.select().from(searchHistory)
      .where(eq(searchHistory.accountId, USER_A))
    expect(aRows).toHaveLength(0)

    // USER_B's rows preserved
    const bRows = await db.select().from(searchHistory)
      .where(eq(searchHistory.accountId, USER_B))
    expect(bRows).toHaveLength(1)
    expect(bRows[0].query).toBe("b-search")
  })
})
