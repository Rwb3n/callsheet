// Admin friction router — S7 §12, Ops §3.4, CS-WORK-064
// Single route: getSummary returns feature gate friction ratios.

import { z } from "zod"
import { router, adminProcedure } from "@/server/trpc"
import type { Db } from "@/db/types"
import { getFeatureGateFrictionSummary } from "@/domains/operations/friction/queries"

export type AdminFrictionRouterDeps = {
  db: Db
}

export function createAdminFrictionRouter(deps: AdminFrictionRouterDeps) {
  return router({
    getSummary: adminProcedure
      .input(z.object({
        period: z.enum(["30d", "90d", "365d"]),
      }))
      .query(async ({ input }) => {
        return getFeatureGateFrictionSummary(deps.db, input.period)
      }),
  })
}
