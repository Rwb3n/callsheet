// quality_score_recalculation deferred action handler — S9 §1.2, AC-8/9/10/16/17/18/20
// Loads listing data, computes quality score, persists, evaluates band crossing.

import { eq, isNull, and, sql } from "drizzle-orm"
import type { Db } from "@/db/types"
import type { DecisionLogDb } from "@/lib/decisions/logger"
import type { InProcessEventBus } from "@/lib/events/bus"
import type { WaitUntilFn } from "@/lib/events/waitUntil"
import type { NotificationDb } from "@/lib/notifications/notifications"
import type { ActionHandlerRegistry } from "@/lib/scheduler"
import type { SchedulerDb } from "@/lib/scheduler/api"
import { logDecision } from "@/lib/decisions/logger"
import { createNotification } from "@/lib/notifications/notifications"
import { scheduleDeferredAction } from "@/lib/scheduler/api"
import {
  listings,
  qualityScores,
  qualityScoreExplanations,
  engagements,
  verifications,
} from "@/db/schema/data-and-listings"
import { decaySignals } from "@/db/schema/intelligence"
import {
  computeQualityScore,
  assignBand,
  buildExplanation,
  computeTopImprovements,
  BAND_ORDER,
  type QualityScoreInput,
  type QualityBand,
} from "@/domains/data-and-listings/quality/scoring"

export type QualityScoreRecalculationDeps = {
  db: Db
  decisionLogDb: DecisionLogDb
  bus: InProcessEventBus
  waitUntilFn: WaitUntilFn
  notificationDb: NotificationDb
  schedulerDb: SchedulerDb
}

export function registerQualityScoreRecalculationHandler(
  registry: ActionHandlerRegistry,
  deps: QualityScoreRecalculationDeps,
): void {
  registry.register("quality_score_recalculation", async (params) => {
    const { listingId } = params

    // 1. Load listing + all related data
    const input = await loadQualityScoreInput(deps.db, listingId)
    if (!input) return // listing deleted/archived between scheduling and execution

    // 2. Load previous score for comparison
    const [previousRow] = await deps.db
      .select({
        composite: qualityScores.composite,
        completeness: qualityScores.completeness,
        freshness: qualityScores.freshness,
        accuracy: qualityScores.accuracy,
        richness: qualityScores.richness,
        verification: qualityScores.verification,
      })
      .from(qualityScores)
      .where(eq(qualityScores.listingId, listingId))
      .limit(1)

    const previousScore = previousRow?.composite ?? 0
    const previousBand = assignBand(previousScore)

    // 3. Compute new score
    const now = new Date()
    const newScore = computeQualityScore(input, now)
    const newBand = assignBand(newScore.composite)

    // 4. Persist to quality_scores table — AC-18: set calculatedBy = "calibrated"
    await deps.db
      .update(qualityScores)
      .set({
        completeness: newScore.completeness,
        freshness: newScore.freshness,
        accuracy: newScore.accuracy,
        richness: newScore.richness,
        verification: newScore.verification,
        composite: newScore.composite,
        lastCalculated: now,
        calculatedBy: "calibrated",
        algorithmVersion: 1,
      })
      .where(eq(qualityScores.listingId, listingId))

    // 5. Update quality_score_explanations
    const explanation = buildExplanation(input, newScore)
    await deps.db
      .update(qualityScoreExplanations)
      .set({ explanation, updatedAt: now })
      .where(eq(qualityScoreExplanations.listingId, listingId))

    // 6. Evaluate band crossing — AC-20: only emit event when band changes
    if (previousBand !== newBand) {
      await evaluateQualityScoreBand(deps, {
        listingId,
        accountId: input.listing.accountId,
        previousScore,
        newScore: newScore.composite,
        previousBand,
        newBand,
        explanation,
      })
    }
  })
}

// --- Load quality score input from DB ---

async function loadQualityScoreInput(
  db: Db,
  listingId: string,
): Promise<(QualityScoreInput & { listing: QualityScoreInput["listing"] & { accountId: string | null } }) | null> {
  const [listing] = await db
    .select()
    .from(listings)
    .where(eq(listings.id, listingId))
    .limit(1)

  if (!listing || listing.lifecycleStatus !== "active") return null

  const [verification] = await db
    .select()
    .from(verifications)
    .where(eq(verifications.listingId, listingId))
    .limit(1)

  const [engagement] = await db
    .select()
    .from(engagements)
    .where(eq(engagements.listingId, listingId))
    .limit(1)

  const activeSignals = await db
    .select({ signalType: decaySignals.signalType })
    .from(decaySignals)
    .where(
      and(
        eq(decaySignals.listingId, listingId),
        isNull(decaySignals.resolvedAt),
      ),
    )

  // Count related entities
  const [tagCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(sql`listing_taxonomy_tags`)
    .where(sql`listing_id = ${listingId}`)

  const [creditCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(sql`credits`)
    .where(sql`listing_id = ${listingId}`)

  const [mediaCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(sql`media_items`)
    .where(sql`listing_id = ${listingId}`)

  const [socialCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(sql`social_profiles`)
    .where(sql`listing_id = ${listingId}`)

  const [accredCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(sql`accreditations`)
    .where(sql`listing_id = ${listingId}`)

  return {
    listing: {
      name: listing.name,
      headline: listing.headline,
      bio: listing.bio,
      baseRegion: listing.baseRegion,
      contactEmail: listing.contactEmail,
      contactPhone: listing.contactPhone,
      websiteUrl: listing.websiteUrl,
      updatedAt: listing.updatedAt,
      createdAt: listing.createdAt,
      accountId: listing.accountId,
    },
    taxonomyTagCount: tagCount.count,
    creditCount: creditCount.count,
    mediaItemCount: mediaCount.count,
    socialProfileCount: socialCount.count,
    accreditationCount: accredCount.count,
    verification: {
      tier: verification?.tier ?? "unclaimed",
    },
    engagements: {
      profileViews: engagement?.profileViews ?? 0,
      lastProfileViewAt: engagement?.lastProfileViewAt ?? null,
      lastEnquiryAt: engagement?.lastEnquiryAt ?? null,
    },
    activeDecaySignalCount: activeSignals.length,
    activeDecaySignals: activeSignals,
  }
}

// --- Band crossing evaluation — AC-8, AC-9, AC-10, AC-16 ---

async function evaluateQualityScoreBand(
  deps: QualityScoreRecalculationDeps,
  params: {
    listingId: string
    accountId: string | null
    previousScore: number
    newScore: number
    previousBand: QualityBand
    newBand: QualityBand
    explanation: ReturnType<typeof buildExplanation>
  },
): Promise<void> {
  const direction = BAND_ORDER[params.newBand] > BAND_ORDER[params.previousBand]
    ? "improved"
    : "declined"

  // Identify which dimensions changed
  const changedDimensions = params.explanation.dimensions
    .map((d) => d.name)

  // AC-10: emit quality_score_changed event
  deps.waitUntilFn(
    deps.bus.emit("quality_score_changed", {
      _brand: "QualityScoreChangedEvent" as const,
      listingId: params.listingId,
      previousComposite: params.previousScore,
      newComposite: params.newScore,
      changedDimensions,
    }, deps.waitUntilFn),
  )

  // AC-8, AC-9: send notification
  if (params.accountId) {
    if (direction === "improved") {
      await createNotification(deps.notificationDb, {
        accountId: params.accountId,
        type: "quality_score_changed",
        title: "Quality score improved",
        body: `Your listing quality improved from ${params.previousBand} to ${params.newBand} (score: ${params.newScore})`,
      })
    } else {
      // AC-9: declined — include top 3 improvement suggestions
      const topImprovements = computeTopImprovements(params.explanation, 3)
      const improvementText = topImprovements.length > 0
        ? ` Suggestions: ${topImprovements.map((i) => i.detail).join("; ")}`
        : ""
      await createNotification(deps.notificationDb, {
        accountId: params.accountId,
        type: "quality_score_changed",
        title: "Quality score declined",
        body: `Your listing quality declined from ${params.previousBand} to ${params.newBand} (score: ${params.newScore}).${improvementText}`,
      })
    }
  }

  // AC-16: log decision
  await logDecision(deps.decisionLogDb, {
    domain: "data-and-listings",
    decisionType: "quality_score_band_evaluation",
    inputs: {
      previousScore: params.previousScore,
      newScore: params.newScore,
      previousBand: params.previousBand,
      newBand: params.newBand,
    },
    output: {
      direction,
      algorithmVersion: 1,
    },
    listingId: params.listingId,
    accountId: params.accountId ?? undefined,
  })
}

// --- Nightly batch — AC-17 ---

export async function scheduleNightlyQualityRecalculation(
  db: Db,
  schedulerDb: SchedulerDb,
): Promise<number> {
  const activeListings = await db
    .select({ id: listings.id })
    .from(listings)
    .where(eq(listings.lifecycleStatus, "active"))

  for (const listing of activeListings) {
    await scheduleDeferredAction(schedulerDb, {
      action: "quality_score_recalculation",
      params: { listingId: listing.id },
      executeAt: new Date(),
      retryPolicy: "retry_3",
      onFailure: "log",
      createdBy: "nightly_quality_batch",
    })
  }

  return activeListings.length
}
