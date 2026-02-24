import { describe, it, expect, vi } from "vitest"
import { executeOrchestratedFlow, resumeFlow, skipStep } from "../engine"
import type { FlowDb } from "../engine"
import type { FlowStepDefinition, FlowRow, OrchestratedFlowStep } from "../types"
import { CONSECUTIVE_FAILURE_ESCALATION_THRESHOLD } from "../types"

// --- Test helpers ---

type TestContext = { results: string[] }

function makeStep(
  overrides: Partial<FlowStepDefinition<TestContext>> = {},
): FlowStepDefinition<TestContext> {
  return {
    name: "test-step",
    domain: "platform",
    execute: async () => {},
    skippable: false,
    ...overrides,
  }
}

function createMockFlowDb(): FlowDb & {
  rows: Map<string, FlowRow>
  insertCalls: Array<Omit<FlowRow, "id" | "createdAt">>
  updateCalls: Array<{ id: string; fields: Partial<Omit<FlowRow, "id" | "createdAt">> }>
} {
  const rows = new Map<string, FlowRow>()
  const insertCalls: Array<Omit<FlowRow, "id" | "createdAt">> = []
  const updateCalls: Array<{ id: string; fields: Partial<Omit<FlowRow, "id" | "createdAt">> }> = []
  let idCounter = 1

  return {
    rows,
    insertCalls,
    updateCalls,
    insert: vi.fn(async (row) => {
      const id = `flow-${idCounter++}`
      insertCalls.push(row)
      const fullRow: FlowRow = {
        id,
        ...row,
        createdAt: new Date(),
      }
      rows.set(id, fullRow)
      return id
    }),
    update: vi.fn(async (id, fields) => {
      updateCalls.push({ id, fields })
      const existing = rows.get(id)
      if (!existing) throw new Error(`Row not found: ${id}`)
      rows.set(id, { ...existing, ...fields } as FlowRow)
    }),
    findById: vi.fn(async (id) => rows.get(id) ?? null),
  }
}

// --- Tests ---

describe("executeOrchestratedFlow", () => {
  // AC-13: Steps execute sequentially: pending → in_progress → completed
  it("executes steps sequentially with correct status transitions", async () => {
    const db = createMockFlowDb()
    const executionOrder: string[] = []

    const steps: FlowStepDefinition<TestContext>[] = [
      makeStep({
        name: "step-1",
        execute: async (ctx) => {
          executionOrder.push("step-1")
          ctx.results.push("one")
        },
      }),
      makeStep({
        name: "step-2",
        execute: async (ctx) => {
          executionOrder.push("step-2")
          ctx.results.push("two")
        },
      }),
    ]

    const result = await executeOrchestratedFlow(db, {
      flowType: "closure",
      triggeredBy: "account-1",
      steps,
      initialContext: { results: [] },
    })

    expect(result.status).toBe("completed")
    expect(result.steps[0].status).toBe("completed")
    expect(result.steps[1].status).toBe("completed")
    expect(executionOrder).toEqual(["step-1", "step-2"])
  })

  // AC-14: Step failure halts flow; status = failed; subsequent steps pending
  it("halts on step failure with failed status and pending subsequent steps", async () => {
    const db = createMockFlowDb()

    const steps: FlowStepDefinition<TestContext>[] = [
      makeStep({ name: "step-1", execute: async (ctx) => { ctx.results.push("ok") } }),
      makeStep({ name: "step-2", execute: async () => { throw new Error("db connection lost") } }),
      makeStep({ name: "step-3", execute: async () => {} }),
    ]

    const result = await executeOrchestratedFlow(db, {
      flowType: "erasure",
      triggeredBy: "dsar-1",
      steps,
      initialContext: { results: [] },
    })

    expect(result.status).toBe("failed")
    expect(result.steps[0].status).toBe("completed")
    expect(result.steps[1].status).toBe("failed")
    expect(result.steps[1].error).toBe("db connection lost")
    expect(result.steps[2].status).toBe("pending")
  })
})

describe("resumeFlow", () => {
  // AC-15: Resume from failed step; completed steps not re-executed
  it("resumes from failed step without re-executing completed steps", async () => {
    const db = createMockFlowDb()
    const executionOrder: string[] = []

    // Simulate a flow that failed on step 1 (index 1), step 0 completed
    const failedSteps: OrchestratedFlowStep[] = [
      { name: "step-1", domain: "platform", status: "completed", attempt: 1, retryable: true, skippable: false, completedAt: new Date().toISOString() },
      { name: "step-2", domain: "operations", status: "failed", attempt: 1, retryable: true, skippable: false, error: "transient" },
      { name: "step-3", domain: "data-and-listings", status: "pending", attempt: 0, retryable: true, skippable: true },
    ]

    // Pre-populate DB with a failed flow
    const flowId = await db.insert({
      flowType: "closure",
      triggeredBy: "account-1",
      status: "failed",
      steps: failedSteps,
      currentStep: 1,
      context: { results: ["one"] },
      startedAt: new Date(),
      completedAt: null,
      deadline: null,
      escalatedAt: null,
      escalationReason: null,
    })

    const stepDefs: FlowStepDefinition<TestContext>[] = [
      makeStep({ name: "step-1", execute: async () => { executionOrder.push("step-1") } }),
      makeStep({ name: "step-2", domain: "operations", execute: async (ctx) => {
        executionOrder.push("step-2")
        ctx.results.push("two")
      } }),
      makeStep({ name: "step-3", domain: "data-and-listings", skippable: true, execute: async (ctx) => {
        executionOrder.push("step-3")
        ctx.results.push("three")
      } }),
    ]

    const result = await resumeFlow(db, flowId, stepDefs)

    // Step 1 was NOT re-executed
    expect(executionOrder).toEqual(["step-2", "step-3"])
    expect(result.status).toBe("completed")
    expect(result.steps[1].status).toBe("completed")
    expect(result.steps[2].status).toBe("completed")
  })

  it("throws when resuming a non-failed flow", async () => {
    const db = createMockFlowDb()
    await db.insert({
      flowType: "closure",
      triggeredBy: "account-1",
      status: "completed",
      steps: [],
      currentStep: 0,
      context: {},
      startedAt: new Date(),
      completedAt: new Date(),
      deadline: null,
      escalatedAt: null,
      escalationReason: null,
    })

    await expect(resumeFlow(db, "flow-1", [])).rejects.toThrow("Cannot resume flow in status: completed")
  })
})

describe("shared context", () => {
  // AC-16: Shared context passes between steps
  it("passes mutable context between steps", async () => {
    const db = createMockFlowDb()

    const steps: FlowStepDefinition<TestContext>[] = [
      makeStep({ name: "step-1", execute: async (ctx) => { ctx.results.push("from-step-1") } }),
      makeStep({ name: "step-2", execute: async (ctx) => { ctx.results.push("from-step-2") } }),
    ]

    const result = await executeOrchestratedFlow(db, {
      flowType: "closure",
      triggeredBy: "account-1",
      steps,
      initialContext: { results: [] },
    })

    expect(result.context.results).toEqual(["from-step-1", "from-step-2"])
  })

  // AC-17: Context persisted to DB, restored on resume
  it("persists context to DB after each step", async () => {
    const db = createMockFlowDb()

    const steps: FlowStepDefinition<TestContext>[] = [
      makeStep({ name: "step-1", execute: async (ctx) => { ctx.results.push("persisted") } }),
      makeStep({ name: "step-2", execute: async () => { throw new Error("fail") } }),
    ]

    const result = await executeOrchestratedFlow(db, {
      flowType: "erasure",
      triggeredBy: "dsar-1",
      steps,
      initialContext: { results: [] },
    })

    // Context was persisted with step-1's mutation
    const row = db.rows.get(result.flowId)!
    expect((row.context as TestContext).results).toContain("persisted")

    // Resume restores context
    const resumedSteps: FlowStepDefinition<TestContext>[] = [
      makeStep({ name: "step-1", execute: async () => {} }),
      makeStep({ name: "step-2", execute: async (ctx) => { ctx.results.push("resumed") } }),
    ]

    const resumed = await resumeFlow(db, result.flowId, resumedSteps)
    expect(resumed.context.results).toEqual(["persisted", "resumed"])
  })
})

describe("skipStep", () => {
  // AC-18: Non-skippable step skip attempt throws error
  it("throws when skipping a non-skippable step", async () => {
    const db = createMockFlowDb()
    await db.insert({
      flowType: "erasure",
      triggeredBy: "dsar-1",
      status: "failed",
      steps: [{ name: "verify-identity", domain: "operations", status: "failed", attempt: 1, retryable: true, skippable: false }],
      currentStep: 0,
      context: {},
      startedAt: new Date(),
      completedAt: null,
      deadline: null,
      escalatedAt: null,
      escalationReason: null,
    })

    await expect(skipStep(db, "flow-1", 0, "test", "admin-1")).rejects.toThrow(
      'Step "verify-identity" is not skippable',
    )
  })

  // AC-19: Skippable step skip logs reason + admin ID
  it("skips a skippable step with logged reason and admin ID", async () => {
    const db = createMockFlowDb()
    await db.insert({
      flowType: "closure",
      triggeredBy: "account-1",
      status: "failed",
      steps: [
        { name: "cancel-paddle", domain: "commercial", status: "failed", attempt: 1, retryable: true, skippable: true },
        { name: "deactivate", domain: "platform", status: "pending", attempt: 0, retryable: true, skippable: false },
      ],
      currentStep: 0,
      context: {},
      startedAt: new Date(),
      completedAt: null,
      deadline: null,
      escalatedAt: null,
      escalationReason: null,
    })

    await skipStep(db, "flow-1", 0, "Handled manually via Paddle dashboard", "admin-1")

    const row = db.rows.get("flow-1")!
    expect(row.steps[0].status).toBe("skipped")
    expect(row.steps[0].skipReason).toBe("Handled manually via Paddle dashboard")
    expect(row.steps[0].skippedBy).toBe("admin-1")
    expect(row.currentStep).toBe(1)
  })
})

describe("auto-escalation", () => {
  // AC-20: 3 consecutive failures → auto-escalation
  it("escalates after 3 consecutive failures on the same step", async () => {
    const db = createMockFlowDb()

    const failingStep = makeStep({
      name: "process-erasure",
      domain: "operations",
      execute: async () => { throw new Error("service unavailable") },
    })

    // Run 1: attempt 1 → failed
    const initialContext: TestContext = { results: [] }
    let result = await executeOrchestratedFlow(db, {
      flowType: "erasure",
      triggeredBy: "dsar-1",
      steps: [failingStep],
      initialContext,
    })
    expect(result.status).toBe("failed")

    // Resume for attempt 2 → failed
    await db.update(result.flowId, { status: "failed" })
    result = await resumeFlow(db, result.flowId, [failingStep])
    expect(result.status).toBe("failed")

    // Resume for attempt 3 → escalated [AC-20]
    await db.update(result.flowId, { status: "failed" })
    result = await resumeFlow(db, result.flowId, [failingStep])
    expect(result.status).toBe("escalated")
    expect(result.escalationReason).toContain("process-erasure")
    expect(result.escalationReason).toContain("3 consecutive times")
  })

  it("CONSECUTIVE_FAILURE_ESCALATION_THRESHOLD is 3", () => {
    expect(CONSECUTIVE_FAILURE_ESCALATION_THRESHOLD).toBe(3)
  })
})
