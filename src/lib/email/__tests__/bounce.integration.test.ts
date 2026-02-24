// CS-WORK-028: Bounce handling, suppression, DSAR — integration tests
import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { eq } from "drizzle-orm"
import { getTestDb, resetDb, closeTestDb } from "@/db/test-utils"
import { seedTestUser, createSchedulerDb, createDecisionLogDb, InMemoryNotificationDb } from "@/db/test-fixtures"
import { deferredActions, decisionLogs } from "@/db/schema/shared"
import { correspondenceLog, suppressedEmails } from "@/db/schema/correspondence"
import { accountProfiles } from "@/db/schema/accounts"
import { handleBounce } from "../bounce-handler"
import type { BounceHandlerDeps } from "../bounce-handler"
import { getCorrespondenceForAccount, anonymiseCorrespondence } from "../correspondence-queries"

// Valid UUID for test accounts (decision_logs.accountId is uuid type)
const ACCOUNT_UUID = "00000000-0000-4000-8000-000000000001"
const ACCOUNT_UUID_2 = "00000000-0000-4000-8000-000000000002"

function createDeps(db: ReturnType<typeof getTestDb>): BounceHandlerDeps & { notificationDb: InMemoryNotificationDb } {
  const notificationDb = new InMemoryNotificationDb()
  return {
    db,
    decisionDb: createDecisionLogDb(db),
    schedulerDb: createSchedulerDb(db),
    notificationDb,
  }
}

async function insertCorrespondenceRow(
  db: ReturnType<typeof getTestDb>,
  overrides: Partial<typeof correspondenceLog.$inferInsert> = {},
) {
  const [row] = await db
    .insert(correspondenceLog)
    .values({
      threadId: "thread-1",
      direction: "outbound",
      status: "bounced",
      externalEmail: "user@test.com",
      templateId: "welcome",
      category: "transactional",
      providerMessageId: "resend-msg-001",
      ...overrides,
    })
    .returning()
  return row
}

const db = getTestDb()

beforeEach(async () => {
  await resetDb()
})

afterAll(async () => {
  await closeTestDb()
})

describe("Bounce handling integration", () => {
  // AC-14: Hard bounce suppression
  it("AC-14: hard bounce suppresses account and email, logs decision", async () => {
    await seedTestUser(db, ACCOUNT_UUID, "user@test.com")
    const row = await insertCorrespondenceRow(db, { accountId: ACCOUNT_UUID })

    const deps = createDeps(db)
    await handleBounce(deps, {
      correspondenceLogId: row.id,
      bounceType: "hard",
      providerMessageId: "resend-msg-001",
      accountId: ACCOUNT_UUID,
      email: "user@test.com",
    })

    // Account-level suppression
    const [profile] = await db
      .select({ suppressedAt: accountProfiles.suppressedAt, reason: accountProfiles.suppressionReason })
      .from(accountProfiles)
      .where(eq(accountProfiles.accountId, ACCOUNT_UUID))
    expect(profile.suppressedAt).not.toBeNull()
    expect(profile.reason).toBe("hard_bounce")

    // Email-level suppression
    const [suppressed] = await db
      .select()
      .from(suppressedEmails)
      .where(eq(suppressedEmails.email, "user@test.com"))
    expect(suppressed).toBeDefined()
    expect(suppressed.reason).toBe("hard_bounce")

    // Decision logged
    const decisions = await db
      .select()
      .from(decisionLogs)
      .where(eq(decisionLogs.decisionType, "email_suppressed"))
    expect(decisions).toHaveLength(1)
    expect(decisions[0].domain).toBe("platform")
    expect((decisions[0].inputs as Record<string, unknown>).reason).toBe("hard_bounce")
  })

  // AC-15: Soft bounce schedules retry
  it("AC-15: soft bounce schedules retry_bounced_email with originalParams", async () => {
    const row = await insertCorrespondenceRow(db, { accountId: null })

    const deps = createDeps(db)
    await handleBounce(deps, {
      correspondenceLogId: row.id,
      bounceType: "soft",
      providerMessageId: "resend-msg-001",
      accountId: null,
      email: "user@test.com",
    })

    const actions = await db
      .select()
      .from(deferredActions)
      .where(eq(deferredActions.action, "retry_bounced_email"))
    expect(actions).toHaveLength(1)
    expect(actions[0].retryPolicy).toBe("once")
    expect(actions[0].onFailure).toBe("log")

    const params = actions[0].params as Record<string, unknown>
    expect(params.correspondenceLogId).toBe(row.id)
    expect(params.originalParams).toBeDefined()
    const originalParams = params.originalParams as Record<string, unknown>
    expect(originalParams.to).toBe("user@test.com")
    expect(originalParams.template).toBe("welcome")
  })

  // AC-16: 3+ bounces creates admin notification
  it("AC-16: 3+ bounces in 90 days creates admin notification", async () => {
    // Insert 3 bounced rows without accountId (no FK constraint needed)
    await insertCorrespondenceRow(db, { accountId: null, providerMessageId: "msg-1" })
    await insertCorrespondenceRow(db, { accountId: null, providerMessageId: "msg-2" })
    const row3 = await insertCorrespondenceRow(db, { accountId: null, providerMessageId: "msg-3" })

    const deps = createDeps(db)
    await handleBounce(deps, {
      correspondenceLogId: row3.id,
      bounceType: "hard",
      providerMessageId: "msg-3",
      accountId: null,
      email: "user@test.com",
    })

    const notifications = deps.notificationDb.getAll()
    expect(notifications.length).toBeGreaterThanOrEqual(1)
    expect(notifications.some(n => n.body.includes("3"))).toBe(true)
  })
})

describe("DSAR correspondence queries integration", () => {
  // AC-17: getCorrespondenceForAccount
  it("AC-17: returns rows matching by accountId OR externalEmail", async () => {
    await seedTestUser(db, ACCOUNT_UUID, "alice@test.com")

    await db.insert(correspondenceLog).values([
      {
        threadId: "t1", direction: "outbound", status: "sent",
        externalEmail: "alice@test.com", accountId: ACCOUNT_UUID,
        templateId: "welcome", category: "transactional",
      },
      {
        threadId: "t2", direction: "outbound", status: "sent",
        externalEmail: "bob@test.com", accountId: null,
        templateId: "article_14_notice", category: "transactional",
      },
      {
        threadId: "t3", direction: "outbound", status: "sent",
        externalEmail: "alice@test.com", accountId: null,
        templateId: "article_14_notice", category: "transactional",
      },
    ])

    // Query by accountId
    const byAccount = await getCorrespondenceForAccount(db, { accountId: ACCOUNT_UUID })
    expect(byAccount).toHaveLength(1)

    // Query by email
    const byEmail = await getCorrespondenceForAccount(db, { email: "alice@test.com" })
    expect(byEmail).toHaveLength(2)

    // Query by both (OR)
    const byBoth = await getCorrespondenceForAccount(db, { accountId: ACCOUNT_UUID, email: "bob@test.com" })
    expect(byBoth).toHaveLength(2)
  })

  // AC-17: anonymiseCorrespondence
  it("AC-17: anonymise erases fields, retains skeleton", async () => {
    await seedTestUser(db, ACCOUNT_UUID_2, "target@test.com")

    await db.insert(correspondenceLog).values({
      threadId: "t1", direction: "outbound", status: "sent",
      externalEmail: "target@test.com", accountId: ACCOUNT_UUID_2,
      templateId: "welcome", category: "transactional",
      subject: "Welcome!", mergeFieldsHash: "abc123",
      bodyText: "Hello there",
    })

    const count = await anonymiseCorrespondence(db, { accountId: ACCOUNT_UUID_2 })
    expect(count).toBe(1)

    const [row] = await db.select().from(correspondenceLog)
    expect(row.externalEmail).toBe("[erased]")
    expect(row.subject).toBe("[erased]")
    expect(row.bodyText).toBe("[erased]")
    expect(row.mergeFieldsHash).toBeNull()
    expect(row.attachmentMeta).toBeNull()
    expect(row.accountId).toBeNull()

    // Skeleton retained
    expect(row.id).toBeDefined()
    expect(row.threadId).toBe("t1")
    expect(row.direction).toBe("outbound")
    expect(row.status).toBe("sent")
    expect(row.templateId).toBe("welcome")
    expect(row.createdAt).toBeDefined()
  })
})
