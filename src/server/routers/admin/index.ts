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
import { createAdminGraduationRouter } from "./graduation"
import type { AdminGraduationRouterDeps } from "./graduation"
import { createAdminSchedulerRouter } from "./scheduler"
import type { AdminSchedulerRouterDeps } from "./scheduler"
import { createAdminDecisionsRouter } from "./decisions"
import type { AdminDecisionsRouterDeps } from "./decisions"
import { createAdminNotificationsRouter } from "./notifications"
import type { AdminNotificationsRouterDeps } from "./notifications"
import { createAdminUsersRouter } from "./users"
import type { AdminUsersRouterDeps } from "./users"
import { createAdminListingsRouter } from "./listings"
import type { AdminListingsRouterDeps } from "./listings"
import { createAdminTasksRouter } from "./tasks"
import type { AdminTasksRouterDeps } from "./tasks"
import { createAdminApiKeysRouter } from "./api-keys"
import type { AdminApiKeysRouterDeps } from "./api-keys"

export type AdminRouterDeps = AdminDashboardRouterDeps & AdminSupportRouterDeps & AdminBillingRouterDeps & AdminComplianceRouterDeps & AdminFlowsRouterDeps & AdminEventsRouterDeps & AdminHealthRouterDeps & AdminFrictionRouterDeps & AdminRefundsRouterDeps & AdminIntelligenceRouterDeps & AdminGraduationRouterDeps & AdminSchedulerRouterDeps & AdminDecisionsRouterDeps & AdminNotificationsRouterDeps & AdminUsersRouterDeps & AdminListingsRouterDeps & AdminTasksRouterDeps & AdminApiKeysRouterDeps

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
    graduation: createAdminGraduationRouter(deps),
    scheduler: createAdminSchedulerRouter(deps),
    decisions: createAdminDecisionsRouter(deps),
    notifications: createAdminNotificationsRouter(deps),
    users: createAdminUsersRouter(deps),
    listings: createAdminListingsRouter(deps),
    tasks: createAdminTasksRouter(deps),
    apiKeys: createAdminApiKeysRouter(deps),
  })
}
