// CS-WORK-023: Article 14 compliance handler integration tests
// AC-42, AC-43, AC-44

import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest"
import { eq, sql } from "drizzle-orm"
import { getTestDb, resetDb, closeTestDb } from "@/db/test-utils"
import { createSchedulerDb, createDecisionLogDb, createUnclaimedListing } from "@/db/test-fixtures"
import { listings } from "@/db/schema/data-and-listings"
import { correspondenceLog } from "@/db/schema/correspondence"
import { deferredActions, decisionLogs } from "@/db/schema/shared"
import { ActionHandlerRegistry } from "@/lib/scheduler"
import {
  registerArticle14ProgressHandler,
  computeArticle14Progress,
} from "@/lib/scheduler/handlers/article14-progress"
import {
  shouldDisplayArticle14Notice,
  removeArticle14Notice,
} from "@/lib/compliance/article14-notice"
import type { AlertPrincipalFn } from "@/lib/scheduler/types"
import type { Db } from "@/db/types"

let db: ReturnType<typeof getTestDb>

// Insert a 4rfv seed listing directly (minimal, bypassing import pipeline)
async function insertSeedListing(
  testDb: Db,
  overrides: { name: string; contactEmail: string | null; slug: string },
) {
  const [created] = await testDb
    .insert(listings)
    .values({
      entityType: "company",
      claimStatus: "unclaimed",
      name: overrides.name,
      slug: overrides.slug,
      contactEmail: overrides.contactEmail,
      source: "4rfv_import",
      subscriptionTier: "free",
      lifecycleStatus: "active",
    })
    .returning()
  return created
}

// Insert a correspondence log entry to simulate a sent Article 14 email
async function insertSentCorrespondence(
  testDb: Db,
  email: string,
  listingId: string,
  status: "sent" | "delivered" | "bounced" | "failed" | "suppressed" = "sent",
) {
  await testDb.insert(correspondenceLog).values({
    threadId: `thread-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    direction: "outbound",
    status,
    externalEmail: email,
    templateId: "article_14_notice",
    category: "transactional",
    listingId,
  })
}

function createTestDeps(testDb: Db, alertPrincipal?: AlertPrincipalFn) {
  return {
    db: testDb,
    schedulerDb: createSchedulerDb(testDb),
    decisionDb: createDecisionLogDb(testDb),
    alertPrincipal: alertPrincipal ?? vi.fn(async () => {}),
  }
}

beforeAll(() => {
  db = getTestDb()
})

beforeEach(async () => {
  await resetDb()
})

afterAll(async () => {
  await closeTestDb()
})

describe("AC-44: article_14_progress_check correctly computes days elapsed and percentage", () => {
  it("computes 0% sent when no correspondence exists", () => {
    const importDate = new Date("2026-02-01T00:00:00Z").toISOString()
    const now = new Date("2026-02-11T00:00:00Z") // day 10

    const progress = computeArticle14Progress(100, 0, importDate, now)

    expect(progress.daysElapsed).toBe(10)
    expect(progress.percentSent).toBe(0)
    expect(progress.totalWithEmail).toBe(100)
    expect(progress.sent).toBe(0)
    expect(progress.shouldAlert).toBe(false) // day 10 < threshold day 20
  })

  it("computes 100% when all sent", () => {
    const importDate = new Date("2026-02-01T00:00:00Z").toISOString()
    const now = new Date("2026-02-21T00:00:00Z") // day 20

    const progress = computeArticle14Progress(50, 50, importDate, now)

    expect(progress.daysElapsed).toBe(20)
    expect(progress.percentSent).toBe(100)
    expect(progress.shouldAlert).toBe(false)
  })

  it("computes partial percentage correctly", () => {
    const importDate = new Date("2026-02-01T00:00:00Z").toISOString()
    const now = new Date("2026-02-15T00:00:00Z") // day 14

    const progress = computeArticle14Progress(200, 100, importDate, now)

    expect(progress.daysElapsed).toBe(14)
    expect(progress.percentSent).toBe(50)
    expect(progress.shouldAlert).toBe(false) // day 14 < 20
  })

  it("handles zero total listings (100% by convention)", () => {
    const importDate = new Date("2026-02-01T00:00:00Z").toISOString()
    const now = new Date("2026-02-25T00:00:00Z")

    const progress = computeArticle14Progress(0, 0, importDate, now)

    expect(progress.percentSent).toBe(100)
    expect(progress.shouldAlert).toBe(false)
  })

  it("handler queries DB correctly for total and sent counts", async () => {
    // 3 listings with email, 1 without
    const l1 = await insertSeedListing(db, { name: "Co A", contactEmail: "a@test.com", slug: "co-a" })
    const l2 = await insertSeedListing(db, { name: "Co B", contactEmail: "b@test.com", slug: "co-b" })
    const l3 = await insertSeedListing(db, { name: "Co C", contactEmail: "c@test.com", slug: "co-c" })
    await insertSeedListing(db, { name: "No Email", contactEmail: null, slug: "no-email" })

    // 2 of 3 sent successfully
    await insertSentCorrespondence(db, "a@test.com", l1.id, "sent")
    await insertSentCorrespondence(db, "b@test.com", l2.id, "delivered")
    // c@test.com bounced — should NOT count as sent
    await insertSentCorrespondence(db, "c@test.com", l3.id, "bounced")

    const alertPrincipal = vi.fn(async () => {})
    const deps = createTestDeps(db, alertPrincipal)
    const registry = new ActionHandlerRegistry()
    registerArticle14ProgressHandler(registry, deps)

    const importDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString() // 5 days ago
    const handler = registry.get("article_14_progress_check")!
    await (handler as (p: Record<string, unknown>) => Promise<void>)({
      importBatchId: "4rfv_import",
      importDate,
    })

    // Should NOT alert (day 5 < 20)
    expect(alertPrincipal).not.toHaveBeenCalled()

    // Decision logged with correct counts
    const logs = await db.select().from(decisionLogs)
    expect(logs).toHaveLength(1)
    expect(logs[0].decisionType).toBe("article_14_progress_check")
    const inputs = logs[0].inputs as { totalWithEmail: number; sent: number; percentSent: number }
    expect(inputs.totalWithEmail).toBe(3)
    expect(inputs.sent).toBe(2) // bounced excluded
    expect(inputs.percentSent).toBe(67)
  })
})

describe("AC-42: article_14_progress_check alerts principal if <80% sent by day 20", () => {
  it("alerts principal when behind schedule at day 20", async () => {
    // 10 listings, only 5 sent (50%)
    const seedListings = []
    for (let i = 0; i < 10; i++) {
      seedListings.push(
        await insertSeedListing(db, {
          name: `Co ${i}`,
          contactEmail: `co${i}@test.com`,
          slug: `co-${i}`,
        }),
      )
    }
    // 5 sent
    for (let i = 0; i < 5; i++) {
      await insertSentCorrespondence(db, `co${i}@test.com`, seedListings[i].id)
    }

    const alertPrincipal = vi.fn(async () => {})
    const deps = createTestDeps(db, alertPrincipal)
    const registry = new ActionHandlerRegistry()
    registerArticle14ProgressHandler(registry, deps)

    const importDate = new Date(Date.now() - 22 * 24 * 60 * 60 * 1000).toISOString() // 22 days ago
    const handler = registry.get("article_14_progress_check")!
    await (handler as (p: Record<string, unknown>) => Promise<void>)({
      importBatchId: "4rfv_import",
      importDate,
    })

    expect(alertPrincipal).toHaveBeenCalledOnce()
    expect(alertPrincipal).toHaveBeenCalledWith(
      "article_14_progress_check",
      "4rfv_import",
      expect.stringContaining("50%"),
    )
  })

  it("does not alert when >=80% sent by day 20", async () => {
    // 10 listings, 9 sent (90%)
    const seedListings = []
    for (let i = 0; i < 10; i++) {
      seedListings.push(
        await insertSeedListing(db, {
          name: `Co ${i}`,
          contactEmail: `co${i}@test.com`,
          slug: `co-ok-${i}`,
        }),
      )
    }
    for (let i = 0; i < 9; i++) {
      await insertSentCorrespondence(db, `co${i}@test.com`, seedListings[i].id)
    }

    const alertPrincipal = vi.fn(async () => {})
    const deps = createTestDeps(db, alertPrincipal)
    const registry = new ActionHandlerRegistry()
    registerArticle14ProgressHandler(registry, deps)

    const importDate = new Date(Date.now() - 25 * 24 * 60 * 60 * 1000).toISOString()
    const handler = registry.get("article_14_progress_check")!
    await (handler as (p: Record<string, unknown>) => Promise<void>)({
      importBatchId: "4rfv_import",
      importDate,
    })

    expect(alertPrincipal).not.toHaveBeenCalled()
  })

  it("does not alert before day 20 even if behind", async () => {
    await insertSeedListing(db, { name: "Only Co", contactEmail: "only@test.com", slug: "only-co" })
    // 0% sent but only day 10

    const alertPrincipal = vi.fn(async () => {})
    const deps = createTestDeps(db, alertPrincipal)
    const registry = new ActionHandlerRegistry()
    registerArticle14ProgressHandler(registry, deps)

    const importDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString()
    const handler = registry.get("article_14_progress_check")!
    await (handler as (p: Record<string, unknown>) => Promise<void>)({
      importBatchId: "4rfv_import",
      importDate,
    })

    expect(alertPrincipal).not.toHaveBeenCalled()
  })

  it("re-schedules itself within compliance deadline (self-perpetuating)", async () => {
    await insertSeedListing(db, { name: "Some Co", contactEmail: "s@test.com", slug: "some-re" })

    const deps = createTestDeps(db)
    const registry = new ActionHandlerRegistry()
    registerArticle14ProgressHandler(registry, deps)

    const importDate = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString() // day 15
    const handler = registry.get("article_14_progress_check")!
    await (handler as (p: Record<string, unknown>) => Promise<void>)({
      importBatchId: "4rfv_import",
      importDate,
    })

    const actions = await db.select().from(deferredActions)
    expect(actions).toHaveLength(1)
    expect(actions[0].action).toBe("article_14_progress_check")
    expect(actions[0].status).toBe("pending")
    const rescheduleParams = actions[0].params as { importBatchId: string; importDate: string }
    expect(rescheduleParams.importBatchId).toBe("4rfv_import")
    expect(rescheduleParams.importDate).toBe(importDate)
  })

  it("does not re-schedule after compliance deadline (day 30+)", async () => {
    const listing = await insertSeedListing(db, { name: "Late Co", contactEmail: "l@test.com", slug: "late-co" })
    await insertSentCorrespondence(db, "l@test.com", listing.id)

    const deps = createTestDeps(db)
    const registry = new ActionHandlerRegistry()
    registerArticle14ProgressHandler(registry, deps)

    const importDate = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000).toISOString() // day 35
    const handler = registry.get("article_14_progress_check")!
    await (handler as (p: Record<string, unknown>) => Promise<void>)({
      importBatchId: "4rfv_import",
      importDate,
    })

    const actions = await db.select().from(deferredActions)
    expect(actions).toHaveLength(0)
  })
})

describe("AC-43: Article 14 on-page notice removed on claim approval", () => {
  it("removes on-page notice when removeArticle14Notice is called", async () => {
    const listing = await createUnclaimedListing(db, {
      article14NoticeDisplayed: true,
    })

    // Before: notice displayed
    const [before] = await db
      .select({ notice: listings.article14NoticeDisplayed })
      .from(listings)
      .where(eq(listings.id, listing.id))
    expect(before.notice).toBe(true)

    await removeArticle14Notice(db, listing.id)

    // After: notice removed
    const [after] = await db
      .select({ notice: listings.article14NoticeDisplayed })
      .from(listings)
      .where(eq(listings.id, listing.id))
    expect(after.notice).toBe(false)
  })

  it("is idempotent — no-op if notice already false", async () => {
    const listing = await createUnclaimedListing(db, {
      article14NoticeDisplayed: false,
    })

    // Should not throw
    await removeArticle14Notice(db, listing.id)

    const [row] = await db
      .select({ notice: listings.article14NoticeDisplayed })
      .from(listings)
      .where(eq(listings.id, listing.id))
    expect(row.notice).toBe(false)
  })

  it("shouldDisplayArticle14Notice returns true for unclaimed 4rfv listing with notice", () => {
    expect(shouldDisplayArticle14Notice({
      article14NoticeDisplayed: true,
      source: "4rfv_import",
      claimStatus: "unclaimed",
    })).toBe(true)
  })

  it("shouldDisplayArticle14Notice returns true during pending_review (banner persists)", () => {
    expect(shouldDisplayArticle14Notice({
      article14NoticeDisplayed: true,
      source: "4rfv_import",
      claimStatus: "pending_review",
    })).toBe(true)
  })

  it("shouldDisplayArticle14Notice returns false for claimed listings", () => {
    expect(shouldDisplayArticle14Notice({
      article14NoticeDisplayed: true,
      source: "4rfv_import",
      claimStatus: "claimed",
    })).toBe(false)
  })

  it("shouldDisplayArticle14Notice returns false for non-4rfv listings", () => {
    expect(shouldDisplayArticle14Notice({
      article14NoticeDisplayed: true,
      source: null,
      claimStatus: "unclaimed",
    })).toBe(false)
  })

  it("shouldDisplayArticle14Notice returns false when flag is false", () => {
    expect(shouldDisplayArticle14Notice({
      article14NoticeDisplayed: false,
      source: "4rfv_import",
      claimStatus: "unclaimed",
    })).toBe(false)
  })
})
