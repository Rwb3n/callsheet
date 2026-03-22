// CR subscription_ended consumer — S8 §10.2, AC-67, AC-68, AC-69
// Branches on origin: paddle → intervention + win-back; archival/closure → churn log only.

import { eq } from "drizzle-orm"
import type { Db } from "@/db/types"
import type { DecisionLogDb } from "@/lib/decisions/logger"
import type { InProcessEventBus } from "@/lib/events/bus"
import type { WaitUntilFn } from "@/lib/events/waitUntil"
import type { EventHandler, ChurnRiskFactor } from "@/lib/events/types"
import type { SchedulerDb } from "@/lib/scheduler/api"
import { logDecision } from "@/lib/decisions/logger"
import { scheduleDeferredAction } from "@/lib/scheduler/api"
import { commercialState, churnAnalysisLog } from "@/db/schema/commercial"
import { PRICING } from "../pricing-config"

const WIN_BACK_DELAY_MS = 60 * 24 * 60 * 60 * 1000 // 60 days

export type SubscriptionEndedDeps = {
  db: Db
  decisionLogDb: DecisionLogDb
  schedulerDb: SchedulerDb
  bus: InProcessEventBus
  waitUntilFn: WaitUntilFn
}

export function subscriptionEndedHandler(
  deps: SubscriptionEndedDeps,
): EventHandler<"subscription_ended"> {
  return {
    domain: "commercial",
    eventType: "subscription_ended",
    mode: "async",
    handler: async (payload) => {
      const { listingId, accountId, previousTier, reason, origin } = payload
      const { db } = deps

      // AC-68: Build risk factors
      const riskFactors: ChurnRiskFactor[] = []
      if (reason === "grace_period_expired") riskFactors.push("payment_at_risk")

      const annualRevenue = -(PRICING[previousTier].annual)

      // AC-67/69: Log churn for all origins
      await db.insert(churnAnalysisLog).values({
        listingId,
        accountId,
        eventType: "churn",
        reason,
        subscriptionTier: previousTier,
        annualRevenue,
        metadata: { origin, ...(riskFactors.length > 0 ? { riskFactors } : {}) },
        createdAt: new Date(),
      })

      // AC-69: Update commercial_state for all origins
      await db.insert(commercialState)
        .values({
          listingId,
          lastChurnEventAt: new Date(),
          lastChurnReason: reason,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: commercialState.listingId,
          set: {
            lastChurnEventAt: new Date(),
            lastChurnReason: reason,
            updatedAt: new Date(),
          },
        })

      // AC-67: P3 origin branch — paddle only
      if (origin === "paddle") {
        // AC-68: Emit churn_risk_detected if risk factors exist
        if (riskFactors.length > 0) {
          await deps.bus.emit(
            "churn_risk_detected",
            {
              _brand: "ChurnRiskDetectedEvent" as const,
              listingId,
              accountId,
              riskFactors,
              timestamp: new Date().toISOString(),
            },
            deps.waitUntilFn,
          )
        }

        // AC-67: Schedule win-back at 60 days
        await scheduleDeferredAction(deps.schedulerDb, {
          action: "win_back_evaluation",
          params: { listingId, accountId },
          executeAt: new Date(Date.now() + WIN_BACK_DELAY_MS),
          retryPolicy: "once",
          onFailure: "log",
          createdBy: "commercial",
        })
      }

      await logDecision(deps.decisionLogDb, {
        domain: "commercial",
        decisionType: "churn_intervention",
        inputs: { reason, origin, previousTier },
        output: { winBackScheduled: origin === "paddle", riskFactors },
        listingId,
        accountId,
      })
    },
  }
}
