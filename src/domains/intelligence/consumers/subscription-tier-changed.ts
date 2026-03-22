// Intelligence consumer: subscription_tier_changed — AC-88
// Logs revenue perception signal, upgrades enrichment to paid cadence on upgrade,
// flags downgrade as potential churn signal.

import { eq, and } from "drizzle-orm"
import type { Db } from "@/db/types"
import type { SchedulerDb } from "@/lib/scheduler/api"
import { cancelDeferredAction } from "@/lib/scheduler/api"
import { enrichmentSchedules } from "@/db/schema/intelligence"
import { perceptionAggregates } from "@/db/schema/intelligence"
import type { EventHandler, SubscriptionTier } from "@/lib/events/types"
import { scheduleEnrichmentForListing } from "./helpers"
import { getWeeklyPeriod } from "@/domains/data-and-listings/analytics/types"

const TIER_RANK: Record<SubscriptionTier, number> = {
  free: 0,
  standard: 1,
  premium: 2,
  partner: 3,
}

export type SubscriptionTierChangedDeps = {
  db: Db
  schedulerDb: SchedulerDb
}

export function subscriptionTierChangedHandler(
  deps: SubscriptionTierChangedDeps,
): EventHandler<"subscription_tier_changed"> {
  return {
    domain: "intelligence",
    eventType: "subscription_tier_changed",
    mode: "async",
    handler: async (event) => {
      const now = new Date()
      const period = getWeeklyPeriod(now)
      const isUpgrade = TIER_RANK[event.newTier] > TIER_RANK[event.previousTier]

      // Log revenue perception signal
      const [existing] = await deps.db
        .select()
        .from(perceptionAggregates)
        .where(
          and(
            eq(perceptionAggregates.listingId, event.listingId),
            eq(perceptionAggregates.aggregateType, "revenue_signal"),
            eq(perceptionAggregates.periodStart, period.start),
          ),
        )
        .limit(1)

      type RevenueSignalData = {
        changes: Array<{
          previousTier: string
          newTier: string
          direction: "upgrade" | "downgrade"
          at: string
        }>
      }

      if (existing) {
        const data = existing.data as unknown as RevenueSignalData
        data.changes.push({
          previousTier: event.previousTier,
          newTier: event.newTier,
          direction: isUpgrade ? "upgrade" : "downgrade",
          at: now.toISOString(),
        })

        await deps.db
          .update(perceptionAggregates)
          .set({
            data: data as unknown as Record<string, unknown>,
            computedAt: now,
            sampleSize: existing.sampleSize + 1,
          })
          .where(eq(perceptionAggregates.id, existing.id))
      } else {
        const data: RevenueSignalData = {
          changes: [
            {
              previousTier: event.previousTier,
              newTier: event.newTier,
              direction: isUpgrade ? "upgrade" : "downgrade",
              at: now.toISOString(),
            },
          ],
        }

        await deps.db.insert(perceptionAggregates).values({
          listingId: event.listingId,
          aggregateType: "revenue_signal",
          periodStart: period.start,
          periodEnd: period.end,
          data: data as unknown as Record<string, unknown>,
          computedAt: now,
          sampleSize: 1,
        })
      }

      if (isUpgrade) {
        // Upgrade enrichment cadence to paid tier
        await deps.db
          .delete(enrichmentSchedules)
          .where(eq(enrichmentSchedules.listingId, event.listingId))

        await cancelDeferredAction(deps.schedulerDb, {
          action: "decay_liveness_check",
          filterParams: { listingId: event.listingId },
          cancelledBy: "intelligence:subscription_tier_changed",
        })

        await scheduleEnrichmentForListing(
          deps.db,
          deps.schedulerDb,
          event.listingId,
          "paid",
          now,
        )
      }
    },
  }
}
