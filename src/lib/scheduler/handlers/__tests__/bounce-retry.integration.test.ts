// retry_bounced_email handler integration test
import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { eq } from "drizzle-orm"
import { getTestDb, resetDb, closeTestDb } from "@/db/test-utils"
import { correspondenceLog } from "@/db/schema/correspondence"
import { ActionHandlerRegistry } from "@/lib/scheduler"
import { InMemoryEmailService, clearTemplates, registerTemplate } from "@/lib/email"
import { registerBounceRetryHandler } from "../bounce-retry"
import { invokeHandler } from "./invoke-handler"
import type { EmailSendParams } from "@/lib/email/types"

const db = getTestDb()

async function insertCorrespondenceRow(
  overrides: Partial<typeof correspondenceLog.$inferInsert> = {},
) {
  const [row] = await db
    .insert(correspondenceLog)
    .values({
      threadId: "thread-retry-1",
      direction: "outbound",
      status: "bounced",
      externalEmail: "user@test.com",
      templateId: "welcome",
      category: "transactional",
      providerMessageId: "resend-retry-001",
      ...overrides,
    })
    .returning()
  return row
}

beforeEach(async () => {
  await resetDb()
  clearTemplates()
  registerTemplate("welcome", () => ({ subject: "Welcome", html: "<p>Hi</p>" }))
})

afterAll(async () => {
  await closeTestDb()
})

describe("retry_bounced_email handler", () => {
  it("re-sends the email when correspondence row is still bounced", async () => {
    const row = await insertCorrespondenceRow()
    const emailService = new InMemoryEmailService()
    const registry = new ActionHandlerRegistry()
    registerBounceRetryHandler(registry, { db, emailService })

    const originalParams: EmailSendParams = {
      to: "user@test.com",
      template: "welcome",
      data: { name: "Test" },
      category: "transactional",
    }

    await invokeHandler(registry, "retry_bounced_email", { correspondenceLogId: row.id, originalParams })

    expect(emailService.getCalls()).toHaveLength(1)
    expect(emailService.getCalls()[0].to).toBe("user@test.com")
    expect(emailService.getCalls()[0].template).toBe("welcome")
  })

  it("skips re-send when correspondence row status is no longer bounced", async () => {
    const row = await insertCorrespondenceRow({ status: "delivered" })
    const emailService = new InMemoryEmailService()
    const registry = new ActionHandlerRegistry()
    registerBounceRetryHandler(registry, { db, emailService })

    const originalParams: EmailSendParams = {
      to: "user@test.com",
      template: "welcome",
      data: {},
      category: "transactional",
    }

    await invokeHandler(registry, "retry_bounced_email", { correspondenceLogId: row.id, originalParams })

    expect(emailService.getCalls()).toHaveLength(0)
  })

  it("skips re-send when correspondence row does not exist", async () => {
    const emailService = new InMemoryEmailService()
    const registry = new ActionHandlerRegistry()
    registerBounceRetryHandler(registry, { db, emailService })

    const originalParams: EmailSendParams = {
      to: "user@test.com",
      template: "welcome",
      data: {},
      category: "transactional",
    }

    await invokeHandler(registry, "retry_bounced_email", { correspondenceLogId: "00000000-0000-4000-8000-000000000099", originalParams })

    expect(emailService.getCalls()).toHaveLength(0)
  })
})
