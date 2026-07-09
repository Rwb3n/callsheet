// GDPR erasure flow integration tests — CS-WORK-083
// AC-2, AC-3, AC-4, AC-6, AC-7, AC-8, AC-9, AC-10

import { describe, it, expect, beforeEach, afterAll, vi } from "vitest"
import { getTestDb, resetDb, closeTestDb } from "@/db/test-utils"
import {
  makeUUID,
  seedTestUser,
  createFlowDb,
  createSchedulerDb,
  createTestBus,
  InMemoryNotificationDb,
} from "@/db/test-fixtures"
import { InMemoryObjectStorageService } from "@/lib/storage"
import { complianceRegister, supportTickets } from "@/db/schema/operations"
import { orchestratedFlows } from "@/db/schema/shared"
import { deferredActions } from "@/db/schema/shared"
import { eq, and } from "drizzle-orm"
import { buildErasureSteps, initiateErasureFlow } from "../erasure"
import type { ErasureContext, ErasureFlowDeps } from "../erasure"
import { executeOrchestratedFlow, resumeFlow, skipStep } from "../engine"
import { checkComplianceHold } from "@/domains/operations/compliance/queries"
import { registerAutoEscalationCheckHandler } from "@/lib/scheduler/handlers/auto-escalation-check"
import { ActionHandlerRegistry } from "@/lib/scheduler/registry"

const db = getTestDb()
const flowDb = createFlowDb(db)
const schedulerDb = createSchedulerDb(db)
const ACCOUNT_ID = makeUUID("erasure001")
const ADMIN_ID = makeUUID("admin001")

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

beforeEach(async () => {
  await resetDb()
  await seedTestUser(db, ACCOUNT_ID)
  await seedTestUser(db, ADMIN_ID, `${ADMIN_ID}@example.com`)
})

afterAll(async () => {
  await closeTestDb()
})

// --- AC-2: executeOrchestratedFlow creates record with erasure type + 30-day deadline ---

describe("AC-2: flow record creation", () => {
  it("creates OrchestratedFlowProgress with flowType erasure and 30-day deadline", async () => {
    const dsarCaseId = await createDSARCase(ACCOUNT_ID)
    const deps = makeDeps()

    const result = await initiateErasureFlow(deps, dsarCaseId, ACCOUNT_ID)

    expect(result.flowType).toBe("erasure")
    expect(result.status).toBe("completed") // all 6 steps execute successfully now that processErasure is implemented (CS-WORK-084)
    expect(result.triggeredBy).toBe(ACCOUNT_ID)
    expect(result.deadline).toBeDefined()

    // Verify 30-day deadline (within 1 minute tolerance)
    const deadlineDate = new Date(result.deadline!)
    const expectedDeadline = new Date(Date.now() + 30 * 86400000)
    expect(Math.abs(deadlineDate.getTime() - expectedDeadline.getTime())).toBeLessThan(60000)
  })
})

// --- AC-3: Non-skippable steps reject skipStep ---

describe("AC-3: non-skippable steps", () => {
  it("steps 1, 4, 5 reject skipStep", async () => {
    const deps = makeDeps()
    const steps = buildErasureSteps(deps)

    // Create a flow with all steps pending
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
      currentStep: 0,
      context: { accountId: ACCOUNT_ID, dsarCaseId: "test" } as Record<string, unknown>,
      startedAt: new Date(),
      completedAt: null,
      deadline: new Date(Date.now() + 30 * 86400000),
      escalatedAt: null,
      escalationReason: null,
    })

    // Step 0 (verify_identity) — not skippable
    await expect(skipStep(flowDb, flowId, 0, "test", ADMIN_ID)).rejects.toThrow(
      'Step "verify_identity" is not skippable',
    )

    // Step 3 (process_erasure) — not skippable
    await expect(skipStep(flowDb, flowId, 3, "test", ADMIN_ID)).rejects.toThrow(
      'Step "process_erasure" is not skippable',
    )

    // Step 4 (close_dsar_case) — not skippable
    await expect(skipStep(flowDb, flowId, 4, "test", ADMIN_ID)).rejects.toThrow(
      'Step "close_dsar_case" is not skippable',
    )
  })
})

// --- AC-4: Skippable steps accept skip with mandatory reason ---

describe("AC-4: skippable steps", () => {
  it("steps 2, 3, 6 accept skip with reason text", async () => {
    const deps = makeDeps()
    const steps = buildErasureSteps(deps)

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
      currentStep: 1,
      context: { accountId: ACCOUNT_ID } as Record<string, unknown>,
      startedAt: new Date(),
      completedAt: null,
      deadline: null,
      escalatedAt: null,
      escalationReason: null,
    })

    // Step 1 (extract_account_data) — skippable
    await skipStep(flowDb, flowId, 1, "Admin accepts no audit trail", ADMIN_ID)
    const row1 = await flowDb.findById(flowId)
    expect(row1!.steps[1].status).toBe("skipped")
    expect(row1!.steps[1].skipReason).toBe("Admin accepts no audit trail")
    expect(row1!.steps[1].skippedBy).toBe(ADMIN_ID)

    // Step 2 (close_active_tickets) — skippable
    await skipStep(flowDb, flowId, 2, "Will clean up manually", ADMIN_ID)
    const row2 = await flowDb.findById(flowId)
    expect(row2!.steps[2].status).toBe("skipped")

    // Step 5 (emit_erasure_completed) — skippable
    await skipStep(flowDb, flowId, 5, "Manual cleanup of downstream state", ADMIN_ID)
    const row3 = await flowDb.findById(flowId)
    expect(row3!.steps[5].status).toBe("skipped")
  })
})

// --- AC-6: Step 6 emits erasure_completed with correct payload ---

describe("AC-6: erasure_completed event emission", () => {
  it("step 6 emits event with correct payload shape", async () => {
    const bus = createTestBus()
    const emitted: unknown[] = []
    bus.on({
      domain: "platform",
      eventType: "erasure_completed",
      mode: "sync",
      handler: async (payload) => {
        emitted.push(payload)
      },
    })

    const deps = makeDeps({ bus })
    const steps = buildErasureSteps(deps)

    // Execute step 6 directly with a populated context
    const ctx: ErasureContext = {
      accountId: ACCOUNT_ID,
      dsarCaseId: "dsar-1",
      listingIdsDeleted: [makeUUID("list001"), makeUUID("list002")],
      listingIdsAnonymised: [makeUUID("list003")],
      freelancerListingsDeleted: 2,
      companyListingsAnonymised: 1,
    }

    await steps[5].execute(ctx)

    expect(emitted).toHaveLength(1)
    const payload = emitted[0] as Record<string, unknown>
    expect(payload._brand).toBe("ErasureCompletedEvent")
    expect(payload.senderAccountId).toBe(ACCOUNT_ID)
    expect(payload.listingIdsDeleted).toEqual([makeUUID("list001"), makeUUID("list002")])
    expect(payload.listingIdsAnonymised).toEqual([makeUUID("list003")])
    expect(payload.freelancerListingsDeleted).toBe(2)
    expect(typeof payload.accountHash).toBe("string")
    expect(typeof payload.timestamp).toBe("string")
    expect(ctx.erasureCompletedEmitted).toBe(true)
  })
})

// --- AC-7: ErasureContext serialisation round-trip ---

describe("AC-7: context serialisation", () => {
  it("UUID arrays and timestamps survive JSON round-trip via flow DB", async () => {
    const deps = makeDeps()
    const steps = buildErasureSteps(deps)

    // Create a flow
    const dsarCaseId = await createDSARCase(ACCOUNT_ID)
    const initialContext: ErasureContext = {
      accountId: ACCOUNT_ID,
      dsarCaseId,
      listingIdsDeleted: [makeUUID("del001"), makeUUID("del002")],
      listingIdsAnonymised: [makeUUID("anon01")],
      freelancerListingsDeleted: 2,
      companyListingsAnonymised: 1,
      identityVerifiedAt: "2026-03-28T10:00:00.000Z",
      dbTransactionCompleted: true,
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
      context: initialContext as Record<string, unknown>,
      startedAt: new Date(),
      completedAt: null,
      deadline: new Date(Date.now() + 30 * 86400000),
      escalatedAt: null,
      escalationReason: null,
    })

    // Read back and verify context fields survive JSONB round-trip
    const row = await flowDb.findById(flowId)
    const restored = row!.context as ErasureContext

    expect(restored.accountId).toBe(ACCOUNT_ID)
    expect(restored.dsarCaseId).toBe(dsarCaseId)
    expect(restored.listingIdsDeleted).toEqual([makeUUID("del001"), makeUUID("del002")])
    expect(restored.listingIdsAnonymised).toEqual([makeUUID("anon01")])
    expect(restored.freelancerListingsDeleted).toBe(2)
    expect(restored.companyListingsAnonymised).toBe(1)
    expect(restored.identityVerifiedAt).toBe("2026-03-28T10:00:00.000Z")
    expect(restored.dbTransactionCompleted).toBe(true)
  })
})

// --- AC-8: Auto-escalation after 3 consecutive failures ---

describe("AC-8: auto-escalation", () => {
  it("engine escalates after 3 consecutive failures on same step", async () => {
    const deps = makeDeps()

    // Step that always fails
    const failingSteps = [
      {
        name: "always_fails",
        domain: "operations",
        skippable: false,
        execute: async () => {
          throw new Error("persistent failure")
        },
      },
    ]

    // Attempt 1
    let result = await executeOrchestratedFlow(flowDb, {
      flowType: "erasure",
      triggeredBy: ACCOUNT_ID,
      steps: failingSteps,
      initialContext: {},
    })
    expect(result.status).toBe("failed")
    expect(result.steps[0].attempt).toBe(1)

    // Attempt 2
    result = await resumeFlow(flowDb, result.flowId, failingSteps)
    expect(result.status).toBe("failed")
    expect(result.steps[0].attempt).toBe(2)

    // Attempt 3 — should escalate
    result = await resumeFlow(flowDb, result.flowId, failingSteps)
    expect(result.status).toBe("escalated")
    expect(result.steps[0].attempt).toBe(3)
    expect(result.escalationReason).toContain("always_fails")
    expect(result.escalationReason).toContain("3 consecutive times")
  })

  it("initiateErasureFlow schedules deadline proximity alerts", async () => {
    const dsarCaseId = await createDSARCase(ACCOUNT_ID)
    const deps = makeDeps()

    await initiateErasureFlow(deps, dsarCaseId, ACCOUNT_ID)

    // Check that auto_escalation_check deferred actions were scheduled
    const actions = await db
      .select({
        action: deferredActions.action,
        params: deferredActions.params,
        createdBy: deferredActions.createdBy,
      })
      .from(deferredActions)
      .where(eq(deferredActions.action, "auto_escalation_check"))

    expect(actions).toHaveLength(2)

    const createdBys = actions.map((a) => a.createdBy).sort()
    expect(createdBys).toEqual([
      "erasure_flow.deadline_3d",
      "erasure_flow.deadline_7d",
    ])

    // Both should reference the flow
    for (const action of actions) {
      const params = action.params as { flowId: string; flowType: string }
      expect(params.flowType).toBe("erasure")
      expect(params.flowId).toBeDefined()
    }
  })

  it("auto_escalation_check handler escalates at 3 days remaining", async () => {
    const notificationDb = new InMemoryNotificationDb()
    const registry = new ActionHandlerRegistry()

    registerAutoEscalationCheckHandler(registry, {
      db,
      notificationDb,
      adminAccountId: ADMIN_ID,
    })

    // Create a flow with deadline 2 days from now
    const flowId = await flowDb.insert({
      flowType: "erasure",
      triggeredBy: ACCOUNT_ID,
      status: "in_progress",
      steps: [],
      currentStep: 0,
      context: {},
      startedAt: new Date(),
      completedAt: null,
      deadline: new Date(Date.now() + 2 * 86400000), // 2 days = within 3-day threshold
      escalatedAt: null,
      escalationReason: null,
    })

    // Invoke the handler
    const handler = registry.get("auto_escalation_check")!
    await (handler as (params: { flowId: string; flowType: string }) => Promise<void>)({
      flowId,
      flowType: "erasure",
    })

    // Flow should be escalated
    const [flow] = await db
      .select({ status: orchestratedFlows.status, escalationReason: orchestratedFlows.escalationReason })
      .from(orchestratedFlows)
      .where(eq(orchestratedFlows.id, flowId))

    expect(flow.status).toBe("escalated")
    expect(flow.escalationReason).toContain("erasure")

    // Notification should be created
    const notifications = notificationDb.getAll()
    expect(notifications.length).toBeGreaterThanOrEqual(1)
    expect(notifications[0].title).toContain("deadline")
  })
})

// --- AC-9: Step 5 updates compliance_register + inserts erasure_audit ---

describe("AC-9: closeDSARCase compliance records", () => {
  it("step 5 closes DSAR case and creates erasure_audit record", async () => {
    const dsarCaseId = await createDSARCase(ACCOUNT_ID)
    const deps = makeDeps()
    const steps = buildErasureSteps(deps)

    // Execute step 5 directly with context that has erasure results
    const ctx: ErasureContext = {
      accountId: ACCOUNT_ID,
      dsarCaseId,
      listingIdsDeleted: [makeUUID("del001")],
      listingIdsAnonymised: [makeUUID("anon01"), makeUUID("anon02")],
      freelancerListingsDeleted: 1,
      companyListingsAnonymised: 2,
    }

    await steps[4].execute(ctx)

    // DSAR case should be completed
    const [dsarCase] = await db
      .select({
        status: complianceRegister.status,
        completedAt: complianceRegister.completedAt,
      })
      .from(complianceRegister)
      .where(eq(complianceRegister.id, dsarCaseId))

    expect(dsarCase.status).toBe("completed")
    expect(dsarCase.completedAt).not.toBeNull()

    // Erasure audit record should exist
    const auditRecords = await db
      .select({
        type: complianceRegister.type,
        accountId: complianceRegister.accountId,
        details: complianceRegister.details,
      })
      .from(complianceRegister)
      .where(
        and(
          eq(complianceRegister.type, "erasure_audit"),
          eq(complianceRegister.accountId, ACCOUNT_ID),
        ),
      )

    expect(auditRecords).toHaveLength(1)
    const audit = auditRecords[0]
    const details = audit.details as Record<string, unknown>
    expect(details.dsarCaseId).toBe(dsarCaseId)
    expect(details.listingIdsDeleted).toEqual([makeUUID("del001")])
    expect(details.listingIdsAnonymised).toEqual([makeUUID("anon01"), makeUUID("anon02")])
    expect(details.freelancerListingsDeleted).toBe(1)
    expect(details.companyListingsAnonymised).toBe(2)
    expect(typeof details.accountHash).toBe("string")

    // Context should be updated
    expect(ctx.dsarCaseClosed).toBe(true)
    expect(ctx.auditRecordCreated).toBe(true)
  })
})

// --- AC-10: checkComplianceHold returns false after step 5 ---

describe("AC-10: compliance hold cleared", () => {
  it("checkComplianceHold returns holdExists: false after DSAR case closed", async () => {
    const dsarCaseId = await createDSARCase(ACCOUNT_ID) // status: "in_progress" → creates hold? No, need "open"

    // Create an open DSAR case (creates a hold)
    const [openCase] = await db
      .insert(complianceRegister)
      .values({
        type: "dsar",
        accountId: ACCOUNT_ID,
        status: "open",
        receivedAt: new Date(),
        deadline: new Date(Date.now() + 30 * 86400000),
      })
      .returning({ id: complianceRegister.id })

    // Before step 5: hold should exist
    const holdBefore = await checkComplianceHold(db, ACCOUNT_ID)
    expect(holdBefore.holdExists).toBe(true)
    expect(holdBefore.holdType).toBe("open_dsar")

    // Execute step 5 with the open DSAR case
    const deps = makeDeps()
    const steps = buildErasureSteps(deps)

    const ctx: ErasureContext = {
      accountId: ACCOUNT_ID,
      dsarCaseId: openCase.id,
      listingIdsDeleted: [],
      listingIdsAnonymised: [],
      freelancerListingsDeleted: 0,
      companyListingsAnonymised: 0,
    }

    await steps[4].execute(ctx)

    // After step 5: hold should be cleared
    const holdAfter = await checkComplianceHold(db, ACCOUNT_ID)
    expect(holdAfter.holdExists).toBe(false)
  })
})
