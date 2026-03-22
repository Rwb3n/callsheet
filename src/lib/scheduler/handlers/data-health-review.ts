// data_health_review deferred action handler — S9 §4.1
// Monthly ceremony: reviews quality distribution, decay trends, enrichment coverage.

import { eq, sql, gte, isNull, and } from "drizzle-orm"
import type { Db } from "@/db/types"
import type { DecisionLogDb } from "@/lib/decisions/logger"
import type { ActionHandlerRegistry } from "@/lib/scheduler"
import type { SchedulerDb } from "@/lib/scheduler/api"
import { listings, qualityScores } from "@/db/schema/data-and-listings"
import { decaySignals, enrichmentSchedules } from "@/db/schema/intelligence"
import {
  checkCeremonyIdempotency,
  logCeremonyRun,
  evaluateCeremonyOutcome,
  scheduleCeremonyNextRun,
  getNextRunDate,
  computeInputsHash,
  currentMonth,
} from "@/domains/intelligence/ceremony/infrastructure"

const DECAY_TREND_ESCALATION_RATIO = 2
const ENRICHMENT_COVERAGE_MIN = 0.80
const DAY_MS = 24 * 60 * 60 * 1000

export type DataHealthReviewDeps = {
  db: Db
  schedulerDb: SchedulerDb
  decisionLogDb: DecisionLogDb
}

export function registerDataHealthReviewHandler(
  registry: ActionHandlerRegistry,
  deps: DataHealthReviewDeps,
): void {
  registry.register("data_health_review", async (_params) => {
    const ceremonyType = "data_health_review" as const
    const hash = computeInputsHash({ month: currentMonth() })
    const nextRunAt = getNextRunDate(ceremonyType)

    // 1. Idempotency guard
    const idempotency = await checkCeremonyIdempotency(deps.db, ceremonyType, hash)
    if (idempotency.skip) {
      await scheduleCeremonyNextRun(deps.schedulerDb, ceremonyType, nextRunAt)
      return
    }

    // No prerequisite check — always runs

    // 2. Quality distribution by band
    const qualityDistribution = await deps.db
      .select({
        band: sql<string>`CASE
          WHEN ${qualityScores.composite} < 40 THEN 'poor'
          WHEN ${qualityScores.composite} < 60 THEN 'fair'
          WHEN ${qualityScores.composite} < 80 THEN 'good'
          ELSE 'excellent'
        END`,
        count: sql<number>`count(*)::int`,
      })
      .from(qualityScores)
      .where(eq(qualityScores.calculatedBy, "calibrated"))
      .groupBy(
        sql`CASE
          WHEN ${qualityScores.composite} < 40 THEN 'poor'
          WHEN ${qualityScores.composite} < 60 THEN 'fair'
          WHEN ${qualityScores.composite} < 80 THEN 'good'
          ELSE 'excellent'
        END`,
      )

    const qualityBands: Record<string, number> = {
      poor: 0,
      fair: 0,
      good: 0,
      excellent: 0,
    }
    for (const row of qualityDistribution) {
      qualityBands[row.band] = row.count
    }

    // 3. Decay trend: signals in last 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * DAY_MS)

    const [newSignalsRow] = await deps.db
      .select({ count: sql<number>`count(*)::int` })
      .from(decaySignals)
      .where(gte(decaySignals.detectedAt, thirtyDaysAgo))

    const [resolvedSignalsRow] = await deps.db
      .select({ count: sql<number>`count(*)::int` })
      .from(decaySignals)
      .where(
        and(
          gte(decaySignals.resolvedAt, thirtyDaysAgo),
          sql`${decaySignals.resolvedAt} IS NOT NULL`,
        ),
      )

    const [activeSignalsRow] = await deps.db
      .select({ count: sql<number>`count(*)::int` })
      .from(decaySignals)
      .where(isNull(decaySignals.resolvedAt))

    const newSignals30d = newSignalsRow.count
    const resolved30d = resolvedSignalsRow.count
    const activeSignals = activeSignalsRow.count

    // 4. Enrichment coverage by cadence tier
    const [activeListingCountRow] = await deps.db
      .select({ count: sql<number>`count(*)::int` })
      .from(listings)
      .where(eq(listings.lifecycleStatus, "active"))

    const activeListingCount = activeListingCountRow.count

    const enrichmentByTier = await deps.db
      .select({
        cadenceTier: enrichmentSchedules.cadenceTier,
        listingCount: sql<number>`count(DISTINCT ${enrichmentSchedules.listingId})::int`,
      })
      .from(enrichmentSchedules)
      .groupBy(enrichmentSchedules.cadenceTier)

    const enrichmentCoverage: Record<string, { count: number; coverage: number }> = {}
    for (const row of enrichmentByTier) {
      enrichmentCoverage[row.cadenceTier] = {
        count: row.listingCount,
        coverage: activeListingCount > 0 ? row.listingCount / activeListingCount : 0,
      }
    }

    // 5. Evaluate actionable outcomes
    let decisionsLogged = 0

    // Decay trend escalation: new signals outpace resolved by 2x
    if (resolved30d > 0 && newSignals30d > DECAY_TREND_ESCALATION_RATIO * resolved30d) {
      await evaluateCeremonyOutcome(deps.decisionLogDb, {
        ceremonyType,
        recommendation: {
          action: "escalate_decay_trend",
          hasFinancialImpact: false,
          hasUserVisibleChange: false,
          precedentExists: true,
        },
      })
      decisionsLogged += 1
    } else if (resolved30d === 0 && newSignals30d > 0) {
      // No resolved signals but new ones exist — also escalate
      await evaluateCeremonyOutcome(deps.decisionLogDb, {
        ceremonyType,
        recommendation: {
          action: "escalate_decay_trend",
          hasFinancialImpact: false,
          hasUserVisibleChange: false,
          precedentExists: true,
        },
      })
      decisionsLogged += 1
    }

    // Enrichment coverage: per-tier check
    for (const [tier, data] of Object.entries(enrichmentCoverage)) {
      if (data.coverage < ENRICHMENT_COVERAGE_MIN) {
        await evaluateCeremonyOutcome(deps.decisionLogDb, {
          ceremonyType,
          recommendation: {
            action: `investigate_enrichment_coverage:${tier}`,
            hasFinancialImpact: false,
            hasUserVisibleChange: false,
            precedentExists: true,
          },
        })
        decisionsLogged += 1
      }
    }

    // 6. Build report
    const report = {
      qualityBands,
      decayTrend: {
        newSignals30d,
        resolved30d,
        activeSignals,
      },
      enrichmentCoverage,
      activeListingCount,
    }

    // 7. Log ceremony run and schedule next
    await logCeremonyRun(deps.db, {
      ceremonyType,
      status: "completed",
      inputsHash: hash,
      outputs: report,
      decisionsLogged,
      nextScheduledAt: nextRunAt,
    })
    await scheduleCeremonyNextRun(deps.schedulerDb, ceremonyType, nextRunAt)
  })
}
