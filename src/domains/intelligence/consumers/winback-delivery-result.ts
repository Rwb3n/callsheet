// Intelligence consumer: winback_delivery_result — AC-99
// Records win-back delivery outcome for effectiveness learning.

import { eq, and } from "drizzle-orm"
import type { Db } from "@/db/types"
import { perceptionAggregates } from "@/db/schema/intelligence"
import type { EventHandler } from "@/lib/events/types"
import { getWeeklyPeriod } from "@/domains/data-and-listings/analytics/types"

export type WinbackDeliveryResultDeps = { db: Db }

export function winbackDeliveryResultHandler(
  deps: WinbackDeliveryResultDeps,
): EventHandler<"winback_delivery_result"> {
  return {
    domain: "intelligence",
    eventType: "winback_delivery_result",
    mode: "async",
    handler: async (event) => {
      const now = new Date()
      const period = getWeeklyPeriod(now)

      type WinbackEffectivenessData = {
        results: Array<{
          accountId: string
          status: "delivered" | "failed"
          at: string
        }>
      }

      const [existing] = await deps.db
        .select()
        .from(perceptionAggregates)
        .where(
          and(
            eq(perceptionAggregates.listingId, event.listingId),
            eq(perceptionAggregates.aggregateType, "winback_effectiveness"),
            eq(perceptionAggregates.periodStart, period.start),
          ),
        )
        .limit(1)

      const result = {
        accountId: event.accountId,
        status: event.status,
        at: event.timestamp,
      }

      if (existing) {
        const data = existing.data as unknown as WinbackEffectivenessData
        data.results.push(result)

        await deps.db
          .update(perceptionAggregates)
          .set({
            data: data as unknown as Record<string, unknown>,
            computedAt: now,
            sampleSize: existing.sampleSize + 1,
          })
          .where(eq(perceptionAggregates.id, existing.id))
      } else {
        const data: WinbackEffectivenessData = { results: [result] }

        await deps.db.insert(perceptionAggregates).values({
          listingId: event.listingId,
          aggregateType: "winback_effectiveness",
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
