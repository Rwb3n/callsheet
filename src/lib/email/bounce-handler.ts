// Bounce handling — Communications Phase 1
// Hard bounce → suppress (account + email level) + log email_suppressed decision.
// Soft bounce → schedule retry_bounced_email deferred action (24h).
// 3+ bounces in 90d → admin notification.

import { eq, and, gte, sql } from "drizzle-orm"
import type { Db } from "@/db/types"
import { accountProfiles } from "@/db/schema/accounts"
import { correspondenceLog } from "@/db/schema/correspondence"
import { suppressedEmails } from "@/db/schema/correspondence"
import type { DecisionLogDb } from "@/lib/decisions/logger"
import { logDecision } from "@/lib/decisions/logger"
import type { SchedulerDb } from "@/lib/scheduler/api"
import { scheduleDeferredAction } from "@/lib/scheduler/api"
import type { NotificationDb } from "@/lib/notifications/notifications"
import { createNotification } from "@/lib/notifications/notifications"
import type { ResendBounceType } from "./webhook-types"
import type { EmailSendParams } from "./types"

const BOUNCE_THRESHOLD = 3
const BOUNCE_WINDOW_DAYS = 90
const RETRY_DELAY_MS = 24 * 60 * 60 * 1000 // 24 hours

export type BounceHandlerDeps = {
  db: Db
  decisionDb: DecisionLogDb
  schedulerDb: SchedulerDb
  notificationDb: NotificationDb
}

type HandleBounceParams = {
  correspondenceLogId: string
  bounceType: ResendBounceType
  providerMessageId: string
  accountId: string | null
  email: string
}

export async function handleBounce(
  deps: BounceHandlerDeps,
  params: HandleBounceParams,
): Promise<void> {
  if (params.bounceType === "hard") {
    await suppressEmail(deps, params)
  } else {
    await scheduleSoftBounceRetry(deps, params)
  }

  await checkBounceThreshold(deps, params)
}

async function suppressEmail(
  deps: BounceHandlerDeps,
  params: HandleBounceParams,
): Promise<void> {
  // Account-level suppression
  if (params.accountId) {
    await deps.db
      .update(accountProfiles)
      .set({ suppressedAt: new Date(), suppressionReason: "hard_bounce" })
      .where(eq(accountProfiles.accountId, params.accountId))
  }

  // Email-level suppression (always)
  const normalised = params.email.toLowerCase().trim()
  await deps.db
    .insert(suppressedEmails)
    .values({
      email: normalised,
      reason: "hard_bounce",
      correspondenceLogId: params.correspondenceLogId,
    })
    .onConflictDoNothing()

  // Log decision
  await logDecision(deps.decisionDb, {
    domain: "platform",
    decisionType: "email_suppressed",
    inputs: {
      reason: "hard_bounce",
      providerMessageId: params.providerMessageId,
      email: params.email,
    },
    output: { suppressed: true },
    accountId: params.accountId ?? undefined,
  })
}

async function scheduleSoftBounceRetry(
  deps: BounceHandlerDeps,
  params: HandleBounceParams,
): Promise<void> {
  // Look up original send params from correspondence_log
  const [row] = await deps.db
    .select({
      templateId: correspondenceLog.templateId,
      category: correspondenceLog.category,
      externalEmail: correspondenceLog.externalEmail,
      accountId: correspondenceLog.accountId,
      listingId: correspondenceLog.listingId,
      threadId: correspondenceLog.threadId,
    })
    .from(correspondenceLog)
    .where(eq(correspondenceLog.id, params.correspondenceLogId))
    .limit(1)

  if (!row || !row.templateId || !row.category) return

  const originalParams: EmailSendParams = {
    to: row.externalEmail,
    template: row.templateId as EmailSendParams["template"],
    data: {},
    category: row.category as EmailSendParams["category"],
    accountId: row.accountId ?? undefined,
    listingId: row.listingId ?? undefined,
    threadId: row.threadId,
  }

  await scheduleDeferredAction(deps.schedulerDb, {
    action: "retry_bounced_email",
    params: {
      correspondenceLogId: params.correspondenceLogId,
      originalParams,
    },
    executeAt: new Date(Date.now() + RETRY_DELAY_MS),
    retryPolicy: "once",
    onFailure: "log",
    createdBy: "platform",
  })
}

async function checkBounceThreshold(
  deps: BounceHandlerDeps,
  params: HandleBounceParams,
): Promise<void> {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - BOUNCE_WINDOW_DAYS)

  const [result] = await deps.db
    .select({ count: sql<number>`count(*)::int` })
    .from(correspondenceLog)
    .where(
      and(
        eq(correspondenceLog.status, "bounced"),
        gte(correspondenceLog.createdAt, cutoff),
        params.accountId
          ? eq(correspondenceLog.accountId, params.accountId)
          : eq(correspondenceLog.externalEmail, params.email),
      ),
    )

  if (result && result.count >= BOUNCE_THRESHOLD) {
    // Admin notification for repeated bounces
    // Use a system admin account — admin notifications are for the entity, not a user
    await createNotification(deps.notificationDb, {
      accountId: "system",
      type: "billing_anomaly",
      title: "Repeated email bounces detected",
      body: `${result.count} bounces in ${BOUNCE_WINDOW_DAYS} days for ${params.accountId ?? params.email}`,
    })
  }
}
