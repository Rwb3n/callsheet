// Notification router — S5 §6, SI §8
// List, dismiss, mark-read, unread count. Cursor-based pagination.

import { z } from "zod"
import { and, eq, lt, desc, isNull } from "drizzle-orm"
import { sql } from "drizzle-orm"
import { router, protectedProcedure } from "@/server/trpc"
import type { Db } from "@/db/types"
import { notifications } from "@/db/schema/shared"

export type NotificationRouterDeps = {
  db: Db
}

export function createNotificationRouter(deps: NotificationRouterDeps) {
  return router({
    // AC-23: list with cursor-based pagination, newest first, excludes dismissed
    list: protectedProcedure
      .input(z.object({
        cursor: z.string().uuid().optional(),
        limit: z.number().min(1).max(50).default(20),
      }))
      .query(async ({ ctx, input }) => {
        const accountId = ctx.session.accountId
        const conditions = [
          eq(notifications.accountId, accountId),
          eq(notifications.dismissed, false),
        ]

        if (input.cursor) {
          // Fetch cursor row's createdAt for keyset pagination
          const [cursorRow] = await deps.db
            .select({ createdAt: notifications.createdAt })
            .from(notifications)
            .where(eq(notifications.id, input.cursor))
            .limit(1)
          if (cursorRow) {
            conditions.push(lt(notifications.createdAt, cursorRow.createdAt))
          }
        }

        const rows = await deps.db
          .select()
          .from(notifications)
          .where(and(...conditions))
          .orderBy(desc(notifications.createdAt))
          .limit(input.limit + 1)

        const hasMore = rows.length > input.limit
        const items = hasMore ? rows.slice(0, input.limit) : rows

        return {
          items: items.map(toResponse),
          nextCursor: hasMore ? items[items.length - 1].id : null,
        }
      }),

    // AC-24: soft-delete (dismissed=true, dismissedAt=now)
    dismiss: protectedProcedure
      .input(z.object({ notificationId: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        await deps.db
          .update(notifications)
          .set({ dismissed: true, dismissedAt: new Date() })
          .where(and(
            eq(notifications.id, input.notificationId),
            eq(notifications.accountId, ctx.session.accountId),
          ))
        return { success: true }
      }),

    // AC-25: mark single notification as read
    markRead: protectedProcedure
      .input(z.object({ notificationId: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        await deps.db
          .update(notifications)
          .set({ readAt: new Date() })
          .where(and(
            eq(notifications.id, input.notificationId),
            eq(notifications.accountId, ctx.session.accountId),
          ))
        return { success: true }
      }),

    // AC-25, AC-26: unread count (not read AND not dismissed)
    getUnreadCount: protectedProcedure
      .query(async ({ ctx }) => {
        const [row] = await deps.db
          .select({ count: sql<number>`count(*)::int` })
          .from(notifications)
          .where(and(
            eq(notifications.accountId, ctx.session.accountId),
            isNull(notifications.readAt),
            eq(notifications.dismissed, false),
          ))
        return { count: row.count }
      }),
  })
}

function toResponse(row: typeof notifications.$inferSelect) {
  return {
    id: row.id,
    accountId: row.accountId,
    type: row.type,
    title: row.title,
    body: row.body,
    link: row.link,
    readAt: row.readAt?.toISOString() ?? null,
    dismissed: row.dismissed,
    dismissedAt: row.dismissedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  }
}
