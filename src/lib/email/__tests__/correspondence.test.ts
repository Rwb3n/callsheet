// CS-WORK-026: EmailService correspondence logging — unit tests
import { describe, it, expect, beforeEach } from "vitest"
import { LoggingEmailService } from "../logging-service"
import { InMemoryEmailService, registerTemplate, clearTemplates } from "../index"
import { InMemoryCorrespondenceWriter, computeMergeFieldsHash } from "../correspondence"
import { InMemorySuppressionChecker } from "../suppression"
import type { EmailSendParams } from "../types"

function registerTestTemplate() {
  registerTemplate("welcome", (_data) => ({
    subject: "Welcome to CALLSHEET",
    html: "<p>Welcome</p>",
  }))
}

function createTestService() {
  const inner = new InMemoryEmailService()
  const writer = new InMemoryCorrespondenceWriter()
  const checker = new InMemorySuppressionChecker()
  const service = new LoggingEmailService(inner, writer, checker)
  return { service, inner, writer, checker }
}

const BASE_PARAMS: EmailSendParams = {
  to: "user@example.com",
  template: "welcome",
  data: { name: "Test User" },
  category: "transactional",
  accountId: "acc-123",
}

describe("LoggingEmailService", () => {
  beforeEach(() => {
    clearTemplates()
    registerTestTemplate()
  })

  // AC-05: system suppression check blocks ALL categories
  it("AC-05: suppresses send without calling inner service when account suppressed", async () => {
    const { service, inner, writer, checker } = createTestService()
    checker.suppressAccount("acc-123", "hard_bounce")

    const result = await service.send(BASE_PARAMS)

    expect(result.status).toBe("suppressed")
    expect(result.messageId).toBeNull()
    expect(result.threadId).toBeDefined()
    expect(inner.getCalls()).toHaveLength(0)

    const rows = writer.getRows()
    expect(rows).toHaveLength(1)
    expect(rows[0].status).toBe("suppressed")
  })

  it("AC-05: suppresses transactional email when email-level suppressed (no accountId)", async () => {
    const { service, inner, writer, checker } = createTestService()
    checker.suppressEmail("user@example.com", "hard_bounce")

    const result = await service.send({ ...BASE_PARAMS, accountId: undefined })

    expect(result.status).toBe("suppressed")
    expect(inner.getCalls()).toHaveLength(0)
    expect(writer.getRows()).toHaveLength(1)
  })

  // AC-06: every send inserts one correspondence_log row
  it("AC-06: inserts correspondence_log row on successful send", async () => {
    const { service, writer } = createTestService()

    const result = await service.send(BASE_PARAMS)

    expect(result.status).toBe("sent")
    const rows = writer.getRows()
    expect(rows).toHaveLength(1)
    expect(rows[0].direction).toBe("outbound")
    expect(rows[0].templateId).toBe("welcome")
    expect(rows[0].category).toBe("transactional")
    expect(rows[0].externalEmail).toBe("user@example.com")
    expect(rows[0].accountId).toBe("acc-123")
    expect(rows[0].status).toBe("sent")
    expect(rows[0].subject).toBe("Welcome to CALLSHEET")
  })

  it("AC-06: suppressed row has rendered subject (DD-5)", async () => {
    const { service, writer, checker } = createTestService()
    checker.suppressAccount("acc-123", "hard_bounce")

    await service.send(BASE_PARAMS)

    const rows = writer.getRows()
    expect(rows[0].subject).toBe("Welcome to CALLSHEET")
    expect(rows[0].status).toBe("suppressed")
  })

  it("AC-06: listingId stored when provided", async () => {
    const { service, writer } = createTestService()
    const listingId = "550e8400-e29b-41d4-a716-446655440000"

    await service.send({ ...BASE_PARAMS, listingId })

    expect(writer.getRows()[0].listingId).toBe(listingId)
  })

  it("AC-06: listingId null when not provided", async () => {
    const { service, writer } = createTestService()

    await service.send(BASE_PARAMS)

    expect(writer.getRows()[0].listingId).toBeNull()
  })

  // AC-07: mergeFieldsHash is SHA-256, deterministic
  it("AC-07: mergeFieldsHash is deterministic SHA-256 of sorted keys", () => {
    const hash1 = computeMergeFieldsHash({ b: 2, a: 1 })
    const hash2 = computeMergeFieldsHash({ a: 1, b: 2 })

    expect(hash1).toBe(hash2)
    expect(hash1).toMatch(/^[a-f0-9]{64}$/)
  })

  it("AC-07: different data produces different hash", () => {
    const hash1 = computeMergeFieldsHash({ name: "Alice" })
    const hash2 = computeMergeFieldsHash({ name: "Bob" })

    expect(hash1).not.toBe(hash2)
  })

  it("AC-07: mergeFieldsHash stored on correspondence row", async () => {
    const { service, writer } = createTestService()

    await service.send(BASE_PARAMS)

    const row = writer.getRows()[0]
    expect(row.mergeFieldsHash).toMatch(/^[a-f0-9]{64}$/)
    expect(row.mergeFieldsHash).toBe(computeMergeFieldsHash(BASE_PARAMS.data))
  })

  // AC-08: threadId handling
  it("AC-08: uses provided threadId when present", async () => {
    const { service, writer } = createTestService()
    const customThreadId = "enquiry-123"

    const result = await service.send({ ...BASE_PARAMS, threadId: customThreadId })

    expect(result.threadId).toBe(customThreadId)
    expect(writer.getRows()[0].threadId).toBe(customThreadId)
  })

  it("AC-08: generates UUID threadId when omitted", async () => {
    const { service, writer } = createTestService()

    const result = await service.send(BASE_PARAMS)

    expect(result.threadId).toBeDefined()
    expect(result.threadId).toMatch(/^[0-9a-f-]{36}$/)
    expect(writer.getRows()[0].threadId).toBe(result.threadId)
  })

  it("AC-08: existing callers unaffected (threadId and listingId optional)", async () => {
    const { service } = createTestService()

    // Calling without threadId or listingId — should work without errors
    const result = await service.send({
      to: "other@test.com",
      template: "welcome",
      data: {},
      category: "transactional",
    })

    expect(result.status).toBe("sent")
    expect(result.threadId).toBeDefined()
  })
})
