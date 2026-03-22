// multi_listing_pricing_evaluation ceremony handler — S9 §4.3, AC-55/56/61/63/69
// Quarterly. Evaluates multi-listing pricing viability based on account counts
// and support ticket volumes. Self-perpetuating deferred action pattern.

import { sql, gte, and, eq, inArray } from "drizzle-orm"
import { listings } from "@/db/schema/data-and-listings"
import { supportTickets } from "@/db/schema/operations"
import type { Db } from "@/db/types"
import type { ActionHandlerRegistry } from "@/lib/scheduler"
import type { SchedulerDb } from "@/lib/scheduler/api"
import type { DecisionLogDb } from "@/lib/decisions/logger"
import {
  checkCeremonyIdempotency,
  logCeremonyRun,
  evaluateCeremonyOutcome,
  scheduleCeremonyNextRun,
  getNextRunDate,
  computeInputsHash,
  currentQuarter,
  startOfQuarter,
} from "@/domains/intelligence/ceremony/infrastructure"

const SPEC = {
  MULTI_LISTING_MIN_ACCOUNTS: 20,
  PRICING_TICKET_THRESHOLD: 10,
  SECONDARY_CHURN_THRESHOLD: 0.30,
}

export type MultiListingPricingEvaluationDeps = {
  db: Db
  schedulerDb: SchedulerDb
  decisionLogDb: DecisionLogDb
}

export function registerMultiListingPricingEvaluationHandler(
  registry: ActionHandlerRegistry,
  deps: MultiListingPricingEvaluationDeps,
): void {
  registry.register("multi_listing_pricing_evaluation", async (_params) => {
    const ceremonyType = "multi_listing_pricing" as const
    const hash = computeInputsHash({ quarter: currentQuarter() })
    const nextRunAt = getNextRunDate(ceremonyType)

    // 1. Idempotency guard — AC-56
    const idem = await checkCeremonyIdempotency(deps.db, ceremonyType, hash)
    if (idem.skip) {
      await scheduleCeremonyNextRun(deps.schedulerDb, ceremonyType, nextRunAt)
      return
    }

    // 2. AC-63: 20+ threshold check is FIRST after idempotency guard
    // Count distinct accounts with >1 active paid listing
    const multiListingAccounts = await deps.db
      .select({
        accountId: listings.accountId,
        listingCount: sql<number>`count(*)::int`.as("listing_count"),
      })
      .from(listings)
      .where(
        and(
          eq(listings.lifecycleStatus, "active"),
          inArray(listings.subscriptionTier, ["standard", "premium", "partner"]),
        ),
      )
      .groupBy(listings.accountId)
      .having(sql`count(*) > 1`)

    const multiListingPaidAccounts = multiListingAccounts.length

    // AC-61: If < 20 → insufficient_data
    if (multiListingPaidAccounts < SPEC.MULTI_LISTING_MIN_ACCOUNTS) {
      await logCeremonyRun(deps.db, {
        ceremonyType,
        status: "completed",
        inputsHash: hash,
        outputs: {
          status: "insufficient_data",
          multiListingPaidAccounts,
          threshold: SPEC.MULTI_LISTING_MIN_ACCOUNTS,
        },
        decisionsLogged: 0,
        nextScheduledAt: nextRunAt,
      })
      await scheduleCeremonyNextRun(deps.schedulerDb, ceremonyType, nextRunAt)
      return
    }

    // 3. Count pricing support tickets this quarter
    const now = new Date()
    const quarterStart = startOfQuarter(now)
    const [ticketCountRow] = await deps.db
      .select({ count: sql<number>`count(*)::int` })
      .from(supportTickets)
      .where(
        and(
          eq(supportTickets.category, "billing_support"),
          gte(supportTickets.createdAt, quarterStart),
        ),
      )
    const pricingTicketsInQuarter = ticketCountRow?.count ?? 0

    // 4. Secondary churn rate (simplified: 0 at V1 since churn_analysis_log doesn't exist yet)
    const secondaryChurnRate = 0

    // 5. Build report
    const discountModelViable =
      pricingTicketsInQuarter <= SPEC.PRICING_TICKET_THRESHOLD &&
      secondaryChurnRate < SPEC.SECONDARY_CHURN_THRESHOLD

    const report = {
      multiListingPaidAccounts,
      secondaryChurnRate,
      pricingTicketsInQuarter,
      discountModelViable,
      quarter: currentQuarter(),
    }

    // 6. Evaluate: if pricingTickets > 10 → escalate with financial impact
    let decisionsLogged = 0
    if (pricingTicketsInQuarter > SPEC.PRICING_TICKET_THRESHOLD) {
      await evaluateCeremonyOutcome(deps.decisionLogDb, {
        ceremonyType,
        recommendation: {
          action: "review_multi_listing_pricing",
          hasFinancialImpact: true,
          hasUserVisibleChange: false,
          precedentExists: false,
        },
      })
      decisionsLogged = 1
    }

    // 7. Log ceremony run — AC-69
    await logCeremonyRun(deps.db, {
      ceremonyType,
      status: "completed",
      inputsHash: hash,
      outputs: report,
      decisionsLogged,
      nextScheduledAt: nextRunAt,
    })

    // 8. Self-perpetuate — AC-55
    await scheduleCeremonyNextRun(deps.schedulerDb, ceremonyType, nextRunAt)
  })
}
