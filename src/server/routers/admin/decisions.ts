// Admin decisions router — CS-WORK-094
// 1 route: search (paginated, multi-filter)
// All adminProcedure.

import { z } from "zod"
import { eq, and, desc, lte, gte } from "drizzle-orm"
import { router, adminProcedure } from "@/server/trpc"
import type { Db } from "@/db/types"
import { decisionLogs } from "@/db/schema/shared"

export type AdminDecisionsRouterDeps = {
  db: Db
}

const decisionSearchInput = z.object({
  domain: z.enum(["data-and-listings", "operations", "platform", "commercial", "cross-domain"]).optional(),
  decisionType: z.string().optional(),
  fromDate: z.string().datetime().optional(),
  toDate: z.string().datetime().optional(),
  listingId: z.string().uuid().optional(),
  accountId: z.string().uuid().optional(),
  cursor: z.string().datetime().optional(),
  limit: z.number().int().min(1).max(50).default(20),
})

export function createAdminDecisionsRouter(deps: AdminDecisionsRouterDeps) {
  return router({
    // AC-1, AC-2, AC-3: paginated search with filters, full row
    search: adminProcedure
      .input(decisionSearchInput)
      .query(async ({ input }) => {
        const conditions = []

        if (input.domain) {
          conditions.push(eq(decisionLogs.domain, input.domain))
        }
        if (input.decisionType) {
          conditions.push(eq(decisionLogs.decisionType, input.decisionType))
        }
        if (input.fromDate) {
          conditions.push(gte(decisionLogs.createdAt, new Date(input.fromDate)))
        }
        if (input.toDate) {
          conditions.push(lte(decisionLogs.createdAt, new Date(input.toDate)))
        }
        if (input.listingId) {
          conditions.push(eq(decisionLogs.listingId, input.listingId))
        }
        if (input.accountId) {
          conditions.push(eq(decisionLogs.accountId, input.accountId))
        }
        if (input.cursor) {
          conditions.push(lte(decisionLogs.createdAt, new Date(input.cursor)))
        }

        const rows = await deps.db
          .select()
          .from(decisionLogs)
          .where(conditions.length > 0 ? and(...conditions) : undefined)
          .orderBy(desc(decisionLogs.createdAt))
          .limit(input.limit + 1)

        const hasMore = rows.length > input.limit
        const items = rows.slice(0, input.limit).map((row) => ({
          id: row.id,
          domain: row.domain,
          decisionType: row.decisionType,
          inputs: row.inputs,
          output: row.output,
          confidence: row.confidence,
          listingId: row.listingId,
          accountId: row.accountId,
          additionalContext: row.additionalContext,
          createdAt: row.createdAt.toISOString(),
        }))

        return {
          items,
          nextCursor: hasMore ? items[items.length - 1].createdAt : undefined,
        }
      }),
  })
}
