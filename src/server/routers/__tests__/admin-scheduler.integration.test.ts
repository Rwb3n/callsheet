// Admin scheduler router integration tests — CS-WORK-093

import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { getTestDb, resetDb, closeTestDb } from "@/db/test-utils"
import {
  makeUUID,
  makeAdminSession,
  makeSession,
  ctx,
  seedTestUser,
  expectTRPCError,
} from "@/db/test-fixtures"
import { createAdminSchedulerRouter } from "@/server/routers/admin/scheduler"
import { deferredActions } from "@/db/schema/shared"

const db = getTestDb()
const adminId = makeUUID("admin001")

const router = createAdminSchedulerRouter({ db })
const caller = router.createCaller(ctx(makeAdminSession(adminId)))
const userCaller = router.createCaller(ctx(makeSession({ accountId: makeUUID("user001") })))

async function insertAction(overrides: Partial<{
  action: string
  status: "pending" | "executing" | "completed" | "failed" | "exhausted" | "cancelled"
  executeAt: Date
  params: Record<string, unknown>
}> = {}) {
  const [row] = await db
    .insert(deferredActions)
    .values({
      action: overrides.action ?? "compliance_schedule_check",
      params: overrides.params ?? {},
      executeAt: overrides.executeAt ?? new Date(Date.now() + 3600000),
      retryPolicy: "retry_3",
      onFailure: "log",
      createdBy: "system",
      status: overrides.status ?? "pending",
      attempts: 0,
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

describe("admin.scheduler.list", () => {
  it("AC-1: returns deferred actions filterable by status and action", async () => {
    await insertAction({ status: "pending" })
    await insertAction({ status: "completed" })
    await insertAction({ action: "billing_reconciliation", status: "pending" })

    const all = await caller.list({ limit: 20 })
    expect(all.items).toHaveLength(3)

    const pending = await caller.list({ status: "pending", limit: 20 })
    expect(pending.items).toHaveLength(2)
    expect(pending.items.every((i) => i.status === "pending")).toBe(true)

    const billing = await caller.list({ action: "billing_reconciliation", limit: 20 })
    expect(billing.items).toHaveLength(1)
    expect(billing.items[0].action).toBe("billing_reconciliation")
  })

  it("AC-2: cursor-based pagination with createdAt", async () => {
    await insertAction()
    await insertAction()
    await insertAction()

    const page1 = await caller.list({ limit: 2 })
    expect(page1.items).toHaveLength(2)
    expect(page1.nextCursor).toBeDefined()

    const page2 = await caller.list({ limit: 2, cursor: page1.nextCursor! })
    expect(page2.items).toHaveLength(1)
    expect(page2.nextCursor).toBeUndefined()
  })
})

describe("admin.scheduler.getDetail", () => {
  it("AC-3: returns full row for a single action", async () => {
    const row = await insertAction({ action: "win_back_evaluation", params: { listingId: makeUUID("list0001"), accountId: makeUUID("acct0001") } })

    const detail = await caller.getDetail({ id: row.id })

    expect(detail.id).toBe(row.id)
    expect(detail.action).toBe("win_back_evaluation")
    expect(detail.params).toEqual({ listingId: makeUUID("list0001"), accountId: makeUUID("acct0001") })
    expect(detail.status).toBe("pending")
    expect(detail.retryPolicy).toBe("retry_3")
    expect(detail.onFailure).toBe("log")
    expect(detail.createdBy).toBe("system")
  })

  it("AC-3: throws NOT_FOUND for missing action", async () => {
    await expectTRPCError(
      caller.getDetail({ id: makeUUID("nonexist") }),
      "NOT_FOUND",
    )
  })
})

describe("admin.scheduler.trigger", () => {
  it("AC-4: sets executeAt to now for pending action", async () => {
    const futureDate = new Date(Date.now() + 86400000)
    const row = await insertAction({ executeAt: futureDate })

    const before = await caller.getDetail({ id: row.id })
    expect(new Date(before.executeAt).getTime()).toBeGreaterThan(Date.now() - 1000)

    await caller.trigger({ id: row.id })

    const after = await caller.getDetail({ id: row.id })
    const triggerTime = new Date(after.executeAt).getTime()
    // Should be within last 5 seconds (roughly "now")
    expect(triggerTime).toBeLessThanOrEqual(Date.now() + 1000)
    expect(triggerTime).toBeGreaterThan(Date.now() - 5000)
  })

  it("AC-4: rejects trigger for non-pending action", async () => {
    const row = await insertAction({ status: "completed" })

    await expectTRPCError(
      caller.trigger({ id: row.id }),
      "PRECONDITION_FAILED",
      "Only pending actions can be triggered",
    )
  })

  it("AC-4: throws NOT_FOUND for missing action", async () => {
    await expectTRPCError(
      caller.trigger({ id: makeUUID("nonexist") }),
      "NOT_FOUND",
    )
  })
})

describe("admin.scheduler.cancel", () => {
  it("AC-5: cancels pending action with reason", async () => {
    const row = await insertAction()

    await caller.cancel({ id: row.id, reason: "No longer needed" })

    const after = await caller.getDetail({ id: row.id })
    expect(after.status).toBe("cancelled")
    expect(after.cancelledAt).not.toBeNull()
    expect(after.cancelledBy).toContain(adminId)
    expect(after.cancelledBy).toContain("No longer needed")
  })

  it("AC-5: rejects cancel for non-pending action", async () => {
    const row = await insertAction({ status: "executing" })

    await expectTRPCError(
      caller.cancel({ id: row.id, reason: "test" }),
      "PRECONDITION_FAILED",
      "Only pending actions can be cancelled",
    )
  })

  it("AC-5: throws NOT_FOUND for missing action", async () => {
    await expectTRPCError(
      caller.cancel({ id: makeUUID("nonexist"), reason: "test" }),
      "NOT_FOUND",
    )
  })
})

describe("AC-6: admin auth enforcement", () => {
  it("list requires adminProcedure", async () => {
    await expect(userCaller.list({ limit: 20 }))
      .rejects.toThrow("Admin access required")
  })

  it("getDetail requires adminProcedure", async () => {
    await expect(userCaller.getDetail({ id: makeUUID("any00001") }))
      .rejects.toThrow("Admin access required")
  })

  it("trigger requires adminProcedure", async () => {
    await expect(userCaller.trigger({ id: makeUUID("any00001") }))
      .rejects.toThrow("Admin access required")
  })

  it("cancel requires adminProcedure", async () => {
    await expect(userCaller.cancel({ id: makeUUID("any00001"), reason: "test" }))
      .rejects.toThrow("Admin access required")
  })
})
