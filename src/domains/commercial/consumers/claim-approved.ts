// CR claim_approved consumer — S8 §10.3, AC-70, AC-71
// Resets conversion trigger state (CR-29), cancels win-back schedules, logs win-back attribution.

import { eq } from "drizzle-orm"
import type { Db } from "@/db/types"
import type { SchedulerDb } from "@/lib/scheduler/api"
import type { EventHandler } from "@/lib/events/types"
import { cancelDeferredAction } from "@/lib/scheduler/api"
import { commercialState, churnAnalysisLog } from "@/db/schema/commercial"

export type ClaimApprovedDeps = {
  db: Db
  schedulerDb: SchedulerDb
}

// AC-70/AC-79: Shared trigger field reset values (CR-29)
export const TRIGGER_RESET = {
  lastViewMilestoneFired: null,
  firstEnquiryTriggerFired: false,
  competitorUpgradedFired: 0,
  lastCompetitorUpgradedAt: null,
  analyticsTeaseFired: 0,
  lastAnalyticsTeaseAt: null,
  socialProofFired: 0,
  lastSocialProofAt: null,
  engagementSummaryFired: 0,
  lastEngagementSummaryAt: null,
  endowmentCtaShown: false,
} as const

export function claimApprovedHandler(
  deps: ClaimApprovedDeps,
): EventHandler<"claim_approved"> {
  return {
    domain: "commercial",
    eventType: "claim_approved",
    mode: "async",
    handler: async (payload) => {
      const { listingId, accountId } = payload
      const { db } = deps

      // Check for existing commercial_state (reclaim scenario)
      const [existing] = await db.select()
        .from(commercialState)
        .where(eq(commercialState.listingId, listingId))
        .limit(1)

      // AC-71: Cancel pending win-back schedules [CR-X-17]
      const cancelledCount = await cancelDeferredAction(deps.schedulerDb, {
        action: "win_back_evaluation",
        filterParams: { listingId },
        cancelledBy: "commercial",
      })

      // AC-71: If win-back was pending, log win_back_converted
      if (cancelledCount > 0) {
        await db.insert(churnAnalysisLog).values({
          listingId,
          accountId,
          eventType: "win_back_converted",
          metadata: { cancelledWinBacks: cancelledCount },
          createdAt: new Date(),
        })
      }

      // AC-70: Reset or create commercial_state (CR-29)
      if (existing) {
        // Preserve: lastChurnEventAt, lastChurnReason, effectivePriceAtSubscription
        await db.update(commercialState)
          .set({ ...TRIGGER_RESET, updatedAt: new Date() })
          .where(eq(commercialState.listingId, listingId))
      } else {
        await db.insert(commercialState).values({
          listingId,
          updatedAt: new Date(),
        })
      }
    },
  }
}
