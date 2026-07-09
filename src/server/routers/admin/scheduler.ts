// Admin scheduler router — CS-WORK-093
// 4 routes: list, getDetail, trigger, cancel
// All adminProcedure. Queries deferred_actions table directly.

import { z } from "zod"
import { eq, and, desc, lte } from "drizzle-orm"
import { TRPCError } from "@trpc/server"
import { router, adminProcedure } from "@/server/trpc"
import type { Db } from "@/db/types"
import { deferredActions } from "@/db/schema/shared"

export type AdminSchedulerRouterDeps = {
  db: Db
}

const schedulerListInput = z.object({
  status: z.enum(["pending", "executing", "completed", "failed", "exhausted", "cancelled"]).optional(),
  action: z.string().optional(),
  cursor: z.string().datetime().optional(),
  limit: z.number().int().min(1).max(50).default(20),
})

export function createAdminSchedulerRouter(deps: AdminSchedulerRouterDeps) {
  return router({
    // AC-1, AC-2: paginated list with status/action filters, createdAt cursor
    list: adminProcedure
      .input(schedulerListInput)
      .query(async ({ input }) => {
        const conditions = []

        if (input.status) {
          conditions.push(eq(deferredActions.status, input.status))
        }
        if (input.action) {
          conditions.push(eq(deferredActions.action, input.action))
        }
        if (input.cursor) {
          conditions.push(lte(deferredActions.createdAt, new Date(input.cursor)))
        }

        const rows = await deps.db
          .select()
          .from(deferredActions)
          .where(conditions.length > 0 ? and(...conditions) : undefined)
          .orderBy(desc(deferredActions.createdAt))
          .limit(input.limit + 1)

        const hasMore = rows.length > input.limit
        const items = rows.slice(0, input.limit).map(toDto)

        return {
          items,
          nextCursor: hasMore ? items[items.length - 1].createdAt : undefined,
        }
      }),

    // AC-3: full detail by ID
    getDetail: adminProcedure
      .input(z.object({ id: z.string().uuid() }))
      .query(async ({ input }) => {
        const [row] = await deps.db
          .select()
          .from(deferredActions)
          .where(eq(deferredActions.id, input.id))
          .limit(1)

        if (!row) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Deferred action not found" })
        }

        return toDto(row)
      }),

    // AC-4: force immediate execution by setting executeAt to now
    trigger: adminProcedure
      .input(z.object({ id: z.string().uuid() }))
      .mutation(async ({ input }) => {
        const [row] = await deps.db
          .select({ id: deferredActions.id, status: deferredActions.status })
          .from(deferredActions)
          .where(eq(deferredActions.id, input.id))
          .limit(1)

        if (!row) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Deferred action not found" })
        }
        if (row.status !== "pending") {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Only pending actions can be triggered" })
        }

        await deps.db
          .update(deferredActions)
          .set({ executeAt: new Date() })
          .where(eq(deferredActions.id, input.id))

        return { success: true as const }
      }),

    // AC-5: cancel a pending action
    cancel: adminProcedure
      .input(z.object({
        id: z.string().uuid(),
        reason: z.string().min(1),
      }))
      .mutation(async ({ input, ctx }) => {
        const [row] = await deps.db
          .select({ id: deferredActions.id, status: deferredActions.status })
          .from(deferredActions)
          .where(eq(deferredActions.id, input.id))
          .limit(1)

        if (!row) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Deferred action not found" })
        }
        if (row.status !== "pending") {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Only pending actions can be cancelled" })
        }

        await deps.db
          .update(deferredActions)
          .set({
            status: "cancelled",
            cancelledAt: new Date(),
            cancelledBy: `${ctx.session!.accountId}:${input.reason}`,
          })
          .where(eq(deferredActions.id, input.id))

        return { success: true as const }
      }),
  })
}

function toDto(row: typeof deferredActions.$inferSelect) {
  return {
    id: row.id,
    action: row.action,
    params: row.params,
    executeAt: row.executeAt.toISOString(),
    retryPolicy: row.retryPolicy,
    onFailure: row.onFailure,
    createdBy: row.createdBy,
    status: row.status,
    attempts: row.attempts,
    lastError: row.lastError,
    cancelledAt: row.cancelledAt?.toISOString() ?? null,
    cancelledBy: row.cancelledBy,
    createdAt: row.createdAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
  }
}
