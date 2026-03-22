// Intelligence consumer helpers — shared functions for perception pipeline
// S9 §6, CS-WORK-081

import { eq, and } from "drizzle-orm"
import type { Db } from "@/db/types"
import type { SchedulerDb } from "@/lib/scheduler/api"
import { scheduleDeferredAction } from "@/lib/scheduler/api"
import { enrichmentSchedules } from "@/db/schema/intelligence"
import { perceptionAggregates } from "@/db/schema/intelligence"
import { qualityScores } from "@/db/schema/data-and-listings"
import {
  getApplicableCheckTypes,
  getCadenceMap,
  type CadenceTier,
} from "@/domains/data-and-listings/decay/detection"
import { getWeeklyPeriod } from "@/domains/data-and-listings/analytics/types"

const DAY_MS = 24 * 60 * 60 * 1000

// AC-92, AC-96: Create enrichment schedules + schedule initial liveness checks
export async function scheduleEnrichmentForListing(
  db: Db,
  schedulerDb: SchedulerDb,
  listingId: string,
  cadenceTier: CadenceTier,
  now: Date = new Date(),
): Promise<void> {
  const checkTypes = getApplicableCheckTypes(cadenceTier)
  const cadenceMap = getCadenceMap(cadenceTier)

  for (const checkType of checkTypes) {
    const cadence = cadenceMap[checkType]
    if (!cadence) continue

    const nextCheckAt = new Date(now.getTime() + cadence.livenessDays * DAY_MS)

    // Insert enrichment schedule row (ignore conflict — idempotent)
    await db
      .insert(enrichmentSchedules)
      .values({
        listingId,
        checkType,
        nextCheckAt,
        cadenceTier,
      })
      .onConflictDoNothing()

    // Schedule initial liveness check
    await scheduleDeferredAction(schedulerDb, {
      action: "decay_liveness_check",
      params: { listingId, checkType },
      executeAt: nextCheckAt,
      retryPolicy: "once",
      onFailure: "log",
      createdBy: "intelligence:listing_created",
    })
  }
}

// AC-97: Record quality calibration perception signal
export async function recordQualityCalibrationSignal(
  db: Db,
  listingId: string,
  signalType: "shortlist" | "enquiry",
  now: Date = new Date(),
): Promise<void> {
  const period = getWeeklyPeriod(now)

  type CalibrationData = {
    signals: Array<{ type: string; count: number; lastSeen: string }>
  }

  const [existing] = await db
    .select()
    .from(perceptionAggregates)
    .where(
      and(
        eq(perceptionAggregates.listingId, listingId),
        eq(perceptionAggregates.aggregateType, "quality_calibration"),
        eq(perceptionAggregates.periodStart, period.start),
      ),
    )
    .limit(1)

  if (existing) {
    const data = existing.data as unknown as CalibrationData
    const idx = data.signals.findIndex((s) => s.type === signalType)
    if (idx >= 0) {
      data.signals[idx].count += 1
      data.signals[idx].lastSeen = now.toISOString()
    } else {
      data.signals.push({ type: signalType, count: 1, lastSeen: now.toISOString() })
    }

    await db
      .update(perceptionAggregates)
      .set({
        data: data as unknown as Record<string, unknown>,
        computedAt: now,
        sampleSize: existing.sampleSize + 1,
      })
      .where(eq(perceptionAggregates.id, existing.id))
  } else {
    const data: CalibrationData = {
      signals: [{ type: signalType, count: 1, lastSeen: now.toISOString() }],
    }

    await db.insert(perceptionAggregates).values({
      listingId,
      aggregateType: "quality_calibration",
      periodStart: period.start,
      periodEnd: period.end,
      data: data as unknown as Record<string, unknown>,
      computedAt: now,
      sampleSize: 1,
    })
  }
}

// AC-96: Update hypothesis tracking (L2/L3) after claim approval
export async function updateHypothesisTracking(
  db: Db,
  listingId: string,
  hypothesisIds: string[],
  now: Date = new Date(),
): Promise<void> {
  const period = getWeeklyPeriod(now)

  type HypothesisTrackingData = {
    observations: Array<{ hypothesisId: string; count: number; lastSeen: string }>
  }

  const [existing] = await db
    .select()
    .from(perceptionAggregates)
    .where(
      and(
        eq(perceptionAggregates.listingId, listingId),
        eq(perceptionAggregates.aggregateType, "hypothesis_tracking"),
        eq(perceptionAggregates.periodStart, period.start),
      ),
    )
    .limit(1)

  if (existing) {
    const data = existing.data as unknown as HypothesisTrackingData
    for (const hId of hypothesisIds) {
      const idx = data.observations.findIndex((o) => o.hypothesisId === hId)
      if (idx >= 0) {
        data.observations[idx].count += 1
        data.observations[idx].lastSeen = now.toISOString()
      } else {
        data.observations.push({ hypothesisId: hId, count: 1, lastSeen: now.toISOString() })
      }
    }

    await db
      .update(perceptionAggregates)
      .set({
        data: data as unknown as Record<string, unknown>,
        computedAt: now,
        sampleSize: existing.sampleSize + 1,
      })
      .where(eq(perceptionAggregates.id, existing.id))
  } else {
    const data: HypothesisTrackingData = {
      observations: hypothesisIds.map((hId) => ({
        hypothesisId: hId,
        count: 1,
        lastSeen: now.toISOString(),
      })),
    }

    await db.insert(perceptionAggregates).values({
      listingId,
      aggregateType: "hypothesis_tracking",
      periodStart: period.start,
      periodEnd: period.end,
      data: data as unknown as Record<string, unknown>,
      computedAt: now,
      sampleSize: 1,
    })
  }
}

// AC-100: Update provider outreach prioritisation after enquiry
export async function updateProviderOutreachPrioritisation(
  db: Db,
  listingId: string,
  now: Date = new Date(),
): Promise<void> {
  const period = getWeeklyPeriod(now)

  type OutreachData = {
    enquiryCount: number
    lastEnquiryAt: string
  }

  const [existing] = await db
    .select()
    .from(perceptionAggregates)
    .where(
      and(
        eq(perceptionAggregates.listingId, listingId),
        eq(perceptionAggregates.aggregateType, "outreach_prioritisation"),
        eq(perceptionAggregates.periodStart, period.start),
      ),
    )
    .limit(1)

  if (existing) {
    const data = existing.data as unknown as OutreachData
    data.enquiryCount += 1
    data.lastEnquiryAt = now.toISOString()

    await db
      .update(perceptionAggregates)
      .set({
        data: data as unknown as Record<string, unknown>,
        computedAt: now,
        sampleSize: data.enquiryCount,
      })
      .where(eq(perceptionAggregates.id, existing.id))
  } else {
    const data: OutreachData = {
      enquiryCount: 1,
      lastEnquiryAt: now.toISOString(),
    }

    await db.insert(perceptionAggregates).values({
      listingId,
      aggregateType: "outreach_prioritisation",
      periodStart: period.start,
      periodEnd: period.end,
      data: data as unknown as Record<string, unknown>,
      computedAt: now,
      sampleSize: 1,
    })
  }
}

// AC-95: Reset freshness timestamp after profile edit
export async function resetFreshnessTimestamp(
  db: Db,
  listingId: string,
  now: Date = new Date(),
): Promise<void> {
  await db
    .update(qualityScores)
    .set({ lastCalculated: now })
    .where(eq(qualityScores.listingId, listingId))
}
