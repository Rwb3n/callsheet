// Concurrent flow interaction integration tests — CS-WORK-087
// AC-40, AC-41, AC-42, AC-43, AC-44, AC-45

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
import {
  buildErasureSteps,
  initiateErasureFlow,
} from "../erasure"
import type { ErasureFlowDeps } from "../erasure"
import {
  buildClosureSteps,
  initiateAccountClosure,
} from "../closure"
import type { ClosureFlowDeps, ClosureContext } from "../closure"
import { executeOrchestratedFlow } from "../engine"
import { registerComplianceHoldRecheckHandler } from "@/lib/scheduler/handlers/compliance-hold-recheck"
import { ActionHandlerRegistry } from "@/lib/scheduler/registry"
import { invokeHandler } from "@/lib/scheduler/handlers/__tests__/invoke-handler"
import { checkComplianceHold } from "@/domains/operations/compliance/queries"

const db = getTestDb()
const flowDb = createFlowDb(db)
const schedulerDb = createSchedulerDb(db)
const ACCOUNT_ID = makeUUID("concflow01")
const OTHER_ACCOUNT = makeUUID("concflow02")

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

async function createBuyerData(accountId: string, listingId: string) {
  await db.insert(shortlists).values({
    accountId,
    name: "My shortlist",
  })
  await db.insert(savedSearches).values({
    accountId,
    name: "Camera ops",
    query: "camera",
  })
  await db.insert(searchHistory).values({
    accountId,
    query: "sound recordist",
    resultCount: 3,
  })
}

beforeEach(async () => {
  await resetDb()
  await seedTestUser(db, ACCOUNT_ID)
  await seedTestUser(db, OTHER_ACCOUNT)
})

afterAll(async () => {
  await closeTestDb()
})

// --- AC-40: Independent flow rows ---

describe("AC-40: independent orchestrated_flows rows", () => {
  it("erasure and closure create separate flow rows with different flowIds", async () => {
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

    // Different flow IDs
    expect(erasureResult.flowId).not.toBe(closureResult.flowId)

    // Both stored in DB with correct flow types
    const [erasureRow] = await db
      .select({
        id: orchestratedFlows.id,
        flowType: orchestratedFlows.flowType,
      })
      .from(orchestratedFlows)
      .where(eq(orchestratedFlows.id, erasureResult.flowId))

    const [closureRow] = await db
      .select({
        id: orchestratedFlows.id,
        flowType: orchestratedFlows.flowType,
      })
      .from(orchestratedFlows)
      .where(eq(orchestratedFlows.id, closureResult.flowId))

    expect(erasureRow.flowType).toBe("erasure")
    expect(closureRow.flowType).toBe("closure")

    // Same triggeredBy
    const allFlows = await db
      .select({
        triggeredBy: orchestratedFlows.triggeredBy,
      })
      .from(orchestratedFlows)
      .where(eq(orchestratedFlows.triggeredBy, ACCOUNT_ID))

    // At least 2 flows for the same account (may be more from deadline alerts creating entries)
    expect(allFlows.length).toBeGreaterThanOrEqual(2)
  })
})

// --- AC-41: Closure step 4 defers with compliance hold in concurrent scenario ---

describe("AC-41: closure defers buyer data when compliance hold exists", () => {
  it("sets buyerDataDeferred and schedules compliance_hold_recheck with flowId", async () => {
    // DSAR case creates a compliance hold (status: "open")
    const holdCaseId = await createComplianceHold(ACCOUNT_ID)

    // Create a closure flow record for step 4 to find
    const closureDeps = makeClosureDeps()
    const closureSteps = buildClosureSteps(closureDeps)

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
      currentStep: 3,
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

    // Simultaneously, an erasure flow exists (independent row)
    const dsarCaseId = await createDSARCase(ACCOUNT_ID)
    const erasureFlowId = await flowDb.insert({
      flowType: "erasure",
      triggeredBy: ACCOUNT_ID,
      status: "in_progress",
      steps: [],
      currentStep: 0,
      context: { accountId: ACCOUNT_ID, dsarCaseId } as Record<string, unknown>,
      startedAt: new Date(),
      completedAt: null,
      deadline: new Date(Date.now() + 30 * 86400000),
      escalatedAt: null,
      escalationReason: null,
    })

    // Execute closure step 4
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

    await closureSteps[3].execute(ctx)

    expect(ctx.buyerDataDeferred).toBe(true)
    expect(ctx.buyerDataDeleted).toBe(false)

    // Verify compliance_hold_recheck scheduled
    const scheduled = await db
      .select({
        action: deferredActions.action,
        params: deferredActions.params,
      })
      .from(deferredActions)
      .where(eq(deferredActions.action, "compliance_hold_recheck"))

    expect(scheduled).toHaveLength(1)
    const params = scheduled[0].params as { accountId: string; flowId: string }
    expect(params.accountId).toBe(ACCOUNT_ID)
    expect(params.flowId).toBe(closureFlowId)
  })
})

// --- AC-42: compliance_hold_recheck deletes buyer data when hold cleared ---

describe("AC-42: recheck deletes buyer data after hold cleared", () => {
  it("deletes shortlists, saved_searches, search_history when hold lifted", async () => {
    const listing = await createTestListing(db, OTHER_ACCOUNT)
    await createBuyerData(ACCOUNT_ID, listing.id)

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

    // No active compliance hold — hold has been cleared
    const registry = new ActionHandlerRegistry()
    registerComplianceHoldRecheckHandler(registry, { db, flowDb, schedulerDb })

    await invokeHandler(registry, "compliance_hold_recheck", {
      accountId: ACCOUNT_ID,
      flowId: closureFlowId,
    })

    // Buyer data deleted
    const sls = await db
      .select()
      .from(shortlists)
      .where(eq(shortlists.accountId, ACCOUNT_ID))
    expect(sls).toHaveLength(0)

    const searches = await db
      .select()
      .from(savedSearches)
      .where(eq(savedSearches.accountId, ACCOUNT_ID))
    expect(searches).toHaveLength(0)

    const history = await db
      .select()
      .from(searchHistory)
      .where(eq(searchHistory.accountId, ACCOUNT_ID))
    expect(history).toHaveLength(0)
  })
})

// --- AC-43: compliance_hold_recheck no-op when processErasure already deleted data ---

describe("AC-43: recheck no-op when erasure already deleted buyer data", () => {
  it("completes without error when buyer data was already deleted by processErasure", async () => {
    // Simulate: closure deferred, then processErasure ran and deleted all data
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

    // NO buyer data exists — processErasure (deleteAccountData) already deleted everything
    // Verify no shortlists, saved searches, search history
    const slsBefore = await db
      .select()
      .from(shortlists)
      .where(eq(shortlists.accountId, ACCOUNT_ID))
    expect(slsBefore).toHaveLength(0)

    // No active compliance hold — hold cleared by DSAR closure
    const registry = new ActionHandlerRegistry()
    registerComplianceHoldRecheckHandler(registry, { db, flowDb, schedulerDb })

    // Should complete without error — executeBuyerDataDeletion is idempotent
    await invokeHandler(registry, "compliance_hold_recheck", {
      accountId: ACCOUNT_ID,
      flowId: closureFlowId,
    })

    // Flow context still updated
    const flowRow = await flowDb.findById(closureFlowId)
    expect(flowRow!.context).toMatchObject({
      buyerDataDeleted: true,
      buyerDataDeferred: false,
    })
  })
})

// --- AC-44: compliance_hold_recheck reschedules when hold still active ---

describe("AC-44: recheck reschedules when compliance hold active", () => {
  it("schedules another recheck in 7 days while both flows exist", async () => {
    // Active DSAR case = compliance hold
    await createComplianceHold(ACCOUNT_ID)

    // Both flows exist concurrently
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

    const dsarCaseId = await createDSARCase(ACCOUNT_ID)
    await flowDb.insert({
      flowType: "erasure",
      triggeredBy: ACCOUNT_ID,
      status: "in_progress",
      steps: [],
      currentStep: 2,
      context: { accountId: ACCOUNT_ID, dsarCaseId } as Record<
        string,
        unknown
      >,
      startedAt: new Date(),
      completedAt: null,
      deadline: new Date(Date.now() + 30 * 86400000),
      escalatedAt: null,
      escalationReason: null,
    })

    const registry = new ActionHandlerRegistry()
    registerComplianceHoldRecheckHandler(registry, { db, flowDb, schedulerDb })

    await invokeHandler(registry, "compliance_hold_recheck", {
      accountId: ACCOUNT_ID,
      flowId: closureFlowId,
    })

    // Should have rescheduled
    const scheduled = await db
      .select({
        action: deferredActions.action,
        executeAt: deferredActions.executeAt,
      })
      .from(deferredActions)
      .where(eq(deferredActions.action, "compliance_hold_recheck"))

    expect(scheduled.length).toBeGreaterThanOrEqual(1)

    // Verify ~7 day schedule
    const nextCheck = scheduled[scheduled.length - 1]
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000
    const diff = new Date(nextCheck.executeAt).getTime() - Date.now()
    expect(diff).toBeGreaterThan(sevenDaysMs - 60000)
    expect(diff).toBeLessThan(sevenDaysMs + 60000)

    // Buyer data NOT deleted (hold still active)
    const flowRow = await flowDb.findById(closureFlowId)
    expect(
      (flowRow!.context as Record<string, unknown>).buyerDataDeferred,
    ).toBe(true)
  })
})

// --- AC-45: processErasure idempotent when listings already archived by closure ---

describe("AC-45: processErasure handles pre-archived listings", () => {
  it("succeeds when listings already archived by prior closure flow", async () => {
    // Create listings, then archive them (simulating closure step 1)
    const companyListing = await createTestListing(db, ACCOUNT_ID, {
      entityType: "company",
    })
    const freelancerListing = await createTestListing(db, ACCOUNT_ID, {
      entityType: "freelancer",
    })

    // Archive both (as closure step 1 would)
    await db
      .update(listings)
      .set({ lifecycleStatus: "archived" })
      .where(eq(listings.id, companyListing.id))
    await db
      .update(listings)
      .set({ lifecycleStatus: "archived" })
      .where(eq(listings.id, freelancerListing.id))

    // Create a DSAR case for the erasure flow
    const dsarCaseId = await createDSARCase(ACCOUNT_ID)

    // Run full erasure flow — processErasure must handle already-archived listings
    const erasureDeps = makeErasureDeps()
    const result = await initiateErasureFlow(
      erasureDeps,
      dsarCaseId,
      ACCOUNT_ID,
    )

    expect(result.status).toBe("completed")

    // Freelancer listing fully deleted (regardless of archive status)
    const freelancerRows = await db
      .select()
      .from(listings)
      .where(eq(listings.id, freelancerListing.id))
    expect(freelancerRows).toHaveLength(0)

    // Company listing anonymised (accountId = null, claimStatus = unclaimed)
    const [companyRow] = await db
      .select({
        accountId: listings.accountId,
        claimStatus: listings.claimStatus,
        contactEmail: listings.contactEmail,
      })
      .from(listings)
      .where(eq(listings.id, companyListing.id))
    expect(companyRow.accountId).toBeNull()
    expect(companyRow.claimStatus).toBe("unclaimed")
    expect(companyRow.contactEmail).toBeNull()
  })
})
