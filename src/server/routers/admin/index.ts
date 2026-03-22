// Admin router — merges all admin sub-routers into admin.* namespace.
// S7 §6, §7, §8. CS-WORK-062 adds health.

import { router } from "@/server/trpc"
import { createAdminDashboardRouter } from "./dashboard"
import type { AdminDashboardRouterDeps } from "./dashboard"
import { createAdminSupportRouter } from "./support"
import type { AdminSupportRouterDeps } from "./support"
import { createAdminBillingRouter } from "./billing"
import type { AdminBillingRouterDeps } from "./billing"
import { createAdminComplianceRouter } from "./compliance"
import type { AdminComplianceRouterDeps } from "./compliance"
import { createAdminFlowsRouter } from "./flows"
import type { AdminFlowsRouterDeps } from "./flows"
import { createAdminEventsRouter } from "./events"
import type { AdminEventsRouterDeps } from "./events"
import { createAdminHealthRouter } from "./health"
import type { AdminHealthRouterDeps } from "./health"
import { createAdminFrictionRouter } from "./friction"
import type { AdminFrictionRouterDeps } from "./friction"
import { createAdminRefundsRouter } from "./refunds"
import type { AdminRefundsRouterDeps } from "./refunds"
import { createAdminIntelligenceRouter } from "./intelligence"
import type { AdminIntelligenceRouterDeps } from "./intelligence"

export type AdminRouterDeps = AdminDashboardRouterDeps & AdminSupportRouterDeps & AdminBillingRouterDeps & AdminComplianceRouterDeps & AdminFlowsRouterDeps & AdminEventsRouterDeps & AdminHealthRouterDeps & AdminFrictionRouterDeps & AdminRefundsRouterDeps & AdminIntelligenceRouterDeps

export function createAdminRouter(deps: AdminRouterDeps) {
  return router({
    dashboard: createAdminDashboardRouter(deps),
    support: createAdminSupportRouter(deps),
    billing: createAdminBillingRouter(deps),
    compliance: createAdminComplianceRouter(deps),
    flows: createAdminFlowsRouter(deps),
    events: createAdminEventsRouter(deps),
    health: createAdminHealthRouter(deps),
    friction: createAdminFrictionRouter(deps),
    refunds: createAdminRefundsRouter(deps),
    intelligence: createAdminIntelligenceRouter(deps),
  })
}
