// Intelligence consumer: claim_approved — AC-96
// Schedules quality recalc (+5 verification), upgrades enrichment to claimed cadence,
// records L2/L3 hypothesis tracking.

import { eq } from "drizzle-orm"
import type { Db } from "@/db/types"
import type { SchedulerDb } from "@/lib/scheduler/api"
import { scheduleDeferredAction, cancelDeferredAction } from "@/lib/scheduler/api"
import { enrichmentSchedules } from "@/db/schema/intelligence"
import type { EventHandler } from "@/lib/events/types"
import { scheduleEnrichmentForListing, updateHypothesisTracking } from "./helpers"

export type ClaimApprovedDeps = {
  db: Db
  schedulerDb: SchedulerDb
}

export function claimApprovedHandler(deps: ClaimApprovedDeps): EventHandler<"claim_approved"> {
  return {
    domain: "intelligence",
    eventType: "claim_approved",
    mode: "async",
    handler: async (event) => {
      // Schedule quality recalc — verification score gains +5
      await scheduleDeferredAction(deps.schedulerDb, {
        action: "quality_score_recalculation",
        params: { listingId: event.listingId },
        executeAt: new Date(Date.now() + 1 * 60 * 1000),
        retryPolicy: "once",
        onFailure: "log",
        createdBy: "intelligence:claim_approved",
      })

      // Upgrade enrichment: delete unclaimed schedules, create claimed cadence
      await deps.db
        .delete(enrichmentSchedules)
        .where(eq(enrichmentSchedules.listingId, event.listingId))

      // Cancel existing liveness checks scheduled under unclaimed cadence
      await cancelDeferredAction(deps.schedulerDb, {
        action: "decay_liveness_check",
        filterParams: { listingId: event.listingId },
        cancelledBy: "intelligence:claim_approved",
      })

      await scheduleEnrichmentForListing(
        deps.db,
        deps.schedulerDb,
        event.listingId,
        "claimed",
      )

      // Record L2 (verification drives engagement) and L3 (claimed listings are more accurate)
      await updateHypothesisTracking(deps.db, event.listingId, ["L2", "L3"])
    },
  }
}
