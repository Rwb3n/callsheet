// checkout_precondition_retry handler — S4 §8.3
// Tests: precondition met → completes, max attempts → refunds, neither → reschedules

import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest"
import { getTestDb, resetDb, closeTestDb } from "@/db/test-utils"
import {
  createSchedulerDb,
  createDecisionLogDb,
  makeUUID,
  seedTestUser,
  createTestListing,
} from "@/db/test-fixtures"
import { deferredActions, decisionLogs } from "@/db/schema/shared"
import { ActionHandlerRegistry } from "@/lib/scheduler"
import {
  registerCheckoutPreconditionRetryHandler,
  type CheckoutRetryDeps,
} from "../checkout-precondition-retry"

type Exec = (params: Record<string, unknown>) => Promise<void>

const db = getTestDb()
const ACCOUNT_ID = makeUUID("cr01")
const LISTING_ID_CLAIMED = makeUUID("cr02")
const LISTING_ID_UNCLAIMED = makeUUID("cr03")

beforeAll(() => {})
beforeEach(async () => { await resetDb() })
afterAll(async () => { await closeTestDb() })

function makeDeps(overrides: Partial<CheckoutRetryDeps> = {}): CheckoutRetryDeps {
  return {
    db,
    schedulerDb: createSchedulerDb(db),
    decisionLogDb: createDecisionLogDb(db),
    onCheckoutCompleted: vi.fn(),
    refundTransaction: vi.fn(),
    ...overrides,
  }
}

function makePaddleEvent(listingId: string) {
  return {
    listingId,
    paddleSubscriptionId: "sub_123",
    type: "subscription.created",
  }
}

async function seedClaimedListing() {
  await seedTestUser(db, ACCOUNT_ID)
  await createTestListing(db, ACCOUNT_ID, {
    id: LISTING_ID_CLAIMED,
    claimStatus: "claimed",
  })
}

async function seedUnclaimedListing() {
  await createTestListing(db, null, {
    id: LISTING_ID_UNCLAIMED,
    claimStatus: "unclaimed",
    source: "4rfv_import",
  })
}

describe("checkout_precondition_retry handler", () => {
  it("completes checkout when listing is claimed", async () => {
    await seedClaimedListing()
    const onCheckoutCompleted = vi.fn()
    const deps = makeDeps({ onCheckoutCompleted })
    const registry = new ActionHandlerRegistry()
    registerCheckoutPreconditionRetryHandler(registry, deps)

    await (registry.get("checkout_precondition_retry") as unknown as Exec)({
      paddleEvent: makePaddleEvent(LISTING_ID_CLAIMED),
      attemptCount: 1,
      maxAttempts: 12,
    })

    expect(onCheckoutCompleted).toHaveBeenCalledOnce()
  })

  it("refunds after max attempts on unclaimed listing", async () => {
    await seedUnclaimedListing()
    const refundTransaction = vi.fn()
    const deps = makeDeps({ refundTransaction })
    const registry = new ActionHandlerRegistry()
    registerCheckoutPreconditionRetryHandler(registry, deps)

    await (registry.get("checkout_precondition_retry") as unknown as Exec)({
      paddleEvent: makePaddleEvent(LISTING_ID_UNCLAIMED),
      attemptCount: 12,
      maxAttempts: 12,
    })

    expect(refundTransaction).toHaveBeenCalledWith("sub_123")

    const decisions = await db.select().from(decisionLogs)
    const failure = decisions.find(
      (d) => d.decisionType === "checkout_precondition_failure",
    )
    expect(failure).toBeTruthy()
  })

  it("reschedules when listing is unclaimed and attempts remain", async () => {
    await seedUnclaimedListing()
    const deps = makeDeps()
    const registry = new ActionHandlerRegistry()
    registerCheckoutPreconditionRetryHandler(registry, deps)

    await (registry.get("checkout_precondition_retry") as unknown as Exec)({
      paddleEvent: makePaddleEvent(LISTING_ID_UNCLAIMED),
      attemptCount: 3,
      maxAttempts: 12,
    })

    const actions = await db.select().from(deferredActions)
    const retry = actions.find(
      (a) => a.action === "checkout_precondition_retry",
    )
    expect(retry).toBeTruthy()
    expect((retry!.params as Record<string, unknown>).attemptCount).toBe(4)
  })
})
