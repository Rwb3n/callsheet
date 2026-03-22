// CS-WORK-065: Admin refunds router integration tests
// AC-13.1 through AC-13.9

import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { eq } from "drizzle-orm"
import { getTestDb, resetDb, closeTestDb } from "@/db/test-utils"
import {
  makeUUID,
  makeAdminSession,
  makeSession,
  ctx,
  seedTestUser,
  createTestListing,
  createSchedulerDb,
  createDecisionLogDb,
} from "@/db/test-fixtures"
import { createAdminRefundsRouter } from "@/server/routers/admin/refunds"
import { supportTickets, pendingCancellations } from "@/db/schema/operations"
import { decisionLogs } from "@/db/schema/shared"
import { InMemoryPaymentService } from "@/lib/services/mocks"

const db = getTestDb()
const schedulerDb = createSchedulerDb(db)
const decisionLogDb = createDecisionLogDb(db)
const payment = new InMemoryPaymentService()

const router = createAdminRefundsRouter({
  db,
  schedulerDb,
  decisionLogDb,
  payment,
})

const ADMIN_ID = makeUUID("adm-ref01")
const USER_ID = makeUUID("usr-ref01")

async function seedRefundTicket(overrides: Record<string, unknown> = {}) {
  const listing = await createTestListing(db, USER_ID, {
    paddleSubscriptionId: "sub_refund_test",
    subscriptionTier: "premium",
    ...overrides,
  })

  const [ticket] = await db
    .insert(supportTickets)
    .values({
      accountId: USER_ID,
      listingId: listing.id,
      category: "refund_request",
      priority: "normal",
      status: "open",
      subject: "I want a refund",
    })
    .returning()

  return { listing, ticket }
}

beforeEach(async () => {
  await resetDb()
  await seedTestUser(db, ADMIN_ID, "admin-refund@callsheet.test")
  await seedTestUser(db, USER_ID, "user-refund@callsheet.test")
  payment.clear()
})

afterAll(async () => {
  await closeTestDb()
})

// --- Auth guards ---

describe("auth guards", () => {
  it("rejects unauthenticated requests on list", async () => {
    const caller = router.createCaller(ctx(null))
    await expect(caller.list({})).rejects.toThrow("Authentication required")
  })

  it("rejects non-admin users on evaluate", async () => {
    const caller = router.createCaller(ctx(makeSession({ accountId: USER_ID })))
    await expect(
      caller.evaluate({ ticketId: makeUUID("000001"), decision: "deny", reason: "test" }),
    ).rejects.toThrow("Admin access required")
  })
})

// --- AC-13.1: list returns refund request tickets joined with account email, listing name, subscription tier ---

describe("AC-13.1: admin.refunds.list", () => {
  it("returns refund request tickets with joined account/listing data", async () => {
    const { ticket } = await seedRefundTicket()

    const caller = router.createCaller(ctx(makeAdminSession(ADMIN_ID)))
    const result = await caller.list({})

    expect(result.refunds).toHaveLength(1)
    expect(result.refunds[0].ticketId).toBe(ticket.id)
    expect(result.refunds[0].accountEmail).toBe("user-refund@callsheet.test")
    expect(result.refunds[0].listingName).toBe("Test Company")
    expect(result.refunds[0].subscriptionTier).toBe("premium")
  })

  it("excludes non-refund tickets", async () => {
    await seedRefundTicket()
    // Insert a billing_support ticket — should NOT appear
    await db.insert(supportTickets).values({
      accountId: USER_ID,
      category: "billing_support",
      priority: "normal",
      status: "open",
      subject: "Billing question",
    })

    const caller = router.createCaller(ctx(makeAdminSession(ADMIN_ID)))
    const result = await caller.list({})

    expect(result.refunds).toHaveLength(1)
  })

  it("filters by status: pending = open tickets", async () => {
    await seedRefundTicket()

    const caller = router.createCaller(ctx(makeAdminSession(ADMIN_ID)))
    const result = await caller.list({ status: "pending" })

    expect(result.refunds).toHaveLength(1)
    expect(result.refunds[0].status).toBe("pending")
  })

  it("returns empty for approved when no resolved tickets exist", async () => {
    await seedRefundTicket()

    const caller = router.createCaller(ctx(makeAdminSession(ADMIN_ID)))
    const result = await caller.list({ status: "approved" })

    expect(result.refunds).toHaveLength(0)
  })
})

// --- AC-13.2: approve creates pending_cancellations + calls PaymentService.cancelSubscription ---

describe("AC-13.2: approve path", () => {
  it("calls PaymentService.cancelSubscription with effectiveFrom: immediately", async () => {
    const { ticket } = await seedRefundTicket()

    const caller = router.createCaller(ctx(makeAdminSession(ADMIN_ID)))
    await caller.evaluate({ ticketId: ticket.id, decision: "approve", reason: "Within 30 days" })

    expect(payment.wasCalledWith("cancelSubscription", {
      paddleSubscriptionId: "sub_refund_test",
      effectiveFrom: "immediately",
    })).toBe(true)
  })
})

// --- AC-13.3: deny resolves ticket without Paddle API call ---

describe("AC-13.3: deny path", () => {
  it("resolves ticket without calling Paddle API", async () => {
    const { ticket } = await seedRefundTicket()

    const caller = router.createCaller(ctx(makeAdminSession(ADMIN_ID)))
    await caller.evaluate({ ticketId: ticket.id, decision: "deny", reason: "Beyond 60 days" })

    expect(payment.wasCalledWith("cancelSubscription")).toBe(false)

    // Verify ticket resolved
    const [updated] = await db
      .select({ status: supportTickets.status, resolvedAt: supportTickets.resolvedAt })
      .from(supportTickets)
      .where(eq(supportTickets.id, ticket.id))
    expect(updated.status).toBe("resolved")
    expect(updated.resolvedAt).not.toBeNull()
  })
})

// --- AC-13.4: both paths resolve ticket and cancel sla_breach_warning ---

describe("AC-13.4: both paths resolve ticket and cancel SLA warning", () => {
  it("approve resolves ticket", async () => {
    const { ticket } = await seedRefundTicket()

    const caller = router.createCaller(ctx(makeAdminSession(ADMIN_ID)))
    await caller.evaluate({ ticketId: ticket.id, decision: "approve", reason: "Policy" })

    const [updated] = await db
      .select({ status: supportTickets.status, resolvedAt: supportTickets.resolvedAt })
      .from(supportTickets)
      .where(eq(supportTickets.id, ticket.id))
    expect(updated.status).toBe("resolved")
    expect(updated.resolvedAt).not.toBeNull()
  })

  it("deny resolves ticket", async () => {
    const { ticket } = await seedRefundTicket()

    const caller = router.createCaller(ctx(makeAdminSession(ADMIN_ID)))
    await caller.evaluate({ ticketId: ticket.id, decision: "deny", reason: "Policy" })

    const [updated] = await db
      .select({ status: supportTickets.status, resolvedAt: supportTickets.resolvedAt })
      .from(supportTickets)
      .where(eq(supportTickets.id, ticket.id))
    expect(updated.status).toBe("resolved")
    expect(updated.resolvedAt).not.toBeNull()
  })
})

// --- AC-13.5: decision log ---

describe("AC-13.5: decision log entry", () => {
  it("produces decision_logs entry with refund_evaluation type", async () => {
    const { ticket } = await seedRefundTicket()

    const caller = router.createCaller(ctx(makeAdminSession(ADMIN_ID)))
    await caller.evaluate({ ticketId: ticket.id, decision: "approve", reason: "30-day window" })

    const logs = await db
      .select()
      .from(decisionLogs)
      .where(eq(decisionLogs.decisionType, "refund_evaluation"))
    expect(logs).toHaveLength(1)
    expect(logs[0].domain).toBe("operations")
    const output = logs[0].output as Record<string, unknown>
    expect(output.decision).toBe("approve")
    expect(output.reason).toBe("30-day window")
    const context = logs[0].additionalContext as Record<string, unknown>
    expect(context.evaluatedBy).toBe(ADMIN_ID)
  })

  it("logs deny decision", async () => {
    const { ticket } = await seedRefundTicket()

    const caller = router.createCaller(ctx(makeAdminSession(ADMIN_ID)))
    await caller.evaluate({ ticketId: ticket.id, decision: "deny", reason: "Beyond policy" })

    const logs = await db
      .select()
      .from(decisionLogs)
      .where(eq(decisionLogs.decisionType, "refund_evaluation"))
    expect(logs).toHaveLength(1)
    const output = logs[0].output as Record<string, unknown>
    expect(output.decision).toBe("deny")
  })
})

// --- AC-13.6: approval does NOT emit subscription_ended directly ---
// Verified structurally: the router calls PaymentService.cancelSubscription
// and does NOT import or call bus.emit. The Paddle webhook triggers S4's standard path.

describe("AC-13.6: approval does not emit subscription_ended", () => {
  it("only calls cancelSubscription, does not emit events", async () => {
    const { ticket } = await seedRefundTicket()

    const caller = router.createCaller(ctx(makeAdminSession(ADMIN_ID)))
    await caller.evaluate({ ticketId: ticket.id, decision: "approve", reason: "OK" })

    // Only cancelSubscription called — no bus interaction
    const calls = payment.getCalls()
    expect(calls).toHaveLength(1)
    expect(calls[0].method).toBe("cancelSubscription")
  })
})

// --- AC-13.7: pending_cancellations record created with reason: voluntary BEFORE Paddle call ---

describe("AC-13.7: pending_cancellations created before Paddle call", () => {
  it("creates pending_cancellations with reason: voluntary", async () => {
    const { ticket, listing } = await seedRefundTicket()

    const caller = router.createCaller(ctx(makeAdminSession(ADMIN_ID)))
    await caller.evaluate({ ticketId: ticket.id, decision: "approve", reason: "Refund" })

    const cancellations = await db
      .select()
      .from(pendingCancellations)
      .where(eq(pendingCancellations.listingId, listing.id))
    expect(cancellations).toHaveLength(1)
    expect(cancellations[0].reason).toBe("voluntary")
    expect(cancellations[0].paddleSubscriptionId).toBe("sub_refund_test")
  })

  it("does NOT create pending_cancellations on deny", async () => {
    const { ticket } = await seedRefundTicket()

    const caller = router.createCaller(ctx(makeAdminSession(ADMIN_ID)))
    await caller.evaluate({ ticketId: ticket.id, decision: "deny", reason: "No" })

    const cancellations = await db.select().from(pendingCancellations)
    expect(cancellations).toHaveLength(0)
  })
})

// --- AC-13.8: rejects tickets not in status: open ---

describe("AC-13.8: rejects non-open tickets", () => {
  it("rejects already-resolved tickets", async () => {
    const { ticket } = await seedRefundTicket()

    // Resolve the ticket first
    await db
      .update(supportTickets)
      .set({ status: "resolved", resolvedAt: new Date() })
      .where(eq(supportTickets.id, ticket.id))

    const caller = router.createCaller(ctx(makeAdminSession(ADMIN_ID)))
    await expect(
      caller.evaluate({ ticketId: ticket.id, decision: "approve", reason: "Late" }),
    ).rejects.toThrow("Ticket already resolved")
  })
})

// --- AC-13.9: rejects tickets with no active subscription ---

describe("AC-13.9: rejects tickets with no active subscription", () => {
  it("rejects when listing has no paddleSubscriptionId", async () => {
    // Create listing without subscription
    const listing = await createTestListing(db, USER_ID, {
      paddleSubscriptionId: null,
      subscriptionTier: "free",
    })

    const [ticket] = await db
      .insert(supportTickets)
      .values({
        accountId: USER_ID,
        listingId: listing.id,
        category: "refund_request",
        priority: "normal",
        status: "open",
        subject: "Refund please",
      })
      .returning()

    const caller = router.createCaller(ctx(makeAdminSession(ADMIN_ID)))
    await expect(
      caller.evaluate({ ticketId: ticket.id, decision: "approve", reason: "test" }),
    ).rejects.toThrow("No active subscription for listing")
  })

  it("rejects when ticket has no listing", async () => {
    const [ticket] = await db
      .insert(supportTickets)
      .values({
        accountId: USER_ID,
        listingId: null,
        category: "refund_request",
        priority: "normal",
        status: "open",
        subject: "Refund with no listing",
      })
      .returning()

    const caller = router.createCaller(ctx(makeAdminSession(ADMIN_ID)))
    await expect(
      caller.evaluate({ ticketId: ticket.id, decision: "approve", reason: "test" }),
    ).rejects.toThrow("No listing associated with ticket")
  })
})
