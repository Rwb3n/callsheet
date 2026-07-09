// Admin tasks router integration tests — CS-WORK-098

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
import { createAdminTasksRouter } from "@/server/routers/admin/tasks"
import { taskSpecs } from "@/db/schema/operations"

const db = getTestDb()
const adminId = makeUUID("admin001")

const router = createAdminTasksRouter({ db })
const caller = router.createCaller(ctx(makeAdminSession(adminId)))
const userCaller = router.createCaller(ctx(makeSession({ accountId: makeUUID("user001") })))

const sampleTask = {
  domain: "support" as const,
  priority: "normal" as const,
  task: "Review flagged listing",
  context: { listingId: makeUUID("list0001") },
  checklist: ["Check content", "Verify photos"],
  acceptanceCriteria: "All content meets policy",
  estimatedTime: "30 minutes",
  timeout: 4,
  escalation: "Escalate to lead moderator",
  requiredSkills: ["moderation"],
  dataAccessScope: { tables: ["listings"] },
  learningCapture: { captureFields: ["outcome"] },
  maxReroutes: 2,
}

async function insertTask(overrides: Partial<{
  domain: "verification" | "support" | "moderation" | "compliance" | "data_maintenance" | "outreach"
  status: "pending" | "assigned" | "in_progress" | "completed" | "timed_out" | "re_routed"
  priority: "critical" | "high" | "normal" | "low"
}> = {}) {
  const [row] = await db
    .insert(taskSpecs)
    .values({
      domain: overrides.domain ?? "support",
      priority: overrides.priority ?? "normal",
      status: overrides.status ?? "pending",
      task: "Test task",
      context: {},
      checklist: [],
      acceptanceCriteria: "Done when done",
      estimatedTime: "1 hour",
      timeout: 4,
      escalation: "Escalate",
      requiredSkills: [],
      dataAccessScope: { tables: [] },
      learningCapture: { captureFields: [] },
      maxReroutes: 2,
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

describe("admin.tasks.list", () => {
  it("AC-1: returns paginated tasks with filters", async () => {
    await insertTask({ domain: "support", status: "pending" })
    await insertTask({ domain: "compliance", status: "completed" })
    await insertTask({ domain: "support", priority: "critical" })

    const all = await caller.list({ limit: 20 })
    expect(all.items).toHaveLength(3)

    const byDomain = await caller.list({ domain: "support", limit: 20 })
    expect(byDomain.items).toHaveLength(2)

    const byStatus = await caller.list({ status: "completed", limit: 20 })
    expect(byStatus.items).toHaveLength(1)

    const byPriority = await caller.list({ priority: "critical", limit: 20 })
    expect(byPriority.items).toHaveLength(1)
  })

  it("AC-1: cursor-based pagination", async () => {
    await insertTask()
    await insertTask()
    await insertTask()

    const page1 = await caller.list({ limit: 2 })
    expect(page1.items).toHaveLength(2)
    expect(page1.nextCursor).toBeDefined()

    const page2 = await caller.list({ limit: 2, cursor: page1.nextCursor! })
    expect(page2.items).toHaveLength(1)
  })
})

describe("admin.tasks.getDetail", () => {
  it("AC-2: returns full task detail", async () => {
    const task = await insertTask()

    const detail = await caller.getDetail({ taskId: task.id })
    expect(detail.id).toBe(task.id)
    expect(detail.domain).toBe("support")
    expect(detail.status).toBe("pending")
    expect(detail.checklist).toEqual([])
    expect(detail.dataAccessScope).toEqual({ tables: [] })
  })

  it("AC-2: throws NOT_FOUND for missing task", async () => {
    await expectTRPCError(
      caller.getDetail({ taskId: makeUUID("nonexist") }),
      "NOT_FOUND",
    )
  })
})

describe("admin.tasks.create", () => {
  it("AC-3: creates a task with all fields", async () => {
    const result = await caller.create(sampleTask)
    expect(result.taskId).toBeDefined()

    const detail = await caller.getDetail({ taskId: result.taskId })
    expect(detail.domain).toBe("support")
    expect(detail.task).toBe("Review flagged listing")
    expect(detail.checklist).toEqual(["Check content", "Verify photos"])
    expect(detail.requiredSkills).toEqual(["moderation"])
  })
})

describe("admin.tasks.updateStatus", () => {
  it("AC-4: updates task status", async () => {
    const task = await insertTask()

    const result = await caller.updateStatus({ taskId: task.id, status: "in_progress" })
    expect(result.status).toBe("in_progress")

    const detail = await caller.getDetail({ taskId: task.id })
    expect(detail.status).toBe("in_progress")
  })

  it("AC-4: sets completedAt when completing", async () => {
    const task = await insertTask()

    await caller.updateStatus({ taskId: task.id, status: "completed", result: { outcome: "resolved" } })

    const detail = await caller.getDetail({ taskId: task.id })
    expect(detail.status).toBe("completed")
    expect(detail.completedAt).not.toBeNull()
    expect(detail.result).toEqual({ outcome: "resolved" })
  })

  it("AC-4: throws NOT_FOUND for missing task", async () => {
    await expectTRPCError(
      caller.updateStatus({ taskId: makeUUID("nonexist"), status: "completed" }),
      "NOT_FOUND",
    )
  })
})

describe("AC-5: admin auth enforcement", () => {
  it("list requires adminProcedure", async () => {
    await expect(userCaller.list({ limit: 20 }))
      .rejects.toThrow("Admin access required")
  })

  it("create requires adminProcedure", async () => {
    await expect(userCaller.create(sampleTask))
      .rejects.toThrow("Admin access required")
  })

  it("updateStatus requires adminProcedure", async () => {
    await expect(userCaller.updateStatus({ taskId: makeUUID("any00001"), status: "completed" }))
      .rejects.toThrow("Admin access required")
  })
})
