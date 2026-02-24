// CS-WORK-027: Webhook handler — integration tests against real DB
import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { eq } from "drizzle-orm"
import { sql } from "drizzle-orm"
import { getTestDb, resetDb, closeTestDb } from "@/db/test-utils"
import { correspondenceLog } from "@/db/schema/correspondence"
import { eventConsumerErrors } from "@/db/schema/shared"
import { handleResendEvent } from "../webhook-handler"
import type { ResendWebhookEvent } from "../webhook-types"

function makeEvent(overrides: Partial<ResendWebhookEvent> & { type: ResendWebhookEvent["type"] }): ResendWebhookEvent {
  return {
    type: overrides.type,
    created_at: new Date().toISOString(),
    data: {
      email_id: "resend-msg-001",
      to: ["user@test.com"],
      from: "noreply@callsheet.co.uk",
      subject: "Test",
      ...overrides.data,
    },
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
      status: "sent",
      externalEmail: "user@test.com",
      templateId: "welcome",
      category: "transactional",
      providerMessageId: "resend-msg-001",
      ...overrides,
    })
    .returning()
  return row
}

describe("Webhook handler integration", () => {
  const db = getTestDb()

  beforeEach(async () => {
    await resetDb()
  })

  afterAll(async () => {
    await closeTestDb()
  })

  // AC-09: email.delivered updates sent → delivered
  it("AC-09: email.delivered updates sent → delivered with explicit updatedAt", async () => {
    // Backdate updatedAt so the handler's new Date() is guaranteed later
    const pastDate = new Date(Date.now() - 60_000)
    const row = await insertCorrespondenceRow(db, { updatedAt: pastDate })

    const result = await handleResendEvent(db, makeEvent({ type: "email.delivered" }))

    expect(result).toEqual({ action: "updated", from: "sent", to: "delivered" })

    const [updated] = await db
      .select()
      .from(correspondenceLog)
      .where(eq(correspondenceLog.id, row.id))
    expect(updated.status).toBe("delivered")
    expect(updated.updatedAt.getTime()).toBeGreaterThan(pastDate.getTime())
  })

  // AC-10: opened, clicked, bounced, complained transitions
  it("AC-10: email.opened transitions delivered → opened", async () => {
    await insertCorrespondenceRow(db, { status: "delivered" })

    const result = await handleResendEvent(db, makeEvent({ type: "email.opened" }))

    expect(result).toEqual({ action: "updated", from: "delivered", to: "opened" })
    const [row] = await db.select().from(correspondenceLog)
    expect(row.status).toBe("opened")
  })

  it("AC-10: email.clicked transitions opened → clicked", async () => {
    await insertCorrespondenceRow(db, { status: "opened" })

    const result = await handleResendEvent(db, makeEvent({ type: "email.clicked" }))

    expect(result).toEqual({ action: "updated", from: "opened", to: "clicked" })
    const [row] = await db.select().from(correspondenceLog)
    expect(row.status).toBe("clicked")
  })

  it("AC-10: email.bounced transitions sent → bounced", async () => {
    let bounceParams: Record<string, unknown> | null = null
    await insertCorrespondenceRow(db)

    const result = await handleResendEvent(
      db,
      makeEvent({
        type: "email.bounced",
        data: {
          email_id: "resend-msg-001",
          to: ["user@test.com"],
          from: "noreply@callsheet.co.uk",
          subject: "Test",
          bounce: { type: "hard", message: "Mailbox not found" },
        },
      }),
      async (params) => { bounceParams = params },
    )

    expect(result).toEqual({ action: "updated", from: "sent", to: "bounced" })
    const [row] = await db.select().from(correspondenceLog)
    expect(row.status).toBe("bounced")
    expect(bounceParams).not.toBeNull()
  })

  it("AC-10: email.complained treated as hard bounce from any state", async () => {
    await insertCorrespondenceRow(db, { status: "delivered" })
    let bounceType: string | null = null

    const result = await handleResendEvent(
      db,
      makeEvent({ type: "email.complained" }),
      async (params) => { bounceType = params.bounceType },
    )

    expect(result).toEqual({ action: "updated", from: "delivered", to: "bounced" })
    expect(bounceType).toBe("hard")
    const [row] = await db.select().from(correspondenceLog)
    expect(row.status).toBe("bounced")
  })

  // AC-11: same-state no-op and invalid transitions
  it("AC-11: duplicate delivered event is no-op", async () => {
    await insertCorrespondenceRow(db, { status: "delivered" })

    const result = await handleResendEvent(db, makeEvent({ type: "email.delivered" }))

    expect(result).toEqual({ action: "no_op", reason: "same_state" })
  })

  it("AC-11: invalid transition logged to event_consumer_errors", async () => {
    await insertCorrespondenceRow(db, { status: "sent" })

    const result = await handleResendEvent(db, makeEvent({ type: "email.clicked" }))

    expect(result).toEqual({ action: "invalid_transition", from: "sent", to: "clicked" })
    const errors = await db.select().from(eventConsumerErrors)
    expect(errors).toHaveLength(1)
    expect(errors[0].consumerId).toBe("email_webhook_handler")
    expect(errors[0].error).toContain("sent → clicked")
  })

  it("AC-11: unknown providerMessageId returns not_found (200 response)", async () => {
    const result = await handleResendEvent(
      db,
      makeEvent({ type: "email.delivered", data: { email_id: "unknown-id", to: ["x@x.com"], from: "a@b.com", subject: "x" } }),
    )

    expect(result).toEqual({ action: "not_found" })
  })

  // AC-13: bounce delegates to bounce handler
  it("AC-13: email.bounced passes bounceType from Resend payload to handler", async () => {
    const row = await insertCorrespondenceRow(db, { accountId: null })
    let receivedParams: Record<string, unknown> | null = null

    await handleResendEvent(
      db,
      makeEvent({
        type: "email.bounced",
        data: {
          email_id: "resend-msg-001",
          to: ["user@test.com"],
          from: "noreply@callsheet.co.uk",
          subject: "Test",
          bounce: { type: "soft", message: "Mailbox full" },
        },
      }),
      async (params) => { receivedParams = params },
    )

    expect(receivedParams).toMatchObject({
      correspondenceLogId: row.id,
      bounceType: "soft",
      providerMessageId: "resend-msg-001",
      email: "user@test.com",
    })
  })
})
