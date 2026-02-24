// CS-WORK-018: Progressive disclosure handler integration tests
// AC-32, AC-33, AC-34, AC-35, AC-48, AC-49

import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest"
import { eq } from "drizzle-orm"
import { getTestDb, resetDb, closeTestDb } from "@/db/test-utils"
import { seedUsers, createTestListing, createSchedulerDb, InMemoryNotificationDb } from "@/db/test-fixtures"
import { listings } from "@/db/schema/data-and-listings"
import { deferredActions } from "@/db/schema/shared"
import { ActionHandlerRegistry } from "@/lib/scheduler"
import { InMemoryEmailService, clearTemplates } from "@/lib/email"
import {
  registerListingLiveTemplate,
  registerWelcomeTemplate,
  registerProfileDay1Template,
  registerProfileDay3Template,
  registerProfileDay7Template,
} from "@/lib/onboarding/email-templates"
import { registerProgressiveEmailHandler } from "@/lib/scheduler/handlers/progressive-email"
import { registerDay14PromptHandler } from "@/lib/scheduler/handlers/day14-prompt"
import { scheduleProgressiveDisclosure } from "@/lib/onboarding/schedule-progressive-disclosure"
import type { EmailPreferences } from "@/lib/email/types"
import type { Db } from "@/db/types"

let db: ReturnType<typeof getTestDb>

const ACCOUNT_ID = "progressive-test-001"
const ACCOUNT_EMAIL = "provider@example.com"

function registerAllTemplates() {
  registerListingLiveTemplate()
  registerWelcomeTemplate()
  registerProfileDay1Template()
  registerProfileDay3Template()
  registerProfileDay7Template()
}

async function createActiveListingWithAccount(
  testDb: Db,
  overrides: Record<string, unknown> = {},
) {
  await seedUsers(testDb, [{ id: ACCOUNT_ID, name: "Test Provider", email: ACCOUNT_EMAIL }])
  return createTestListing(testDb, ACCOUNT_ID, {
    entityType: "freelancer",
    lifecycleStatus: "active",
    claimStatus: "claimed",
    ...overrides,
  })
}

beforeAll(() => {
  db = getTestDb()
})

beforeEach(async () => {
  await resetDb()
  clearTemplates()
  registerAllTemplates()
})

afterAll(async () => {
  await closeTestDb()
})

describe("AC-32: send_progressive_email skips if target action already complete", () => {
  it("skips email when headline and bio are already present (profile_day1)", async () => {
    const listing = await createActiveListingWithAccount(db, {
      headline: "Expert Cinematographer",
      bio: "20 years of experience in film and TV.",
    })

    const emailService = new InMemoryEmailService()
    const registry = new ActionHandlerRegistry()
    registerProgressiveEmailHandler(registry, { db, emailService })

    const handler = registry.get("send_progressive_email")!
    await (handler as (p: Record<string, unknown>) => Promise<void>)({
      listingId: listing.id,
      template: "profile_day1",
      accountId: ACCOUNT_ID,
    })

    expect(emailService.getCalls()).toHaveLength(0)
  })

  it("sends email when headline is missing (profile_day1)", async () => {
    const listing = await createActiveListingWithAccount(db, {
      headline: null,
      bio: null,
    })

    const emailService = new InMemoryEmailService()
    const registry = new ActionHandlerRegistry()
    registerProgressiveEmailHandler(registry, { db, emailService })

    const handler = registry.get("send_progressive_email")!
    await (handler as (p: Record<string, unknown>) => Promise<void>)({
      listingId: listing.id,
      template: "profile_day1",
      accountId: ACCOUNT_ID,
    })

    expect(emailService.getCalls()).toHaveLength(1)
    expect(emailService.getCalls()[0].template).toBe("profile_day1")
    expect(emailService.getCalls()[0].category).toBe("profile_nudge")
  })
})

describe("AC-33: send_progressive_email skips if listing no longer active", () => {
  it("skips email when listing is suspended", async () => {
    const listing = await createActiveListingWithAccount(db, {
      lifecycleStatus: "suspended",
      headline: null,
    })

    const emailService = new InMemoryEmailService()
    const registry = new ActionHandlerRegistry()
    registerProgressiveEmailHandler(registry, { db, emailService })

    const handler = registry.get("send_progressive_email")!
    await (handler as (p: Record<string, unknown>) => Promise<void>)({
      listingId: listing.id,
      template: "profile_day1",
      accountId: ACCOUNT_ID,
    })

    expect(emailService.getCalls()).toHaveLength(0)
  })

  it("skips email when listing is archived", async () => {
    const listing = await createActiveListingWithAccount(db, {
      lifecycleStatus: "archived",
      headline: null,
    })

    const emailService = new InMemoryEmailService()
    const registry = new ActionHandlerRegistry()
    registerProgressiveEmailHandler(registry, { db, emailService })

    const handler = registry.get("send_progressive_email")!
    await (handler as (p: Record<string, unknown>) => Promise<void>)({
      listingId: listing.id,
      template: "profile_day1",
      accountId: ACCOUNT_ID,
    })

    expect(emailService.getCalls()).toHaveLength(0)
  })
})

describe("AC-34: Day 14 notification only if profile strength < 80%", () => {
  it("creates notification when profile is incomplete", async () => {
    const listing = await createActiveListingWithAccount(db, {
      headline: null,
      bio: null,
      headshotUrl: null,
      websiteUrl: null,
      contactEmail: null,
    })

    const notificationDb = new InMemoryNotificationDb()
    const registry = new ActionHandlerRegistry()
    registerDay14PromptHandler(registry, { db, notificationDb })

    const handler = registry.get("onboarding_day14_prompt")!
    await (handler as (p: Record<string, unknown>) => Promise<void>)({
      listingId: listing.id,
      accountId: ACCOUNT_ID,
    })

    const notifications = notificationDb.getAll()
    expect(notifications).toHaveLength(1)
    expect(notifications[0].type).toBe("onboarding_prompt")
    expect(notifications[0].accountId).toBe(ACCOUNT_ID)
    expect(notifications[0].link).toContain(listing.id)
  })

  it("skips notification when profile strength >= 80%", async () => {
    // All fallback fields present → 100%
    const listing = await createActiveListingWithAccount(db, {
      headline: "Expert DP",
      bio: "Twenty years of experience",
      headshotUrl: "https://example.com/photo.jpg",
      websiteUrl: "https://example.com",
      contactEmail: "contact@example.com",
    })

    const notificationDb = new InMemoryNotificationDb()
    const registry = new ActionHandlerRegistry()
    registerDay14PromptHandler(registry, { db, notificationDb })

    const handler = registry.get("onboarding_day14_prompt")!
    await (handler as (p: Record<string, unknown>) => Promise<void>)({
      listingId: listing.id,
      accountId: ACCOUNT_ID,
    })

    expect(notificationDb.getAll()).toHaveLength(0)
  })
})

describe("AC-35: profile_nudge unsubscribe suppresses progressive emails", () => {
  it("returns suppressed status when profile_nudge preference is false", async () => {
    const listing = await createActiveListingWithAccount(db, {
      headline: null,
      bio: null,
    })

    const preferences = new Map<string, EmailPreferences>()
    preferences.set(ACCOUNT_ID, {
      enquiry_notification: true,
      listing_status: true,
      profile_nudge: false,
      conversion_marketing: true,
    })
    const emailService = new InMemoryEmailService(preferences)
    const registry = new ActionHandlerRegistry()
    registerProgressiveEmailHandler(registry, { db, emailService })

    const handler = registry.get("send_progressive_email")!
    await (handler as (p: Record<string, unknown>) => Promise<void>)({
      listingId: listing.id,
      template: "profile_day1",
      accountId: ACCOUNT_ID,
    })

    // Email service was called but returned suppressed
    const calls = emailService.getCalls()
    expect(calls).toHaveLength(1)
    expect(calls[0].category).toBe("profile_nudge")
  })
})

describe("AC-48: onboarding_day14_prompt skips if listing inactive", () => {
  it("skips notification when listing is suspended", async () => {
    const listing = await createActiveListingWithAccount(db, {
      lifecycleStatus: "suspended",
      headline: null,
    })

    const notificationDb = new InMemoryNotificationDb()
    const registry = new ActionHandlerRegistry()
    registerDay14PromptHandler(registry, { db, notificationDb })

    const handler = registry.get("onboarding_day14_prompt")!
    await (handler as (p: Record<string, unknown>) => Promise<void>)({
      listingId: listing.id,
      accountId: ACCOUNT_ID,
    })

    expect(notificationDb.getAll()).toHaveLength(0)
  })
})

describe("AC-49: Day 14 deferred action scheduled during scheduleProgressiveDisclosure", () => {
  it("schedules 4 deferred actions including Day 14 prompt", async () => {
    const listing = await createActiveListingWithAccount(db)
    const schedulerDb = createSchedulerDb(db)
    const baseTime = new Date("2026-03-01T10:00:00Z")

    const ids = await scheduleProgressiveDisclosure(
      schedulerDb,
      { listingId: listing.id, accountId: ACCOUNT_ID },
      baseTime,
    )

    expect(ids).toHaveLength(4)

    const actions = await db
      .select()
      .from(deferredActions)
      .where(eq(deferredActions.createdBy, ACCOUNT_ID))

    expect(actions).toHaveLength(4)

    const emailActions = actions.filter((a) => a.action === "send_progressive_email")
    expect(emailActions).toHaveLength(3)

    const day14Actions = actions.filter((a) => a.action === "onboarding_day14_prompt")
    expect(day14Actions).toHaveLength(1)

    // Verify Day 14 scheduling offset (14 days from base)
    const day14 = day14Actions[0]
    const expectedTime = new Date(baseTime.getTime() + 14 * 24 * 60 * 60 * 1000)
    expect(day14.executeAt.getTime()).toBe(expectedTime.getTime())
    expect((day14.params as { listingId: string }).listingId).toBe(listing.id)
    expect((day14.params as { accountId: string }).accountId).toBe(ACCOUNT_ID)
  })
})
