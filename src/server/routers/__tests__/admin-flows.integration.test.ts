// Admin flows router integration tests — CS-WORK-061 AC-6.1 through AC-6.10

import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { getTestDb, resetDb, closeTestDb } from "@/db/test-utils"
import {
  makeUUID,
  makeAdminSession,
  makeSession,
  ctx,
  seedTestUser,
  createFlowDb,
  createDecisionLogDb,
  createNotificationDb,
  InMemoryNotificationDb,
} from "@/db/test-fixtures"
import { createAdminFlowsRouter } from "@/server/routers/admin/flows"
import { decisionLogs, orchestratedFlows } from "@/db/schema/shared"
import { eq } from "drizzle-orm"
import type { OrchestratedFlowStep } from "@/lib/flows"

const db = getTestDb()
const flowDb = createFlowDb(db)
const decisionLogDb = createDecisionLogDb(db)
const notificationDb = new InMemoryNotificationDb()
const adminId = makeUUID("admin001")

const router = createAdminFlowsRouter({ db, flowDb, decisionLogDb, notificationDb })
const caller = router.createCaller(ctx(makeAdminSession(adminId)))
const userCaller = router.createCaller(ctx(makeSession({ accountId: makeUUID("user001") })))

function makeErasureSteps(): OrchestratedFlowStep[] {
  return [
    { name: "verify_identity", domain: "operations", status: "completed", attempt: 1, retryable: true, skippable: false, completedAt: new Date().toISOString() },
    { name: "extract_account_data", domain: "data-and-listings", status: "failed", attempt: 1, retryable: true, skippable: true, error: "extraction timeout" },
    { name: "close_support_tickets", domain: "operations", status: "pending", attempt: 0, retryable: true, skippable: true },
    { name: "process_erasure", domain: "data-and-listings", status: "pending", attempt: 0, retryable: true, skippable: false },
    { name: "close_dsar_case", domain: "operations", status: "pending", attempt: 0, retryable: true, skippable: false },
    { name: "emit_erasure_completed", domain: "platform", status: "pending", attempt: 0, retryable: true, skippable: true },
  ]
}

function makeClosureSteps(): OrchestratedFlowStep[] {
  return [
    { name: "archive_listings", domain: "data-and-listings", status: "completed", attempt: 1, retryable: true, skippable: false, completedAt: new Date().toISOString() },
    { name: "cancel_subscriptions", domain: "commercial", status: "failed", attempt: 1, retryable: true, skippable: true, error: "Paddle timeout" },
    { name: "anonymise_buyer_data", domain: "platform", status: "pending", attempt: 0, retryable: true, skippable: true },
    { name: "delete_defer_buyer_data", domain: "platform", status: "pending", attempt: 0, retryable: true, skippable: true },
    { name: "deactivate_account", domain: "platform", status: "pending", attempt: 0, retryable: true, skippable: false },
    { name: "emit_account_closed", domain: "platform", status: "pending", attempt: 0, retryable: true, skippable: true },
  ]
}

async function insertFlow(overrides: Partial<{
  flowType: "erasure" | "closure"
  status: "initiated" | "in_progress" | "completed" | "failed" | "escalated"
  steps: OrchestratedFlowStep[]
  currentStep: number
  deadline: Date | null
}> = {}) {
  return flowDb.insert({
    flowType: overrides.flowType ?? "erasure",
    triggeredBy: adminId,
    status: overrides.status ?? "failed",
    steps: overrides.steps ?? makeErasureSteps(),
    currentStep: overrides.currentStep ?? 1,
    context: { accountId: makeUUID("target01") },
    startedAt: new Date(),
    completedAt: null,
    deadline: overrides.deadline ?? new Date(Date.now() + 10 * 86400000),
    escalatedAt: null,
    escalationReason: null,
  })
}

beforeEach(async () => {
  await resetDb()
  await seedTestUser(db, adminId)
})

afterAll(async () => {
  await closeTestDb()
})

describe("admin.flows.list", () => {
  it("AC-6.1: returns flows filtered by flowType and status, paginated", async () => {
    await insertFlow({ flowType: "erasure", status: "failed" })
    await insertFlow({ flowType: "closure", status: "in_progress", steps: makeClosureSteps() })
    await insertFlow({ flowType: "erasure", status: "completed" })

    const all = await caller.list({ limit: 20 })
    expect(all.flows).toHaveLength(3)

    const erasureOnly = await caller.list({ flowType: "erasure", limit: 20 })
    expect(erasureOnly.flows).toHaveLength(2)
    expect(erasureOnly.flows.every((f) => f.flowType === "erasure")).toBe(true)

    const failedOnly = await caller.list({ status: "failed", limit: 20 })
    expect(failedOnly.flows).toHaveLength(1)
    expect(failedOnly.flows[0].status).toBe("failed")
  })

  it("AC-6.1: cursor-based pagination with 20 per page default", async () => {
    // Insert 3 flows and paginate with limit 2
    await insertFlow()
    await insertFlow()
    await insertFlow()

    const page1 = await caller.list({ limit: 2 })
    expect(page1.flows).toHaveLength(2)
    expect(page1.nextCursor).toBeDefined()

    const page2 = await caller.list({ limit: 2, cursor: page1.nextCursor! })
    expect(page2.flows).toHaveLength(1)
    expect(page2.nextCursor).toBeUndefined()
  })

  it("AC-6.2: erasure flows show deadline and daysRemaining, closure flows show null", async () => {
    const futureDeadline = new Date(Date.now() + 15 * 86400000)
    await flowDb.insert({
      flowType: "erasure",
      triggeredBy: adminId,
      status: "failed",
      steps: makeErasureSteps(),
      currentStep: 1,
      context: {},
      startedAt: new Date(),
      completedAt: null,
      deadline: futureDeadline,
      escalatedAt: null,
      escalationReason: null,
    })
    await flowDb.insert({
      flowType: "closure",
      triggeredBy: adminId,
      status: "in_progress",
      steps: makeClosureSteps(),
      currentStep: 1,
      context: {},
      startedAt: new Date(),
      completedAt: null,
      deadline: null,
      escalatedAt: null,
      escalationReason: null,
    })

    const result = await caller.list({ limit: 20, sort: "started_at" })
    const erasure = result.flows.find((f) => f.flowType === "erasure")!
    const closure = result.flows.find((f) => f.flowType === "closure")!

    expect(erasure.deadline).not.toBeNull()
    expect(erasure.daysRemaining).toBeGreaterThan(14)
    expect(closure.deadline).toBeNull()
    expect(closure.daysRemaining).toBeNull()
  })

  it("AC-6.1: supports sort by deadline, started_at, updated_at", async () => {
    await insertFlow({ deadline: new Date(Date.now() + 5 * 86400000) })
    await insertFlow({ deadline: new Date(Date.now() + 20 * 86400000) })

    const byDeadline = await caller.list({ sort: "deadline", limit: 20 })
    expect(byDeadline.flows).toHaveLength(2)

    const byStartedAt = await caller.list({ sort: "started_at", limit: 20 })
    expect(byStartedAt.flows).toHaveLength(2)

    const byUpdatedAt = await caller.list({ sort: "updated_at", limit: 20 })
    expect(byUpdatedAt.flows).toHaveLength(2)
  })
})

describe("admin.flows.getDetail", () => {
  it("AC-6.3: returns step-level detail with status, attempt, error", async () => {
    const flowId = await insertFlow()
    const detail = await caller.getDetail({ flowId })

    expect(detail.flowId).toBe(flowId)
    expect(detail.flowType).toBe("erasure")
    expect(detail.steps).toHaveLength(6)
    expect(detail.totalSteps).toBe(6)

    // Completed step
    const step0 = detail.steps[0]
    expect(step0.name).toBe("verify_identity")
    expect(step0.status).toBe("completed")
    expect(step0.attempt).toBe(1)
    expect(step0.completedAt).not.toBeNull()

    // Failed step
    const step1 = detail.steps[1]
    expect(step1.name).toBe("extract_account_data")
    expect(step1.status).toBe("failed")
    expect(step1.error).toBe("extraction timeout")
    expect(step1.attempt).toBe(1)
  })

  it("AC-6.3: steps include skippable flag from constraint matrix", async () => {
    const flowId = await insertFlow()
    const detail = await caller.getDetail({ flowId })

    // Non-skippable steps
    expect(detail.steps[0].skippable).toBe(false) // verify_identity
    expect(detail.steps[3].skippable).toBe(false) // process_erasure
    expect(detail.steps[4].skippable).toBe(false) // close_dsar_case

    // Skippable steps
    expect(detail.steps[1].skippable).toBe(true) // extract_account_data
    expect(detail.steps[2].skippable).toBe(true) // close_support_tickets
    expect(detail.steps[5].skippable).toBe(true) // emit_erasure_completed
  })

  it("returns NOT_FOUND for non-existent flow", async () => {
    await expect(caller.getDetail({ flowId: makeUUID("nonexist") }))
      .rejects.toThrow("Flow not found")
  })
})

describe("admin.flows.retryStep", () => {
  it("AC-6.4: increments attempt, sets step to in_progress, logs decision", async () => {
    const flowId = await insertFlow({ status: "failed" })

    await caller.retryStep({ flowId })

    const updated = await flowDb.findById(flowId)
    expect(updated!.status).toBe("in_progress")
    expect(updated!.steps[1].status).toBe("in_progress")
    expect(updated!.steps[1].attempt).toBe(2)
    expect(updated!.updatedAt).not.toBeNull()

    // AC-6.10: decision log
    const logs = await decisionLogDb.findByDomainAndType("operations", "flow_step_retry")
    expect(logs.length).toBeGreaterThanOrEqual(1)
    expect(logs.some((l) => l.decisionType === "flow_step_retry")).toBe(true)
  })

  it("AC-6.4: rejects retry when flow is not in failed state", async () => {
    const flowId = await insertFlow({ status: "in_progress" })

    await expect(caller.retryStep({ flowId }))
      .rejects.toThrow("Flow is not in failed state")
  })

  it("AC-6.10: requires adminProcedure", async () => {
    const flowId = await insertFlow()
    await expect(userCaller.retryStep({ flowId }))
      .rejects.toThrow("Admin access required")
  })
})

describe("admin.flows.skipStep", () => {
  it("AC-6.5: skips step, records reason and skippedBy, advances flow", async () => {
    const flowId = await insertFlow({ status: "failed" })

    await caller.skipStep({ flowId, reason: "Data already exported manually" })

    const updated = await flowDb.findById(flowId)
    expect(updated!.steps[1].status).toBe("skipped")
    expect(updated!.steps[1].skipReason).toBe("Data already exported manually")
    expect(updated!.steps[1].skippedBy).toBe(adminId)
    expect(updated!.currentStep).toBe(2)
    expect(updated!.updatedAt).not.toBeNull()

    // Decision log
    const logs = await decisionLogDb.findByDomainAndType("operations", "flow_step_skip")
    expect(logs.some((l) => l.decisionType === "flow_step_skip")).toBe(true)
  })

  it("AC-6.5: completing the last step marks flow as completed", async () => {
    // Create a flow at the last skippable step
    const steps = makeErasureSteps()
    steps[5] = { ...steps[5], status: "failed", attempt: 1, error: "emit failed" }
    const flowId = await insertFlow({ status: "failed", steps, currentStep: 5 })

    await caller.skipStep({ flowId, reason: "Manual cleanup done" })

    const updated = await flowDb.findById(flowId)
    expect(updated!.status).toBe("completed")
    expect(updated!.completedAt).not.toBeNull()
  })

  it("AC-6.6: rejects skip on non-skippable step with FORBIDDEN", async () => {
    // Set currentStep to verify_identity (non-skippable)
    const steps = makeErasureSteps()
    steps[0] = { ...steps[0], status: "failed", attempt: 1, error: "verification failed" }
    const flowId = await insertFlow({ status: "failed", steps, currentStep: 0 })

    await expect(caller.skipStep({ flowId, reason: "skip it" }))
      .rejects.toThrow("Step is not skippable: verify_identity")
  })

  it("AC-6.6: closure flow non-skippable steps also rejected", async () => {
    // deactivate_account is non-skippable
    const steps = makeClosureSteps()
    steps[4] = { ...steps[4], status: "failed", attempt: 1, error: "deactivation failed" }
    const flowId = await insertFlow({
      flowType: "closure",
      status: "failed",
      steps,
      currentStep: 4,
      deadline: null,
    })

    await expect(caller.skipStep({ flowId, reason: "skip it" }))
      .rejects.toThrow("Step is not skippable: deactivate_account")
  })

  it("AC-6.7: rejects empty skip reason with BAD_REQUEST", async () => {
    const flowId = await insertFlow({ status: "failed" })

    await expect(caller.skipStep({ flowId, reason: "" }))
      .rejects.toThrow("Skip reason is required")

    await expect(caller.skipStep({ flowId, reason: "   " }))
      .rejects.toThrow("Skip reason is required")
  })
})

describe("admin.flows.escalate", () => {
  it("AC-6.8: sets flow to escalated, records reason and timestamp", async () => {
    const flowId = await insertFlow({ status: "failed" })

    await caller.escalate({ flowId, reason: "DSAR deadline approaching, step stuck" })

    const updated = await flowDb.findById(flowId)
    expect(updated!.status).toBe("escalated")
    expect(updated!.escalatedAt).not.toBeNull()
    expect(updated!.escalationReason).toBe("DSAR deadline approaching, step stuck")
    expect(updated!.updatedAt).not.toBeNull()
  })

  it("AC-6.8: creates notification for principal", async () => {
    const flowId = await insertFlow({ status: "failed" })

    await caller.escalate({ flowId, reason: "Escalation reason" })

    const allNotifications = notificationDb.getAll()
    const flowNotification = allNotifications.find((n) => n.link?.includes(flowId))
    expect(flowNotification).toBeDefined()
    expect(flowNotification!.type).toBe("compliance_deadline")
    expect(flowNotification!.body).toBe("Escalation reason")
    expect(flowNotification!.title).toContain("Orchestrated flow escalated")
  })

  it("AC-6.10: logs decision for escalation", async () => {
    const flowId = await insertFlow({ status: "failed" })

    await caller.escalate({ flowId, reason: "Needs review" })

    const logs = await decisionLogDb.findByDomainAndType("operations", "flow_escalation")
    expect(logs.some((l) => l.decisionType === "flow_escalation")).toBe(true)
  })

  it("AC-6.10: requires adminProcedure", async () => {
    const flowId = await insertFlow()
    await expect(userCaller.escalate({ flowId, reason: "test" }))
      .rejects.toThrow("Admin access required")
  })
})

describe("AC-6.9: updatedAt tracking", () => {
  it("updatedAt is set on retryStep", async () => {
    const flowId = await insertFlow({ status: "failed" })

    await caller.retryStep({ flowId })

    const after = await flowDb.findById(flowId)
    expect(after!.updatedAt).not.toBeNull()
    expect(after!.updatedAt).toBeInstanceOf(Date)
  })

  it("updatedAt is set on skipStep", async () => {
    const flowId = await insertFlow({ status: "failed" })

    await caller.skipStep({ flowId, reason: "Test skip" })

    const after = await flowDb.findById(flowId)
    expect(after!.updatedAt).not.toBeNull()
  })

  it("updatedAt is set on escalate", async () => {
    const flowId = await insertFlow({ status: "failed" })

    await caller.escalate({ flowId, reason: "Test escalation" })

    const after = await flowDb.findById(flowId)
    expect(after!.updatedAt).not.toBeNull()
  })
})
