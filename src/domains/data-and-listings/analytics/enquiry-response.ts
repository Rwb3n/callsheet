// Enquiry response insights — S9 §3.5, AC-52, AC-53
// Computes response rate, median response time, and conversion estimate
// from engagement counters and enquiry records.

import { eq, and, isNotNull } from "drizzle-orm"
import type { Db } from "@/db/types"
import { engagements } from "@/db/schema/data-and-listings"
import { enquiryRecords } from "@/db/schema/accounts"
import { perceptionAggregates } from "@/db/schema/intelligence"
import {
  type EnquiryResponseInsights,
  ANALYTICS_CONSTANTS,
  getDailyPeriod,
  median,
  roundTo,
} from "./types"

const AGGREGATE_TYPE = "enquiry_response" as const

/**
 * Pure computation helper — testable without DB.
 * Given total enquiries and an array of response times (minutes),
 * computes the insights object.
 */
export function computeInsightsFromData(
  totalEnquiries: number,
  responseTimes: number[],
): EnquiryResponseInsights | null {
  if (totalEnquiries === 0) return null

  const respondedEnquiries = responseTimes.length
  const responseRate = roundTo(respondedEnquiries / totalEnquiries, 3)

  const medianResponseTimeHours =
    responseTimes.length > 0
      ? roundTo(median(responseTimes) / 60, 1)
      : null

  const fastResponses = responseTimes.filter(
    (t) => t <= ANALYTICS_CONSTANTS.FAST_RESPONSE_THRESHOLD_MINUTES,
  ).length

  const conversionEstimate =
    respondedEnquiries > 0
      ? roundTo(fastResponses / respondedEnquiries, 3)
      : 0

  return {
    responseRate,
    medianResponseTimeHours,
    conversionEstimate,
    totalEnquiries,
    respondedEnquiries,
  }
}

export async function computeEnquiryResponseInsights(
  db: Db,
  listingId: string,
  now?: Date,
): Promise<EnquiryResponseInsights | null> {
  const effectiveNow = now ?? new Date()

  // Fetch engagement counters for total enquiries
  const [engagement] = await db
    .select({ enquiriesReceived: engagements.enquiriesReceived })
    .from(engagements)
    .where(eq(engagements.listingId, listingId))
    .limit(1)

  const totalEnquiries = engagement?.enquiriesReceived ?? 0

  if (totalEnquiries === 0) return null

  // Fetch responded enquiry records with response times
  const responseRows = await db
    .select({ responseTimeMinutes: enquiryRecords.responseTimeMinutes })
    .from(enquiryRecords)
    .where(
      and(
        eq(enquiryRecords.listingId, listingId),
        isNotNull(enquiryRecords.respondedAt),
      ),
    )

  const responseTimes = responseRows
    .map((r) => r.responseTimeMinutes)
    .filter((t): t is number => t !== null)

  const insights = computeInsightsFromData(totalEnquiries, responseTimes)

  if (!insights) return null

  // Upsert to perception_aggregates with daily period
  const period = getDailyPeriod(effectiveNow)
  const jsonData = insights as unknown as Record<string, unknown>

  const [existing] = await db
    .select({ id: perceptionAggregates.id })
    .from(perceptionAggregates)
    .where(
      and(
        eq(perceptionAggregates.listingId, listingId),
        eq(perceptionAggregates.aggregateType, AGGREGATE_TYPE),
        eq(perceptionAggregates.periodStart, period.start),
      ),
    )
    .limit(1)

  if (existing) {
    await db
      .update(perceptionAggregates)
      .set({
        data: jsonData,
        computedAt: effectiveNow,
        sampleSize: totalEnquiries,
      })
      .where(eq(perceptionAggregates.id, existing.id))
  } else {
    await db.insert(perceptionAggregates).values({
      listingId,
      aggregateType: AGGREGATE_TYPE,
      periodStart: period.start,
      periodEnd: period.end,
      data: jsonData,
      computedAt: effectiveNow,
      sampleSize: totalEnquiries,
    })
  }

  return insights
}
