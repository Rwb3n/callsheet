// provider_outreach_ranking deferred action handler — S9 §4.1
// Monthly ceremony: ranks unclaimed listings by estimated value for outreach prioritisation.
// Informational only — no evaluateCeremonyOutcome calls.

import { eq, and, sql, desc, isNull } from "drizzle-orm"
import type { Db } from "@/db/types"
import type { ActionHandlerRegistry } from "@/lib/scheduler"
import type { SchedulerDb } from "@/lib/scheduler/api"
import type { DecisionLogDb } from "@/lib/decisions/logger"
import { listings, qualityScores, engagements } from "@/db/schema/data-and-listings"
import {
  checkCeremonyIdempotency,
  logCeremonyRun,
  scheduleCeremonyNextRun,
  getNextRunDate,
  computeInputsHash,
  currentMonth,
} from "@/domains/intelligence/ceremony/infrastructure"

const OUTREACH_TOP_N = 50

export type ProviderOutreachRankingDeps = {
  db: Db
  schedulerDb: SchedulerDb
  decisionLogDb: DecisionLogDb
}

export function registerProviderOutreachRankingHandler(
  registry: ActionHandlerRegistry,
  deps: ProviderOutreachRankingDeps,
): void {
  registry.register("provider_outreach_ranking", async (_params) => {
    const ceremonyType = "provider_outreach" as const
    const hash = computeInputsHash({ month: currentMonth() })
    const nextRunAt = getNextRunDate(ceremonyType)

    // 1. Idempotency guard
    const idempotency = await checkCeremonyIdempotency(deps.db, ceremonyType, hash)
    if (idempotency.skip) {
      await scheduleCeremonyNextRun(deps.schedulerDb, ceremonyType, nextRunAt)
      return
    }

    // No prerequisite check. No evaluateCeremonyOutcome (informational only).

    // 2. Query unclaimed active listings with quality and engagement data
    const ranked = await deps.db
      .select({
        listingId: listings.id,
        name: listings.name,
        quality: qualityScores.composite,
        views: engagements.profileViews,
        enquiries: engagements.enquiriesReceived,
        estimatedValue: sql<number>`(
          COALESCE(${qualityScores.composite}, 0) *
          (COALESCE(${engagements.profileViews}, 0) + COALESCE(${engagements.enquiriesReceived}, 0) * 10)
        )::int`,
      })
      .from(listings)
      .leftJoin(qualityScores, eq(qualityScores.listingId, listings.id))
      .leftJoin(engagements, eq(engagements.listingId, listings.id))
      .where(
        and(
          eq(listings.lifecycleStatus, "active"),
          eq(listings.claimStatus, "unclaimed"),
          isNull(listings.accountId),
        ),
      )
      .orderBy(
        desc(
          sql`(
            COALESCE(${qualityScores.composite}, 0) *
            (COALESCE(${engagements.profileViews}, 0) + COALESCE(${engagements.enquiriesReceived}, 0) * 10)
          )`,
        ),
      )
      .limit(OUTREACH_TOP_N)

    // 3. Build report
    const report = {
      listings: ranked.map((r) => ({
        listingId: r.listingId,
        name: r.name,
        quality: r.quality ?? 0,
        views: r.views ?? 0,
        enquiries: r.enquiries ?? 0,
        estimatedValue: r.estimatedValue,
      })),
      topN: OUTREACH_TOP_N,
      generatedAt: new Date().toISOString(),
    }

    // 4. Log ceremony run and schedule next
    await logCeremonyRun(deps.db, {
      ceremonyType,
      status: "completed",
      inputsHash: hash,
      outputs: report,
      decisionsLogged: 0,
      nextScheduledAt: nextRunAt,
    })
    await scheduleCeremonyNextRun(deps.schedulerDb, ceremonyType, nextRunAt)
  })
}
