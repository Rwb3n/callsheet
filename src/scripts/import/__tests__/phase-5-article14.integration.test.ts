// Integration tests: Phase 5 Article 14 — AC-27, AC-28

import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest"
import { eq, sql } from "drizzle-orm"
import { getTestDb, resetDb, closeTestDb } from "@/db/test-utils"
import { createSchedulerDb, createDecisionLogDb } from "@/db/test-fixtures"
import { decisionLogs, deferredActions } from "@/db/schema/shared"
import { listings } from "@/db/schema/data-and-listings"
import { InMemoryEmailService, clearTemplates } from "@/lib/email"
import { phase5Article14, registerArticle14Template } from "../phase-5-article14"

type Db = ReturnType<typeof getTestDb>
let db: Db

// Insert a seed listing directly (bypassing the import pipeline)
async function insertSeedListing(
  db: Db,
  overrides: { name: string; contactEmail: string | null; slug: string },
) {
  const [created] = await db
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
    .returning({ id: listings.id })
  return created.id
}

beforeAll(() => {
  db = getTestDb()
})

beforeEach(async () => {
  await resetDb()
  clearTemplates()
  registerArticle14Template()
})

afterAll(async () => {
  await closeTestDb()
})

describe("Phase 5: Article 14 GDPR notices", () => {
  it("AC-27: sends Article 14 email to listings with contact email", async () => {
    await insertSeedListing(db, {
      name: "Alpha Productions",
      contactEmail: "info@alpha.com",
      slug: "alpha-productions",
    })
    await insertSeedListing(db, {
      name: "Beta Studios",
      contactEmail: "hello@beta.com",
      slug: "beta-studios",
    })

    const emailService = new InMemoryEmailService()
    const result = await phase5Article14(
      db,
      emailService,
      createDecisionLogDb(db),
      createSchedulerDb(db),
    )

    expect(result.emailsSent).toBe(2)
    expect(result.emailsFailed).toBe(0)
    expect(result.onPageNotices).toBe(0)

    const calls = emailService.getCalls()
    expect(calls).toHaveLength(2)
    expect(calls[0].template).toBe("article_14_notice")
    expect(calls[0].category).toBe("transactional")
    expect(calls[0].to).toBe("info@alpha.com")
    expect(calls[1].to).toBe("hello@beta.com")
  })

  it("AC-28: sets on-page notice for listings without contact email", async () => {
    const id = await insertSeedListing(db, {
      name: "No Email Co",
      contactEmail: null,
      slug: "no-email-co",
    })

    const emailService = new InMemoryEmailService()
    const result = await phase5Article14(
      db,
      emailService,
      createDecisionLogDb(db),
      createSchedulerDb(db),
    )

    expect(result.emailsSent).toBe(0)
    expect(result.onPageNotices).toBe(1)
    expect(emailService.getCalls()).toHaveLength(0)

    // Verify DB flag set
    const [row] = await db
      .select({ article14: listings.article14NoticeDisplayed })
      .from(listings)
      .where(eq(listings.id, id))
    expect(row.article14).toBe(true)

    // Verify compliance decision logged
    const logs = await db.select().from(decisionLogs)
    expect(logs).toHaveLength(1)
    expect(logs[0].decisionType).toBe("article_14_exemption")
    expect(logs[0].domain).toBe("operations")
  })

  it("handles mixed listings — email and no-email", async () => {
    await insertSeedListing(db, {
      name: "With Email",
      contactEmail: "a@b.com",
      slug: "with-email",
    })
    const noEmailId = await insertSeedListing(db, {
      name: "Without Email",
      contactEmail: null,
      slug: "without-email",
    })

    const emailService = new InMemoryEmailService()
    const result = await phase5Article14(
      db,
      emailService,
      createDecisionLogDb(db),
      createSchedulerDb(db),
    )

    expect(result.emailsSent).toBe(1)
    expect(result.onPageNotices).toBe(1)

    // On-page notice only for the no-email listing
    const [withEmailRow] = await db
      .select({ article14: listings.article14NoticeDisplayed })
      .from(listings)
      .where(eq(listings.source, "4rfv_import"))

    const noEmailRows = await db
      .select({ id: listings.id, article14: listings.article14NoticeDisplayed })
      .from(listings)
      .where(eq(listings.id, noEmailId))
    expect(noEmailRows[0].article14).toBe(true)
  })

  it("schedules article_14_progress_check deferred action", async () => {
    await insertSeedListing(db, {
      name: "Some Co",
      contactEmail: "x@y.com",
      slug: "some-co",
    })

    const emailService = new InMemoryEmailService()
    await phase5Article14(
      db,
      emailService,
      createDecisionLogDb(db),
      createSchedulerDb(db),
    )

    const actions = await db.select().from(deferredActions)
    expect(actions).toHaveLength(1)
    expect(actions[0].action).toBe("article_14_progress_check")
    expect(actions[0].onFailure).toBe("alert_principal")
    expect(actions[0].status).toBe("pending")
    const params = actions[0].params as { importBatchId: string; importDate: string }
    expect(params.importBatchId).toBe("4rfv_import")
    expect(params.importDate).toBeDefined()
  })

  it("counts failed emails correctly", async () => {
    await insertSeedListing(db, {
      name: "Fail Co",
      contactEmail: "fail@test.com",
      slug: "fail-co",
    })

    const emailService = new InMemoryEmailService()
    emailService.setResponse({ messageId: null, status: "failed", threadId: "test-fail-thread" })

    const result = await phase5Article14(
      db,
      emailService,
      createDecisionLogDb(db),
      createSchedulerDb(db),
    )

    expect(result.emailsSent).toBe(0)
    expect(result.emailsFailed).toBe(1)
  })

  it("ignores non-4rfv listings", async () => {
    // Insert a user-created listing (source = null)
    await db.insert(listings).values({
      entityType: "freelancer",
      claimStatus: "unclaimed",
      name: "User Created",
      slug: "user-created",
      contactEmail: "user@test.com",
      source: null,
      subscriptionTier: "free",
      lifecycleStatus: "active",
    })

    const emailService = new InMemoryEmailService()
    const result = await phase5Article14(
      db,
      emailService,
      createDecisionLogDb(db),
      createSchedulerDb(db),
    )

    expect(result.emailsSent).toBe(0)
    expect(result.onPageNotices).toBe(0)
    expect(emailService.getCalls()).toHaveLength(0)
  })
})
