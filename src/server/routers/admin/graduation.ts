// Admin graduation router — S10 §7, router plan §2
// 3 routes (089): status, history, override
// 2 routes (090): algorithmRollout, algorithmComparison

import { z } from "zod"
import { sql, desc, and, eq, gte } from "drizzle-orm"
import { router, adminProcedure } from "@/server/trpc"
import type { Db } from "@/db/types"
import type { DecisionLogDb } from "@/lib/decisions/logger"
import { logDecision } from "@/lib/decisions/logger"
import type { SchedulerDb } from "@/lib/scheduler/api"
import { decisionLogs } from "@/db/schema/shared"
import { qualityScores } from "@/db/schema/data-and-listings"
import {
  handleRolloutPercentageChange,
  checkAlgorithmRollbackTrigger,
} from "@/domains/intelligence/graduation/algorithm-rollout"
import { assignBand } from "@/domains/data-and-listings/quality/scoring"

export type AdminGraduationRouterDeps = {
  db: Db
  decisionLogDb: DecisionLogDb
  schedulerDb: SchedulerDb
}

export function createAdminGraduationRouter(deps: AdminGraduationRouterDeps) {
  return router({
    // --- status: current graduation status per sub-entity/capability ---
    status: adminProcedure
      .input(
        z
          .object({
            subEntity: z.string().optional(),
            capability: z.string().optional(),
          })
          .optional(),
      )
      .query(async ({ input }) => {
        const filters = input ?? {}

        // Build WHERE conditions
        const conditions = [
          eq(decisionLogs.decisionType, "graduation_evaluation"),
        ]
        if (filters.subEntity) {
          conditions.push(
            sql`${decisionLogs.inputs}->>'subEntity' = ${filters.subEntity}`,
          )
        }
        if (filters.capability) {
          conditions.push(
            sql`${decisionLogs.inputs}->>'capability' = ${filters.capability}`,
          )
        }

        // Latest evaluation per sub-entity + capability
        const rows = await deps.db
          .select({
            subEntity:
              sql<string>`${decisionLogs.inputs}->>'subEntity'`.as(
                "subEntity",
              ),
            capability:
              sql<string>`${decisionLogs.inputs}->>'capability'`.as(
                "capability",
              ),
            graduated:
              sql<string>`${decisionLogs.output}->>'graduated'`.as("graduated"),
            lastEvaluatedAt: decisionLogs.createdAt,
            currentMetrics:
              sql<Record<string, number>>`${decisionLogs.inputs}->'currentMetrics'`.as(
                "currentMetrics",
              ),
            thresholds:
              sql<Record<string, number>>`${decisionLogs.inputs}->'thresholds'`.as(
                "thresholds",
              ),
          })
          .from(decisionLogs)
          .where(and(...conditions))
          .orderBy(desc(decisionLogs.createdAt))

        // Deduplicate: keep latest per (subEntity, capability)
        const seen = new Set<string>()
        const result: Array<{
          subEntity: string
          capability: string
          graduated: boolean
          lastEvaluatedAt: Date | null
          currentMetrics: Record<string, number>
          thresholds: Record<string, number>
        }> = []

        for (const row of rows) {
          const key = `${row.subEntity}:${row.capability}`
          if (seen.has(key)) continue
          seen.add(key)
          result.push({
            subEntity: row.subEntity,
            capability: row.capability,
            graduated: row.graduated === "true",
            lastEvaluatedAt: row.lastEvaluatedAt,
            currentMetrics: row.currentMetrics ?? {},
            thresholds: row.thresholds ?? {},
          })
        }

        return result
      }),

    // --- history: historical evaluations for a specific sub-entity + capability ---
    history: adminProcedure
      .input(
        z.object({
          subEntity: z.string(),
          capability: z.string(),
          limit: z.number().min(1).max(100).default(20),
        }),
      )
      .query(async ({ input }) => {
        const rows = await deps.db
          .select({
            id: decisionLogs.id,
            subEntity:
              sql<string>`${decisionLogs.inputs}->>'subEntity'`.as(
                "subEntity",
              ),
            capability:
              sql<string>`${decisionLogs.inputs}->>'capability'`.as(
                "capability",
              ),
            graduated:
              sql<string>`${decisionLogs.output}->>'graduated'`.as("graduated"),
            reason:
              sql<string>`${decisionLogs.output}->>'reason'`.as("reason"),
            currentMetrics:
              sql<Record<string, number>>`${decisionLogs.inputs}->'currentMetrics'`.as(
                "currentMetrics",
              ),
            evaluatedAt: decisionLogs.createdAt,
          })
          .from(decisionLogs)
          .where(
            and(
              eq(decisionLogs.decisionType, "graduation_evaluation"),
              sql`${decisionLogs.inputs}->>'subEntity' = ${input.subEntity}`,
              sql`${decisionLogs.inputs}->>'capability' = ${input.capability}`,
            ),
          )
          .orderBy(desc(decisionLogs.createdAt))
          .limit(input.limit)

        return rows.map((r) => ({
          id: r.id,
          subEntity: r.subEntity,
          capability: r.capability,
          graduated: r.graduated === "true",
          reason: r.reason ?? "",
          currentMetrics: r.currentMetrics ?? {},
          evaluatedAt: r.evaluatedAt,
        }))
      }),

    // --- override: manually override graduation status ---
    override: adminProcedure
      .input(
        z.object({
          subEntity: z.string(),
          capability: z.string(),
          graduated: z.boolean(),
          reason: z.string().min(1),
        }),
      )
      .mutation(async ({ input }) => {
        await logDecision(deps.decisionLogDb, {
          domain: "cross-domain",
          decisionType: "graduation_evaluation",
          inputs: {
            subEntity: input.subEntity,
            capability: input.capability,
            reason: "manual_override",
          },
          output: {
            graduated: input.graduated,
            reason: input.reason,
          },
        })

        return { success: true }
      }),

    // --- algorithmRollout: set rollout percentage (CS-WORK-090) ---
    algorithmRollout: adminProcedure
      .input(
        z.object({
          rolloutPercentage: z.number().int().min(0).max(100),
        }),
      )
      .mutation(async ({ input }) => {
        // Determine current rollout percentage from most recent graduation_evaluation
        const [latestRow] = await deps.db
          .select({
            inputs: decisionLogs.inputs,
          })
          .from(decisionLogs)
          .where(
            and(
              eq(decisionLogs.decisionType, "graduation_evaluation"),
              sql`${decisionLogs.inputs}->>'capability' = ${"algorithm_rollout"}`,
              sql`${decisionLogs.inputs}->'currentMetrics' ? 'newPercentage'`,
            ),
          )
          .orderBy(desc(decisionLogs.createdAt))
          .limit(1)

        const previousPercentage =
          (
            (latestRow?.inputs as Record<string, unknown>)
              ?.currentMetrics as Record<string, number> | undefined
          )?.newPercentage ?? 0

        if (previousPercentage === input.rolloutPercentage) {
          return { updated: false, affectedListings: 0 }
        }

        const result = await handleRolloutPercentageChange(
          { db: deps.db, decisionLogDb: deps.decisionLogDb, schedulerDb: deps.schedulerDb },
          previousPercentage,
          input.rolloutPercentage,
        )

        return { updated: true, affectedListings: result.affectedListings }
      }),

    // --- algorithmComparison: V1 vs V2 band distribution (CS-WORK-090) ---
    algorithmComparison: adminProcedure.query(async () => {
      // Fetch all quality scores with algorithm version
      const rows = await deps.db
        .select({
          algorithmVersion: qualityScores.algorithmVersion,
          composite: qualityScores.composite,
        })
        .from(qualityScores)

      const v1Bands: Record<string, number> = {
        excellent: 0,
        good: 0,
        fair: 0,
        poor: 0,
      }
      const v2Bands: Record<string, number> = {
        excellent: 0,
        good: 0,
        fair: 0,
        poor: 0,
      }
      let v1Count = 0
      let v2Count = 0

      for (const row of rows) {
        const band = assignBand(row.composite)
        if (row.algorithmVersion === 2) {
          v2Bands[band]++
          v2Count++
        } else {
          v1Bands[band]++
          v1Count++
        }
      }

      // Compute declassification rate from algorithm_comparison decision logs
      const rollbackCheck = await checkAlgorithmRollbackTrigger({
        db: deps.db,
        decisionLogDb: deps.decisionLogDb,
        schedulerDb: deps.schedulerDb,
      })

      return {
        v1: v1Bands,
        v2: v2Bands,
        declassificationRate: rollbackCheck.declassificationRate,
        sampleSize: { v1: v1Count, v2: v2Count },
      }
    }),
  })
}
