// Win-back evaluation and delivery — S8 §3, CR §2.4
// evaluateWinBack: decision architecture for 60-day post-cancellation win-back.
// cancelWinBackSchedules: cancels pending win_back_evaluation deferred actions.
// checkWinBackAttribution: tracks win-back → resubscription conversions.

import { eq, and, gte } from "drizzle-orm"
import type { Db } from "@/db/types"
import type { DecisionLogDb } from "@/lib/decisions/logger"
import type { SchedulerDb } from "@/lib/scheduler/api"
import { cancelDeferredAction } from "@/lib/scheduler/api"
import { logDecision } from "@/lib/decisions/logger"
import { churnAnalysisLog } from "@/db/schema/commercial"
import { getEngagementCounters } from "@/domains/data-and-listings/queries/engagement-counters"

// --- Types ---

export type WinBackInput = {
  listingId: string
  cancelledAccountId: string
  listing: {
    lifecycleStatus: string
    accountId: string | null
    name: string
  }
  engagement: {
    enquiriesReceived: number
    profileViews: number
  }
}

export type WinbackMergeFields = {
  subject: string
  body: string
  listingName: string
  enquiryCount?: number
  viewCount?: number
}

export type WinBackResult =
  | { action: "no_action"; reason: string }
  | { action: "send_email"; mergeFields: WinbackMergeFields }

// --- Pure decision function (AC-23, AC-24) ---

const ENQUIRY_THRESHOLD = 3
const VIEW_THRESHOLD = 100

export function evaluateWinBack(input: WinBackInput): WinBackResult {
  // AC-23: listing must be active
  if (input.listing.lifecycleStatus !== "active") {
    return { action: "no_action", reason: "listing_not_active" }
  }

  // AC-23: ownership must match
  if (input.listing.accountId !== input.cancelledAccountId) {
    return { action: "no_action", reason: "listing_ownership_changed" }
  }

  // AC-24: engagement thresholds
  const enquiries = input.engagement.enquiriesReceived
  const views = input.engagement.profileViews

  if (enquiries > ENQUIRY_THRESHOLD || views > VIEW_THRESHOLD) {
    return {
      action: "send_email",
      mergeFields: buildMergeFields(input.listing.name, enquiries, views),
    }
  }

  return { action: "no_action", reason: "insufficient_engagement" }
}

function buildMergeFields(
  listingName: string,
  enquiries: number,
  views: number,
): WinbackMergeFields {
  const enquiryTriggered = enquiries > ENQUIRY_THRESHOLD
  const viewTriggered = views > VIEW_THRESHOLD

  const subject = `Your listing "${listingName}" is still getting attention`
  const body = enquiryTriggered
    ? `Since you left, "${listingName}" has received ${enquiries} enquiries. ` +
      `Re-subscribe to respond and keep your listing visible.`
    : `Since you left, "${listingName}" has been viewed ${views} times. ` +
      `Re-subscribe to keep your listing at the top of search results.`

  return {
    subject,
    body,
    listingName,
    ...(enquiryTriggered ? { enquiryCount: enquiries } : {}),
    ...(viewTriggered ? { viewCount: views } : {}),
  }
}

// --- Schedule cancellation (AC-26) ---

export async function cancelWinBackSchedules(
  schedulerDb: SchedulerDb,
  listingIds: string[],
  cancelledBy: string,
): Promise<number> {
  let total = 0
  for (const listingId of listingIds) {
    const count = await cancelDeferredAction(schedulerDb, {
      action: "win_back_evaluation",
      filterParams: { listingId },
      cancelledBy,
    })
    total += count
  }
  return total
}

// --- Win-back attribution (AC-27) ---

const ATTRIBUTION_WINDOW_MS = 90 * 24 * 60 * 60 * 1000 // 90 days

export async function checkWinBackAttribution(
  db: Db,
  listingId: string,
  accountId: string,
  resubscribeDate?: Date,
): Promise<boolean> {
  const now = resubscribeDate ?? new Date()
  const windowStart = new Date(now.getTime() - ATTRIBUTION_WINDOW_MS)

  // Find win_back_sent entries within 90-day window
  const sent = await db
    .select()
    .from(churnAnalysisLog)
    .where(
      and(
        eq(churnAnalysisLog.listingId, listingId),
        eq(churnAnalysisLog.eventType, "win_back_sent"),
        gte(churnAnalysisLog.createdAt, windowStart),
      ),
    )
    .limit(1)

  if (sent.length === 0) return false

  // Write win_back_converted entry with attribution metadata
  await db.insert(churnAnalysisLog).values({
    listingId,
    accountId,
    eventType: "win_back_converted",
    reason: "resubscription_within_90d",
    metadata: {
      attributedToSentAt: sent[0].createdAt.toISOString(),
      resubscribedAt: now.toISOString(),
      daysBetween: Math.floor((now.getTime() - sent[0].createdAt.getTime()) / (1000 * 60 * 60 * 24)),
    },
  })

  return true
}

// --- Decision logging (AC-28) ---

export async function logWinBackDecision(
  decisionLogDb: DecisionLogDb,
  input: WinBackInput,
  result: WinBackResult,
): Promise<void> {
  await logDecision(decisionLogDb, {
    domain: "commercial",
    decisionType: "winback_evaluation",
    inputs: {
      listingId: input.listingId,
      cancelledAccountId: input.cancelledAccountId,
      lifecycleStatus: input.listing.lifecycleStatus,
      ownershipMatch: input.listing.accountId === input.cancelledAccountId,
      enquiriesReceived: input.engagement.enquiriesReceived,
      profileViews: input.engagement.profileViews,
    },
    output: {
      action: result.action,
      reason: result.action === "no_action" ? result.reason : undefined,
    },
    listingId: input.listingId,
    additionalContext: { cancelledAccountId: input.cancelledAccountId },
  })
}

export { getEngagementCounters as getEngagementCountersForWinBack } from "@/domains/data-and-listings/queries/engagement-counters"
