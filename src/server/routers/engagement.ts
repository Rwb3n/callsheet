// Engagement counter query interface — D&L §3.2, S1 §4.5

import { z } from "zod"
import { eq } from "drizzle-orm"
import { router, protectedProcedure } from "@/server/trpc"
import type { Db } from "@/db/types"
import { engagements } from "@/db/schema/data-and-listings"

type EngagementCounters = {
  profileViews: number
  searchAppearances: number
  enquiriesReceived: number
  enquiryResponseRate: number | null
  enquiryResponseTime: number | null
}

export type EngagementRouterDeps = { db: Db }

export function createEngagementRouter(deps: EngagementRouterDeps) {
  return router({
    getCounters: protectedProcedure
      .input(z.object({ listingId: z.string().uuid() }))
      .query(async ({ input }): Promise<EngagementCounters> => {
        const [row] = await deps.db
          .select()
          .from(engagements)
          .where(eq(engagements.listingId, input.listingId))
          .limit(1)

        // Zero-initialised for unclaimed/nonexistent listings [S6-ST-11]
        if (!row) {
          return {
            profileViews: 0,
            searchAppearances: 0,
            enquiriesReceived: 0,
            enquiryResponseRate: null,
            enquiryResponseTime: null,
          }
        }

        return {
          profileViews: row.profileViews,
          searchAppearances: row.searchAppearances,
          enquiriesReceived: row.enquiriesReceived,
          enquiryResponseRate: row.enquiryResponseRate,
          enquiryResponseTime: row.enquiryResponseTime,
        }
      }),
  })
}
