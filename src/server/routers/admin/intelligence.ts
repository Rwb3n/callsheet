// Admin intelligence router — S9 §1.9, §4 (ceremony admin), §5.6
// qualityDistribution: returns band distribution across calibrated listings.
// decaySignals: paginated list of active/resolved decay signals with listing context.
// enrichmentStatus: enrichment coverage by tier.
// ceremonies: recent ceremony runs.
// learningHypotheses: all learning hypothesis rows.
// revenueHealth: V1 revenue perception + S9 extended fields.

import { z } from "zod"
import { eq, sql, and, isNull, isNotNull, lte, desc } from "drizzle-orm"
import { router, adminProcedure } from "@/server/trpc"
import type { Db } from "@/db/types"
import { qualityScores, listings } from "@/db/schema/data-and-listings"
import { decaySignals, enrichmentSchedules, ceremonyRuns, learningHypotheses } from "@/db/schema/intelligence"
import { commercialState } from "@/db/schema/commercial"
import { computeRevenuePerception } from "@/domains/commercial/revenue-perception"

export const decaySignalsInput = z.object({
  status: z.enum(["active", "resolved", "all"]).default("active"),
  severity: z.enum(["critical", "high", "medium", "low"]).optional(),
  limit: z.number().min(1).max(100).default(50),
  cursor: z.string().datetime().optional(),
})

export const enrichmentStatusInput = z.object({
  cadenceTier: z.enum(["paid", "claimed", "unclaimed"]).optional(),
})

export type AdminIntelligenceRouterDeps = {
  db: Db
}

export function createAdminIntelligenceRouter(deps: AdminIntelligenceRouterDeps) {
  return router({
    qualityDistribution: adminProcedure
      .query(async () => {
        const rows = await deps.db
          .select({
            band: sql<string>`
              CASE
                WHEN ${qualityScores.composite} >= 80 THEN 'excellent'
                WHEN ${qualityScores.composite} >= 60 THEN 'good'
                WHEN ${qualityScores.composite} >= 40 THEN 'fair'
                ELSE 'poor'
              END
            `.as("band"),
            count: sql<number>`count(*)::int`.as("count"),
          })
          .from(qualityScores)
          .where(eq(qualityScores.calculatedBy, "calibrated"))
          .groupBy(sql`band`)

        const distribution: Record<string, number> = {
          poor: 0,
          fair: 0,
          good: 0,
          excellent: 0,
        }

        for (const row of rows) {
          distribution[row.band] = row.count
        }

        const total = Object.values(distribution).reduce((a, b) => a + b, 0)

        return { distribution, total }
      }),

    decaySignals: adminProcedure
      .input(decaySignalsInput)
      .query(async ({ input }) => {
        const conditions = []

        if (input.status === "active") {
          conditions.push(isNull(decaySignals.resolvedAt))
        } else if (input.status === "resolved") {
          conditions.push(isNotNull(decaySignals.resolvedAt))
        }

        if (input.severity) {
          conditions.push(eq(decaySignals.severity, input.severity))
        }

        if (input.cursor) {
          conditions.push(lte(decaySignals.detectedAt, new Date(input.cursor)))
        }

        const where = conditions.length > 0 ? and(...conditions) : undefined

        const rows = await deps.db
          .select({
            id: decaySignals.id,
            listingId: decaySignals.listingId,
            listingName: listings.name,
            signalType: decaySignals.signalType,
            severity: decaySignals.severity,
            detectedAt: decaySignals.detectedAt,
            resolvedAt: decaySignals.resolvedAt,
            resolution: decaySignals.resolution,
            checkDetails: decaySignals.checkDetails,
          })
          .from(decaySignals)
          .innerJoin(listings, eq(decaySignals.listingId, listings.id))
          .where(where)
          .orderBy(desc(decaySignals.detectedAt))
          .limit(input.limit + 1)

        const hasMore = rows.length > input.limit
        const items = hasMore ? rows.slice(0, input.limit) : rows
        const nextCursor = hasMore ? items[items.length - 1].detectedAt.toISOString() : null

        return { items, nextCursor }
      }),

    enrichmentStatus: adminProcedure
      .input(enrichmentStatusInput)
      .query(async ({ input }) => {
        const conditions = input.cadenceTier
          ? eq(enrichmentSchedules.cadenceTier, input.cadenceTier)
          : undefined

        const rows = await deps.db
          .select({
            tier: enrichmentSchedules.cadenceTier,
            totalSchedules: sql<number>`count(*)::int`,
            overdueCount: sql<number>`count(*) FILTER (WHERE ${enrichmentSchedules.nextCheckAt} < NOW())::int`,
            earliestNextCheck: sql<string>`min(${enrichmentSchedules.nextCheckAt})::text`,
          })
          .from(enrichmentSchedules)
          .where(conditions)
          .groupBy(enrichmentSchedules.cadenceTier)

        return { tiers: rows }
      }),

    ceremonies: adminProcedure
      .input(z.object({
        ceremonyType: z.string().optional(),
        limit: z.number().min(1).max(100).default(20),
      }))
      .query(async ({ input }) => {
        const conditions = input.ceremonyType
          ? eq(ceremonyRuns.ceremonyType, input.ceremonyType as typeof ceremonyRuns.$inferSelect.ceremonyType)
          : undefined

        const rows = await deps.db
          .select({
            id: ceremonyRuns.id,
            ceremonyType: ceremonyRuns.ceremonyType,
            startedAt: ceremonyRuns.startedAt,
            completedAt: ceremonyRuns.completedAt,
            status: ceremonyRuns.status,
            inputsHash: ceremonyRuns.inputsHash,
            outputs: ceremonyRuns.outputs,
            decisionsLogged: ceremonyRuns.decisionsLogged,
            nextScheduledAt: ceremonyRuns.nextScheduledAt,
          })
          .from(ceremonyRuns)
          .where(conditions)
          .orderBy(desc(ceremonyRuns.startedAt))
          .limit(input.limit)

        return { runs: rows }
      }),

    learningHypotheses: adminProcedure.query(async () => {
      const rows = await deps.db.select().from(learningHypotheses)
      return { hypotheses: rows }
    }),

    revenueHealth: adminProcedure.query(async () => {
      const v1 = await computeRevenuePerception(deps.db)

      // Read S9 extended fields from any commercial_state row (global data)
      const [extended] = await deps.db
        .select({ revenueHealthExtended: commercialState.revenueHealthExtended })
        .from(commercialState)
        .limit(1)

      return {
        ...v1,
        extended: extended?.revenueHealthExtended ?? null,
      }
    }),
  })
}
