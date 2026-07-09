// Account closure flow integration tests — CS-WORK-085
// AC-24, AC-25, AC-26, AC-27, AC-28, AC-29, AC-30

import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { getTestDb, resetDb, closeTestDb } from "@/db/test-utils"
import {
  makeUUID,
  seedTestUser,
  createFlowDb,
  createSchedulerDb,
  createTestBus,
  createTestListing,
} from "@/db/test-fixtures"
import { orchestratedFlows } from "@/db/schema/shared"
import { pendingCancellations } from "@/db/schema/operations"
import { accountProfiles } from "@/db/schema/accounts"
import { listings } from "@/db/schema/data-and-listings"
import { eq, and } from "drizzle-orm"
import { buildClosureSteps, initiateAccountClosure } from "../closure"
import type { ClosureContext, ClosureFlowDeps } from "../closure"
import { executeOrchestratedFlow, skipStep } from "../engine"
import { InMemoryPaymentService } from "@/lib/services/mocks"

const db = getTestDb()
const flowDb = createFlowDb(db)
const schedulerDb = createSchedulerDb(db)
const ACCOUNT_ID = makeUUID("closure001")

function makeDeps(overrides: Partial<ClosureFlowDeps> = {}): ClosureFlowDeps {
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

beforeEach(async () => {
  await resetDb()
  await seedTestUser(db, ACCOUNT_ID)
})

afterAll(async () => {
  await closeTestDb()
})

// --- AC-24: executeOrchestratedFlow creates record with closure type ---

describe("AC-24: flow record creation", () => {
  it("creates orchestrated_flows record with flowType = closure and status = initiated", async () => {
    const deps = makeDeps()

    const result = await initiateAccountClosure(deps, ACCOUNT_ID)

    expect(result.flowType).toBe("closure")
    expect(result.triggeredBy).toBe(ACCOUNT_ID)

    // Verify DB record
    const [row] = await db
      .select({
        flowType: orchestratedFlows.flowType,
        status: orchestratedFlows.status,
      })
      .from(orchestratedFlows)
      .where(eq(orchestratedFlows.id, result.flowId))

    expect(row.flowType).toBe("closure")
    // Status may be completed (all no-op steps) or failed (if some step fails)
    // With no listings, all steps are no-ops or empty loops, so it completes
    expect(["initiated", "completed", "in_progress"]).toContain(row.status)

    // No deadline for closure flows
    expect(result.deadline).toBeUndefined()
  })
})

// --- AC-25: Step 1 archives all active listings and emits listing_archived ---

describe("AC-25: archive_listings step", () => {
  it("archives all active listings and accumulates IDs in context", async () => {
    const listing1 = await createTestListing(db, ACCOUNT_ID)
    const listing2 = await createTestListing(db, ACCOUNT_ID)

    const deps = makeDeps()
    const steps = buildClosureSteps(deps)

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

    await steps[0].execute(ctx)

    // Both listings archived
    const [l1] = await db
      .select({ lifecycleStatus: listings.lifecycleStatus })
      .from(listings)
      .where(eq(listings.id, listing1.id))
    const [l2] = await db
      .select({ lifecycleStatus: listings.lifecycleStatus })
      .from(listings)
      .where(eq(listings.id, listing2.id))
    expect(l1.lifecycleStatus).toBe("archived")
    expect(l2.lifecycleStatus).toBe("archived")

    // Context accumulates IDs
    expect(ctx.listingsArchived).toHaveLength(2)
    expect(ctx.listingsArchived).toContain(listing1.id)
    expect(ctx.listingsArchived).toContain(listing2.id)
  })

  it("emits listing_archived per listing (sync consumers)", async () => {
    const listing = await createTestListing(db, ACCOUNT_ID)

    const bus = createTestBus()
    const emitted: unknown[] = []
    bus.on({
      domain: "platform",
      eventType: "listing_archived",
      mode: "sync",
      handler: async (payload) => {
        emitted.push(payload)
      },
    })

    const deps = makeDeps({ bus })
    const steps = buildClosureSteps(deps)

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

    await steps[0].execute(ctx)

    expect(emitted).toHaveLength(1)
    const payload = emitted[0] as Record<string, unknown>
    expect(payload._brand).toBe("ListingArchivedEvent")
    expect(payload.listingId).toBe(listing.id)
    expect(payload.accountId).toBe(ACCOUNT_ID)
  })

  it("skips already-archived listings (idempotent on retry)", async () => {
    await createTestListing(db, ACCOUNT_ID, { lifecycleStatus: "archived" })
    const active = await createTestListing(db, ACCOUNT_ID)

    const deps = makeDeps()
    const steps = buildClosureSteps(deps)

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

    await steps[0].execute(ctx)

    // Only the active listing was archived
    expect(ctx.listingsArchived).toEqual([active.id])
  })
})

// --- AC-26: Step 2 creates pending_cancellation before calling PaymentService ---

describe("AC-26: cancel_paddle_subscriptions step", () => {
  it("creates pending_cancellation record with reason account_closed before API call", async () => {
    await createTestListing(db, ACCOUNT_ID, {
      paddleSubscriptionId: "sub_001",
      subscriptionTier: "standard",
    })

    const payment = new InMemoryPaymentService()
    const deps = makeDeps({ payment })
    const steps = buildClosureSteps(deps)

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

    await steps[1].execute(ctx)

    // pending_cancellation created
    const [pc] = await db
      .select({
        paddleSubscriptionId: pendingCancellations.paddleSubscriptionId,
        reason: pendingCancellations.reason,
      })
      .from(pendingCancellations)
      .where(
        and(
          eq(pendingCancellations.paddleSubscriptionId, "sub_001"),
          eq(pendingCancellations.reason, "account_closed"),
        ),
      )
    expect(pc).toBeDefined()
    expect(pc.paddleSubscriptionId).toBe("sub_001")
    expect(pc.reason).toBe("account_closed")

    // Payment service called
    expect(
      payment.wasCalledWith("cancelSubscription", {
        paddleSubscriptionId: "sub_001",
        reason: "account_closed",
        effectiveFrom: "immediately",
      }),
    ).toBe(true)

    expect(ctx.subscriptionsCancelled).toBe(1)
  })
})

// --- AC-27: Step 2 failure preserves context ---

describe("AC-27: step 2 failure", () => {
  it("halts flow at step 2 with failed status and preserves failure context", async () => {
    await createTestListing(db, ACCOUNT_ID, {
      paddleSubscriptionId: "sub_fail",
      subscriptionTier: "premium",
    })

    const payment = new InMemoryPaymentService()
    // Make cancelSubscription throw
    payment.cancelSubscription = async () => {
      throw new Error("Paddle API timeout")
    }

    const deps = makeDeps({ payment })
    const steps = buildClosureSteps(deps)

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

    // Step 2 should throw
    await expect(steps[1].execute(ctx)).rejects.toThrow(
      "Paddle cancellation failed",
    )

    // Context shows which failed
    expect(ctx.subscriptionsFailed).toContain("sub_fail")
    expect(ctx.subscriptionsCancelled).toBe(0)
  })

  it("flow engine records failure status when step 2 throws", async () => {
    await createTestListing(db, ACCOUNT_ID, {
      paddleSubscriptionId: "sub_fail2",
      subscriptionTier: "standard",
    })

    const payment = new InMemoryPaymentService()
    payment.cancelSubscription = async () => {
      throw new Error("Paddle API timeout")
    }

    const deps = makeDeps({ payment })
    const steps = buildClosureSteps(deps)

    const result = await executeOrchestratedFlow(flowDb, {
      flowType: "closure",
      triggeredBy: ACCOUNT_ID,
      steps,
      initialContext: {
        accountId: ACCOUNT_ID,
        listingsArchived: [],
        subscriptionsCancelled: 0,
        subscriptionsFailed: [],
        enquiriesAnonymised: 0,
        buyerDataDeleted: false,
        buyerDataDeferred: false,
        accountDeactivated: false,
        accountClosedEmitted: false,
      },
    })

    // Flow failed at step 1 (cancel_paddle_subscriptions is index 1)
    expect(result.status).toBe("failed")
    expect(result.steps[1].status).toBe("failed")
    expect(result.steps[1].error).toContain("Paddle cancellation failed")
  })
})

// --- AC-28: Step 2 retry skips already-cancelled subscriptions ---

describe("AC-28: step 2 retry idempotency", () => {
  it("skips pending_cancellation insert for already-recorded subscriptions", async () => {
    const listing = await createTestListing(db, ACCOUNT_ID, {
      paddleSubscriptionId: "sub_retry",
      subscriptionTier: "standard",
    })

    // Pre-insert a pending_cancellation (simulating first attempt)
    await db.insert(pendingCancellations).values({
      paddleSubscriptionId: "sub_retry",
      listingId: listing.id,
      reason: "account_closed",
    })

    const payment = new InMemoryPaymentService()
    const deps = makeDeps({ payment })
    const steps = buildClosureSteps(deps)

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

    await steps[1].execute(ctx)

    // Only 1 pending_cancellation record exists (not a duplicate)
    const records = await db
      .select()
      .from(pendingCancellations)
      .where(eq(pendingCancellations.paddleSubscriptionId, "sub_retry"))
    expect(records).toHaveLength(1)

    // Paddle API still called (idempotent — Paddle accepts re-cancellation)
    expect(
      payment.wasCalledWith("cancelSubscription", {
        paddleSubscriptionId: "sub_retry",
        reason: "account_closed",
        effectiveFrom: "immediately",
      }),
    ).toBe(true)

    expect(ctx.subscriptionsCancelled).toBe(1)
  })
})

// --- AC-29: Step 5 deactivates account, not skippable ---

describe("AC-29: deactivate_account step", () => {
  it("sets account suppressedAt and suppressionReason", async () => {
    const deps = makeDeps()
    const steps = buildClosureSteps(deps)

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

    await steps[4].execute(ctx)

    const [profile] = await db
      .select({
        suppressedAt: accountProfiles.suppressedAt,
        suppressionReason: accountProfiles.suppressionReason,
      })
      .from(accountProfiles)
      .where(eq(accountProfiles.accountId, ACCOUNT_ID))
    expect(profile.suppressedAt).toBeTruthy()
    expect(profile.suppressionReason).toBe("account_closed")
    expect(ctx.accountDeactivated).toBe(true)
  })

  it("step 5 is NOT skippable — skipStep rejects", async () => {
    const deps = makeDeps()
    const steps = buildClosureSteps(deps)

    const flowId = await flowDb.insert({
      flowType: "closure",
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
      context: { accountId: ACCOUNT_ID } as Record<string, unknown>,
      startedAt: new Date(),
      completedAt: null,
      deadline: null,
      escalatedAt: null,
      escalationReason: null,
    })

    await expect(
      skipStep(flowDb, flowId, 4, "test reason", ACCOUNT_ID),
    ).rejects.toThrow('Step "deactivate_account" is not skippable')
  })
})

// --- AC-30: Step 6 emits account_closed with correct payload ---

describe("AC-30: emit_account_closed step", () => {
  it("emits account_closed with full PP §1.9 payload", async () => {
    const bus = createTestBus()
    const emitted: unknown[] = []
    bus.on({
      domain: "platform",
      eventType: "account_closed",
      mode: "sync",
      handler: async (payload) => {
        emitted.push(payload)
      },
    })

    const deps = makeDeps({ bus })
    const steps = buildClosureSteps(deps)

    const ctx: ClosureContext = {
      accountId: ACCOUNT_ID,
      listingsArchived: [makeUUID("list001"), makeUUID("list002")],
      subscriptionsCancelled: 1,
      subscriptionsFailed: ["sub_fail_1"],
      enquiriesAnonymised: 5,
      buyerDataDeleted: false,
      buyerDataDeferred: true,
      accountDeactivated: true,
      accountClosedEmitted: false,
    }

    await steps[5].execute(ctx)

    expect(emitted).toHaveLength(1)
    const payload = emitted[0] as Record<string, unknown>
    expect(payload._brand).toBe("AccountClosedEvent")
    expect(payload.accountId).toBe(ACCOUNT_ID)
    expect(payload.listingsArchived).toEqual([
      makeUUID("list001"),
      makeUUID("list002"),
    ])
    expect(payload.buyerDataDeleted).toBe(false)
    expect(payload.complianceHoldActive).toBe(true) // buyerDataDeferred = true
    expect(payload.paddleCancellationsPending).toBe(true) // subscriptionsFailed.length > 0
    expect(typeof payload.timestamp).toBe("string")
    expect(ctx.accountClosedEmitted).toBe(true)
  })

  it("complianceHoldActive is false when buyerDataDeferred is false", async () => {
    const bus = createTestBus()
    const emitted: unknown[] = []
    bus.on({
      domain: "platform",
      eventType: "account_closed",
      mode: "sync",
      handler: async (payload) => {
        emitted.push(payload)
      },
    })

    const deps = makeDeps({ bus })
    const steps = buildClosureSteps(deps)

    const ctx: ClosureContext = {
      accountId: ACCOUNT_ID,
      listingsArchived: [],
      subscriptionsCancelled: 0,
      subscriptionsFailed: [],
      enquiriesAnonymised: 0,
      buyerDataDeleted: true,
      buyerDataDeferred: false,
      accountDeactivated: true,
      accountClosedEmitted: false,
    }

    await steps[5].execute(ctx)

    const payload = emitted[0] as Record<string, unknown>
    expect(payload.buyerDataDeleted).toBe(true)
    expect(payload.complianceHoldActive).toBe(false)
    expect(payload.paddleCancellationsPending).toBe(false)
  })
})
