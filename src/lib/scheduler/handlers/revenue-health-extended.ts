// revenue_health_extended ceremony handler — S9 §5.5, AC-55/56/69/80
// Monthly. Computes 8 S9 revenue health extension fields and writes to commercial_state.
// Self-perpetuating deferred action pattern.

import { sql, eq, and, gte } from "drizzle-orm"
import { listings } from "@/db/schema/data-and-listings"
import { churnAnalysisLog, commercialState } from "@/db/schema/commercial"
import type { Db } from "@/db/types"
import type { ActionHandlerRegistry } from "@/lib/scheduler"
import type { SchedulerDb } from "@/lib/scheduler/api"
import type { DecisionLogDb } from "@/lib/decisions/logger"
import {
  checkCeremonyIdempotency,
  logCeremonyRun,
  scheduleCeremonyNextRun,
  getNextRunDate,
  computeInputsHash,
  currentMonth,
} from "@/domains/intelligence/ceremony/infrastructure"
import { computeRevenuePerception } from "@/domains/commercial/revenue-perception"
import { computeRevenueHealthExtended, type RevenueHealthInputs } from "@/domains/intelligence/commercial/revenue-health-extended"

export type RevenueHealthExtendedDeps = {
  db: Db
  schedulerDb: SchedulerDb
  decisionLogDb: DecisionLogDb
}

export function registerRevenueHealthExtendedHandler(
  registry: ActionHandlerRegistry,
  deps: RevenueHealthExtendedDeps,
): void {
  registry.register("revenue_health_extended", async (_params) => {
    const ceremonyType = "revenue_review" as const
    const hash = computeInputsHash({ month: currentMonth() })
    const nextRunAt = getNextRunDate(ceremonyType)

    // 1. Idempotency guard — AC-56
    const idem = await checkCeremonyIdempotency(deps.db, ceremonyType, hash)
    if (idem.skip) {
      await scheduleCeremonyNextRun(deps.schedulerDb, ceremonyType, nextRunAt)
      return
    }

    // 2. Compute S8 V1 RevenuePerception for averageRevenuePerListing and churnRate30d
    const perception = await computeRevenuePerception(deps.db)

    const now = new Date()
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)

    // 3. Query churn by tier — count churn events and active listings per tier
    const churnByTierRows = await deps.db
      .select({
        tier: listings.subscriptionTier,
        activeCount: sql<number>`count(*)::int`,
      })
      .from(listings)
      .where(eq(listings.lifecycleStatus, "active"))
      .groupBy(listings.subscriptionTier)

    const churnEventsByTier = await deps.db
      .select({
        tier: churnAnalysisLog.subscriptionTier,
        churnEvents: sql<number>`count(*)::int`,
      })
      .from(churnAnalysisLog)
      .where(
        and(
          eq(churnAnalysisLog.eventType, "churn"),
          gte(churnAnalysisLog.createdAt, thirtyDaysAgo),
        ),
      )
      .groupBy(churnAnalysisLog.subscriptionTier)

    const churnEventMap = new Map<string, number>()
    for (const row of churnEventsByTier) {
      if (row.tier) churnEventMap.set(row.tier, row.churnEvents)
    }

    const churnByTierData = churnByTierRows.map(row => ({
      tier: row.tier,
      activeCount: row.activeCount,
      churnEvents: churnEventMap.get(row.tier) ?? 0,
    }))

    // 4. Annual renewal eligible — listings with annual billing that started >11 months ago
    const elevenMonthsAgo = new Date(now.getTime() - 330 * 24 * 60 * 60 * 1000)
    const [eligibleRow] = await deps.db
      .select({ count: sql<number>`count(*)::int` })
      .from(listings)
      .where(
        and(
          sql`${listings.billingCadence} = 'annual'`,
          sql`${listings.subscriptionStartDate} <= ${elevenMonthsAgo}`,
          eq(listings.lifecycleStatus, "active"),
        ),
      )
    const eligibleForRenewal = eligibleRow?.count ?? 0

    // 5. Churned annual count in last 30 days
    const [churnedAnnualRow] = await deps.db
      .select({ count: sql<number>`count(*)::int` })
      .from(churnAnalysisLog)
      .where(
        and(
          eq(churnAnalysisLog.eventType, "churn"),
          gte(churnAnalysisLog.createdAt, thirtyDaysAgo),
          sql`${churnAnalysisLog.metadata}->>'billingCadence' = 'annual'`,
        ),
      )
    const churnedAnnualCount = churnedAnnualRow?.count ?? 0

    // 6. Discount cohort divergence — churn rates for discounted vs full price
    const [discountedChurnRow] = await deps.db
      .select({ count: sql<number>`count(*)::int` })
      .from(churnAnalysisLog)
      .where(
        and(
          eq(churnAnalysisLog.eventType, "churn"),
          gte(churnAnalysisLog.createdAt, thirtyDaysAgo),
          sql`${churnAnalysisLog.metadata}->>'discounted' = 'true'`,
        ),
      )
    const discountedChurn = discountedChurnRow?.count ?? 0

    const [discountedActiveRow] = await deps.db
      .select({ count: sql<number>`count(*)::int` })
      .from(commercialState)
      .where(
        sql`${commercialState.effectivePriceAtSubscription} IS NOT NULL AND ${commercialState.effectivePriceAtSubscription} < (
          SELECT CASE
            WHEN l.subscription_tier = 'standard' THEN 19900
            WHEN l.subscription_tier = 'premium' THEN 39900
            WHEN l.subscription_tier = 'partner' THEN 69900
            ELSE 0
          END
          FROM listings l WHERE l.id = ${commercialState.listingId} AND l.lifecycle_status = 'active'
        )`,
      )
    const discountedActive = discountedActiveRow?.count ?? 0

    const [fullPriceChurnRow] = await deps.db
      .select({ count: sql<number>`count(*)::int` })
      .from(churnAnalysisLog)
      .where(
        and(
          eq(churnAnalysisLog.eventType, "churn"),
          gte(churnAnalysisLog.createdAt, thirtyDaysAgo),
          sql`(${churnAnalysisLog.metadata}->>'discounted' IS NULL OR ${churnAnalysisLog.metadata}->>'discounted' != 'true')`,
        ),
      )
    const fullPriceChurn = fullPriceChurnRow?.count ?? 0

    const [fullPriceActiveRow] = await deps.db
      .select({ count: sql<number>`count(*)::int` })
      .from(listings)
      .where(
        and(
          sql`${listings.subscriptionTier} IN ('standard', 'premium', 'partner')`,
          eq(listings.lifecycleStatus, "active"),
        ),
      )
    const fullPriceActive = (fullPriceActiveRow?.count ?? 0) - discountedActive

    // 7. Downgrades and full churn in last 90 days
    const [downgradeRow] = await deps.db
      .select({ count: sql<number>`count(*)::int` })
      .from(churnAnalysisLog)
      .where(
        and(
          eq(churnAnalysisLog.eventType, "downgrade"),
          gte(churnAnalysisLog.createdAt, ninetyDaysAgo),
        ),
      )
    const downgrades90d = downgradeRow?.count ?? 0

    const [fullChurnRow] = await deps.db
      .select({ count: sql<number>`count(*)::int` })
      .from(churnAnalysisLog)
      .where(
        and(
          eq(churnAnalysisLog.eventType, "churn"),
          gte(churnAnalysisLog.createdAt, ninetyDaysAgo),
        ),
      )
    const fullChurn90d = fullChurnRow?.count ?? 0

    // 8. Subscription lifetime days for churned accounts (sorted)
    const lifetimeRows = await deps.db
      .select({
        days: sql<number>`EXTRACT(EPOCH FROM (${churnAnalysisLog.createdAt} - ${listings.subscriptionStartDate})) / 86400`,
      })
      .from(churnAnalysisLog)
      .innerJoin(listings, eq(churnAnalysisLog.listingId, listings.id))
      .where(
        and(
          eq(churnAnalysisLog.eventType, "churn"),
          sql`${listings.subscriptionStartDate} IS NOT NULL`,
        ),
      )

    const lifetimeDays = lifetimeRows
      .map(r => Math.round(r.days))
      .filter(d => d >= 0)
      .sort((a, b) => a - b)

    // 9. Secondary listing churn — accounts with >1 listing
    const [secondaryChurnRow] = await deps.db
      .select({ count: sql<number>`count(*)::int` })
      .from(churnAnalysisLog)
      .where(
        and(
          eq(churnAnalysisLog.eventType, "churn"),
          gte(churnAnalysisLog.createdAt, thirtyDaysAgo),
          sql`${churnAnalysisLog.accountId} IN (
            SELECT account_id FROM listings
            WHERE account_id IS NOT NULL
            GROUP BY account_id
            HAVING count(*) > 1
          )`,
        ),
      )
    const secondaryChurnEvents = secondaryChurnRow?.count ?? 0

    const [totalSecondaryRow] = await deps.db
      .select({ count: sql<number>`count(*)::int` })
      .from(listings)
      .where(
        and(
          eq(listings.lifecycleStatus, "active"),
          sql`${listings.subscriptionTier} IN ('standard', 'premium', 'partner')`,
          sql`${listings.accountId} IN (
            SELECT account_id FROM listings
            WHERE account_id IS NOT NULL AND lifecycle_status = 'active'
            GROUP BY account_id
            HAVING count(*) > 1
          )`,
        ),
      )
    const totalSecondaryListings = totalSecondaryRow?.count ?? 0

    // 10. Compute extended revenue health
    const inputs: RevenueHealthInputs = {
      churnByTierData,
      eligibleForRenewal,
      churnedAnnualCount,
      averageRevenuePerListing: perception.averageRevenuePerListing,
      churnRate30d: perception.churnRate30d,
      discountedChurn,
      discountedActive,
      fullPriceChurn,
      fullPriceActive,
      downgrades90d,
      fullChurn90d,
      lifetimeDays,
      secondaryChurnEvents,
      totalSecondaryListings,
    }

    const result = computeRevenueHealthExtended(inputs)

    // 11. Write to ALL commercial_state rows (global data) — AC-80
    await deps.db.execute(
      sql`UPDATE commercial_state SET revenue_health_extended = ${JSON.stringify(result)}::jsonb, updated_at = now()`,
    )

    // 12. Log ceremony run — AC-69
    await logCeremonyRun(deps.db, {
      ceremonyType,
      status: "completed",
      inputsHash: hash,
      outputs: { period: currentMonth(), ...result },
      decisionsLogged: 0,
      nextScheduledAt: nextRunAt,
    })

    // 13. Self-perpetuate — AC-55
    await scheduleCeremonyNextRun(deps.schedulerDb, ceremonyType, nextRunAt)
  })
}
