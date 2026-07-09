// End-to-end concurrent flow validation — CS-WORK-088
// AC-56, AC-57

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
} from "@/db/test-fixtures"
import {
  shortlists,
  savedSearches,
  searchHistory,
} from "@/db/schema/accounts"
import { complianceRegister } from "@/db/schema/operations"
import { deferredActions, orchestratedFlows } from "@/db/schema/shared"
import { listings } from "@/db/schema/data-and-listings"
import { InMemoryObjectStorageService } from "@/lib/storage"
import { InMemoryPaymentService } from "@/lib/services/mocks"
import { buildErasureSteps, initiateErasureFlow } from "../erasure"
import type { ErasureFlowDeps } from "../erasure"
import { buildClosureSteps, initiateAccountClosure } from "../closure"
import type { ClosureFlowDeps, ClosureContext } from "../closure"
import { executeOrchestratedFlow, resumeFlow } from "../engine"
import { registerComplianceHoldRecheckHandler } from "@/lib/scheduler/handlers/compliance-hold-recheck"
import { ActionHandlerRegistry } from "@/lib/scheduler/registry"
import { invokeHandler } from "@/lib/scheduler/handlers/__tests__/invoke-handler"

const db = getTestDb()
const flowDb = createFlowDb(db)
const schedulerDb = createSchedulerDb(db)
const ACCOUNT_ID = makeUUID("conce2e001")
const OTHER_ACCOUNT = makeUUID("conce2e002")

function makeErasureDeps(
  overrides: Partial<ErasureFlowDeps> = {},
): ErasureFlowDeps {
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

function makeClosureDeps(
  overrides: Partial<ClosureFlowDeps> = {},
): ClosureFlowDeps {
  return {
    db,
    flowDb,
    bus: createTestBus(),
    waitUntilFn: () => {},
    payment: new InMemoryPaymentService(),
    schedulerDb,
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

async function createComplianceHold(accountId: string): Promise<string> {
  const [row] = await db
    .insert(complianceRegister)
    .values({
      type: "dsar",
      accountId,
      status: "open",
      receivedAt: new Date(),
      deadline: new Date(Date.now() + 30 * 86400000),
    })
    .returning({ id: complianceRegister.id })
  return row.id
}

async function createBuyerData(accountId: string) {
  await db.insert(shortlists).values({
    accountId,
    name: "E2E shortlist",
  })
  await db.insert(savedSearches).values({
    accountId,
    name: "E2E saved search",
    query: "camera",
  })
  await db.insert(searchHistory).values({
    accountId,
    query: "sound recordist",
    resultCount: 3,
  })
}

async function hasBuyerData(accountId: string): Promise<boolean> {
  const sls = await db.select().from(shortlists).where(eq(shortlists.accountId, accountId))
  const ss = await db.select().from(savedSearches).where(eq(savedSearches.accountId, accountId))
  const sh = await db.select().from(searchHistory).where(eq(searchHistory.accountId, accountId))
  return sls.length > 0 || ss.length > 0 || sh.length > 0
}

beforeEach(async () => {
  await resetDb()
  await seedTestUser(db, ACCOUNT_ID)
  await seedTestUser(db, OTHER_ACCOUNT)
})

afterAll(async () => {
  await closeTestDb()
})

// --- AC-56: Concurrent erasure + closure coexist ---

describe("AC-56: concurrent flow coexistence", () => {
  it("Scenario A: erasure during closure — closure defers, processErasure deletes, recheck is no-op", async () => {
    // Setup: account with listings and buyer data
    await createTestListing(db, ACCOUNT_ID, { entityType: "freelancer" })
    await createTestListing(db, ACCOUNT_ID, { entityType: "company" })
    const otherListing = await createTestListing(db, OTHER_ACCOUNT)
    await createBuyerData(ACCOUNT_ID)

    // 1. Initiate closure — will complete (no compliance hold yet)
    // But we need to simulate the scenario where a DSAR arrives mid-closure.
    // Approach: manually create closure flow, execute steps 1-3, then create DSAR,
    // then execute step 4 (which checks compliance hold).

    const closureDeps = makeClosureDeps()
    const closureSteps = buildClosureSteps(closureDeps)

    // Create closure flow manually (to control step-by-step execution)
    const closureFlowId = await flowDb.insert({
      flowType: "closure",
      triggeredBy: ACCOUNT_ID,
      status: "in_progress",
      steps: closureSteps.map((s) => ({
        name: s.name,
        domain: s.domain,
        status: "pending" as const,
        attempt: 0,
        retryable: true,
        skippable: s.skippable,
      })),
      currentStep: 0,
      context: {
        accountId: ACCOUNT_ID,
        listingsArchived: [],
        subscriptionsCancelled: 0,
        subscriptionsFailed: [],
        enquiriesAnonymised: 0,
        buyerDataDeleted: false,
        buyerDataDeferred: false,
        accountDeactivated: false,
        accountClosedEmitted: false,
      } as Record<string, unknown>,
      startedAt: new Date(),
      completedAt: null,
      deadline: null,
      escalatedAt: null,
      escalationReason: null,
    })

    // Execute closure steps 0-2 directly via context
    const ctx: ClosureContext = {
      accountId: ACCOUNT_ID,
      listingsArchived: [],
      subscriptionsCancelled: 0,
      subscriptionsFailed: [],
      enquiriesAnonymised: 0,
      buyerDataDeleted: false,
      buyerDataDeferred: false,
      accountDeactivated: false,
      accountClosedEmitted: false,
    }
    await closureSteps[0].execute(ctx) // archive listings
    await closureSteps[1].execute(ctx) // cancel paddle (no-op, no paid listings)
    await closureSteps[2].execute(ctx) // anonymise enquiries (no-op, no enquiries)

    // 2. DSAR arrives — compliance hold created
    const holdCaseId = await createComplianceHold(ACCOUNT_ID)

    // 3. Execute closure step 3 (delete_defer_buyer_data) — should defer
    await closureSteps[3].execute(ctx)
    expect(ctx.buyerDataDeferred).toBe(true)
    expect(ctx.buyerDataDeleted).toBe(false)

    // Buyer data still exists
    expect(await hasBuyerData(ACCOUNT_ID)).toBe(true)

    // 4. Complete closure (steps 4-5)
    await closureSteps[4].execute(ctx) // deactivate account
    await closureSteps[5].execute(ctx) // emit account_closed

    // 5. Initiate and complete erasure flow
    const dsarCaseId = await createDSARCase(ACCOUNT_ID)
    // Close the hold case first (change status from "open" to "in_progress") so erasure step 1 passes
    await db
      .update(complianceRegister)
      .set({ status: "in_progress" })
      .where(eq(complianceRegister.id, holdCaseId))

    const erasureDeps = makeErasureDeps()
    const erasureResult = await initiateErasureFlow(erasureDeps, dsarCaseId, ACCOUNT_ID)
    expect(erasureResult.status).toBe("completed")

    // 6. processErasure deleted buyer data (via deleteAccountData)
    expect(await hasBuyerData(ACCOUNT_ID)).toBe(false)

    // 7. Fire compliance_hold_recheck — should be no-op
    // Close the DSAR case fully so hold clears
    await db
      .update(complianceRegister)
      .set({ status: "completed", completedAt: new Date() })
      .where(eq(complianceRegister.id, holdCaseId))

    const registry = new ActionHandlerRegistry()
    registerComplianceHoldRecheckHandler(registry, { db, flowDb, schedulerDb })

    await invokeHandler(registry, "compliance_hold_recheck", {
      accountId: ACCOUNT_ID,
      flowId: closureFlowId,
    })

    // Still no buyer data (already deleted by processErasure)
    expect(await hasBuyerData(ACCOUNT_ID)).toBe(false)
  })

  it("both flows create independent orchestrated_flows rows", async () => {
    const dsarCaseId = await createDSARCase(ACCOUNT_ID)

    const erasureResult = await initiateErasureFlow(
      makeErasureDeps(),
      dsarCaseId,
      ACCOUNT_ID,
    )
    const closureResult = await initiateAccountClosure(
      makeClosureDeps(),
      ACCOUNT_ID,
    )

    expect(erasureResult.flowId).not.toBe(closureResult.flowId)

    const allFlows = await db
      .select({
        id: orchestratedFlows.id,
        flowType: orchestratedFlows.flowType,
      })
      .from(orchestratedFlows)
      .where(eq(orchestratedFlows.triggeredBy, ACCOUNT_ID))

    const flowTypes = allFlows.map((f) => f.flowType).sort()
    expect(flowTypes).toContain("erasure")
    expect(flowTypes).toContain("closure")
  })
})

// --- AC-57: compliance_hold_recheck lifecycle ---

describe("AC-57: compliance_hold_recheck lifecycle", () => {
  it("reschedules when hold still active, deletes buyer data when hold cleared", async () => {
    const otherListing = await createTestListing(db, OTHER_ACCOUNT)
    await createBuyerData(ACCOUNT_ID)

    // Create a completed closure flow with deferred state
    const closureFlowId = await flowDb.insert({
      flowType: "closure",
      triggeredBy: ACCOUNT_ID,
      status: "completed",
      steps: [],
      currentStep: 5,
      context: {
        accountId: ACCOUNT_ID,
        buyerDataDeleted: false,
        buyerDataDeferred: true,
      },
      startedAt: new Date(),
      completedAt: new Date(),
      deadline: null,
      escalatedAt: null,
      escalationReason: null,
    })

    // Active compliance hold
    const holdCaseId = await createComplianceHold(ACCOUNT_ID)

    const registry = new ActionHandlerRegistry()
    registerComplianceHoldRecheckHandler(registry, { db, flowDb, schedulerDb })

    // First recheck — hold active, should reschedule
    await invokeHandler(registry, "compliance_hold_recheck", {
      accountId: ACCOUNT_ID,
      flowId: closureFlowId,
    })

    // Buyer data still exists
    expect(await hasBuyerData(ACCOUNT_ID)).toBe(true)

    // Verify rescheduled
    const scheduled = await db
      .select({ action: deferredActions.action, executeAt: deferredActions.executeAt })
      .from(deferredActions)
      .where(eq(deferredActions.action, "compliance_hold_recheck"))

    expect(scheduled.length).toBeGreaterThanOrEqual(1)
    const nextCheck = scheduled[scheduled.length - 1]
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000
    const diff = new Date(nextCheck.executeAt).getTime() - Date.now()
    expect(diff).toBeGreaterThan(sevenDaysMs - 60000)
    expect(diff).toBeLessThan(sevenDaysMs + 60000)

    // Clear the hold (close DSAR case)
    await db
      .update(complianceRegister)
      .set({ status: "completed", completedAt: new Date() })
      .where(eq(complianceRegister.id, holdCaseId))

    // Second recheck — hold cleared, should delete buyer data
    await invokeHandler(registry, "compliance_hold_recheck", {
      accountId: ACCOUNT_ID,
      flowId: closureFlowId,
    })

    // Buyer data deleted
    expect(await hasBuyerData(ACCOUNT_ID)).toBe(false)

    // Flow context updated
    const flowRow = await flowDb.findById(closureFlowId)
    expect(flowRow!.context).toMatchObject({
      buyerDataDeleted: true,
      buyerDataDeferred: false,
    })
  })

  it("recheck is no-op when buyer data already deleted by processErasure", async () => {
    // No buyer data exists (processErasure already deleted it)
    const closureFlowId = await flowDb.insert({
      flowType: "closure",
      triggeredBy: ACCOUNT_ID,
      status: "completed",
      steps: [],
      currentStep: 5,
      context: {
        accountId: ACCOUNT_ID,
        buyerDataDeleted: false,
        buyerDataDeferred: true,
      },
      startedAt: new Date(),
      completedAt: new Date(),
      deadline: null,
      escalatedAt: null,
      escalationReason: null,
    })

    // No compliance hold (already cleared)
    const registry = new ActionHandlerRegistry()
    registerComplianceHoldRecheckHandler(registry, { db, flowDb, schedulerDb })

    // Should complete without error — deleteBuyerData is idempotent
    await invokeHandler(registry, "compliance_hold_recheck", {
      accountId: ACCOUNT_ID,
      flowId: closureFlowId,
    })

    // Flow context updated even though data was already gone
    const flowRow = await flowDb.findById(closureFlowId)
    expect(flowRow!.context).toMatchObject({
      buyerDataDeleted: true,
      buyerDataDeferred: false,
    })
  })
})
