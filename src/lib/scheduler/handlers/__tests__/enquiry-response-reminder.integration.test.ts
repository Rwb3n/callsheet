// enquiry_response_reminder handler integration test — AC-20, AC-21

import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest"
import { eq } from "drizzle-orm"
import { getTestDb, resetDb, closeTestDb } from "@/db/test-utils"
import { seedTestUser, createTestListing } from "@/db/test-fixtures"
import { enquiryRecords } from "@/db/schema/accounts"
import { ActionHandlerRegistry } from "@/lib/scheduler"
import { InMemoryEmailService } from "@/lib/email/transport"
import { registerEnquiryReminderTemplate } from "@/domains/platform/enquiry/email-templates"
import { registerEnquiryResponseReminderHandler } from "../enquiry-response-reminder"
import { invokeHandler } from "./invoke-handler"

let db: ReturnType<typeof getTestDb>

const OWNER_ID = "test-reminder-owner"

beforeAll(async () => {
  db = getTestDb()
  registerEnquiryReminderTemplate()
})

beforeEach(async () => {
  await resetDb()
  await seedTestUser(db, OWNER_ID)
})

afterAll(async () => {
  await closeTestDb()
})

async function insertEnquiry(
  listingId: string,
  overrides: Partial<typeof enquiryRecords.$inferInsert> & { id: string },
) {
  const [row] = await db
    .insert(enquiryRecords)
    .values({
      listingId,
      body: "Test enquiry",
      senderEmail: "sender@example.com",
      status: "unread",
      ...overrides,
    })
    .returning()
  return row
}

// --- AC-20: marks enquiry as stale and sends reminder email ---

describe("enquiry_response_reminder handler", () => {
  it("marks unread enquiry as stale and sends reminder email", async () => {
    const listing = await createTestListing(db, OWNER_ID)
    const enquiry = await insertEnquiry(listing.id, {
      id: "e0000000-0000-4000-8000-000000000001",
      status: "unread",
    })

    const emailService = new InMemoryEmailService()
    const registry = new ActionHandlerRegistry()
    registerEnquiryResponseReminderHandler(registry, { db, emailService })

    await invokeHandler(registry, "enquiry_response_reminder", {
      enquiryId: enquiry.id,
      listingId: listing.id,
    })

    // Verify status changed to stale
    const [updated] = await db
      .select()
      .from(enquiryRecords)
      .where(eq(enquiryRecords.id, enquiry.id))
    expect(updated.status).toBe("stale")

    // Verify reminder email sent to listing owner
    expect(emailService.wasCalledWith("enquiry_reminder")).toBe(true)
    const calls = emailService.getCalls()
    expect(calls[0].to).toBe(`${OWNER_ID}@example.com`)
    expect(calls[0].data).toMatchObject({ listingName: "Test Company", daysSinceEnquiry: 7 })
  })

  // --- AC-21: no-op if enquiry was already responded ---

  it("is a no-op when enquiry status is responded", async () => {
    const listing = await createTestListing(db, OWNER_ID)
    const enquiry = await insertEnquiry(listing.id, {
      id: "e0000000-0000-4000-8000-000000000001",
      status: "responded",
      respondedAt: new Date(),
    })

    const emailService = new InMemoryEmailService()
    const registry = new ActionHandlerRegistry()
    registerEnquiryResponseReminderHandler(registry, { db, emailService })

    await invokeHandler(registry, "enquiry_response_reminder", {
      enquiryId: enquiry.id,
      listingId: listing.id,
    })

    // Status unchanged
    const [unchanged] = await db
      .select()
      .from(enquiryRecords)
      .where(eq(enquiryRecords.id, enquiry.id))
    expect(unchanged.status).toBe("responded")

    // No email sent
    expect(emailService.getCalls()).toHaveLength(0)
  })

  it("is a no-op when enquiry does not exist", async () => {
    const listing = await createTestListing(db, OWNER_ID)

    const emailService = new InMemoryEmailService()
    const registry = new ActionHandlerRegistry()
    registerEnquiryResponseReminderHandler(registry, { db, emailService })

    // Should not throw
    await invokeHandler(registry, "enquiry_response_reminder", {
      enquiryId: "e0000000-0000-4000-8000-999999999999",
      listingId: listing.id,
    })

    expect(emailService.getCalls()).toHaveLength(0)
  })

  it("skips email when listing has no owner", async () => {
    // Unclaimed listing (accountId = null)
    const listing = await createTestListing(db, null as unknown as string)
    const enquiry = await insertEnquiry(listing.id, {
      id: "e0000000-0000-4000-8000-000000000001",
      status: "unread",
    })

    const emailService = new InMemoryEmailService()
    const registry = new ActionHandlerRegistry()
    registerEnquiryResponseReminderHandler(registry, { db, emailService })

    await invokeHandler(registry, "enquiry_response_reminder", {
      enquiryId: enquiry.id,
      listingId: listing.id,
    })

    // Status still updated to stale
    const [updated] = await db
      .select()
      .from(enquiryRecords)
      .where(eq(enquiryRecords.id, enquiry.id))
    expect(updated.status).toBe("stale")

    // But no email sent (no account to send to)
    expect(emailService.getCalls()).toHaveLength(0)
  })
})
