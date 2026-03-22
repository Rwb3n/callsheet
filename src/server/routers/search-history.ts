// Search history router — S6 §5.2, CS-WORK-054
// Read/clear access for authenticated users. Writes happen inside search.query.

import { z } from "zod"
import { eq, desc } from "drizzle-orm"
import { router, protectedProcedure } from "@/server/trpc"
import type { Db } from "@/db/types"
import { searchHistory } from "@/db/schema/accounts"

const MAX_HISTORY_LIMIT = 50
const DEFAULT_HISTORY_LIMIT = 10

export type SearchHistoryRouterDeps = {
  db: Db
}

export function createSearchHistoryRouter(deps: SearchHistoryRouterDeps) {
  const { db } = deps

  return router({
    // AC-35: list recent search history for authenticated user
    list: protectedProcedure
      .input(z.object({
        limit: z.number().int().min(1).max(MAX_HISTORY_LIMIT).optional(),
      }))
      .query(async ({ ctx, input }) => {
        const effectiveLimit = Math.min(input.limit ?? DEFAULT_HISTORY_LIMIT, MAX_HISTORY_LIMIT)

        return db.select({
          id: searchHistory.id,
          query: searchHistory.query,
          filters: searchHistory.filters,
          resultCount: searchHistory.resultCount,
          createdAt: searchHistory.createdAt,
        })
          .from(searchHistory)
          .where(eq(searchHistory.accountId, ctx.session.accountId))
          .orderBy(desc(searchHistory.createdAt))
          .limit(effectiveLimit)
      }),

    // AC-36: clear all search history for authenticated user only
    clear: protectedProcedure
      .mutation(async ({ ctx }) => {
        await db.delete(searchHistory)
          .where(eq(searchHistory.accountId, ctx.session.accountId))
      }),
  })
}
