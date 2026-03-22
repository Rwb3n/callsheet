// Viewer demographics aggregation — S9 §3.3, AC-40, AC-41
// Incrementally aggregates viewer profile data into perception_aggregates.
// Called after dedup check — receives already-deduplicated view events.

import { eq, and } from "drizzle-orm"
import type { Db } from "@/db/types"
import { perceptionAggregates } from "@/db/schema/intelligence"
import {
  type ViewerDemographicsData,
  type DemographicBucket,
  type SectorBucket,
  type RegionBucket,
  getWeeklyPeriod,
  roundTo,
} from "./types"

const AGGREGATE_TYPE = "viewer_demographics" as const

function emptyDemographicsData(): ViewerDemographicsData {
  return {
    entityTypes: [],
    sectors: [],
    regions: [],
    totalUniqueViewers: 0,
  }
}

function incrementBucket<T extends { count: number; pct: number }>(
  buckets: T[],
  key: keyof T,
  value: string,
): T[] {
  const existing = buckets.find((b) => b[key] === value)
  if (existing) {
    existing.count += 1
  } else {
    // Create a new bucket with the matching key field set
    const newBucket = { count: 1, pct: 0, [key]: value } as T
    buckets.push(newBucket)
  }
  return buckets
}

function recomputePercentages<T extends { count: number; pct: number }>(
  buckets: T[],
): T[] {
  const total = buckets.reduce((sum, b) => sum + b.count, 0)
  if (total === 0) return buckets
  for (const bucket of buckets) {
    bucket.pct = roundTo(bucket.count / total, 2)
  }
  return buckets
}

export async function aggregateViewerDemographic(
  db: Db,
  listingId: string,
  viewerProfile: { entityType?: string; sector?: string; region?: string },
  now?: Date,
): Promise<void> {
  const period = getWeeklyPeriod(now ?? new Date())

  // Read existing aggregate for this listing + week
  const [existing] = await db
    .select()
    .from(perceptionAggregates)
    .where(
      and(
        eq(perceptionAggregates.listingId, listingId),
        eq(perceptionAggregates.aggregateType, AGGREGATE_TYPE),
        eq(perceptionAggregates.periodStart, period.start),
      ),
    )
    .limit(1)

  const data: ViewerDemographicsData = existing
    ? (existing.data as unknown as ViewerDemographicsData)
    : emptyDemographicsData()

  // Increment total unique viewers
  data.totalUniqueViewers += 1

  // Increment entity type bucket if provided
  if (viewerProfile.entityType) {
    incrementBucket<DemographicBucket<string>>(
      data.entityTypes,
      "type",
      viewerProfile.entityType,
    )
    recomputePercentages(data.entityTypes)
  }

  // Increment sector bucket if provided
  if (viewerProfile.sector) {
    incrementBucket<SectorBucket>(data.sectors, "sector", viewerProfile.sector)
    recomputePercentages(data.sectors)
  }

  // Increment region bucket if provided
  if (viewerProfile.region) {
    incrementBucket<RegionBucket>(data.regions, "region", viewerProfile.region)
    recomputePercentages(data.regions)
  }

  const computedAt = now ?? new Date()
  const jsonData = data as unknown as Record<string, unknown>

  if (existing) {
    await db
      .update(perceptionAggregates)
      .set({
        data: jsonData,
        computedAt,
        sampleSize: data.totalUniqueViewers,
      })
      .where(eq(perceptionAggregates.id, existing.id))
  } else {
    await db.insert(perceptionAggregates).values({
      listingId,
      aggregateType: AGGREGATE_TYPE,
      periodStart: period.start,
      periodEnd: period.end,
      data: jsonData,
      computedAt,
      sampleSize: data.totalUniqueViewers,
    })
  }
}
