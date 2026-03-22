// Admin events router integration tests — CS-WORK-061 AC-7.1 through AC-7.6

import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { getTestDb, resetDb, closeTestDb } from "@/db/test-utils"
import {
  makeUUID,
  makeAdminSession,
  makeSession,
  ctx,
  seedTestUser,
  emptyConsumerMatrix,
} from "@/db/test-fixtures"
import { createAdminEventsRouter } from "@/server/routers/admin/events"
import { eventConsumerErrors } from "@/db/schema/shared"
import { eq } from "drizzle-orm"
import { InProcessEventBus } from "@/lib/events/bus"

const db = getTestDb()
const adminId = makeUUID("admin001")

// Stub bus + waitUntil — retry test needs a real bus to emit through
let busEmitCalls: Array<{ eventType: string; payload: unknown }> = []
const stubWaitUntil = (p: Promise<unknown>) => { p.catch(() => {}) }

function createTestBus() {
  busEmitCalls = []
  const bus = new InProcessEventBus({
    logError: async () => {},
    consumerMatrix: emptyConsumerMatrix,
  })
  // Spy on emit by wrapping
  const originalEmit = bus.emit.bind(bus)
  bus.emit = async (eventType, payload, waitUntilFn) => {
    busEmitCalls.push({ eventType, payload })
    // Don't actually dispatch to consumers in test — just record
  }
  return bus
}

let bus = createTestBus()

const router = createAdminEventsRouter({ db, bus, waitUntilFn: stubWaitUntil })
const caller = router.createCaller(ctx(makeAdminSession(adminId)))
const userCaller = router.createCaller(ctx(makeSession({ accountId: makeUUID("user001") })))

async function insertError(overrides: Partial<{
  eventType: string
  consumerDomain: string
  consumerId: string
  payload: unknown
  error: string
  mode: string
  resolved: boolean
  createdAt: Date
}> = {}) {
  const [row] = await db.insert(eventConsumerErrors).values({
    eventType: overrides.eventType ?? "claim_approved",
    consumerDomain: overrides.consumerDomain ?? "platform",
    consumerId: overrides.consumerId ?? "platform:claim_approved:searchIndex",
    payload: overrides.payload ?? { _brand: "ClaimApprovedEvent", listingId: "test" },
    error: overrides.error ?? "Connection timeout",
    mode: overrides.mode ?? "sync",
    resolved: overrides.resolved ?? false,
    ...(overrides.createdAt ? { createdAt: overrides.createdAt } : {}),
  }).returning()
  return row
}

beforeEach(async () => {
  await resetDb()
  await seedTestUser(db, adminId)
  bus = createTestBus()
})

afterAll(async () => {
  await closeTestDb()
})

describe("admin.events.list", () => {
  it("AC-7.1: groups errors by consumerId with count and latest error detail", async () => {
    // Insert 3 errors for same consumer, 1 for different consumer
    await insertError({ consumerId: "platform:claim_approved:searchIndex" })
    await insertError({ consumerId: "platform:claim_approved:searchIndex" })
    await insertError({ consumerId: "platform:claim_approved:searchIndex" })
    await insertError({ consumerId: "operations:claim_approved:triage", consumerDomain: "operations" })

    const result = await caller.list({})
    expect(result.errors).toHaveLength(2)

    // Sorted by error count DESC
    const first = result.errors[0]
    expect(first.consumerId).toBe("platform:claim_approved:searchIndex")
    expect(first.errorCount).toBe(3)
    expect(first.latestError).not.toBeNull()
    expect(first.latestError!.eventType).toBe("claim_approved")
    expect(first.latestError!.error).toBe("Connection timeout")

    const second = result.errors[1]
    expect(second.consumerId).toBe("operations:claim_approved:triage")
    expect(second.errorCount).toBe(1)
  })

  it("AC-7.2: filters by date range", async () => {
    const oldDate = new Date("2026-01-01T00:00:00Z")
    const newDate = new Date("2026-02-20T00:00:00Z")

    await insertError({ createdAt: oldDate })
    await insertError({ createdAt: newDate })

    const result = await caller.list({
      fromDate: "2026-02-01T00:00:00Z",
    })
    expect(result.errors).toHaveLength(1)
  })

  it("AC-7.2: filters by consumerId", async () => {
    await insertError({ consumerId: "platform:claim_approved:searchIndex" })
    await insertError({ consumerId: "operations:claim_approved:triage", consumerDomain: "operations" })

    const result = await caller.list({
      consumerId: "operations:claim_approved:triage",
    })
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].consumerId).toBe("operations:claim_approved:triage")
  })

  it("AC-7.2: default shows unresolved only", async () => {
    await insertError({ resolved: false })
    await insertError({ resolved: true })

    const result = await caller.list({})
    expect(result.errors).toHaveLength(1)
  })

  it("AC-7.2: resolved=true shows resolved errors", async () => {
    await insertError({ resolved: false })
    await insertError({ resolved: true })

    const result = await caller.list({ resolved: true })
    expect(result.errors).toHaveLength(1)
  })

  it("AC-7.6: returns totalUnresolved count", async () => {
    await insertError({ resolved: false })
    await insertError({ resolved: false })
    await insertError({ resolved: true })

    const result = await caller.list({})
    expect(result.totalUnresolved).toBe(2)
  })

  it("AC-7.6: totalUnresolved is 0 when all resolved", async () => {
    await insertError({ resolved: true })
    await insertError({ resolved: true })

    const result = await caller.list({})
    expect(result.totalUnresolved).toBe(0)
  })

  it("paginates with limit + nextCursor", async () => {
    await insertError({ consumerId: "a:a:a" })
    await insertError({ consumerId: "b:b:b", consumerDomain: "operations" })
    await insertError({ consumerId: "c:c:c", consumerDomain: "commercial" })

    const page1 = await caller.list({ limit: 2 })
    expect(page1.errors).toHaveLength(2)
    expect(page1.nextCursor).toBeDefined()
  })
})

describe("admin.events.resolve", () => {
  it("AC-7.3: marks error as resolved, hidden from default view", async () => {
    const error = await insertError()

    await caller.resolve({ errorId: error.id })

    const [updated] = await db
      .select()
      .from(eventConsumerErrors)
      .where(eq(eventConsumerErrors.id, error.id))

    expect(updated.resolved).toBe(true)
    expect(updated.resolvedAt).not.toBeNull()

    // Hidden from default list (unresolved only)
    const result = await caller.list({})
    expect(result.errors).toHaveLength(0)
  })

  it("AC-7.3: returns NOT_FOUND for non-existent error", async () => {
    await expect(caller.resolve({ errorId: makeUUID("nonexist") }))
      .rejects.toThrow("Error not found")
  })

  it("requires adminProcedure", async () => {
    const error = await insertError()
    await expect(userCaller.resolve({ errorId: error.id }))
      .rejects.toThrow("Admin access required")
  })
})

describe("admin.events.retry", () => {
  it("AC-7.4: re-emits stored payload and marks original resolved", async () => {
    const payload = { _brand: "ClaimApprovedEvent", listingId: "lst-001", accountId: "acc-001", method: "auto", timestamp: new Date().toISOString() }
    const error = await insertError({ payload })

    // Recreate router with fresh bus for this test
    const testBus = createTestBus()
    const testRouter = createAdminEventsRouter({ db, bus: testBus, waitUntilFn: stubWaitUntil })
    const testCaller = testRouter.createCaller(ctx(makeAdminSession(adminId)))

    await testCaller.retry({ errorId: error.id })

    // AC-7.5: bus.emit was called with the stored eventType and payload
    expect(busEmitCalls).toHaveLength(1)
    expect(busEmitCalls[0].eventType).toBe("claim_approved")
    expect(busEmitCalls[0].payload).toEqual(payload)

    // Original error marked resolved
    const [updated] = await db
      .select()
      .from(eventConsumerErrors)
      .where(eq(eventConsumerErrors.id, error.id))

    expect(updated.resolved).toBe(true)
    expect(updated.resolvedAt).not.toBeNull()
  })

  it("AC-7.4: returns NOT_FOUND for non-existent error", async () => {
    await expect(caller.retry({ errorId: makeUUID("nonexist") }))
      .rejects.toThrow("Error not found")
  })

  it("requires adminProcedure", async () => {
    const error = await insertError()
    await expect(userCaller.retry({ errorId: error.id }))
      .rejects.toThrow("Admin access required")
  })
})
