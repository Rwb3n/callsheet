// Intelligence consumer: subscription_ended — AC-98
// Records churn analysis entry for ALL origins.
// Paddle-only: adds win-back attribution refinement marker.

import { eq, and } from "drizzle-orm"
import type { Db } from "@/db/types"
import { perceptionAggregates } from "@/db/schema/intelligence"
import type { EventHandler } from "@/lib/events/types"
import { getWeeklyPeriod } from "@/domains/data-and-listings/analytics/types"

export type SubscriptionEndedDeps = { db: Db }

export function subscriptionEndedHandler(
  deps: SubscriptionEndedDeps,
): EventHandler<"subscription_ended"> {
  return {
    domain: "intelligence",
    eventType: "subscription_ended",
    mode: "async",
    handler: async (event) => {
      const now = new Date()
      const period = getWeeklyPeriod(now)

      type ChurnAnalysisData = {
        entries: Array<{
          accountId: string
          previousTier: string
          reason: string
          origin: string
          winbackAttribution: boolean
          at: string
        }>
      }

      const [existing] = await deps.db
        .select()
        .from(perceptionAggregates)
        .where(
          and(
            eq(perceptionAggregates.listingId, event.listingId),
            eq(perceptionAggregates.aggregateType, "churn_analysis"),
            eq(perceptionAggregates.periodStart, period.start),
          ),
        )
        .limit(1)

      const entry = {
        accountId: event.accountId,
        previousTier: event.previousTier,
        reason: event.reason,
        origin: event.origin,
        winbackAttribution: event.origin === "paddle",
        at: event.timestamp,
      }

      if (existing) {
        const data = existing.data as unknown as ChurnAnalysisData
        data.entries.push(entry)

        await deps.db
          .update(perceptionAggregates)
          .set({
            data: data as unknown as Record<string, unknown>,
            computedAt: now,
            sampleSize: existing.sampleSize + 1,
          })
          .where(eq(perceptionAggregates.id, existing.id))
      } else {
        const data: ChurnAnalysisData = { entries: [entry] }

        await deps.db.insert(perceptionAggregates).values({
          listingId: event.listingId,
          aggregateType: "churn_analysis",
          periodStart: period.start,
          periodEnd: period.end,
          data: data as unknown as Record<string, unknown>,
          computedAt: now,
          sampleSize: 1,
        })
      }
    },
  }
}
