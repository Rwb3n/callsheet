// Admin notifications router — CS-WORK-095
// 2 routes: list (cross-account), dismiss
// All adminProcedure.

import { z } from "zod"
import { eq, and, desc, lte } from "drizzle-orm"
import { TRPCError } from "@trpc/server"
import { router, adminProcedure } from "@/server/trpc"
import type { Db } from "@/db/types"
import { notifications } from "@/db/schema/shared"

export type AdminNotificationsRouterDeps = {
  db: Db
}

const notificationListInput = z.object({
  accountId: z.string().optional(),
  type: z.string().optional(),
  dismissed: z.boolean().optional(),
  cursor: z.string().datetime().optional(),
  limit: z.number().int().min(1).max(50).default(20),
})

export function createAdminNotificationsRouter(deps: AdminNotificationsRouterDeps) {
  return router({
    // AC-1: cross-account list with filters
    list: adminProcedure
      .input(notificationListInput)
      .query(async ({ input }) => {
        const conditions = []

        if (input.accountId) {
          conditions.push(eq(notifications.accountId, input.accountId))
        }
        if (input.type) {
          conditions.push(eq(notifications.type, input.type))
        }
        if (input.dismissed !== undefined) {
          conditions.push(eq(notifications.dismissed, input.dismissed))
        }
        if (input.cursor) {
          conditions.push(lte(notifications.createdAt, new Date(input.cursor)))
        }

        const rows = await deps.db
          .select()
          .from(notifications)
          .where(conditions.length > 0 ? and(...conditions) : undefined)
          .orderBy(desc(notifications.createdAt))
          .limit(input.limit + 1)

        const hasMore = rows.length > input.limit
        const items = rows.slice(0, input.limit).map(toDto)

        return {
          items,
          nextCursor: hasMore ? items[items.length - 1].createdAt : undefined,
        }
      }),

    // AC-2: admin dismiss any notification
    dismiss: adminProcedure
      .input(z.object({ notificationId: z.string().uuid() }))
      .mutation(async ({ input }) => {
        const [row] = await deps.db
          .select({ id: notifications.id })
          .from(notifications)
          .where(eq(notifications.id, input.notificationId))
          .limit(1)

        if (!row) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Notification not found" })
        }

        await deps.db
          .update(notifications)
          .set({ dismissed: true, dismissedAt: new Date() })
          .where(eq(notifications.id, input.notificationId))

        return { success: true as const }
      }),
  })
}

function toDto(row: typeof notifications.$inferSelect) {
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
