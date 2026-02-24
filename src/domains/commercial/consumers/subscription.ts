// CR subscription event consumers — CR §2, S4 §10
// subscription_tier_changed: revenue metrics logging
// subscription_ended: churn log + win_back_evaluation scheduling (paddle-origin only) [AC-43]

import { scheduleDeferredAction, type SchedulerDb } from "@/lib/scheduler/api"
import { logDecision, type DecisionLogDb } from "@/lib/decisions/logger"
import type { EventHandler } from "@/lib/events/types"

const WIN_BACK_DELAY_MS = 60 * 24 * 60 * 60 * 1000 // 60 days

type CommercialConsumerDeps = {
  schedulerDb: SchedulerDb
  decisionLogDb: DecisionLogDb
}

export function subscriptionTierChangedRevenueMetricsHandler(
  deps: CommercialConsumerDeps,
): EventHandler<"subscription_tier_changed"> {
  return {
    domain: "commercial",
    eventType: "subscription_tier_changed",
    mode: "async",
    handler: async (payload) => {
      await logDecision(deps.decisionLogDb, {
        domain: "commercial",
        decisionType: "conversion_trigger_evaluation",
        inputs: {
          listingId: payload.listingId,
          previousTier: payload.previousTier,
          newTier: payload.newTier,
          event: "subscription_tier_changed",
        },
        output: { action: "revenue_metrics_logged" },
        listingId: payload.listingId,
      })
    },
  }
}

export function subscriptionEndedChurnAndWinbackHandler(
  deps: CommercialConsumerDeps,
): EventHandler<"subscription_ended"> {
  return {
    domain: "commercial",
    eventType: "subscription_ended",
    mode: "async",
    handler: async (payload) => {
      // Log churn for all origins
      await logDecision(deps.decisionLogDb, {
        domain: "commercial",
        decisionType: "churn_event_evaluation",
        inputs: {
          listingId: payload.listingId,
          accountId: payload.accountId,
          previousTier: payload.previousTier,
          reason: payload.reason,
          origin: payload.origin,
        },
        output: { action: "churn_logged" },
        listingId: payload.listingId,
        accountId: payload.accountId,
      })

      // Schedule win-back only for paddle-origin endings [AC-43]
      if (payload.origin === "paddle") {
        await scheduleDeferredAction(deps.schedulerDb, {
          action: "win_back_evaluation",
          params: { listingId: payload.listingId, accountId: payload.accountId },
          executeAt: new Date(Date.now() + WIN_BACK_DELAY_MS),
          retryPolicy: "retry_3",
          onFailure: "log",
          createdBy: "commercial",
        })
      }
    },
  }
}
