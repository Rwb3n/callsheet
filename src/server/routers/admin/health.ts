// Admin health router — S7 §8, CS-WORK-062
// Single route: getStatus returns 5 health signals with overall severity.

import { router, adminProcedure } from "@/server/trpc"
import type { Db } from "@/db/types"
import { computeHealthSignals } from "./dashboard"

// --- Deps ---

export type AdminHealthRouterDeps = {
  db: Db
}

// --- Router ---

export function createAdminHealthRouter(deps: AdminHealthRouterDeps) {
  return router({
    getStatus: adminProcedure
      .query(async () => {
        return computeHealthSignals(deps.db)
      }),
  })
}
