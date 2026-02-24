// CS-WORK-026: Correspondence logging — integration tests against real DB
import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { eq } from "drizzle-orm"
import { getTestDb, resetDb, closeTestDb } from "@/db/test-utils"
import { correspondenceLog } from "@/db/schema/correspondence"
import { DbCorrespondenceWriter, computeMergeFieldsHash } from "../correspondence"
import { DbSuppressionChecker } from "../suppression"
import { accountProfiles } from "@/db/schema/accounts"
import { suppressedEmails } from "@/db/schema/correspondence"
import { LoggingEmailService } from "../logging-service"
import { InMemoryEmailService, registerTemplate, clearTemplates, hasTemplate } from "../index"
import { sql } from "drizzle-orm"

function registerWelcomeTemplate() {
  if (!hasTemplate("welcome")) {
    registerTemplate("welcome", (_data) => ({
      subject: "Welcome to CALLSHEET",
      html: "<p>Welcome</p>",
    }))
  }
}

// Create a test user for FK constraints
async function createTestUser(db: ReturnType<typeof getTestDb>, id: string, email: string) {
  await db.execute(
    sql`INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at) VALUES (${id}, ${"Test User"}, ${email}, true, now(), now())`,
  )
}

describe("Correspondence logging integration", () => {
  const db = getTestDb()

  beforeEach(async () => {
    await resetDb()
    clearTemplates()
    registerWelcomeTemplate()
  })

  afterAll(async () => {
    await closeTestDb()
  })

  it("AC-06: LoggingEmailService inserts correspondence_log row in DB", async () => {
    await createTestUser(db, "user-1", "user@test.com")
    await db.insert(accountProfiles).values({
      accountId: "user-1",
      fullName: "Test User",
    })

    const inner = new InMemoryEmailService()
    const writer = new DbCorrespondenceWriter(db)
    const checker = new DbSuppressionChecker(db)
    const service = new LoggingEmailService(inner, writer, checker)

    const result = await service.send({
      to: "user@test.com",
      template: "welcome",
      data: { name: "Test" },
      category: "transactional",
      accountId: "user-1",
    })

    expect(result.status).toBe("sent")

    const rows = await db.select().from(correspondenceLog)
    expect(rows).toHaveLength(1)
    expect(rows[0].direction).toBe("outbound")
    expect(rows[0].templateId).toBe("welcome")
    expect(rows[0].accountId).toBe("user-1")
    expect(rows[0].externalEmail).toBe("user@test.com")
    expect(rows[0].status).toBe("sent")
    expect(rows[0].subject).toBe("Welcome to CALLSHEET")
    expect(rows[0].mergeFieldsHash).toMatch(/^[a-f0-9]{64}$/)
    expect(rows[0].threadId).toBe(result.threadId)
  })

  it("AC-05: account-level suppression blocks send", async () => {
    await createTestUser(db, "user-2", "suppressed@test.com")
    await db.insert(accountProfiles).values({
      accountId: "user-2",
      fullName: "Suppressed User",
      suppressedAt: new Date(),
      suppressionReason: "hard_bounce",
    })

    const inner = new InMemoryEmailService()
    const writer = new DbCorrespondenceWriter(db)
    const checker = new DbSuppressionChecker(db)
    const service = new LoggingEmailService(inner, writer, checker)

    const result = await service.send({
      to: "suppressed@test.com",
      template: "welcome",
      data: {},
      category: "transactional",
      accountId: "user-2",
    })

    expect(result.status).toBe("suppressed")
    expect(inner.getCalls()).toHaveLength(0)

    const rows = await db.select().from(correspondenceLog)
    expect(rows).toHaveLength(1)
    expect(rows[0].status).toBe("suppressed")
    expect(rows[0].subject).toBe("Welcome to CALLSHEET")
  })

  it("AC-05: email-level suppression blocks send for non-account addresses", async () => {
    await db.insert(suppressedEmails).values({
      email: "bounced@old-company.com",
      reason: "hard_bounce",
    })

    const inner = new InMemoryEmailService()
    const writer = new DbCorrespondenceWriter(db)
    const checker = new DbSuppressionChecker(db)
    const service = new LoggingEmailService(inner, writer, checker)

    const result = await service.send({
      to: "bounced@old-company.com",
      template: "welcome",
      data: {},
      category: "transactional",
    })

    expect(result.status).toBe("suppressed")
    expect(inner.getCalls()).toHaveLength(0)
  })

  it("AC-08: custom threadId used when provided", async () => {
    const inner = new InMemoryEmailService()
    const writer = new DbCorrespondenceWriter(db)
    const checker = new DbSuppressionChecker(db)
    const service = new LoggingEmailService(inner, writer, checker)

    const result = await service.send({
      to: "test@test.com",
      template: "welcome",
      data: {},
      category: "transactional",
      threadId: "custom-thread-abc",
    })

    expect(result.threadId).toBe("custom-thread-abc")
    const rows = await db.select().from(correspondenceLog)
    expect(rows[0].threadId).toBe("custom-thread-abc")
  })

  it("AC-07: mergeFieldsHash matches computed hash", async () => {
    const inner = new InMemoryEmailService()
    const writer = new DbCorrespondenceWriter(db)
    const checker = new DbSuppressionChecker(db)
    const service = new LoggingEmailService(inner, writer, checker)

    const data = { name: "Alice", company: "Test Co" }
    await service.send({
      to: "alice@test.com",
      template: "welcome",
      data,
      category: "transactional",
    })

    const rows = await db.select().from(correspondenceLog)
    expect(rows[0].mergeFieldsHash).toBe(computeMergeFieldsHash(data))
  })
})
