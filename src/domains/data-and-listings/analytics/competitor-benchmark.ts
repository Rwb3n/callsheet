// Competitor benchmarking — S9 §3.4, AC-42, AC-43, AC-44, AC-45, AC-51
// Identifies competitors by service-area overlap, computes anonymised medians,
// caches result in perception_aggregates with 7-day TTL.

import { eq, and, ne, gte, inArray, sql, countDistinct } from "drizzle-orm"
import type { Db } from "@/db/types"
import { listings, listingTaxonomyTags, engagements, qualityScores } from "@/db/schema/data-and-listings"
import { perceptionAggregates } from "@/db/schema/intelligence"
import type { TaxonomyTag } from "@/domains/data-and-listings/integrity/types"
import {
  type CompetitorBenchmark,
  ANALYTICS_CONSTANTS,
  median,
  getWeeklyPeriod,
} from "./types"

const AGGREGATE_TYPE = "competitor_benchmarking" as const

// --- Pure helper: build benchmark from raw data (exported for unit testing) ---

export function buildBenchmarkResult(
  engagementData: { profileViews: number; enquiriesReceived: number }[],
  scoreData: { composite: number }[],
  competitorCount: number,
): CompetitorBenchmark {
  if (competitorCount < ANALYTICS_CONSTANTS.COMPETITOR_MIN_SAMPLE_SIZE) {
    return {
      medianViews: null,
      medianEnquiries: null,
      medianQualityScore: null,
      sampleSize: competitorCount,
      taxonomyOverlapCount: competitorCount,
      insufficientData: true,
    }
  }

  return {
    medianViews: median(engagementData.map((c) => c.profileViews)),
    medianEnquiries: median(engagementData.map((c) => c.enquiriesReceived)),
    medianQualityScore: median(scoreData.map((c) => c.composite)),
    sampleSize: competitorCount,
    taxonomyOverlapCount: competitorCount,
    insufficientData: false,
  }
}

// --- Main function ---

export async function computeCompetitorBenchmark(
  db: Db,
  listingId: string,
  taxonomyTags: TaxonomyTag[],
  now: Date = new Date(),
): Promise<CompetitorBenchmark> {
  // 1. Check cache: perception_aggregates with TTL
  const ttlThreshold = new Date(now.getTime() - ANALYTICS_CONSTANTS.COMPETITOR_BENCHMARK_TTL_DAYS * 24 * 60 * 60 * 1000)

  const cached = await db
    .select({ data: perceptionAggregates.data })
    .from(perceptionAggregates)
    .where(
      and(
        eq(perceptionAggregates.listingId, listingId),
        eq(perceptionAggregates.aggregateType, AGGREGATE_TYPE),
        gte(perceptionAggregates.computedAt, ttlThreshold),
      ),
    )
    .limit(1)

  if (cached.length > 0) {
    return cached[0].data as CompetitorBenchmark
  }

  // 2. Identify competitors: listings sharing >= 2 service areas
  const serviceAreaIds = [...new Set(taxonomyTags.map((t) => t.serviceAreaId))]

  if (serviceAreaIds.length === 0) {
    return buildBenchmarkResult([], [], 0)
  }

  const competitorRows = await db
    .select({ competitorId: listingTaxonomyTags.listingId })
    .from(listingTaxonomyTags)
    .innerJoin(listings, eq(listings.id, listingTaxonomyTags.listingId))
    .where(
      and(
        ne(listingTaxonomyTags.listingId, listingId),
        inArray(listingTaxonomyTags.serviceAreaId, serviceAreaIds),
        eq(listings.lifecycleStatus, "active"),
      ),
    )
    .groupBy(listingTaxonomyTags.listingId)
    .having(
      gte(
        countDistinct(listingTaxonomyTags.serviceAreaId),
        ANALYTICS_CONSTANTS.COMPETITOR_MIN_OVERLAP_SERVICE_AREAS,
      ),
    )

  const competitorIds = competitorRows.map((r) => r.competitorId)

  // 3. Insufficient data check
  if (competitorIds.length < ANALYTICS_CONSTANTS.COMPETITOR_MIN_SAMPLE_SIZE) {
    return buildBenchmarkResult([], [], competitorIds.length)
  }

  // 4. Batch fetch engagement + quality scores (AC-44: no per-competitor queries)
  const [engagementData, scoreData] = await Promise.all([
    db
      .select({
        profileViews: engagements.profileViews,
        enquiriesReceived: engagements.enquiriesReceived,
      })
      .from(engagements)
      .where(inArray(engagements.listingId, competitorIds)),
    db
      .select({ composite: qualityScores.composite })
      .from(qualityScores)
      .where(inArray(qualityScores.listingId, competitorIds)),
  ])

  // 5. Compute anonymised medians (AC-43)
  const benchmark = buildBenchmarkResult(engagementData, scoreData, competitorIds.length)

  // 6. Cache result (AC-45): upsert to perception_aggregates
  const period = getWeeklyPeriod(now)

  await db
    .insert(perceptionAggregates)
    .values({
      listingId,
      aggregateType: AGGREGATE_TYPE,
      periodStart: period.start,
      periodEnd: period.end,
      data: benchmark as unknown as Record<string, unknown>,
      computedAt: now,
      sampleSize: competitorIds.length,
    })
    .onConflictDoUpdate({
      target: [
        perceptionAggregates.listingId,
        perceptionAggregates.aggregateType,
        perceptionAggregates.periodStart,
      ],
      set: {
        periodEnd: period.end,
        data: benchmark as unknown as Record<string, unknown>,
        computedAt: now,
        sampleSize: competitorIds.length,
      },
    })

  return benchmark
}
