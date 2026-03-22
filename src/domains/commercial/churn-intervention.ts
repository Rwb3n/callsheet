// Churn detection and intervention — S8 §2, CR §2.3
// evaluateChurnIntervention: decision architecture for voluntary cancellation retention.
// logChurnEvent: writes to churn_analysis_log for all 5 churn paths.
// emitChurnRiskDetected / emitPendingCancellation: typed event emission helpers.

import { eq } from "drizzle-orm"
import type { Db } from "@/db/types"
import type { DecisionLogDb } from "@/lib/decisions/logger"
import type { InProcessEventBus } from "@/lib/events/bus"
import type { WaitUntilFn } from "@/lib/events/waitUntil"
import type { SubscriptionTier, ChurnRiskFactor } from "@/lib/events/types"
import type { CancellationReason } from "@/domains/commercial/subscription/types"
import { logDecision } from "@/lib/decisions/logger"
import { churnAnalysisLog, commercialState } from "@/db/schema/commercial"
import { PRICING } from "./pricing-config"
import type { EngagementCounters } from "@/domains/data-and-listings/queries/engagement-counters"

// --- Types ---

export type { EngagementCounters }

export type ChurnInterventionInput = {
  listingId: string
  accountId: string
  cancellationReason: CancellationReason
  previousTier: SubscriptionTier
  recentEngagement: EngagementCounters
  subscriptionStartDate: string | null
  lastChurnEventAt: string | null
}

export type ChurnInterventionResult =
  | { action: "show_retention_data"; data: { enquiries: number; views: number }; message: string }
  | { action: "accept"; reason: string }
  | { action: "grace_period"; duration: "14_days"; fallback: "downgrade_to_free" }

export type ChurnInterventionDeps = {
  db: Db
  decisionLogDb: DecisionLogDb
  bus: InProcessEventBus
  waitUntilFn: WaitUntilFn
}

// --- Pure decision function (AC-14, AC-15) ---

export function evaluateChurnIntervention(input: ChurnInterventionInput): ChurnInterventionResult {
  if (input.cancellationReason === "payment_failure") {
    return { action: "grace_period", duration: "14_days", fallback: "downgrade_to_free" }
  }

  if (input.cancellationReason === "paddle_reconciliation") {
    return { action: "accept", reason: "paddle_reconciliation — no intervention" }
  }

  if (input.cancellationReason === "account_closed" || input.cancellationReason === "listing_archived") {
    return { action: "accept", reason: `${input.cancellationReason} — no intervention` }
  }

  // Voluntary cancellation — single data-driven prompt
  const recentEnquiries = input.recentEngagement.enquiriesReceived
  const recentViews = input.recentEngagement.profileViews

  if (recentEnquiries > 0 || recentViews > 50) {
    return {
      action: "show_retention_data",
      data: { enquiries: recentEnquiries, views: recentViews },
      message:
        `In the last 30 days, your listing received ${recentEnquiries} enquiries and ` +
        `${recentViews} profile views. These will continue on the free tier, but without ` +
        `priority placement or analytics.`,
    }
  }

  return { action: "accept", reason: "low_engagement — retention unlikely" }
}

// --- Decision logging (AC-21) ---

function daysSince(date: string | null): number {
  if (!date) return Infinity
  return (Date.now() - new Date(date).getTime()) / (1000 * 60 * 60 * 24)
}

export async function logChurnInterventionDecision(
  decisionLogDb: DecisionLogDb,
  input: ChurnInterventionInput,
  result: ChurnInterventionResult,
): Promise<void> {
  await logDecision(decisionLogDb, {
    domain: "commercial",
    decisionType: "churn_intervention",
    inputs: {
      cancellationReason: input.cancellationReason,
      previousTier: input.previousTier,
      recentEnquiries: input.recentEngagement.enquiriesReceived,
      recentViews: input.recentEngagement.profileViews,
      subscriptionAgeDays: daysSince(input.subscriptionStartDate),
    },
    output: {
      action: result.action,
      reason: result.action === "accept" ? result.reason : undefined,
    },
    listingId: input.listingId,
    accountId: input.accountId,
  })
}

// --- Churn analysis logging (AC-20) ---

export type LogChurnEventParams = {
  listingId: string
  accountId: string | null
  eventType: "churn" | "renewal"
  reason: string
  subscriptionTier: SubscriptionTier | null
  metadata?: Record<string, unknown>
}

export async function logChurnEvent(db: Db, params: LogChurnEventParams): Promise<void> {
  const annualRevenue = computeAnnualRevenue(params.eventType, params.subscriptionTier)

  await db.insert(churnAnalysisLog).values({
    listingId: params.listingId,
    accountId: params.accountId,
    eventType: params.eventType,
    reason: params.reason,
    subscriptionTier: params.subscriptionTier,
    annualRevenue,
    metadata: params.metadata ?? null,
  })

  // Update commercial_state with last churn event
  if (params.eventType === "churn") {
    await updateChurnState(db, params.listingId, params.reason)
  }
}

function computeAnnualRevenue(eventType: string, tier: SubscriptionTier | null): number | null {
  if (eventType === "renewal") return null
  if (!tier || tier === "free") return 0
  return -PRICING[tier].annual
}

async function updateChurnState(db: Db, listingId: string, reason: string): Promise<void> {
  const [existing] = await db.select().from(commercialState).where(eq(commercialState.listingId, listingId)).limit(1)

  if (existing) {
    await db.update(commercialState).set({
      lastChurnEventAt: new Date(),
      lastChurnReason: reason,
      updatedAt: new Date(),
    }).where(eq(commercialState.listingId, listingId))
  } else {
    await db.insert(commercialState).values({
      listingId,
      lastChurnEventAt: new Date(),
      lastChurnReason: reason,
    })
  }
}

// --- Event emission helpers (AC-18, AC-19) ---

export function emitChurnRiskDetected(
  bus: InProcessEventBus,
  waitUntilFn: WaitUntilFn,
  listingId: string,
  accountId: string,
  riskFactors: ChurnRiskFactor[],
): void {
  waitUntilFn(
    bus.emit("churn_risk_detected", {
      _brand: "ChurnRiskDetectedEvent" as const,
      listingId,
      accountId,
      riskFactors,
      timestamp: new Date().toISOString(),
    }, waitUntilFn),
  )
}

export function emitPendingCancellation(
  bus: InProcessEventBus,
  waitUntilFn: WaitUntilFn,
  paddleSubscriptionId: string,
  listingId: string,
  reason: CancellationReason,
): void {
  waitUntilFn(
    bus.emit("pending_cancellation_created", {
      _brand: "PendingCancellationCreatedEvent" as const,
      paddleSubscriptionId,
      listingId,
      reason,
      timestamp: new Date().toISOString(),
    }, waitUntilFn),
  )
}

// --- V1 ChurnRiskFactor production (AC-17) ---
// V1 produces 3 of 5 factors. The remaining 2 require proactive periodic detection (S9).
export const V1_CHURN_RISK_FACTORS: ChurnRiskFactor[] = [
  "low_quality_paid",
  "payment_at_risk",
  "quality_declining",
]
