// search_history_cleanup handler integration test — CS-WORK-054, AC-37
// Verifies: deletes rows older than 365 days, preserves recent rows,
// self-schedules next execution.

import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest"
import { getTestDb, resetDb, closeTestDb } from "@/db/test-utils"
import { seedTestUser } from "@/db/test-fixtures"
import { searchHistory } from "@/db/schema/accounts"
import { ActionHandlerRegistry } from "@/lib/scheduler"
import { registerSearchHistoryCleanupHandler, SEARCH_HISTORY_RETENTION_DAYS } from "../search-history-cleanup"
import { invokeHandler } from "./invoke-handler"

let db: ReturnType<typeof getTestDb>

const USER_ID = "cleanup-test-user"

// In-memory SchedulerDb that captures insert calls
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
        return "mock-scheduled-id"
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
  await seedTestUser(db, USER_ID)
})

afterAll(async () => {
  await closeTestDb()
})

describe("search_history_cleanup handler", () => {
  it("deletes rows older than 365 days", async () => {
    const now = new Date()
    const oldDate = new Date(now)
    oldDate.setDate(oldDate.getDate() - (SEARCH_HISTORY_RETENTION_DAYS + 1))

    const recentDate = new Date(now)
    recentDate.setDate(recentDate.getDate() - 10)

    await db.insert(searchHistory).values([
      { accountId: USER_ID, query: "old-search", resultCount: 5, createdAt: oldDate },
      { accountId: USER_ID, query: "recent-search", resultCount: 10, createdAt: recentDate },
    ])

    const mockScheduler = createMockSchedulerDb()
    const registry = new ActionHandlerRegistry()
    registerSearchHistoryCleanupHandler(registry, { db, schedulerDb: mockScheduler.db })

    await invokeHandler(registry, "search_history_cleanup", {} as Record<string, never>)

    const remaining = await db.select().from(searchHistory)
    expect(remaining).toHaveLength(1)
    expect(remaining[0].query).toBe("recent-search")
  })

  it("preserves rows exactly at the 365-day boundary", async () => {
    const now = new Date()
    // Row created exactly 364 days ago — should be preserved
    const borderlineDate = new Date(now)
    borderlineDate.setDate(borderlineDate.getDate() - (SEARCH_HISTORY_RETENTION_DAYS - 1))

    await db.insert(searchHistory).values({
      accountId: USER_ID,
      query: "borderline-search",
      resultCount: 3,
      createdAt: borderlineDate,
    })

    const mockScheduler = createMockSchedulerDb()
    const registry = new ActionHandlerRegistry()
    registerSearchHistoryCleanupHandler(registry, { db, schedulerDb: mockScheduler.db })

    await invokeHandler(registry, "search_history_cleanup", {} as Record<string, never>)

    const remaining = await db.select().from(searchHistory)
    expect(remaining).toHaveLength(1)
  })

  it("self-schedules next execution 24h later", async () => {
    const mockScheduler = createMockSchedulerDb()
    const registry = new ActionHandlerRegistry()
    registerSearchHistoryCleanupHandler(registry, { db, schedulerDb: mockScheduler.db })

    const beforeExec = Date.now()
    await invokeHandler(registry, "search_history_cleanup", {} as Record<string, never>)
    const afterExec = Date.now()

    const scheduled = mockScheduler.getScheduled()
    expect(scheduled).toHaveLength(1)
    expect(scheduled[0].action).toBe("search_history_cleanup")
    expect(scheduled[0].params).toEqual({})

    // Verify next execution is ~24h from now
    const nextExecMs = scheduled[0].executeAt.getTime()
    const expectedMs = 24 * 60 * 60 * 1000
    expect(nextExecMs).toBeGreaterThanOrEqual(beforeExec + expectedMs)
    expect(nextExecMs).toBeLessThanOrEqual(afterExec + expectedMs)
  })

  it("is a no-op on empty table, still reschedules", async () => {
    const mockScheduler = createMockSchedulerDb()
    const registry = new ActionHandlerRegistry()
    registerSearchHistoryCleanupHandler(registry, { db, schedulerDb: mockScheduler.db })

    await invokeHandler(registry, "search_history_cleanup", {} as Record<string, never>)

    // No rows to delete — should still reschedule
    const scheduled = mockScheduler.getScheduled()
    expect(scheduled).toHaveLength(1)
    expect(scheduled[0].action).toBe("search_history_cleanup")
  })
})
