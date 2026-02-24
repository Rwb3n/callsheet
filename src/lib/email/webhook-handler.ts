// Resend webhook event handler — Communications Phase 1
// Looks up correspondence_log by providerMessageId, validates transition, updates status.

import { eq } from "drizzle-orm"
import type { Db } from "@/db/types"
import { correspondenceLog } from "@/db/schema/correspondence"
import { eventConsumerErrors } from "@/db/schema/shared"
import type { ResendWebhookEvent, ResendBounceType } from "./webhook-types"

type CorrespondenceStatus = "sent" | "delivered" | "opened" | "clicked" | "bounced" | "failed" | "received" | "suppressed"

// Valid status transitions — key is current status, value is set of allowed next statuses
const VALID_TRANSITIONS: Record<string, Set<string>> = {
  sent: new Set(["delivered", "bounced", "failed"]),
  delivered: new Set(["opened"]),
  opened: new Set(["clicked"]),
}

export type WebhookHandlerResult =
  | { action: "updated"; from: string; to: string }
  | { action: "no_op"; reason: string }
  | { action: "invalid_transition"; from: string; to: string }
  | { action: "not_found" }

export type BounceHandler = (params: {
  correspondenceLogId: string
  bounceType: ResendBounceType
  providerMessageId: string
  accountId: string | null
  email: string
}) => Promise<void>

export async function handleResendEvent(
  db: Db,
  event: ResendWebhookEvent,
  onBounce?: BounceHandler,
): Promise<WebhookHandlerResult> {
  const providerMessageId = event.data.email_id
  const targetStatus = mapEventToStatus(event.type)
  if (!targetStatus) return { action: "no_op", reason: "unhandled_event_type" }

  // Look up by providerMessageId
  const [row] = await db
    .select({
      id: correspondenceLog.id,
      status: correspondenceLog.status,
      accountId: correspondenceLog.accountId,
      externalEmail: correspondenceLog.externalEmail,
    })
    .from(correspondenceLog)
    .where(eq(correspondenceLog.providerMessageId, providerMessageId))
    .limit(1)

  if (!row) return { action: "not_found" }

  const currentStatus = row.status

  // Same-state transition → no-op
  if (currentStatus === targetStatus) {
    return { action: "no_op", reason: "same_state" }
  }

  // email.complained → treated as hard bounce, from any state
  if (event.type === "email.complained") {
    await db
      .update(correspondenceLog)
      .set({ status: "bounced", updatedAt: new Date() })
      .where(eq(correspondenceLog.id, row.id))

    if (onBounce) {
      await onBounce({
        correspondenceLogId: row.id,
        bounceType: "hard",
        providerMessageId,
        accountId: row.accountId,
        email: row.externalEmail,
      })
    }

    return { action: "updated", from: currentStatus, to: "bounced" }
  }

  // Validate transition
  const allowed = VALID_TRANSITIONS[currentStatus]
  if (!allowed || !allowed.has(targetStatus)) {
    await logInvalidTransition(db, event, currentStatus, targetStatus)
    return { action: "invalid_transition", from: currentStatus, to: targetStatus }
  }

  // Apply status update
  await db
    .update(correspondenceLog)
    .set({ status: targetStatus as CorrespondenceStatus, updatedAt: new Date() })
    .where(eq(correspondenceLog.id, row.id))

  // Delegate bounces
  if (targetStatus === "bounced" && onBounce) {
    await onBounce({
      correspondenceLogId: row.id,
      bounceType: event.data.bounce?.type ?? "hard",
      providerMessageId,
      accountId: row.accountId,
      email: row.externalEmail,
    })
  }

  return { action: "updated", from: currentStatus, to: targetStatus }
}

function mapEventToStatus(eventType: string): CorrespondenceStatus | null {
  switch (eventType) {
    case "email.delivered": return "delivered"
    case "email.opened": return "opened"
    case "email.clicked": return "clicked"
    case "email.bounced": return "bounced"
    case "email.complained": return "bounced"
    default: return null
  }
}

async function logInvalidTransition(
  db: Db,
  event: ResendWebhookEvent,
  currentStatus: string,
  targetStatus: string,
): Promise<void> {
  await db.insert(eventConsumerErrors).values({
    eventType: event.type,
    consumerDomain: "platform",
    consumerId: "email_webhook_handler",
    payload: event as unknown as Record<string, unknown>,
    error: `Invalid transition: ${currentStatus} → ${targetStatus}`,
    mode: "async",
  })
}
