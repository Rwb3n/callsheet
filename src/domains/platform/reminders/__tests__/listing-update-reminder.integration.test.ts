// AC-35, AC-36, AC-37: listing_update_reminder handler + scheduling integration tests

import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest"
import { eq } from "drizzle-orm"
import { getTestDb, resetDb, closeTestDb } from "@/db/test-utils"
import { seedTestUser, createTestListing, createSchedulerDb } from "@/db/test-fixtures"
import { deferredActions } from "@/db/schema/shared"
import { ActionHandlerRegistry } from "@/lib/scheduler"
import { scheduleDeferredAction, cancelDeferredAction } from "@/lib/scheduler"
import { InMemoryEmailService } from "@/lib/email/transport"
import { registerListingUpdateReminderTemplate } from "../email-templates"
import { registerListingUpdateReminderHandler, REMINDER_INTERVAL_MS } from "../listing-update-reminder"
import { profileEditedHandler } from "@/domains/data-and-listings/consumers/quality"
import { invokeHandler } from "@/lib/scheduler/handlers/__tests__/invoke-handler"

let db: ReturnType<typeof getTestDb>

const OWNER_ID = "test-reminder-owner"

beforeAll(async () => {
  db = getTestDb()
  registerListingUpdateReminderTemplate()
})

beforeEach(async () => {
  await resetDb()
  await seedTestUser(db, OWNER_ID)
})

afterAll(async () => {
  await closeTestDb()
})

// --- AC-37: listing_update_reminder handler sends email and reschedules itself ---

describe("listing_update_reminder handler", () => {
  it("sends reminder email and schedules next reminder (self-perpetuating)", async () => {
    const listing = await createTestListing(db, OWNER_ID)
    const emailService = new InMemoryEmailService()
    const schedulerDb = createSchedulerDb(db)
    const registry = new ActionHandlerRegistry()
    registerListingUpdateReminderHandler(registry, { db, emailService, schedulerDb })

    await invokeHandler(registry, "listing_update_reminder", { listingId: listing.id })

    // Verify email sent
    expect(emailService.wasCalledWith("listing_update_reminder")).toBe(true)
    const calls = emailService.getCalls()
    expect(calls[0].to).toBe(`${OWNER_ID}@example.com`)
    expect(calls[0].data).toMatchObject({ listingName: "Test Company" })

    // Verify next reminder scheduled (self-perpetuating)
    const pending = await db.select().from(deferredActions)
      .where(eq(deferredActions.action, "listing_update_reminder"))
    expect(pending).toHaveLength(1)
    expect(pending[0].status).toBe("pending")

    const scheduledMs = pending[0].executeAt.getTime()
    const expectedMs = Date.now() + REMINDER_INTERVAL_MS
    expect(Math.abs(scheduledMs - expectedMs)).toBeLessThan(5000)
  })

  it("is a no-op when listing has no owner", async () => {
    const listing = await createTestListing(db, null as unknown as string)
    const emailService = new InMemoryEmailService()
    const schedulerDb = createSchedulerDb(db)
    const registry = new ActionHandlerRegistry()
    registerListingUpdateReminderHandler(registry, { db, emailService, schedulerDb })

    await invokeHandler(registry, "listing_update_reminder", { listingId: listing.id })

    expect(emailService.getCalls()).toHaveLength(0)
  })

  it("is a no-op when listing is archived", async () => {
    const listing = await createTestListing(db, OWNER_ID, { lifecycleStatus: "archived" })
    const emailService = new InMemoryEmailService()
    const schedulerDb = createSchedulerDb(db)
    const registry = new ActionHandlerRegistry()
    registerListingUpdateReminderHandler(registry, { db, emailService, schedulerDb })

    await invokeHandler(registry, "listing_update_reminder", { listingId: listing.id })

    expect(emailService.getCalls()).toHaveLength(0)
  })

  it("is a no-op when listing does not exist", async () => {
    const emailService = new InMemoryEmailService()
    const schedulerDb = createSchedulerDb(db)
    const registry = new ActionHandlerRegistry()
    registerListingUpdateReminderHandler(registry, { db, emailService, schedulerDb })

    await invokeHandler(registry, "listing_update_reminder", {
      listingId: "00000000-0000-4000-8000-999999999999",
    })

    expect(emailService.getCalls()).toHaveLength(0)
  })
})

// --- AC-35: profile_edited consumer schedules 90-day listing_update_reminder ---

describe("profile_edited consumer — reminder scheduling", () => {
  it("schedules listing_update_reminder deferred action at 90 days", async () => {
    const listing = await createTestListing(db, OWNER_ID)
    const schedulerDb = createSchedulerDb(db)
    const handler = profileEditedHandler({ schedulerDb })

    await handler.handler({
      _brand: "ProfileEditedEvent" as const,
      listingId: listing.id,
      accountId: OWNER_ID,
      changedFields: ["headline"],
    })

    const pending = await db.select().from(deferredActions)
      .where(eq(deferredActions.action, "listing_update_reminder"))
    expect(pending).toHaveLength(1)
    expect(pending[0].status).toBe("pending")

    const scheduledMs = pending[0].executeAt.getTime()
    const expectedMs = Date.now() + REMINDER_INTERVAL_MS
    expect(Math.abs(scheduledMs - expectedMs)).toBeLessThan(5000)
  })
})

// --- AC-36: Subsequent edit cancels existing reminder and reschedules (clock reset) ---

describe("profile_edited consumer — clock reset", () => {
  it("cancels existing reminder and reschedules on subsequent edit", async () => {
    const listing = await createTestListing(db, OWNER_ID)
    const schedulerDb = createSchedulerDb(db)

    // First edit — schedule reminder
    const handler1 = profileEditedHandler({ schedulerDb })
    await handler1.handler({
      _brand: "ProfileEditedEvent" as const,
      listingId: listing.id,
      accountId: OWNER_ID,
      changedFields: ["headline"],
    })

    // Verify first reminder
    const first = await db.select().from(deferredActions)
      .where(eq(deferredActions.action, "listing_update_reminder"))
    expect(first.filter((a) => a.status === "pending")).toHaveLength(1)
    const firstId = first[0].id

    // Second edit — should cancel first and schedule new
    const handler2 = profileEditedHandler({ schedulerDb })
    await handler2.handler({
      _brand: "ProfileEditedEvent" as const,
      listingId: listing.id,
      accountId: OWNER_ID,
      changedFields: ["bio"],
    })

    const all = await db.select().from(deferredActions)
      .where(eq(deferredActions.action, "listing_update_reminder"))

    // Should have 2 rows total: 1 cancelled + 1 new pending
    const cancelled = all.filter((a) => a.status === "cancelled")
    const pending = all.filter((a) => a.status === "pending")
    expect(cancelled.length + pending.length).toBeGreaterThanOrEqual(2)
    expect(pending).toHaveLength(1)
    expect(pending[0].id).not.toBe(firstId)
  })
})
