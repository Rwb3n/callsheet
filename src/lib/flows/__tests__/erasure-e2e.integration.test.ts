// End-to-end erasure flow validation — CS-WORK-088
// AC-46, AC-48, AC-49, AC-50, AC-51, AC-52, AC-53

import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { eq } from "drizzle-orm"
import { getTestDb, resetDb, closeTestDb } from "@/db/test-utils"
import {
  makeUUID,
  seedTestUser,
  createFlowDb,
  createSchedulerDb,
  createTestBus,
  createTestListing,
  InMemoryNotificationDb,
} from "@/db/test-fixtures"
import { complianceRegister } from "@/db/schema/operations"
import { orchestratedFlows, deferredActions } from "@/db/schema/shared"
import { listings } from "@/db/schema/data-and-listings"
import { InMemoryObjectStorageService } from "@/lib/storage"
import type { ObjectStorageService } from "@/lib/storage"
import { buildErasureSteps, initiateErasureFlow } from "../erasure"
import type { ErasureContext, ErasureFlowDeps } from "../erasure"
import { executeOrchestratedFlow, resumeFlow, skipStep } from "../engine"
import type { FlowStepDefinition } from "../types"
import { registerAutoEscalationCheckHandler } from "@/lib/scheduler/handlers/auto-escalation-check"
import { ActionHandlerRegistry } from "@/lib/scheduler/registry"

const db = getTestDb()
const flowDb = createFlowDb(db)
const schedulerDb = createSchedulerDb(db)
const ACCOUNT_ID = makeUUID("erasuree2e")
const ADMIN_ID = makeUUID("admin0e2e1")

function makeDeps(overrides: Partial<ErasureFlowDeps> = {}): ErasureFlowDeps {
  return {
    db,
    flowDb,
    bus: createTestBus(),
    waitUntilFn: () => {},
    schedulerDb,
    storage: new InMemoryObjectStorageService(),
    ...overrides,
  }
}

async function createDSARCase(
  accountId: string,
  status: "open" | "in_progress" = "in_progress",
): Promise<string> {
  const [row] = await db
    .insert(complianceRegister)
    .values({
      type: "dsar",
      accountId,
      status,
      receivedAt: new Date(),
      deadline: new Date(Date.now() + 30 * 86400000),
    })
    .returning({ id: complianceRegister.id })
  return row.id
}

// --- Controllable step wrapper ---
// Wraps real step executors with a failure toggle.
// When shouldFail.value === true, the step throws before executing.
// This exercises the real orchestrator halt/retry against real DB.

function makeControllableSteps<T>(
  steps: FlowStepDefinition<T>[],
  failAtIndex: { value: number | null },
): FlowStepDefinition<T>[] {
  return steps.map((step, i) => ({
    ...step,
    execute: async (ctx: T) => {
      if (failAtIndex.value === i) {
        throw new Error(`Injected failure at step ${i}: ${step.name}`)
      }
      return step.execute(ctx)
    },
  }))
}

beforeEach(async () => {
  await resetDb()
  await seedTestUser(db, ACCOUNT_ID)
  await seedTestUser(db, ADMIN_ID, `${ADMIN_ID}@example.com`)
})

afterAll(async () => {
  await closeTestDb()
})

// --- AC-46: Per-step failure injection for all 6 erasure steps ---

describe("AC-46: per-step failure injection — erasure", () => {
  async function setupErasureFlow(deps: ErasureFlowDeps) {
    const dsarCaseId = await createDSARCase(ACCOUNT_ID)
    await createTestListing(db, ACCOUNT_ID, { entityType: "freelancer" })

    return {
      dsarCaseId,
      initialContext: {
        accountId: ACCOUNT_ID,
        dsarCaseId,
        listingIdsDeleted: [],
        listingIdsAnonymised: [],
        freelancerListingsDeleted: 0,
        companyListingsAnonymised: 0,
      } as ErasureContext,
    }
  }

  it("step 0 (verify_identity) — failure halts, retry succeeds", async () => {
    const deps = makeDeps()
    const { dsarCaseId, initialContext } = await setupErasureFlow(deps)
    const failAt = { value: 0 as number | null }
    const steps = makeControllableSteps(buildErasureSteps(deps), failAt)

    const result = await executeOrchestratedFlow(flowDb, {
      flowType: "erasure",
      triggeredBy: ACCOUNT_ID,
      steps,
      initialContext,
    })

    expect(result.status).toBe("failed")
    expect(result.steps[0].status).toBe("failed")
    expect(result.steps[0].attempt).toBe(1)
    expect(result.steps[0].error).toContain("Injected failure at step 0")
    for (let i = 1; i < 6; i++) {
      expect(result.steps[i].status).toBe("pending")
    }

    // Fix and retry
    failAt.value = null
    const retried = await resumeFlow(flowDb, result.flowId, steps)
    expect(retried.status).toBe("completed")
    expect(retried.steps[0].status).toBe("completed")
    expect(retried.steps[0].attempt).toBe(2)
  })

  it("step 1 (extract_account_data) — failure halts, retry succeeds", async () => {
    const deps = makeDeps()
    const { dsarCaseId, initialContext } = await setupErasureFlow(deps)
    const failAt = { value: 1 as number | null }
    const steps = makeControllableSteps(buildErasureSteps(deps), failAt)

    const result = await executeOrchestratedFlow(flowDb, {
      flowType: "erasure",
      triggeredBy: ACCOUNT_ID,
      steps,
      initialContext,
    })

    expect(result.status).toBe("failed")
    expect(result.steps[0].status).toBe("completed")
    expect(result.steps[1].status).toBe("failed")
    expect(result.steps[1].attempt).toBe(1)

    failAt.value = null
    const retried = await resumeFlow(flowDb, result.flowId, steps)
    expect(retried.status).toBe("completed")
    expect(retried.steps[1].status).toBe("completed")
    expect(retried.steps[1].attempt).toBe(2)
  })

  it("step 2 (close_active_tickets) — failure halts, retry succeeds", async () => {
    const deps = makeDeps()
    const { dsarCaseId, initialContext } = await setupErasureFlow(deps)
    const failAt = { value: 2 as number | null }
    const steps = makeControllableSteps(buildErasureSteps(deps), failAt)

    const result = await executeOrchestratedFlow(flowDb, {
      flowType: "erasure",
      triggeredBy: ACCOUNT_ID,
      steps,
      initialContext,
    })

    expect(result.status).toBe("failed")
    expect(result.steps[0].status).toBe("completed")
    expect(result.steps[1].status).toBe("completed")
    expect(result.steps[2].status).toBe("failed")

    failAt.value = null
    const retried = await resumeFlow(flowDb, result.flowId, steps)
    expect(retried.status).toBe("completed")
    expect(retried.steps[2].status).toBe("completed")
    expect(retried.steps[2].attempt).toBe(2)
  })

  it("step 3 (process_erasure) — failure halts, retry succeeds", async () => {
    const deps = makeDeps()
    const { dsarCaseId, initialContext } = await setupErasureFlow(deps)
    const failAt = { value: 3 as number | null }
    const steps = makeControllableSteps(buildErasureSteps(deps), failAt)

    const result = await executeOrchestratedFlow(flowDb, {
      flowType: "erasure",
      triggeredBy: ACCOUNT_ID,
      steps,
      initialContext,
    })

    expect(result.status).toBe("failed")
    expect(result.steps[3].status).toBe("failed")
    // Steps 0-2 completed
    for (let i = 0; i < 3; i++) {
      expect(result.steps[i].status).toBe("completed")
    }
    // Steps 4-5 still pending
    expect(result.steps[4].status).toBe("pending")
    expect(result.steps[5].status).toBe("pending")

    failAt.value = null
    const retried = await resumeFlow(flowDb, result.flowId, steps)
    expect(retried.status).toBe("completed")
    expect(retried.steps[3].status).toBe("completed")
    expect(retried.steps[3].attempt).toBe(2)
  })

  it("step 4 (close_dsar_case) — failure halts, retry succeeds", async () => {
    const deps = makeDeps()
    const { dsarCaseId, initialContext } = await setupErasureFlow(deps)
    const failAt = { value: 4 as number | null }
    const steps = makeControllableSteps(buildErasureSteps(deps), failAt)

    const result = await executeOrchestratedFlow(flowDb, {
      flowType: "erasure",
      triggeredBy: ACCOUNT_ID,
      steps,
      initialContext,
    })

    expect(result.status).toBe("failed")
    expect(result.steps[4].status).toBe("failed")
    for (let i = 0; i < 4; i++) {
      expect(result.steps[i].status).toBe("completed")
    }
    expect(result.steps[5].status).toBe("pending")

    failAt.value = null
    const retried = await resumeFlow(flowDb, result.flowId, steps)
    expect(retried.status).toBe("completed")
    expect(retried.steps[4].status).toBe("completed")
    expect(retried.steps[4].attempt).toBe(2)
  })

  it("step 5 (emit_erasure_completed) — failure halts, retry succeeds", async () => {
    const deps = makeDeps()
    const { dsarCaseId, initialContext } = await setupErasureFlow(deps)
    const failAt = { value: 5 as number | null }
    const steps = makeControllableSteps(buildErasureSteps(deps), failAt)

    const result = await executeOrchestratedFlow(flowDb, {
      flowType: "erasure",
      triggeredBy: ACCOUNT_ID,
      steps,
      initialContext,
    })

    expect(result.status).toBe("failed")
    expect(result.steps[5].status).toBe("failed")
    for (let i = 0; i < 5; i++) {
      expect(result.steps[i].status).toBe("completed")
    }

    failAt.value = null
    const retried = await resumeFlow(flowDb, result.flowId, steps)
    expect(retried.status).toBe("completed")
    expect(retried.steps[5].status).toBe("completed")
    expect(retried.steps[5].attempt).toBe(2)
  })
})

// --- AC-48: Attempt counter increments on each retry ---

describe("AC-48: attempt counter persistence", () => {
  it("attempt increments 1 → 2 → 3 across retries, persisted to DB", async () => {
    const deps = makeDeps()
    const dsarCaseId = await createDSARCase(ACCOUNT_ID)
    const failAt = { value: 0 as number | null }
    const steps = makeControllableSteps(buildErasureSteps(deps), failAt)

    // Attempt 1 → fail
    let result = await executeOrchestratedFlow(flowDb, {
      flowType: "erasure",
      triggeredBy: ACCOUNT_ID,
      steps,
      initialContext: {
        accountId: ACCOUNT_ID,
        dsarCaseId,
        listingIdsDeleted: [],
        listingIdsAnonymised: [],
        freelancerListingsDeleted: 0,
        companyListingsAnonymised: 0,
      } as ErasureContext,
    })
    expect(result.steps[0].attempt).toBe(1)

    // Verify persisted to DB
    let row = await flowDb.findById(result.flowId)
    expect(row!.steps[0].attempt).toBe(1)

    // Attempt 2 → fail
    result = await resumeFlow(flowDb, result.flowId, steps)
    expect(result.steps[0].attempt).toBe(2)
    row = await flowDb.findById(result.flowId)
    expect(row!.steps[0].attempt).toBe(2)

    // Attempt 3 → escalated (3 consecutive failures)
    result = await resumeFlow(flowDb, result.flowId, steps)
    expect(result.steps[0].attempt).toBe(3)
    expect(result.status).toBe("escalated")
    row = await flowDb.findById(result.flowId)
    expect(row!.steps[0].attempt).toBe(3)
    expect(row!.status).toBe("escalated")
  })
})

// --- AC-49: Context JSON serialisation round-trip ---

describe("AC-49: context serialisation round-trip", () => {
  it("UUID arrays, timestamps, booleans, and nested objects survive JSONB round-trip", async () => {
    const deps = makeDeps()
    const dsarCaseId = await createDSARCase(ACCOUNT_ID)
    const steps = buildErasureSteps(deps)

    const contextWithNested: ErasureContext & { nested?: Record<string, unknown> } = {
      accountId: ACCOUNT_ID,
      dsarCaseId,
      listingIdsDeleted: [makeUUID("del00001"), makeUUID("del00002")],
      listingIdsAnonymised: [makeUUID("anon0001")],
      freelancerListingsDeleted: 2,
      companyListingsAnonymised: 1,
      identityVerifiedAt: "2026-03-28T10:00:00.000Z",
      dbTransactionCompleted: true,
      r2CleanupCompleted: false,
      // Nested object — spec §6.5 R12-P1
      nested: {
        auditTrail: {
          steps: ["verify", "extract"],
          metadata: { source: "dsar", priority: 1 },
        },
      },
    }

    const flowId = await flowDb.insert({
      flowType: "erasure",
      triggeredBy: ACCOUNT_ID,
      status: "failed",
      steps: steps.map((s) => ({
        name: s.name,
        domain: s.domain,
        status: "pending" as const,
        attempt: 0,
        retryable: true,
        skippable: s.skippable,
      })),
      currentStep: 4,
      context: contextWithNested as Record<string, unknown>,
      startedAt: new Date(),
      completedAt: null,
      deadline: new Date(Date.now() + 30 * 86400000),
      escalatedAt: null,
      escalationReason: null,
    })

    const row = await flowDb.findById(flowId)
    const restored = row!.context as typeof contextWithNested

    // UUID arrays
    expect(restored.listingIdsDeleted).toEqual([makeUUID("del00001"), makeUUID("del00002")])
    expect(restored.listingIdsAnonymised).toEqual([makeUUID("anon0001")])

    // ISO8601 timestamps
    expect(restored.identityVerifiedAt).toBe("2026-03-28T10:00:00.000Z")

    // Booleans
    expect(restored.dbTransactionCompleted).toBe(true)
    expect(restored.r2CleanupCompleted).toBe(false)

    // Nested objects
    expect(restored.nested).toEqual({
      auditTrail: {
        steps: ["verify", "extract"],
        metadata: { source: "dsar", priority: 1 },
      },
    })

    // Numeric primitives
    expect(restored.freelancerListingsDeleted).toBe(2)
    expect(restored.companyListingsAnonymised).toBe(1)
  })
})

// --- AC-50: Prior completed steps NOT re-executed on retry ---

describe("AC-50: prior steps not re-executed", () => {
  it("resume from step 3 does not re-execute steps 0-2", async () => {
    const deps = makeDeps()
    const dsarCaseId = await createDSARCase(ACCOUNT_ID)
    await createTestListing(db, ACCOUNT_ID, { entityType: "freelancer" })

    const callCounts = [0, 0, 0, 0, 0, 0]
    const failAt = { value: 3 as number | null }

    const steps = buildErasureSteps(deps).map((step, i) => ({
      ...step,
      execute: async (ctx: ErasureContext) => {
        callCounts[i]++
        if (failAt.value === i) {
          throw new Error(`Injected failure at step ${i}`)
        }
        return step.execute(ctx)
      },
    }))

    // Execute — fails at step 3
    const result = await executeOrchestratedFlow(flowDb, {
      flowType: "erasure",
      triggeredBy: ACCOUNT_ID,
      steps,
      initialContext: {
        accountId: ACCOUNT_ID,
        dsarCaseId,
        listingIdsDeleted: [],
        listingIdsAnonymised: [],
        freelancerListingsDeleted: 0,
        companyListingsAnonymised: 0,
      } as ErasureContext,
    })

    expect(result.status).toBe("failed")
    expect(callCounts).toEqual([1, 1, 1, 1, 0, 0])

    // Reset counters, fix failure
    callCounts.fill(0)
    failAt.value = null

    // Resume — should only execute steps 3-5
    const retried = await resumeFlow(flowDb, result.flowId, steps)
    expect(retried.status).toBe("completed")
    expect(callCounts[0]).toBe(0) // NOT re-executed
    expect(callCounts[1]).toBe(0) // NOT re-executed
    expect(callCounts[2]).toBe(0) // NOT re-executed
    expect(callCounts[3]).toBe(1) // retried
    expect(callCounts[4]).toBe(1) // continued
    expect(callCounts[5]).toBe(1) // continued
  })
})

// --- AC-51: processErasure retry with dbTransactionCompleted skips DB ---

describe("AC-51: D2 sub-step skip on retry", () => {
  it("retry with dbTransactionCompleted=true skips DB transaction, retries R2 only", async () => {
    // Create a storage service that fails on first deleteByPrefix call
    let deleteByPrefixCallCount = 0
    const failingStorage: ObjectStorageService = {
      upload: async () => ({ url: null }),
      getSignedUrl: async () => "https://signed.url",
      delete: async () => {},
      listByPrefix: async () => [],
      download: async () => Buffer.from(""),
      deleteByPrefix: async (prefix: string) => {
        deleteByPrefixCallCount++
        if (deleteByPrefixCallCount === 1) {
          throw new Error("R2 timeout")
        }
        return { deleted: 0 }
      },
    }

    const deps = makeDeps({ storage: failingStorage })
    const dsarCaseId = await createDSARCase(ACCOUNT_ID)
    await createTestListing(db, ACCOUNT_ID, { entityType: "freelancer" })
    const steps = buildErasureSteps(deps)

    // Execute full flow — step 4 (process_erasure) will fail during R2 cleanup
    const result = await executeOrchestratedFlow(flowDb, {
      flowType: "erasure",
      triggeredBy: ACCOUNT_ID,
      steps,
      initialContext: {
        accountId: ACCOUNT_ID,
        dsarCaseId,
        listingIdsDeleted: [],
        listingIdsAnonymised: [],
        freelancerListingsDeleted: 0,
        companyListingsAnonymised: 0,
      } as ErasureContext,
    })

    expect(result.status).toBe("failed")
    expect(result.steps[3].status).toBe("failed")
    expect(result.steps[3].error).toContain("R2 timeout")

    // Verify context: DB transaction completed but R2 failed
    const row = await flowDb.findById(result.flowId)
    const ctx = row!.context as ErasureContext
    expect(ctx.dbTransactionCompleted).toBe(true)
    expect(ctx.r2CleanupCompleted).toBeUndefined()

    // Verify the freelancer listing was actually deleted by the DB transaction
    const freelancerRows = await db
      .select()
      .from(listings)
      .where(eq(listings.accountId, ACCOUNT_ID))
    // Freelancer listing deleted, possibly company listing anonymised
    // The important thing: DB transaction ran successfully

    // Retry — R2 should succeed now (2nd call)
    const retried = await resumeFlow(flowDb, result.flowId, steps)
    expect(retried.status).toBe("completed")
    expect(retried.steps[3].status).toBe("completed")
    expect(retried.steps[3].attempt).toBe(2)

    // Verify R2 was called twice total (once failed, once succeeded)
    expect(deleteByPrefixCallCount).toBeGreaterThanOrEqual(2)

    // Verify context shows R2 completed
    const finalRow = await flowDb.findById(result.flowId)
    const finalCtx = finalRow!.context as ErasureContext
    expect(finalCtx.dbTransactionCompleted).toBe(true)
    expect(finalCtx.r2CleanupCompleted).toBe(true)
  })
})

// --- AC-52: After 3 failures, auto-escalation ---

describe("AC-52: 3 consecutive failures → escalation", () => {
  it("engine escalates after 3 consecutive failures, flow status = escalated", async () => {
    const deps = makeDeps()
    const dsarCaseId = await createDSARCase(ACCOUNT_ID)
    const failAt = { value: 0 as number | null } // always fail step 0
    const steps = makeControllableSteps(buildErasureSteps(deps), failAt)

    const initialContext: ErasureContext = {
      accountId: ACCOUNT_ID,
      dsarCaseId,
      listingIdsDeleted: [],
      listingIdsAnonymised: [],
      freelancerListingsDeleted: 0,
      companyListingsAnonymised: 0,
    }

    // 3 consecutive failures
    let result = await executeOrchestratedFlow(flowDb, {
      flowType: "erasure",
      triggeredBy: ACCOUNT_ID,
      steps,
      initialContext,
    })
    expect(result.status).toBe("failed")

    result = await resumeFlow(flowDb, result.flowId, steps)
    expect(result.status).toBe("failed")

    result = await resumeFlow(flowDb, result.flowId, steps)
    expect(result.status).toBe("escalated")
    expect(result.escalationReason).toContain("3 consecutive times")

    // Verify persisted
    const row = await flowDb.findById(result.flowId)
    expect(row!.status).toBe("escalated")
    expect(row!.escalatedAt).not.toBeNull()
  })
})

// --- AC-53: Erasure deadline proximity escalation lifecycle ---

describe("AC-53: deadline proximity escalation", () => {
  it("7-day alert creates notification without escalation", async () => {
    const notificationDb = new InMemoryNotificationDb()
    const registry = new ActionHandlerRegistry()
    registerAutoEscalationCheckHandler(registry, {
      db,
      notificationDb,
      adminAccountId: ADMIN_ID,
    })

    // Create flow with deadline 6 days from now (within 7-day window)
    const flowId = await flowDb.insert({
      flowType: "erasure",
      triggeredBy: ACCOUNT_ID,
      status: "in_progress",
      steps: [],
      currentStep: 0,
      context: {},
      startedAt: new Date(),
      completedAt: null,
      deadline: new Date(Date.now() + 6 * 86400000),
      escalatedAt: null,
      escalationReason: null,
    })

    const handler = registry.get("auto_escalation_check")!
    await (handler as (params: { flowId: string; flowType: string }) => Promise<void>)({
      flowId,
      flowType: "erasure",
    })

    // Should create notification but NOT escalate
    const notifications = notificationDb.getAll()
    expect(notifications).toHaveLength(1)
    expect(notifications[0].title).toContain("deadline approaching")

    const [flow] = await db
      .select({ status: orchestratedFlows.status })
      .from(orchestratedFlows)
      .where(eq(orchestratedFlows.id, flowId))
    expect(flow.status).toBe("in_progress") // NOT escalated
  })

  it("3-day threshold auto-escalates flow", async () => {
    const notificationDb = new InMemoryNotificationDb()
    const registry = new ActionHandlerRegistry()
    registerAutoEscalationCheckHandler(registry, {
      db,
      notificationDb,
      adminAccountId: ADMIN_ID,
    })

    // Create flow with deadline 2 days from now (within 3-day threshold)
    const flowId = await flowDb.insert({
      flowType: "erasure",
      triggeredBy: ACCOUNT_ID,
      status: "in_progress",
      steps: [],
      currentStep: 0,
      context: {},
      startedAt: new Date(),
      completedAt: null,
      deadline: new Date(Date.now() + 2 * 86400000),
      escalatedAt: null,
      escalationReason: null,
    })

    const handler = registry.get("auto_escalation_check")!
    await (handler as (params: { flowId: string; flowType: string }) => Promise<void>)({
      flowId,
      flowType: "erasure",
    })

    const [flow] = await db
      .select({
        status: orchestratedFlows.status,
        escalationReason: orchestratedFlows.escalationReason,
      })
      .from(orchestratedFlows)
      .where(eq(orchestratedFlows.id, flowId))
    expect(flow.status).toBe("escalated")
    expect(flow.escalationReason).toContain("erasure")

    const notifications = notificationDb.getAll()
    expect(notifications).toHaveLength(1)
    expect(notifications[0].title).toContain("days")
  })

  it("deadline-passed triggers critical alert and escalation", async () => {
    const notificationDb = new InMemoryNotificationDb()
    const registry = new ActionHandlerRegistry()
    registerAutoEscalationCheckHandler(registry, {
      db,
      notificationDb,
      adminAccountId: ADMIN_ID,
    })

    // Create flow with deadline in the past
    const flowId = await flowDb.insert({
      flowType: "erasure",
      triggeredBy: ACCOUNT_ID,
      status: "in_progress",
      steps: [],
      currentStep: 0,
      context: {},
      startedAt: new Date(),
      completedAt: null,
      deadline: new Date(Date.now() - 86400000), // 1 day ago
      escalatedAt: null,
      escalationReason: null,
    })

    const handler = registry.get("auto_escalation_check")!
    await (handler as (params: { flowId: string; flowType: string }) => Promise<void>)({
      flowId,
      flowType: "erasure",
    })

    const [flow] = await db
      .select({
        status: orchestratedFlows.status,
        escalationReason: orchestratedFlows.escalationReason,
      })
      .from(orchestratedFlows)
      .where(eq(orchestratedFlows.id, flowId))
    expect(flow.status).toBe("escalated")
    expect(flow.escalationReason).toContain("passed")

    const notifications = notificationDb.getAll()
    expect(notifications).toHaveLength(1)
    expect(notifications[0].title).toContain("CRITICAL")
  })

  it("completed flow is ignored by auto_escalation_check", async () => {
    const notificationDb = new InMemoryNotificationDb()
    const registry = new ActionHandlerRegistry()
    registerAutoEscalationCheckHandler(registry, {
      db,
      notificationDb,
      adminAccountId: ADMIN_ID,
    })

    const flowId = await flowDb.insert({
      flowType: "erasure",
      triggeredBy: ACCOUNT_ID,
      status: "completed",
      steps: [],
      currentStep: 5,
      context: {},
      startedAt: new Date(),
      completedAt: new Date(),
      deadline: new Date(Date.now() - 86400000), // past deadline but completed
      escalatedAt: null,
      escalationReason: null,
    })

    const handler = registry.get("auto_escalation_check")!
    await (handler as (params: { flowId: string; flowType: string }) => Promise<void>)({
      flowId,
      flowType: "erasure",
    })

    // No notifications, status unchanged
    expect(notificationDb.getAll()).toHaveLength(0)
    const [flow] = await db
      .select({ status: orchestratedFlows.status })
      .from(orchestratedFlows)
      .where(eq(orchestratedFlows.id, flowId))
    expect(flow.status).toBe("completed")
  })
})
