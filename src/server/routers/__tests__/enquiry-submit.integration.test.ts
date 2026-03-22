// CS-WORK-052 AC-20 through AC-27: Enquiry submission integration tests
// Tests call enquiry router via createCaller() against real Postgres.

import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest"
import { eq, and } from "drizzle-orm"
import { getTestDb, resetDb, closeTestDb } from "@/db/test-utils"
import {
  seedTestUser,
  makeSession,
  ctx,
  createTestListing,
  createUnclaimedListing,
  createSchedulerDb,
  emptyConsumerMatrix,
} from "@/db/test-fixtures"
import { enquiryRecords } from "@/db/schema/accounts"
import { pendingEnquiries, listings } from "@/db/schema/data-and-listings"
import { deferredActions } from "@/db/schema/shared"
import { createEnquiryRouter } from "../enquiry"
import { InMemoryEmailService } from "@/lib/email/transport"
import { InProcessEventBus } from "@/lib/events/bus"
import { createWaitUntilCollector } from "@/lib/events/waitUntil"
import type { AuthSession } from "@/lib/auth"
import type { EnquiryRouterDeps } from "../enquiry"
import {
  registerNewEnquiryTemplate,
  registerEnquiryResponseTemplate,
  registerEnquiryReminderTemplate,
} from "@/domains/platform/enquiry/email-templates"
import { registerEnquiryForwardedTemplate } from "@/lib/onboarding/email-templates"

let db: ReturnType<typeof getTestDb>
let emailService: InMemoryEmailService
let bus: InProcessEventBus
let waitUntilFn: ReturnType<typeof createWaitUntilCollector>["waitUntilFn"]
let getPromises: ReturnType<typeof createWaitUntilCollector>["getPromises"]

const BUYER_ID = "test-buyer-001"
const OWNER_ID = "test-owner-001"

function makeDeps(): EnquiryRouterDeps {
  return {
    db,
    emailService,
    bus,
    waitUntilFn,
    schedulerDb: createSchedulerDb(db),
  }
}

function caller(session: AuthSession | null) {
  const router = createEnquiryRouter(makeDeps())
  return router.createCaller(ctx(session))
}

const buyerSession = makeSession({ accountId: BUYER_ID, email: "buyer@example.com" })
const noSession = null

function validInput(listingId: string, overrides: Record<string, unknown> = {}) {
  return {
    listingId,
    senderName: "Alice Buyer",
    message: "I would like to discuss a potential project collaboration.",
    ...overrides,
  }
}

beforeAll(async () => {
  db = getTestDb()
  registerNewEnquiryTemplate()
  registerEnquiryResponseTemplate()
  registerEnquiryReminderTemplate()
  registerEnquiryForwardedTemplate()
})

beforeEach(async () => {
  await resetDb()
  await seedTestUser(db, BUYER_ID, "buyer@example.com")
  await seedTestUser(db, OWNER_ID, "owner@example.com")
  emailService = new InMemoryEmailService()
  bus = new InProcessEventBus({
    logError: async () => {},
    consumerMatrix: emptyConsumerMatrix,
  })
  const collector = createWaitUntilCollector()
  waitUntilFn = collector.waitUntilFn
  getPromises = collector.getPromises
})

afterAll(async () => {
  await closeTestDb()
})

// --- AC-20: Branch A (claimed) — direct delivery ---

describe("enquiry.submit — Branch A (claimed)", () => {
  it("creates enquiry_records row with status = unread", async () => {
    const listing = await createTestListing(db, OWNER_ID, { claimStatus: "claimed" })

    const result = await caller(buyerSession).submit(validInput(listing.id))

    expect(result).toHaveProperty("enquiryId")
    const [row] = await db
      .select()
      .from(enquiryRecords)
      .where(eq(enquiryRecords.id, (result as { enquiryId: string }).enquiryId))
    expect(row.status).toBe("unread")
    expect(row.senderAccountId).toBe(BUYER_ID)
    expect(row.senderEmail).toBe("buyer@example.com")
    expect(row.listingId).toBe(listing.id)
  })

  it("sends new_enquiry email to provider", async () => {
    const listing = await createTestListing(db, OWNER_ID, { claimStatus: "claimed" })

    await caller(buyerSession).submit(validInput(listing.id))

    expect(emailService.wasCalledWith("new_enquiry")).toBe(true)
    const calls = emailService.getCalls()
    const enquiryEmail = calls.find((c) => c.template === "new_enquiry")
    expect(enquiryEmail!.to).toBe("owner@example.com")
    expect(enquiryEmail!.data.senderName).toBe("Alice Buyer")
  })

  it("schedules enquiry_response_reminder at 7 days", async () => {
    const listing = await createTestListing(db, OWNER_ID, { claimStatus: "claimed" })

    const result = await caller(buyerSession).submit(validInput(listing.id))
    const enquiryId = (result as { enquiryId: string }).enquiryId

    const [action] = await db
      .select()
      .from(deferredActions)
      .where(eq(deferredActions.action, "enquiry_response_reminder"))
    expect(action).toBeTruthy()
    expect((action.params as { enquiryId: string }).enquiryId).toBe(enquiryId)
    // Verify it's ~7 days in the future
    const delayMs = action.executeAt.getTime() - Date.now()
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000
    expect(delayMs).toBeGreaterThan(sevenDaysMs - 5000)
    expect(delayMs).toBeLessThanOrEqual(sevenDaysMs + 1000)
  })
})

// --- AC-21: Branch B (unclaimed + email) ---

describe("enquiry.submit — Branch B (unclaimed + email)", () => {
  it("sends enquiry_forwarded email with claim CTA and queues in pending_enquiries", async () => {
    const listing = await createUnclaimedListing(db, { contactEmail: "seed@provider.com" })

    const result = await caller(buyerSession).submit(validInput(listing.id))
    expect(result).toHaveProperty("enquiryId")
    const enquiryId = (result as { enquiryId: string }).enquiryId

    // Verify enquiry_forwarded email sent
    expect(emailService.wasCalledWith("enquiry_forwarded")).toBe(true)
    const fwdEmail = emailService.getCalls().find((c) => c.template === "enquiry_forwarded")
    expect(fwdEmail!.to).toBe("seed@provider.com")

    // Verify pending_enquiries row with 90-day TTL
    const [pending] = await db
      .select()
      .from(pendingEnquiries)
      .where(eq(pendingEnquiries.enquiryId, enquiryId))
    expect(pending).toBeTruthy()
    expect(pending.forwardedAt).toBeTruthy()
    const ttlDays = Math.round(
      (pending.expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000),
    )
    expect(ttlDays).toBeGreaterThanOrEqual(89)
    expect(ttlDays).toBeLessThanOrEqual(91)
  })
})

// --- AC-22: Branch C (unclaimed, no email) ---

describe("enquiry.submit — Branch C (unclaimed, no email)", () => {
  it("returns NO_EMAIL with contact methods and creates no enquiry record", async () => {
    const listing = await createUnclaimedListing(db, {
      contactEmail: null,
      contactPhone: "020 7946 0958",
      websiteUrl: "https://seedco.com",
    })

    const result = await caller(buyerSession).submit(validInput(listing.id))

    expect(result).toEqual({
      code: "NO_EMAIL",
      contactMethods: {
        phone: "020 7946 0958",
        website: "https://seedco.com",
      },
    })

    // No enquiry record created
    const rows = await db
      .select()
      .from(enquiryRecords)
      .where(eq(enquiryRecords.listingId, listing.id))
    expect(rows).toHaveLength(0)
  })
})

// --- AC-23: Branch D (disputed) ---

describe("enquiry.submit — Branch D (disputed)", () => {
  it("queues silently with no email sent, buyer sees normal result", async () => {
    const listing = await createTestListing(db, null, {
      claimStatus: "disputed",
      contactEmail: "disputed@provider.com",
    })

    const result = await caller(buyerSession).submit(validInput(listing.id))

    // Buyer sees normal result — has enquiryId, identical to Branch A
    expect(result).toHaveProperty("enquiryId")
    const enquiryId = (result as { enquiryId: string }).enquiryId

    // No email sent
    expect(emailService.getCalls()).toHaveLength(0)

    // Queued in pending_enquiries with no forwardedAt [S6-ST-12]
    const [pending] = await db
      .select()
      .from(pendingEnquiries)
      .where(eq(pendingEnquiries.enquiryId, enquiryId))
    expect(pending).toBeTruthy()
    expect(pending.forwardedAt).toBeNull()
  })
})

// --- AC-24: enquiry_submitted event —  no PII ---

describe("enquiry_submitted event", () => {
  it("payload contains only enquiryId, listingId — no PII", async () => {
    const listing = await createTestListing(db, OWNER_ID, { claimStatus: "claimed" })

    const emitted: Array<{ type: string; payload: unknown }> = []
    bus.on({
      domain: "platform",
      eventType: "enquiry_submitted",
      mode: "async",
      handler: async (payload) => { emitted.push({ type: "enquiry_submitted", payload }) },
    })

    await caller(buyerSession).submit(validInput(listing.id))
    await Promise.all(getPromises())

    expect(emitted).toHaveLength(1)
    const payload = emitted[0].payload as Record<string, unknown>
    expect(payload).toHaveProperty("enquiryId")
    expect(payload).toHaveProperty("listingId")
    expect(payload).not.toHaveProperty("senderEmail")
    expect(payload).not.toHaveProperty("senderAccountId")
  })

  it("is emitted for branches A, B, D but not C", async () => {
    const emitted: unknown[] = []
    bus.on({
      domain: "platform",
      eventType: "enquiry_submitted",
      mode: "async",
      handler: async (payload) => { emitted.push(payload) },
    })

    // Branch A
    const claimedListing = await createTestListing(db, OWNER_ID, { claimStatus: "claimed" })
    await caller(buyerSession).submit(validInput(claimedListing.id))
    await Promise.all(getPromises())

    // Branch B
    const unclaimedWithEmail = await createUnclaimedListing(db, { contactEmail: "fwd@test.com" })
    await caller(buyerSession).submit(validInput(unclaimedWithEmail.id))
    await Promise.all(getPromises())

    // Branch D
    const disputedListing = await createTestListing(db, null, { claimStatus: "disputed" })
    await caller(buyerSession).submit(validInput(disputedListing.id))
    await Promise.all(getPromises())

    // Branch C — should NOT emit
    const unclaimedNoEmail = await createUnclaimedListing(db, { contactEmail: null })
    await caller(buyerSession).submit(validInput(unclaimedNoEmail.id))
    await Promise.all(getPromises())

    expect(emitted).toHaveLength(3)
  })
})

// --- AC-25: Spam prevention ---

describe("enquiry.submit — spam prevention", () => {
  it("rejects when honeypot is non-empty", async () => {
    const listing = await createTestListing(db, OWNER_ID, { claimStatus: "claimed" })

    await expect(
      caller(buyerSession).submit(validInput(listing.id, { honeypot: "bot-value" })),
    ).rejects.toThrow()
  })

  it("rejects 11th enquiry from same email within 1 hour", async () => {
    const listing = await createTestListing(db, OWNER_ID, { claimStatus: "claimed" })

    // Insert 10 existing enquiries from the same sender email within the past hour
    for (let i = 0; i < 10; i++) {
      await db.insert(enquiryRecords).values({
        listingId: listing.id,
        senderEmail: "buyer@example.com",
        body: "Previous enquiry message padding",
        status: "unread",
        sentAt: new Date(Date.now() - 30 * 60 * 1000), // 30 mins ago
      })
    }

    await expect(
      caller(buyerSession).submit(validInput(listing.id)),
    ).rejects.toThrow("RATE_LIMIT_EXCEEDED")
  })
})

// --- AC-26: Sender identity resolution ---

describe("enquiry.submit — sender identity", () => {
  it("anonymous user must provide senderEmail", async () => {
    const listing = await createTestListing(db, OWNER_ID, { claimStatus: "claimed" })

    await expect(
      caller(noSession).submit(validInput(listing.id)),
    ).rejects.toThrow("Email required")
  })

  it("authenticated user senderEmail resolved from session (form input ignored)", async () => {
    const listing = await createTestListing(db, OWNER_ID, { claimStatus: "claimed" })

    const result = await caller(buyerSession).submit(
      validInput(listing.id, { senderEmail: "wrong@example.com" }),
    )

    const enquiryId = (result as { enquiryId: string }).enquiryId
    const [row] = await db
      .select()
      .from(enquiryRecords)
      .where(eq(enquiryRecords.id, enquiryId))
    // Session email used, not form input
    expect(row.senderEmail).toBe("buyer@example.com")
  })

  it("anonymous enquiry stored with senderAccountId = null", async () => {
    const listing = await createTestListing(db, OWNER_ID, { claimStatus: "claimed" })

    const result = await caller(noSession).submit(
      validInput(listing.id, { senderEmail: "anon@test.com" }),
    )

    const enquiryId = (result as { enquiryId: string }).enquiryId
    const [row] = await db
      .select()
      .from(enquiryRecords)
      .where(eq(enquiryRecords.id, enquiryId))
    expect(row.senderAccountId).toBeNull()
    expect(row.senderEmail).toBe("anon@test.com")
  })
})

// --- AC-27: Inactive listing ---

describe("enquiry.submit — inactive listing", () => {
  it("returns NOT_FOUND for archived listing", async () => {
    const listing = await createTestListing(db, OWNER_ID, {
      claimStatus: "claimed",
      lifecycleStatus: "archived",
    })

    await expect(
      caller(buyerSession).submit(validInput(listing.id)),
    ).rejects.toThrow("NOT_FOUND")
  })
})

// --- Buyer-side read routes ---

describe("enquiry.listSent", () => {
  it("returns enquiries sent by current user with listing details", async () => {
    const listing = await createTestListing(db, OWNER_ID, { claimStatus: "claimed" })

    // Submit an enquiry as the buyer
    await caller(buyerSession).submit(validInput(listing.id))

    const result = await caller(buyerSession).listSent({ limit: 20 })

    expect(result.enquiries).toHaveLength(1)
    expect(result.enquiries[0].listingName).toBe("Test Company")
    expect(result.enquiries[0].status).toBe("unread")
    expect(result.enquiries[0].message.length).toBeLessThanOrEqual(200)
  })

  it("does not return enquiries from other senders", async () => {
    const listing = await createTestListing(db, OWNER_ID, { claimStatus: "claimed" })

    // Insert enquiry from a different sender
    await db.insert(enquiryRecords).values({
      senderAccountId: OWNER_ID,
      senderEmail: "owner@example.com",
      listingId: listing.id,
      body: "Not the buyer's enquiry at all",
      status: "unread",
    })

    const result = await caller(buyerSession).listSent({ limit: 20 })
    expect(result.enquiries).toHaveLength(0)
  })
})

describe("enquiry.getSent", () => {
  it("returns single enquiry detail for owner", async () => {
    const listing = await createTestListing(db, OWNER_ID, { claimStatus: "claimed" })
    const submitResult = await caller(buyerSession).submit(validInput(listing.id))
    const enquiryId = (submitResult as { enquiryId: string }).enquiryId

    const detail = await caller(buyerSession).getSent({ enquiryId })

    expect(detail.enquiryId).toBe(enquiryId)
    expect(detail.listingName).toBe("Test Company")
    expect(detail.senderName).toBe("Alice Buyer")
    expect(detail.message).toBe("I would like to discuss a potential project collaboration.")
  })

  it("returns NOT_FOUND for enquiry from another sender", async () => {
    const listing = await createTestListing(db, OWNER_ID, { claimStatus: "claimed" })

    // Insert enquiry from different sender
    const [row] = await db.insert(enquiryRecords).values({
      senderAccountId: OWNER_ID,
      senderEmail: "owner@example.com",
      listingId: listing.id,
      body: "Not the buyer's enquiry at all",
      status: "unread",
    }).returning()

    await expect(
      caller(buyerSession).getSent({ enquiryId: row.id }),
    ).rejects.toThrow("NOT_FOUND")
  })
})
