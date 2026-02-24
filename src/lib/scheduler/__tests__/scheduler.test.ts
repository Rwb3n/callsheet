import { describe, it, expect, vi } from "vitest"
import { ActionHandlerRegistry } from "../registry"
import { scheduleDeferredAction, cancelDeferredAction, seedRecurringActions } from "../api"
import type { SchedulerDb } from "../api"
import { pollAndExecute, RETRY_3_MAX_ATTEMPTS } from "../poll"
import type { PollDb } from "../poll"
import type { DeferredActionRow, AlertPrincipalFn, RecurringActionConfig } from "../types"
import { NOTIFICATION_CLEANUP_BATCH_LIMIT } from "../types"

// --- Test helpers ---

function makeRow(overrides: Partial<DeferredActionRow> = {}): DeferredActionRow {
  return {
    id: "action-1",
    action: "notification_cleanup",
    params: {},
    executeAt: new Date("2026-01-01T00:00:00Z"),
    retryPolicy: "once",
    onFailure: "log",
    createdBy: "shared",
    status: "pending",
    attempts: 0,
    lastError: null,
    cancelledAt: null,
    cancelledBy: null,
    createdAt: new Date("2025-12-01T00:00:00Z"),
    completedAt: null,
    ...overrides,
  }
}

function createMockSchedulerDb(): SchedulerDb & {
  insertedRows: Array<Record<string, unknown>>
  cancelledCalls: Array<Record<string, unknown>>
} {
  const insertedRows: Array<Record<string, unknown>> = []
  const cancelledCalls: Array<Record<string, unknown>> = []
  return {
    insertedRows,
    cancelledCalls,
    insert: vi.fn(async (row) => {
      insertedRows.push(row)
      return "generated-id-1"
    }),
    cancelMatching: vi.fn(async (action, filterParams, cancelledBy, cancelledAt) => {
      cancelledCalls.push({ action, filterParams, cancelledBy, cancelledAt })
      return 1
    }),
    findPending: vi.fn(async () => null),
  }
}

function createMockPollDb(actions: DeferredActionRow[] = []): PollDb & {
  executingIds: string[]
  completedIds: string[]
  failedIds: Array<{ id: string; error: string; attempts: number }>
  exhaustedIds: Array<{ id: string; error: string; attempts: number }>
  rescheduledIds: Array<{ id: string; executeAt: Date; attempts: number }>
} {
  const executingIds: string[] = []
  const completedIds: string[] = []
  const failedIds: Array<{ id: string; error: string; attempts: number }> = []
  const exhaustedIds: Array<{ id: string; error: string; attempts: number }> = []
  const rescheduledIds: Array<{ id: string; executeAt: Date; attempts: number }> = []

  return {
    executingIds,
    completedIds,
    failedIds,
    exhaustedIds,
    rescheduledIds,
    findDueActions: vi.fn(async () => actions),
    setExecuting: vi.fn(async (id) => { executingIds.push(id) }),
    setCompleted: vi.fn(async (id) => { completedIds.push(id) }),
    setFailed: vi.fn(async (id, error, attempts) => { failedIds.push({ id, error, attempts }) }),
    setExhausted: vi.fn(async (id, error, attempts) => { exhaustedIds.push({ id, error, attempts }) }),
    reschedule: vi.fn(async (id, executeAt, attempts) => { rescheduledIds.push({ id, executeAt, attempts }) }),
  }
}

// --- Tests ---

describe("ActionHandlerRegistry", () => {
  it("registers and retrieves a handler", () => {
    const registry = new ActionHandlerRegistry()
    const handler = vi.fn(async () => {})
    registry.register("notification_cleanup", handler)

    expect(registry.has("notification_cleanup")).toBe(true)
    expect(registry.get("notification_cleanup")).toBeDefined()
  })

  it("rejects duplicate registration", () => {
    const registry = new ActionHandlerRegistry()
    registry.register("notification_cleanup", async () => {})

    expect(() => registry.register("notification_cleanup", async () => {}))
      .toThrow("Handler already registered for action: notification_cleanup")
  })
})

describe("scheduleDeferredAction", () => {
  // AC-12: scheduleDeferredAction returns ID; DB row has pending status
  it("returns action ID and inserts row with pending status", async () => {
    const db = createMockSchedulerDb()
    const id = await scheduleDeferredAction(db, {
      action: "notification_cleanup",
      params: {} as Record<string, never>,
      executeAt: new Date("2026-01-01T00:00:00Z"),
      retryPolicy: "retry_3",
      onFailure: "log",
      createdBy: "shared",
    })

    expect(id).toBe("generated-id-1")
    expect(db.insertedRows).toHaveLength(1)
    expect(db.insertedRows[0]).toMatchObject({
      action: "notification_cleanup",
      status: "pending",
      retryPolicy: "retry_3",
      onFailure: "log",
      createdBy: "shared",
      attempts: 0,
    })
  })
})

describe("cancelDeferredAction", () => {
  it("delegates cancel to DB adapter", async () => {
    const db = createMockSchedulerDb()
    const count = await cancelDeferredAction(db, {
      action: "compliance_hold_recheck",
      filterParams: { accountId: "acc-1" },
      cancelledBy: "platform",
    })

    expect(count).toBe(1)
    expect(db.cancelledCalls).toHaveLength(1)
    expect(db.cancelledCalls[0]).toMatchObject({
      action: "compliance_hold_recheck",
      filterParams: { accountId: "acc-1" },
      cancelledBy: "platform",
    })
  })
})

describe("pollAndExecute", () => {
  const fixedNow = new Date("2026-01-01T00:01:00Z")

  function createPollOptions(
    db: PollDb,
    overrides?: { registry?: ActionHandlerRegistry; alertPrincipal?: AlertPrincipalFn },
  ) {
    const registry = overrides?.registry ?? new ActionHandlerRegistry()
    const alertPrincipal = overrides?.alertPrincipal ?? vi.fn(async () => {})
    return { registry, db, alertPrincipal, now: () => fixedNow }
  }

  // AC-07: Action executes within 120s of executeAt
  // (We verify the handler is called when executeAt <= now)
  it("executes action whose executeAt has passed", async () => {
    const handler = vi.fn(async () => {})
    const registry = new ActionHandlerRegistry()
    registry.register("notification_cleanup", handler)

    const row = makeRow({ executeAt: new Date("2026-01-01T00:00:00Z") })
    const db = createMockPollDb([row])

    await pollAndExecute(createPollOptions(db, { registry }))

    expect(handler).toHaveBeenCalledWith(row.params)
    expect(db.completedIds).toContain("action-1")
  })

  // AC-08: retry_3 retries 3x with backoff, then marks exhausted
  it("retries with backoff for retry_3, exhausts after 3 attempts", async () => {
    const registry = new ActionHandlerRegistry()
    registry.register("billing_reconciliation", async () => { throw new Error("transient") })

    // Attempt 1 (attempts=0 → nextAttempt=1, below 3 → reschedule)
    const row1 = makeRow({
      action: "billing_reconciliation",
      retryPolicy: "retry_3",
      onFailure: "alert_principal",
      attempts: 0,
    })
    const db1 = createMockPollDb([row1])
    await pollAndExecute(createPollOptions(db1, { registry }))

    expect(db1.rescheduledIds).toHaveLength(1)
    expect(db1.rescheduledIds[0].attempts).toBe(1)
    // Backoff: 2^1 * 60_000 = 120_000ms
    const expectedDelay1 = fixedNow.getTime() + 120_000
    expect(db1.rescheduledIds[0].executeAt.getTime()).toBe(expectedDelay1)

    // Attempt 2 (attempts=1 → nextAttempt=2, below 3 → reschedule)
    const row2 = makeRow({
      action: "billing_reconciliation",
      retryPolicy: "retry_3",
      onFailure: "alert_principal",
      attempts: 1,
    })
    const db2 = createMockPollDb([row2])
    await pollAndExecute(createPollOptions(db2, { registry }))

    expect(db2.rescheduledIds).toHaveLength(1)
    expect(db2.rescheduledIds[0].attempts).toBe(2)
    // Backoff: 2^2 * 60_000 = 240_000ms
    const expectedDelay2 = fixedNow.getTime() + 240_000
    expect(db2.rescheduledIds[0].executeAt.getTime()).toBe(expectedDelay2)

    // Attempt 3 (attempts=2 → nextAttempt=3, equals max → exhausted)
    const alertPrincipal = vi.fn(async () => {})
    const row3 = makeRow({
      action: "billing_reconciliation",
      retryPolicy: "retry_3",
      onFailure: "alert_principal",
      attempts: 2,
    })
    const db3 = createMockPollDb([row3])
    await pollAndExecute(createPollOptions(db3, { registry, alertPrincipal }))

    expect(db3.exhaustedIds).toHaveLength(1)
    expect(db3.exhaustedIds[0].attempts).toBe(RETRY_3_MAX_ATTEMPTS)
    expect(alertPrincipal).toHaveBeenCalledWith("billing_reconciliation", "action-1", "transient")
  })

  // AC-09: once marks exhausted after single failure
  it("marks exhausted immediately for once retry policy", async () => {
    const registry = new ActionHandlerRegistry()
    registry.register("expire_enquiry_queue", async () => { throw new Error("fail") })

    const row = makeRow({
      action: "expire_enquiry_queue",
      params: { listingId: "listing-1" },
      retryPolicy: "once",
      onFailure: "log",
    })
    const db = createMockPollDb([row])

    await pollAndExecute(createPollOptions(db, { registry }))

    expect(db.exhaustedIds).toHaveLength(1)
    expect(db.exhaustedIds[0].attempts).toBe(1)
    expect(db.rescheduledIds).toHaveLength(0)
  })

  // AC-10: alert_principal on exhaustion triggers principal notification
  it("calls alertPrincipal when action exhausts with alert_principal policy", async () => {
    const registry = new ActionHandlerRegistry()
    registry.register("compliance_schedule_check", async () => { throw new Error("critical") })
    const alertPrincipal = vi.fn(async () => {})

    const row = makeRow({
      action: "compliance_schedule_check",
      retryPolicy: "once",
      onFailure: "alert_principal",
    })
    const db = createMockPollDb([row])

    await pollAndExecute(createPollOptions(db, { registry, alertPrincipal }))

    expect(alertPrincipal).toHaveBeenCalledWith("compliance_schedule_check", "action-1", "critical")
  })

  // AC-10 negative: log policy does NOT alert principal
  it("does not call alertPrincipal when onFailure is log", async () => {
    const registry = new ActionHandlerRegistry()
    registry.register("expire_enquiry_queue", async () => { throw new Error("fail") })
    const alertPrincipal = vi.fn(async () => {})

    const row = makeRow({
      action: "expire_enquiry_queue",
      params: { listingId: "listing-1" },
      retryPolicy: "once",
      onFailure: "log",
    })
    const db = createMockPollDb([row])

    await pollAndExecute(createPollOptions(db, { registry, alertPrincipal }))

    expect(alertPrincipal).not.toHaveBeenCalled()
  })

  // AC-11: Cancelled action skipped during poll
  it("skips cancelled actions", async () => {
    const handler = vi.fn(async () => {})
    const registry = new ActionHandlerRegistry()
    registry.register("notification_cleanup", handler)

    const row = makeRow({ status: "cancelled" })
    const db = createMockPollDb([row])

    await pollAndExecute(createPollOptions(db, { registry }))

    expect(handler).not.toHaveBeenCalled()
    expect(db.executingIds).toHaveLength(0)
  })

  // AC-48: Recurring action handler schedules successor; startup seeds if no pending exists
  it("recurring handler can schedule its own successor", async () => {
    const schedulerDb = createMockSchedulerDb()
    const registry = new ActionHandlerRegistry()

    // Simulate a recurring handler that schedules its successor
    registry.register("notification_cleanup", async () => {
      await scheduleDeferredAction(schedulerDb, {
        action: "notification_cleanup",
        params: {} as Record<string, never>,
        executeAt: new Date(fixedNow.getTime() + 24 * 60 * 60 * 1000),
        retryPolicy: "retry_3",
        onFailure: "log",
        createdBy: "shared",
      })
    })

    const row = makeRow()
    const pollDb = createMockPollDb([row])

    await pollAndExecute(createPollOptions(pollDb, { registry }))

    // Handler ran and completed
    expect(pollDb.completedIds).toContain("action-1")
    // Successor was scheduled
    expect(schedulerDb.insertedRows).toHaveLength(1)
    expect(schedulerDb.insertedRows[0]).toMatchObject({
      action: "notification_cleanup",
      status: "pending",
    })
  })

  // AC-48: Startup seed via seedRecurringActions()
  it("seeds recurring action on startup when none pending", async () => {
    const db = createMockSchedulerDb()
    db.findPending = vi.fn(async () => null)

    const configs: RecurringActionConfig[] = [{
      action: "notification_cleanup",
      intervalMs: 24 * 60 * 60 * 1000,
      retryPolicy: "retry_3",
      onFailure: "log",
      createdBy: "shared",
    }]

    const seeded = await seedRecurringActions(db, configs, fixedNow)

    expect(seeded).toHaveLength(1)
    expect(db.insertedRows).toHaveLength(1)
    expect(db.insertedRows[0]).toMatchObject({
      action: "notification_cleanup",
      status: "pending",
    })
  })

  it("does not seed recurring action when one is already pending", async () => {
    const db = createMockSchedulerDb()
    db.findPending = vi.fn(async () => makeRow())

    const configs: RecurringActionConfig[] = [{
      action: "notification_cleanup",
      intervalMs: 24 * 60 * 60 * 1000,
      retryPolicy: "retry_3",
      onFailure: "log",
      createdBy: "shared",
    }]

    const seeded = await seedRecurringActions(db, configs, fixedNow)

    expect(seeded).toHaveLength(0)
    expect(db.insertedRows).toHaveLength(0)
  })

  // AC-49: notification_cleanup batch limit constant is 10000 [S0-16]
  it("NOTIFICATION_CLEANUP_BATCH_LIMIT is 10000", () => {
    expect(NOTIFICATION_CLEANUP_BATCH_LIMIT).toBe(10_000)
  })

  it("notification_cleanup handler executes with empty params", async () => {
    const registry = new ActionHandlerRegistry()
    let receivedParams: unknown

    registry.register("notification_cleanup", async (params) => {
      receivedParams = params
    })

    const row = makeRow()
    const db = createMockPollDb([row])

    await pollAndExecute(createPollOptions(db, { registry }))

    expect(receivedParams).toEqual({})
    expect(db.completedIds).toContain("action-1")
  })

  it("marks action as failed when no handler is registered", async () => {
    const registry = new ActionHandlerRegistry()
    const row = makeRow({ action: "unknown_action" })
    const db = createMockPollDb([row])

    await pollAndExecute(createPollOptions(db, { registry }))

    expect(db.failedIds).toHaveLength(1)
    expect(db.failedIds[0].error).toContain("No handler registered")
  })
})
