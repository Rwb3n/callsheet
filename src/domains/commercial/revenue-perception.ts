// Revenue perception — S8 §5, CR §6
// Computes 8-metric RevenuePerception from listings + churn_analysis_log aggregates.
// evaluateRevenueHealth interprets metrics against thresholds → health signals.

import { sql, eq, and, gte, isNotNull } from "drizzle-orm"
import type { Db } from "@/db/types"
import { listings } from "@/db/schema/data-and-listings"
import { churnAnalysisLog } from "@/db/schema/commercial"
import { PRICING } from "@/domains/commercial/pricing-config"
import type { SubscriptionTier } from "@/lib/events/types"

// --- Types ---

export type RevenuePerception = {
  mrr: number
  arr: number
  tierDistribution: Record<SubscriptionTier, number>
  churnRate30d: number
  churnRate90d: number
  conversionRate30d: number
  netRevenueRetention: number
  averageRevenuePerListing: number
}

export type RevenueHealthStatus = "healthy" | "warning" | "critical"

export type RevenueHealthSignal = {
  metric: string
  status: RevenueHealthStatus
  value: number
  threshold: number
  recommendation: string
}

// --- Computation ---

export async function computeRevenuePerception(db: Db): Promise<RevenuePerception> {
  // Active paid listings with billing cadence for MRR
  const activePaid = await db
    .select({
      subscriptionTier: listings.subscriptionTier,
      billingCadence: listings.billingCadence,
    })
    .from(listings)
    .where(
      and(
        sql`${listings.subscriptionTier} IN ('standard', 'premium', 'partner')`,
        eq(listings.lifecycleStatus, "active"),
      ),
    )

  // MRR: sum monthly contribution per paid listing
  let mrr = 0
  for (const row of activePaid) {
    const tier = row.subscriptionTier as SubscriptionTier
    const pricing = PRICING[tier]
    if (row.billingCadence === "monthly") {
      mrr += pricing.monthly
    } else {
      mrr += pricing.annual / 12
    }
  }

  const arr = mrr * 12

  // Tier distribution: count of active listings per tier (including free)
  const tierCounts = await db
    .select({
      tier: listings.subscriptionTier,
      count: sql<number>`cast(count(*) as integer)`,
    })
    .from(listings)
    .where(eq(listings.lifecycleStatus, "active"))
    .groupBy(listings.subscriptionTier)

  const tierDistribution: Record<SubscriptionTier, number> = {
    free: 0,
    standard: 0,
    premium: 0,
    partner: 0,
  }
  for (const row of tierCounts) {
    tierDistribution[row.tier as SubscriptionTier] = row.count
  }

  // Churn rates
  const churnRate30d = await computeChurnRate(db, 30, activePaid.length)
  const churnRate90d = await computeChurnRate(db, 90, activePaid.length)

  // Conversion rate (30d)
  const conversionRate30d = await computeConversionRate30d(db)

  // Net revenue retention (30d rolling)
  const netRevenueRetention = await computeNRR(db, mrr)

  // Average revenue per listing
  const averageRevenuePerListing = activePaid.length > 0 ? mrr / activePaid.length : 0

  return {
    mrr,
    arr,
    tierDistribution,
    churnRate30d,
    churnRate90d,
    conversionRate30d,
    netRevenueRetention,
    averageRevenuePerListing,
  }
}

async function computeChurnRate(db: Db, periodDays: number, currentPaidCount: number): Promise<number> {
  const cutoff = sql`now() - interval '${sql.raw(String(periodDays))} days'`

  const [{ count: churnsInPeriod }] = await db
    .select({ count: sql<number>`cast(count(*) as integer)` })
    .from(churnAnalysisLog)
    .where(
      and(
        eq(churnAnalysisLog.eventType, "churn"),
        gte(churnAnalysisLog.createdAt, cutoff),
      ),
    )

  const paidAtPeriodStart = currentPaidCount + churnsInPeriod
  return paidAtPeriodStart > 0 ? (churnsInPeriod / paidAtPeriodStart) * 100 : 0
}

async function computeConversionRate30d(db: Db): Promise<number> {
  const cutoff30d = sql`now() - interval '30 days'`

  const [{ count: conversions }] = await db
    .select({ count: sql<number>`cast(count(*) as integer)` })
    .from(churnAnalysisLog)
    .where(
      and(
        eq(churnAnalysisLog.eventType, "conversion"),
        gte(churnAnalysisLog.createdAt, cutoff30d),
      ),
    )

  const [{ count: freeClaimedCount }] = await db
    .select({ count: sql<number>`cast(count(*) as integer)` })
    .from(listings)
    .where(
      and(
        eq(listings.subscriptionTier, "free"),
        isNotNull(listings.accountId),
        eq(listings.lifecycleStatus, "active"),
      ),
    )

  return freeClaimedCount > 0 ? (conversions / freeClaimedCount) * 100 : 0
}

async function computeNRR(db: Db, currentMRR: number): Promise<number> {
  if (currentMRR === 0) return 0

  const cutoff30d = sql`now() - interval '30 days'`

  const [upgrades] = await db
    .select({ total: sql<number>`coalesce(sum(${churnAnalysisLog.annualRevenue}), 0)` })
    .from(churnAnalysisLog)
    .where(
      and(
        eq(churnAnalysisLog.eventType, "upgrade"),
        gte(churnAnalysisLog.createdAt, cutoff30d),
      ),
    )

  const [downgrades] = await db
    .select({ total: sql<number>`coalesce(sum(abs(${churnAnalysisLog.annualRevenue})), 0)` })
    .from(churnAnalysisLog)
    .where(
      and(
        eq(churnAnalysisLog.eventType, "downgrade"),
        gte(churnAnalysisLog.createdAt, cutoff30d),
      ),
    )

  const [churnRev] = await db
    .select({ total: sql<number>`coalesce(sum(abs(${churnAnalysisLog.annualRevenue})), 0)` })
    .from(churnAnalysisLog)
    .where(
      and(
        eq(churnAnalysisLog.eventType, "churn"),
        gte(churnAnalysisLog.createdAt, cutoff30d),
      ),
    )

  const monthlyUpgrades = Number(upgrades.total) / 12
  const monthlyDowngrades = Number(downgrades.total) / 12
  const monthlyChurnRevenue = Number(churnRev.total) / 12

  return ((currentMRR + monthlyUpgrades - monthlyDowngrades - monthlyChurnRevenue) / currentMRR) * 100
}

// --- Health Evaluation (pure function) ---

export function evaluateRevenueHealth(perception: RevenuePerception): RevenueHealthSignal[] {
  const signals: RevenueHealthSignal[] = []

  // Churn Rate (30d)
  if (perception.churnRate30d > 8) {
    signals.push({
      metric: "churnRate30d",
      status: "critical",
      value: perception.churnRate30d,
      threshold: 8,
      recommendation: "Monthly churn >8%. Investigate exit reasons, tier distribution of churners, billing cadence concentration. Escalate to principal.",
    })
  } else if (perception.churnRate30d >= 3) {
    signals.push({
      metric: "churnRate30d",
      status: "warning",
      value: perception.churnRate30d,
      threshold: 3,
      recommendation: "Monthly churn 3-8%. Monitor churn-by-tier breakdown and payment failure rate. Review §2 churn intervention effectiveness.",
    })
  } else {
    signals.push({
      metric: "churnRate30d",
      status: "healthy",
      value: perception.churnRate30d,
      threshold: 3,
      recommendation: "Churn below 3%. No action needed.",
    })
  }

  // Conversion Rate (30d)
  if (perception.conversionRate30d >= 2) {
    signals.push({
      metric: "conversionRate30d",
      status: "healthy",
      value: perception.conversionRate30d,
      threshold: 2,
      recommendation: "Conversion rate above 2%. Conversion triggers functioning.",
    })
  } else {
    signals.push({
      metric: "conversionRate30d",
      status: "warning",
      value: perception.conversionRate30d,
      threshold: 2,
      recommendation: "Conversion rate below 2%. Review conversion trigger firing rates, analytics teaser engagement, and pricing page visit-to-checkout ratio.",
    })
  }

  // Net Revenue Retention
  if (perception.netRevenueRetention < 90) {
    signals.push({
      metric: "netRevenueRetention",
      status: "critical",
      value: perception.netRevenueRetention,
      threshold: 90,
      recommendation: "NRR below 90%. Revenue contracting — downgrades and churn exceed expansion. Escalate to principal for strategic review.",
    })
  } else if (perception.netRevenueRetention < 100) {
    signals.push({
      metric: "netRevenueRetention",
      status: "warning",
      value: perception.netRevenueRetention,
      threshold: 100,
      recommendation: "NRR between 90-100%. Revenue stable but not expanding. Review upgrade conversion paths and premium feature engagement.",
    })
  } else {
    signals.push({
      metric: "netRevenueRetention",
      status: "healthy",
      value: perception.netRevenueRetention,
      threshold: 100,
      recommendation: "NRR above 100%. Net revenue expanding from existing base.",
    })
  }

  return signals
}
