// Admin users router — CS-WORK-096
// 3 routes: list, getDetail, updateRole
// All adminProcedure.

import { z } from "zod"
import { eq, and, desc, lte, ilike, or } from "drizzle-orm"
import { TRPCError } from "@trpc/server"
import { router, adminProcedure } from "@/server/trpc"
import type { Db } from "@/db/types"
import { user } from "@/db/schema/auth"
import { accountProfiles } from "@/db/schema/accounts"

export type AdminUsersRouterDeps = {
  db: Db
}

const userListInput = z.object({
  search: z.string().optional(),
  role: z.enum(["user", "admin"]).optional(),
  cursor: z.string().datetime().optional(),
  limit: z.number().int().min(1).max(50).default(20),
})

export function createAdminUsersRouter(deps: AdminUsersRouterDeps) {
  return router({
    // AC-1: paginated list with search and role filter
    list: adminProcedure
      .input(userListInput)
      .query(async ({ input }) => {
        const conditions = []

        if (input.role) {
          conditions.push(eq(user.role, input.role))
        }
        if (input.search) {
          const pattern = `%${input.search}%`
          conditions.push(or(ilike(user.name, pattern), ilike(user.email, pattern))!)
        }
        if (input.cursor) {
          conditions.push(lte(user.createdAt, new Date(input.cursor)))
        }

        const rows = await deps.db
          .select({
            id: user.id,
            name: user.name,
            email: user.email,
            emailVerified: user.emailVerified,
            role: user.role,
            createdAt: user.createdAt,
          })
          .from(user)
          .where(conditions.length > 0 ? and(...conditions) : undefined)
          .orderBy(desc(user.createdAt))
          .limit(input.limit + 1)

        const hasMore = rows.length > input.limit
        const items = rows.slice(0, input.limit).map((r) => ({
          id: r.id,
          name: r.name,
          email: r.email,
          emailVerified: r.emailVerified,
          role: r.role,
          createdAt: r.createdAt.toISOString(),
        }))

        return {
          items,
          nextCursor: hasMore ? items[items.length - 1].createdAt : undefined,
        }
      }),

    // AC-2: full user detail with profile
    getDetail: adminProcedure
      .input(z.object({ userId: z.string().min(1) }))
      .query(async ({ input }) => {
        const [row] = await deps.db
          .select()
          .from(user)
          .where(eq(user.id, input.userId))
          .limit(1)

        if (!row) {
          throw new TRPCError({ code: "NOT_FOUND", message: "User not found" })
        }

        const [profile] = await deps.db
          .select()
          .from(accountProfiles)
          .where(eq(accountProfiles.accountId, input.userId))
          .limit(1)

        return {
          id: row.id,
          name: row.name,
          email: row.email,
          emailVerified: row.emailVerified,
          role: row.role,
          image: row.image,
          createdAt: row.createdAt.toISOString(),
          profile: profile ? {
            fullName: profile.fullName,
            suppressedAt: profile.suppressedAt?.toISOString() ?? null,
            suppressionReason: profile.suppressionReason,
            paddleCustomerId: profile.paddleCustomerId,
          } : null,
        }
      }),

    // AC-3: update user role
    updateRole: adminProcedure
      .input(z.object({
        userId: z.string().min(1),
        role: z.enum(["user", "admin"]),
      }))
      .mutation(async ({ input }) => {
        const [existing] = await deps.db
          .select({ id: user.id })
          .from(user)
          .where(eq(user.id, input.userId))
          .limit(1)

        if (!existing) {
          throw new TRPCError({ code: "NOT_FOUND", message: "User not found" })
        }

        await deps.db
          .update(user)
          .set({ role: input.role, updatedAt: new Date() })
          .where(eq(user.id, input.userId))

        return { userId: input.userId, role: input.role }
      }),
  })
}
