// Intelligence consumer: conversion_milestone — AC-90
// Records per-gate conversion attribution by correlating with most recent
// conversion_trigger_evaluation decision log.

import { eq, and, desc } from "drizzle-orm"
import type { Db } from "@/db/types"
import { decisionLogs } from "@/db/schema/shared"
import { perceptionAggregates } from "@/db/schema/intelligence"
import type { EventHandler } from "@/lib/events/types"
import { getWeeklyPeriod } from "@/domains/data-and-listings/analytics/types"

export type ConversionMilestoneDeps = { db: Db }

export function conversionMilestoneHandler(
  deps: ConversionMilestoneDeps,
): EventHandler<"conversion_milestone"> {
  return {
    domain: "intelligence",
    eventType: "conversion_milestone",
    mode: "async",
    handler: async (event) => {
      const now = new Date()
      const period = getWeeklyPeriod(now)

      // Query most recent conversion_trigger_evaluation decision for this listing
      const [triggerDecision] = await deps.db
        .select({
          inputs: decisionLogs.inputs,
          listingId: decisionLogs.listingId,
          createdAt: decisionLogs.createdAt,
        })
        .from(decisionLogs)
        .where(
          and(
            eq(decisionLogs.listingId, event.listingId),
            eq(decisionLogs.decisionType, "conversion_trigger_evaluation"),
          ),
        )
        .orderBy(desc(decisionLogs.createdAt))
        .limit(1)

      const triggerType =
        (triggerDecision?.inputs as Record<string, unknown>)?.triggerType as string
          ?? "organic"

      type ConversionAttributionData = {
        attributions: Array<{
          milestone: string
          gate: string
          accountId: string
          at: string
        }>
      }

      const [existing] = await deps.db
        .select()
        .from(perceptionAggregates)
        .where(
          and(
            eq(perceptionAggregates.listingId, event.listingId),
            eq(perceptionAggregates.aggregateType, "conversion_attribution"),
            eq(perceptionAggregates.periodStart, period.start),
          ),
        )
        .limit(1)

      const attribution = {
        milestone: event.milestone,
        gate: triggerType,
        accountId: event.accountId,
        at: event.timestamp,
      }

      if (existing) {
        const data = existing.data as unknown as ConversionAttributionData
        data.attributions.push(attribution)

        await deps.db
          .update(perceptionAggregates)
          .set({
            data: data as unknown as Record<string, unknown>,
            computedAt: now,
            sampleSize: existing.sampleSize + 1,
          })
          .where(eq(perceptionAggregates.id, existing.id))
      } else {
        const data: ConversionAttributionData = { attributions: [attribution] }

        await deps.db.insert(perceptionAggregates).values({
          listingId: event.listingId,
          aggregateType: "conversion_attribution",
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
