// CR erasure_completed consumer — S8 §10.8, AC-77, AC-78, AC-79
// Cancels win-back schedules, anonymises churn logs, clears trigger state.

import { eq, inArray } from "drizzle-orm"
import type { Db } from "@/db/types"
import type { SchedulerDb } from "@/lib/scheduler/api"
import type { EventHandler } from "@/lib/events/types"
import { cancelDeferredAction } from "@/lib/scheduler/api"
import { commercialState, churnAnalysisLog } from "@/db/schema/commercial"
import { TRIGGER_RESET } from "./claim-approved"

export type ErasureCompletedDeps = {
  db: Db
  schedulerDb: SchedulerDb
}

export function erasureCompletedHandler(
  deps: ErasureCompletedDeps,
): EventHandler<"erasure_completed"> {
  return {
    domain: "commercial",
    eventType: "erasure_completed",
    mode: "async",
    handler: async (payload) => {
      const { accountHash, listingIdsAnonymised, listingIdsDeleted } = payload
      const allListingIds = [...listingIdsAnonymised, ...listingIdsDeleted]
      const { db } = deps

      if (allListingIds.length === 0) return

      // AC-77: Cancel pending win-back schedules for all affected listings
      for (const lid of allListingIds) {
        await cancelDeferredAction(deps.schedulerDb, {
          action: "win_back_evaluation",
          filterParams: { listingId: lid },
          cancelledBy: "commercial",
        })
      }

      // AC-78: Anonymise churn_analysis_log entries — match by listingId, not accountId [CR-ST-15]
      await db.update(churnAnalysisLog)
        .set({
          accountId: null,
          accountHash,
        })
        .where(inArray(churnAnalysisLog.listingId, allListingIds))

      // AC-79: Clear conversion trigger state for affected listings (same reset as CR-29)
      for (const lid of allListingIds) {
        await db.update(commercialState)
          .set({ ...TRIGGER_RESET, updatedAt: new Date() })
          .where(eq(commercialState.listingId, lid))
      }
    },
  }
}
