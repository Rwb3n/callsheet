// Admin events router — S7 §7, CS-WORK-061
// 3 routes: list, resolve, retry
// All adminProcedure.

import { z } from "zod"
import { eq, sql, and, desc, gte, lte } from "drizzle-orm"
import { TRPCError } from "@trpc/server"
import { router, adminProcedure } from "@/server/trpc"
import type { Db } from "@/db/types"
import type { InProcessEventBus } from "@/lib/events/bus"
import type { WaitUntilFn } from "@/lib/events/waitUntil"
import type { EventType } from "@/lib/events/types"
import { eventConsumerErrors } from "@/db/schema/shared"

export type AdminEventsRouterDeps = {
  db: Db
  bus: InProcessEventBus
  waitUntilFn: WaitUntilFn
}

const eventErrorListInput = z.object({
  fromDate: z.string().datetime().optional(),
  toDate: z.string().datetime().optional(),
  consumerId: z.string().optional(),
  resolved: z.boolean().default(false),
  cursor: z.string().datetime().optional(),
  limit: z.number().int().min(1).max(50).default(20),
})

export function createAdminEventsRouter(deps: AdminEventsRouterDeps) {
  return router({
    // AC-7.1, AC-7.2: grouped by consumerId, filterable, AC-7.6: totalUnresolved
    list: adminProcedure
      .input(eventErrorListInput)
      .query(async ({ input }) => {
        const conditions = [eq(eventConsumerErrors.resolved, input.resolved)]

        if (input.fromDate) {
          conditions.push(gte(eventConsumerErrors.createdAt, new Date(input.fromDate)))
        }
        if (input.toDate) {
          conditions.push(lte(eventConsumerErrors.createdAt, new Date(input.toDate)))
        }
        if (input.consumerId) {
          conditions.push(eq(eventConsumerErrors.consumerId, input.consumerId))
        }

        // Grouped query — one row per consumerId
        const groups = await deps.db
          .select({
            consumerId: eventConsumerErrors.consumerId,
            errorCount: sql<number>`count(*)::int`,
            latestTimestamp: sql<string>`max(${eventConsumerErrors.createdAt})`,
            oldestUnresolved: sql<string | null>`min(${eventConsumerErrors.createdAt}) FILTER (WHERE ${eventConsumerErrors.resolved} = false)`,
          })
          .from(eventConsumerErrors)
          .where(and(...conditions))
          .groupBy(eventConsumerErrors.consumerId)
          .orderBy(desc(sql`count(*)`))
          .limit(input.limit + 1)

        const hasMore = groups.length > input.limit
        const groupSlice = groups.slice(0, input.limit)

        // Fetch latest error detail per group (avoid N+1 with single query)
        const errors = await Promise.all(
          groupSlice.map(async (g) => {
            const [latest] = await deps.db
              .select({
                id: eventConsumerErrors.id,
                eventType: eventConsumerErrors.eventType,
                payload: eventConsumerErrors.payload,
                error: eventConsumerErrors.error,
                timestamp: eventConsumerErrors.createdAt,
                mode: eventConsumerErrors.mode,
              })
              .from(eventConsumerErrors)
              .where(
                and(
                  eq(eventConsumerErrors.consumerId, g.consumerId),
                  eq(eventConsumerErrors.resolved, input.resolved),
                ),
              )
              .orderBy(desc(eventConsumerErrors.createdAt))
              .limit(1)

            return {
              consumerId: g.consumerId,
              errorCount: parseInt(String(g.errorCount), 10),
              latestError: latest
                ? {
                    id: latest.id,
                    eventType: latest.eventType,
                    payload: latest.payload,
                    error: latest.error,
                    timestamp: latest.timestamp.toISOString(),
                    mode: latest.mode,
                  }
                : null,
              oldestUnresolved: g.oldestUnresolved
                ? new Date(String(g.oldestUnresolved)).toISOString()
                : null,
            }
          }),
        )

        // AC-7.6: total unresolved count
        const [unresolvedRow] = await deps.db
          .select({ count: sql<number>`count(*)::int` })
          .from(eventConsumerErrors)
          .where(eq(eventConsumerErrors.resolved, false))

        return {
          errors,
          totalUnresolved: parseInt(String(unresolvedRow?.count ?? 0), 10),
          nextCursor: hasMore
            ? errors[errors.length - 1]?.latestError?.timestamp
            : undefined,
        }
      }),

    // AC-7.3: mark error as resolved
    resolve: adminProcedure
      .input(z.object({ errorId: z.string().uuid() }))
      .mutation(async ({ input }) => {
        const [existing] = await deps.db
          .select({ id: eventConsumerErrors.id })
          .from(eventConsumerErrors)
          .where(eq(eventConsumerErrors.id, input.errorId))
          .limit(1)

        if (!existing) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Error not found" })
        }

        await deps.db
          .update(eventConsumerErrors)
          .set({ resolved: true, resolvedAt: new Date() })
          .where(eq(eventConsumerErrors.id, input.errorId))
      }),

    // AC-7.4, AC-7.5: re-emit stored payload, mark resolved
    retry: adminProcedure
      .input(z.object({ errorId: z.string().uuid() }))
      .mutation(async ({ input }) => {
        const [errorRecord] = await deps.db
          .select()
          .from(eventConsumerErrors)
          .where(eq(eventConsumerErrors.id, input.errorId))
          .limit(1)

        if (!errorRecord) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Error not found" })
        }

        // AC-7.5: re-emit through event bus — triggers ALL consumers, not directed
        await deps.bus.emit(
          errorRecord.eventType as EventType,
          errorRecord.payload as never,
          deps.waitUntilFn,
        )

        // Mark original as resolved — if consumer fails again, bus logs a new error row
        await deps.db
          .update(eventConsumerErrors)
          .set({ resolved: true, resolvedAt: new Date() })
          .where(eq(eventConsumerErrors.id, input.errorId))
      }),
  })
}
