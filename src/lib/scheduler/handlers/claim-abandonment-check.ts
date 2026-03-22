// claim_abandonment_check deferred action handler — S9 §1.5, AC-12/13/21
// Scans for listings stuck in pending_review > 90 days, reverts to unclaimed.

import { eq, and, lte } from "drizzle-orm"
import type { Db } from "@/db/types"
import type { ActionHandlerRegistry } from "@/lib/scheduler"
import type { SchedulerDb } from "@/lib/scheduler/api"
import { scheduleDeferredAction } from "@/lib/scheduler/api"
import { listings } from "@/db/schema/data-and-listings"

const ABANDONMENT_DAYS = 90
const SELF_PERPETUATION_MS = 24 * 60 * 60 * 1000 // 24 hours

export type ClaimAbandonmentCheckDeps = {
  db: Db
  schedulerDb: SchedulerDb
}

export function registerClaimAbandonmentCheckHandler(
  registry: ActionHandlerRegistry,
  deps: ClaimAbandonmentCheckDeps,
): void {
  registry.register("claim_abandonment_check", async () => {
    const now = new Date()
    const cutoff = new Date(now.getTime() - ABANDONMENT_DAYS * 24 * 60 * 60 * 1000)

    // AC-12: scan for abandoned claims
    const abandonedListings = await deps.db
      .select({ id: listings.id })
      .from(listings)
      .where(
        and(
          eq(listings.claimStatus, "pending_review"),
          lte(listings.claimSubmittedAt, cutoff),
        ),
      )

    let abandonedCount = 0

    for (const listing of abandonedListings) {
      // Reset claim status to unclaimed
      await deps.db
        .update(listings)
        .set({
          claimStatus: "unclaimed",
          accountId: null,
          claimSubmittedAt: null,
        })
        .where(eq(listings.id, listing.id))

      // AC-13: schedule pre-claim snapshot cleanup
      await scheduleDeferredAction(deps.schedulerDb, {
        action: "pre_claim_snapshot_cleanup",
        params: { listingId: listing.id },
        executeAt: new Date(),
        retryPolicy: "once",
        onFailure: "log",
        createdBy: "claim_abandonment_check",
      })

      // Recalculate quality score (verification dimension drops to unclaimed = 0)
      await scheduleDeferredAction(deps.schedulerDb, {
        action: "quality_score_recalculation",
        params: { listingId: listing.id },
        executeAt: new Date(),
        retryPolicy: "retry_3",
        onFailure: "log",
        createdBy: "claim_abandonment_check",
      })

      abandonedCount++
    }

    if (abandonedCount > 0) {
      console.info(`[claim_abandonment_check] Reverted ${abandonedCount} abandoned claims to unclaimed`)
    }

    // AC-21: self-perpetuating — schedule next daily run
    await scheduleDeferredAction(deps.schedulerDb, {
      action: "claim_abandonment_check",
      params: {} as Record<string, never>,
      executeAt: new Date(now.getTime() + SELF_PERPETUATION_MS),
      retryPolicy: "once",
      onFailure: "log",
      createdBy: "claim_abandonment_check",
    })
  })
}
