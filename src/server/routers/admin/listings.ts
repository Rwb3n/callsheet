// Admin listings router — CS-WORK-097
// 2 routes: suspend, unsuspend
// All adminProcedure.

import { z } from "zod"
import { eq } from "drizzle-orm"
import { TRPCError } from "@trpc/server"
import { router, adminProcedure } from "@/server/trpc"
import type { Db } from "@/db/types"
import { listings } from "@/db/schema/data-and-listings"

export type AdminListingsRouterDeps = {
  db: Db
}

export function createAdminListingsRouter(deps: AdminListingsRouterDeps) {
  return router({
    // AC-1: suspend a listing (sets lifecycleStatus to suspended)
    suspend: adminProcedure
      .input(z.object({
        listingId: z.string().uuid(),
        reason: z.string().min(1),
      }))
      .mutation(async ({ input }) => {
        const [row] = await deps.db
          .select({ id: listings.id, lifecycleStatus: listings.lifecycleStatus })
          .from(listings)
          .where(eq(listings.id, input.listingId))
          .limit(1)

        if (!row) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Listing not found" })
        }
        if (row.lifecycleStatus === "suspended") {
          throw new TRPCError({ code: "CONFLICT", message: "Listing is already suspended" })
        }

        await deps.db
          .update(listings)
          .set({ lifecycleStatus: "suspended", updatedAt: new Date() })
          .where(eq(listings.id, input.listingId))

        return { listingId: input.listingId, status: "suspended" as const }
      }),

    // AC-2: unsuspend a listing (restores to active)
    unsuspend: adminProcedure
      .input(z.object({
        listingId: z.string().uuid(),
      }))
      .mutation(async ({ input }) => {
        const [row] = await deps.db
          .select({ id: listings.id, lifecycleStatus: listings.lifecycleStatus })
          .from(listings)
          .where(eq(listings.id, input.listingId))
          .limit(1)

        if (!row) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Listing not found" })
        }
        if (row.lifecycleStatus !== "suspended") {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Listing is not suspended" })
        }

        await deps.db
          .update(listings)
          .set({ lifecycleStatus: "active", updatedAt: new Date() })
          .where(eq(listings.id, input.listingId))

        return { listingId: input.listingId, status: "active" as const }
      }),
  })
}
