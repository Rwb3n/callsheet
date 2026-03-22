// Admin support integration tests — CS-WORK-058 AC-2.3, AC-2.5–AC-2.7, AC-2.9–AC-2.15
import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { eq, and } from "drizzle-orm"
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
import { createAdminSupportRouter } from "@/server/routers/admin/support"
import { supportTickets, churnRiskRegistry } from "@/db/schema/operations"
import { deferredActions, decisionLogs } from "@/db/schema/shared"
import { hasActiveTicket } from "@/domains/operations/support/queries"
import { registerTemplate, hasTemplate, clearTemplates } from "@/lib/email/templates"
import type { EmailService, EmailSendParams, EmailSendResult } from "@/lib/email/types"

// --- Test infrastructure ---

const db = getTestDb()
const schedulerDb = createSchedulerDb(db)
const decisionLogDb = createDecisionLogDb(db)

class InMemoryEmailService implements EmailService {
  sent: EmailSendParams[] = []
  async send(params: EmailSendParams): Promise<EmailSendResult> {
    this.sent.push(params)
    return { messageId: "test-msg-id", status: "sent", threadId: "test-thread" }
  }
}

let emailService: InMemoryEmailService

const ADMIN_ID = makeUUID("admin001")
const USER_ID = makeUUID("user001")

function makeRouter() {
  return createAdminSupportRouter({ db, schedulerDb, decisionLogDb, emailService })
}

beforeEach(async () => {
  await resetDb()
  emailService = new InMemoryEmailService()
  clearTemplates()
  registerTemplate("support_acknowledgment", (data) => ({
    subject: `Support ticket: ${data.subject}`,
    html: `<p>Ticket ${data.ticketId}</p>`,
  }))
  await seedTestUser(db, ADMIN_ID, "admin@callsheet.test")
  await seedTestUser(db, USER_ID, "user@callsheet.test")
})

afterAll(async () => {
  await closeTestDb()
})

// --- AC-2.3: churn risk elevation in create ---

describe("churn risk elevation (AC-2.3)", () => {
  it("elevates priority for high_risk account", async () => {
    const listing = await createTestListing(db, USER_ID)

    // Seed churn risk entry
    await db.insert(churnRiskRegistry).values({
      listingId: listing.id,
      accountId: USER_ID,
      riskLevel: "high_risk",
      detectedAt: new Date(),
      expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
    })

    const router = makeRouter()
    const caller = router.createCaller(ctx(makeAdminSession(ADMIN_ID)))

    // billing_support base = normal, high_risk elevates to high
    const { ticketId } = await caller.create({
      accountId: USER_ID,
      listingId: listing.id,
      category: "billing_support",
      priority: "normal",
      subject: "Billing query from churning user",
    })

    // Verify the decision log records the elevation
    const logs = await db
      .select()
      .from(decisionLogs)
      .where(eq(decisionLogs.domain, "operations"))
    expect(logs.length).toBe(1)
    const output = logs[0].output as Record<string, unknown>
    expect(output.priorityElevated).toBe(true)
  })

  it("does not elevate for at_risk account (badge only)", async () => {
    const listing = await createTestListing(db, USER_ID)

    await db.insert(churnRiskRegistry).values({
      listingId: listing.id,
      accountId: USER_ID,
      riskLevel: "at_risk",
      detectedAt: new Date(),
      expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
    })

    const router = makeRouter()
    const caller = router.createCaller(ctx(makeAdminSession(ADMIN_ID)))

    await caller.create({
      accountId: USER_ID,
      listingId: listing.id,
      category: "billing_support",
      priority: "normal",
      subject: "Billing query from at-risk user",
    })

    const logs = await db
      .select()
      .from(decisionLogs)
      .where(eq(decisionLogs.domain, "operations"))
    const output = logs[0].output as Record<string, unknown>
    expect(output.priorityElevated).toBe(false)
  })

  it("ignores expired churn risk entries", async () => {
    const listing = await createTestListing(db, USER_ID)

    // Expired entry
    await db.insert(churnRiskRegistry).values({
      listingId: listing.id,
      accountId: USER_ID,
      riskLevel: "high_risk",
      detectedAt: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000),
      expiresAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
    })

    const router = makeRouter()
    const caller = router.createCaller(ctx(makeAdminSession(ADMIN_ID)))

    await caller.create({
      accountId: USER_ID,
      category: "billing_support",
      priority: "normal",
      subject: "Should not elevate",
    })

    const logs = await db.select().from(decisionLogs).where(eq(decisionLogs.domain, "operations"))
    const inputs = logs[0].inputs as Record<string, unknown>
    expect(inputs.churnRiskLevel).toBeNull()
  })
})

// --- AC-2.5: sla_breach_warning scheduled at 80% of SLA ---

describe("SLA breach warning scheduling (AC-2.5)", () => {
  it("schedules sla_breach_warning on ticket creation", async () => {
    const router = makeRouter()
    const caller = router.createCaller(ctx(makeAdminSession(ADMIN_ID)))

    const { ticketId } = await caller.create({
      category: "billing_support",
      priority: "normal",
      subject: "Test SLA",
    })

    const [action] = await db
      .select()
      .from(deferredActions)
      .where(eq(deferredActions.action, "sla_breach_warning"))

    expect(action).toBeDefined()
    expect(action.status).toBe("pending")
    const params = action.params as Record<string, unknown>
    expect(params.ticketId).toBe(ticketId)
  })
})

// --- AC-2.6: sla_breach_warning cancelled on resolve/close ---

describe("SLA breach warning cancellation (AC-2.6)", () => {
  it("cancels sla_breach_warning when ticket resolved", async () => {
    const router = makeRouter()
    const caller = router.createCaller(ctx(makeAdminSession(ADMIN_ID)))

    const { ticketId } = await caller.create({
      category: "billing_support",
      priority: "normal",
      subject: "Test resolve",
    })

    await caller.updateStatus({ ticketId, status: "resolved" })

    const [action] = await db
      .select()
      .from(deferredActions)
      .where(eq(deferredActions.action, "sla_breach_warning"))

    expect(action.status).toBe("cancelled")
  })

  it("cancels sla_breach_warning when ticket closed", async () => {
    const router = makeRouter()
    const caller = router.createCaller(ctx(makeAdminSession(ADMIN_ID)))

    const { ticketId } = await caller.create({
      category: "other",
      priority: "normal",
      subject: "Test close",
    })

    await caller.updateStatus({ ticketId, status: "closed" })

    const [action] = await db
      .select()
      .from(deferredActions)
      .where(eq(deferredActions.action, "sla_breach_warning"))

    expect(action.status).toBe("cancelled")
  })
})

// --- AC-2.7: support_acknowledgment email ---

describe("support acknowledgment email (AC-2.7)", () => {
  it("sends email when accountId has email", async () => {
    const router = makeRouter()
    const caller = router.createCaller(ctx(makeAdminSession(ADMIN_ID)))

    await caller.create({
      accountId: USER_ID,
      category: "billing_support",
      priority: "normal",
      subject: "Need help with billing",
    })

    expect(emailService.sent.length).toBe(1)
    expect(emailService.sent[0].to).toBe("user@callsheet.test")
    expect(emailService.sent[0].template).toBe("support_acknowledgment")
  })

  it("does not send email when no accountId", async () => {
    const router = makeRouter()
    const caller = router.createCaller(ctx(makeAdminSession(ADMIN_ID)))

    await caller.create({
      category: "other",
      priority: "normal",
      subject: "Anonymous ticket",
    })

    expect(emailService.sent.length).toBe(0)
  })
})

// --- AC-2.9, AC-2.10: hasActiveTicket query interface ---

describe("hasActiveTicket (AC-2.9, AC-2.10)", () => {
  it("returns active ticket record for open ticket", async () => {
    const listing = await createTestListing(db, USER_ID)

    await db.insert(supportTickets).values({
      accountId: USER_ID,
      listingId: listing.id,
      category: "billing_support",
      priority: "normal",
      status: "open",
      subject: "Active ticket",
    })

    const result = await hasActiveTicket(db, listing.id)
    expect(result).not.toBeNull()
    expect(result!.category).toBe("billing_support")
  })

  it("returns active ticket for assigned status", async () => {
    const listing = await createTestListing(db, USER_ID)

    await db.insert(supportTickets).values({
      accountId: USER_ID,
      listingId: listing.id,
      category: "claim_dispute",
      priority: "high",
      status: "assigned",
      subject: "Assigned ticket",
    })

    const result = await hasActiveTicket(db, listing.id)
    expect(result).not.toBeNull()
    expect(result!.category).toBe("claim_dispute")
  })

  it("returns null when no active tickets exist (AC-2.10)", async () => {
    const listing = await createTestListing(db, USER_ID)

    // Only resolved ticket
    await db.insert(supportTickets).values({
      accountId: USER_ID,
      listingId: listing.id,
      category: "other",
      priority: "normal",
      status: "resolved",
      subject: "Resolved ticket",
    })

    const result = await hasActiveTicket(db, listing.id)
    expect(result).toBeNull()
  })

  it("returns null when no tickets for listing", async () => {
    const listing = await createTestListing(db, USER_ID)
    const result = await hasActiveTicket(db, listing.id)
    expect(result).toBeNull()
  })

  it("returns most recent active ticket when multiple exist", async () => {
    const listing = await createTestListing(db, USER_ID)

    await db.insert(supportTickets).values({
      accountId: USER_ID,
      listingId: listing.id,
      category: "billing_support",
      priority: "normal",
      status: "open",
      subject: "Older ticket",
      createdAt: new Date("2026-01-01T00:00:00Z"),
    })

    await db.insert(supportTickets).values({
      accountId: USER_ID,
      listingId: listing.id,
      category: "claim_dispute",
      priority: "high",
      status: "open",
      subject: "Newer ticket",
      createdAt: new Date("2026-02-01T00:00:00Z"),
    })

    const result = await hasActiveTicket(db, listing.id)
    expect(result).not.toBeNull()
    expect(result!.category).toBe("claim_dispute") // more recent
  })

  it("completes in <50ms (AC-2.9 performance)", async () => {
    const listing = await createTestListing(db, USER_ID)
    const start = Date.now()
    await hasActiveTicket(db, listing.id)
    expect(Date.now() - start).toBeLessThan(50)
  })
})

// --- AC-2.11: decision logs ---

describe("decision logging (AC-2.11)", () => {
  it("logs decision on ticket creation", async () => {
    const router = makeRouter()
    const caller = router.createCaller(ctx(makeAdminSession(ADMIN_ID)))

    await caller.create({
      category: "data_request",
      priority: "high",
      subject: "DSAR request",
    })

    const logs = await db.select().from(decisionLogs).where(eq(decisionLogs.domain, "operations"))
    expect(logs.length).toBe(1)
    expect(logs[0].decisionType).toBe("support_triage")
  })

  it("logs decision on status change", async () => {
    const router = makeRouter()
    const caller = router.createCaller(ctx(makeAdminSession(ADMIN_ID)))

    const { ticketId } = await caller.create({
      category: "other",
      priority: "normal",
      subject: "Test",
    })

    await caller.updateStatus({ ticketId, status: "resolved" })

    const logs = await db.select().from(decisionLogs).where(eq(decisionLogs.domain, "operations"))
    expect(logs.length).toBe(2) // create + status change
  })
})

// --- AC-2.12: list with cursor-based pagination and filters ---

describe("admin.support.list (AC-2.12)", () => {
  it("returns paginated tickets with default sort sla_deadline ASC NULLS LAST", async () => {
    const now = new Date()
    const soonDeadline = new Date(now.getTime() + 2 * 60 * 60 * 1000)
    const laterDeadline = new Date(now.getTime() + 48 * 60 * 60 * 1000)

    await db.insert(supportTickets).values([
      { category: "other", priority: "normal", status: "open", subject: "No SLA", slaDeadline: null },
      { category: "billing_support", priority: "high", status: "open", subject: "Later SLA", slaDeadline: laterDeadline },
      { category: "data_request", priority: "high", status: "open", subject: "Soon SLA", slaDeadline: soonDeadline },
    ])

    const router = makeRouter()
    const caller = router.createCaller(ctx(makeAdminSession(ADMIN_ID)))
    const result = await caller.list({ limit: 10 })

    expect(result.tickets.length).toBe(3)
    // sla_deadline ASC NULLS LAST: soon first, later second, null last
    expect(result.tickets[0].subject).toBe("Soon SLA")
    expect(result.tickets[1].subject).toBe("Later SLA")
    expect(result.tickets[2].subject).toBe("No SLA")
  })

  it("filters by status", async () => {
    await db.insert(supportTickets).values([
      { category: "other", priority: "normal", status: "open", subject: "Open" },
      { category: "other", priority: "normal", status: "resolved", subject: "Resolved" },
    ])

    const router = makeRouter()
    const caller = router.createCaller(ctx(makeAdminSession(ADMIN_ID)))
    const result = await caller.list({ status: "open", limit: 10 })

    expect(result.tickets.length).toBe(1)
    expect(result.tickets[0].subject).toBe("Open")
  })

  it("filters by priority", async () => {
    await db.insert(supportTickets).values([
      { category: "data_request", priority: "high", status: "open", subject: "High" },
      { category: "other", priority: "low", status: "open", subject: "Low" },
    ])

    const router = makeRouter()
    const caller = router.createCaller(ctx(makeAdminSession(ADMIN_ID)))
    const result = await caller.list({ priority: "high", limit: 10 })

    expect(result.tickets.length).toBe(1)
    expect(result.tickets[0].subject).toBe("High")
  })

  it("filters by category", async () => {
    await db.insert(supportTickets).values([
      { category: "billing_support", priority: "normal", status: "open", subject: "Billing" },
      { category: "other", priority: "normal", status: "open", subject: "Other" },
    ])

    const router = makeRouter()
    const caller = router.createCaller(ctx(makeAdminSession(ADMIN_ID)))
    const result = await caller.list({ category: "billing_support", limit: 10 })

    expect(result.tickets.length).toBe(1)
    expect(result.tickets[0].subject).toBe("Billing")
  })

  it("supports cursor-based pagination", async () => {
    // Insert 3 tickets with distinct sla deadlines (default sort column)
    for (let i = 0; i < 3; i++) {
      await db.insert(supportTickets).values({
        category: "other",
        priority: "normal",
        status: "open",
        subject: `Ticket ${i}`,
        slaDeadline: new Date(Date.now() + (i + 1) * 60 * 60 * 1000),
      })
    }

    const router = makeRouter()
    const caller = router.createCaller(ctx(makeAdminSession(ADMIN_ID)))

    const page1 = await caller.list({ limit: 2 })
    expect(page1.tickets.length).toBe(2)
    expect(page1.nextCursor).toBeDefined()

    // Page 2 uses cursor — must return different tickets
    const page2 = await caller.list({ limit: 2, cursor: page1.nextCursor })
    expect(page2.tickets.length).toBe(1)
    const page1Ids = page1.tickets.map((t) => t.id)
    const page2Ids = page2.tickets.map((t) => t.id)
    expect(page1Ids).not.toContainEqual(page2Ids[0])
    expect(page2.nextCursor).toBeUndefined()
  })
})

// --- AC-2.13: getDetail with LEFT JOINs ---

describe("admin.support.getDetail (AC-2.13)", () => {
  it("returns ticket with account email and listing name", async () => {
    const listing = await createTestListing(db, USER_ID, { name: "Film Crew Ltd" })

    const [ticket] = await db.insert(supportTickets).values({
      accountId: USER_ID,
      listingId: listing.id,
      category: "billing_support",
      priority: "normal",
      status: "open",
      subject: "Test detail",
    }).returning()

    const router = makeRouter()
    const caller = router.createCaller(ctx(makeAdminSession(ADMIN_ID)))
    const result = await caller.getDetail({ ticketId: ticket.id })

    expect(result.accountEmail).toBe("user@callsheet.test")
    expect(result.listingName).toBe("Film Crew Ltd")
    expect(result.churnRiskLevel).toBeNull()
  })

  it("returns churn risk level via LEFT JOIN", async () => {
    const listing = await createTestListing(db, USER_ID)

    await db.insert(churnRiskRegistry).values({
      listingId: listing.id,
      accountId: USER_ID,
      riskLevel: "high_risk",
      detectedAt: new Date(),
      expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
    })

    const [ticket] = await db.insert(supportTickets).values({
      accountId: USER_ID,
      listingId: listing.id,
      category: "billing_support",
      priority: "normal",
      status: "open",
      subject: "Churn risk test",
    }).returning()

    const router = makeRouter()
    const caller = router.createCaller(ctx(makeAdminSession(ADMIN_ID)))
    const result = await caller.getDetail({ ticketId: ticket.id })

    expect(result.churnRiskLevel).toBe("high_risk")
  })

  it("throws NOT_FOUND for missing ticket", async () => {
    const router = makeRouter()
    const caller = router.createCaller(ctx(makeAdminSession(ADMIN_ID)))
    await expect(caller.getDetail({ ticketId: makeUUID("nonexist") })).rejects.toThrow()
  })
})

// --- AC-2.14: priority change recomputes SLA + reschedules warning ---

describe("admin.support.updatePriority (AC-2.14)", () => {
  it("recomputes SLA deadline and reschedules sla_breach_warning", async () => {
    const router = makeRouter()
    const caller = router.createCaller(ctx(makeAdminSession(ADMIN_ID)))

    const { ticketId } = await caller.create({
      category: "other",
      priority: "normal", // 72h SLA
      subject: "Priority change test",
    })

    // Change to critical (4h SLA)
    await caller.updatePriority({ ticketId, priority: "critical", reason: "Urgent" })

    // Verify SLA was recomputed
    const [ticket] = await db
      .select({ slaDeadline: supportTickets.slaDeadline, priority: supportTickets.priority })
      .from(supportTickets)
      .where(eq(supportTickets.id, ticketId))

    expect(ticket.priority).toBe("critical")
    // New SLA should be ~4h from now, not ~72h
    const hoursRemaining = (ticket.slaDeadline!.getTime() - Date.now()) / (60 * 60 * 1000)
    expect(hoursRemaining).toBeLessThan(5) // some tolerance
    expect(hoursRemaining).toBeGreaterThan(3)

    // Verify old warning was cancelled and new one scheduled
    const actions = await db
      .select()
      .from(deferredActions)
      .where(eq(deferredActions.action, "sla_breach_warning"))

    const cancelled = actions.filter((a) => a.status === "cancelled")
    const pending = actions.filter((a) => a.status === "pending")
    expect(cancelled.length).toBeGreaterThanOrEqual(1)
    expect(pending.length).toBe(1)
  })

  it("does not reschedule for resolved tickets", async () => {
    const router = makeRouter()
    const caller = router.createCaller(ctx(makeAdminSession(ADMIN_ID)))

    const { ticketId } = await caller.create({
      category: "other",
      priority: "normal",
      subject: "Already resolved",
    })

    await caller.updateStatus({ ticketId, status: "resolved" })

    // Count actions before priority change
    const before = await db.select().from(deferredActions).where(eq(deferredActions.action, "sla_breach_warning"))

    await caller.updatePriority({ ticketId, priority: "critical", reason: "Test" })

    // No new pending actions created (ticket is resolved)
    const after = await db.select().from(deferredActions).where(
      and(eq(deferredActions.action, "sla_breach_warning"), eq(deferredActions.status, "pending")),
    )
    expect(after.length).toBe(0)
  })

  it("is idempotent — same priority is no-op", async () => {
    const router = makeRouter()
    const caller = router.createCaller(ctx(makeAdminSession(ADMIN_ID)))

    const { ticketId } = await caller.create({
      category: "other",
      priority: "normal",
      subject: "Idempotent priority",
    })

    const logsBefore = await db.select().from(decisionLogs)

    // Same priority — should be no-op
    await caller.updatePriority({ ticketId, priority: "normal", reason: "No change" })

    const logsAfter = await db.select().from(decisionLogs)
    // No additional decision log for the no-op
    expect(logsAfter.length).toBe(logsBefore.length)
  })
})

// --- AC-2.15: updateStatus idempotent ---

describe("admin.support.updateStatus idempotency (AC-2.15)", () => {
  it("is a no-op when transitioning to current status", async () => {
    const router = makeRouter()
    const caller = router.createCaller(ctx(makeAdminSession(ADMIN_ID)))

    const { ticketId } = await caller.create({
      category: "other",
      priority: "normal",
      subject: "Idempotent test",
    })

    const logsBefore = await db.select().from(decisionLogs)

    // Transition to same status (open → open)
    await caller.updateStatus({ ticketId, status: "open" })

    const logsAfter = await db.select().from(decisionLogs)
    // No additional log for the no-op
    expect(logsAfter.length).toBe(logsBefore.length)
  })

  it("throws NOT_FOUND for missing ticket", async () => {
    const router = makeRouter()
    const caller = router.createCaller(ctx(makeAdminSession(ADMIN_ID)))
    await expect(
      caller.updateStatus({ ticketId: makeUUID("nonexist"), status: "resolved" }),
    ).rejects.toThrow()
  })
})
