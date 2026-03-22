// Admin dashboard router — S7 §1, CS-WORK-057 AC-1.3, AC-1.6, AC-1.7, AC-1.8, AC-1.9
// 7 parallel aggregate queries merged into single AdminOverview response.

import { sql, eq, and, inArray, isNotNull, lt } from "drizzle-orm"
import { router, adminProcedure } from "@/server/trpc"
import type { Db } from "@/db/types"
import type { NotificationDb } from "@/lib/notifications"
import { getUnreadCount } from "@/lib/notifications"
import { supportTickets } from "@/db/schema/operations"
import { taskSpecs } from "@/db/schema/operations"
import { complianceRegister } from "@/db/schema/operations"
import { billingReconciliationStatus } from "@/db/schema/operations"
import { orchestratedFlows, eventConsumerErrors, deferredActions } from "@/db/schema/shared"

// --- Types ---

type HealthSignal = {
  name: string
  status: "healthy" | "warning" | "critical"
  detail: string
  lastChecked: string
}

export type AdminOverview = {
  tickets: { open: number; critical: number; approachingSLA: number }
  tasks: { pending: number; overdue: number; byDomain: Record<string, number> }
  flows: { active: number; failed: number; escalated: number }
  health: { status: "healthy" | "degraded" | "unhealthy"; signals: HealthSignal[] }
  compliance: { openDSARs: number; approachingDeadlines: number }
  billing: { status: string; activeHolds: number }
  notifications: { unread: number }
}

// --- Deps ---

export type AdminDashboardRouterDeps = {
  db: Db
  notificationDb: NotificationDb
}

// --- Health signal computation (shared with admin.health.getStatus) ---

export async function computeHealthSignals(db: Db): Promise<{
  overall: "healthy" | "degraded" | "unhealthy"
  signals: HealthSignal[]
}> {
  const now = new Date().toISOString()
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000)

  // AC-8.8: 5 parallel queries
  const [billingResult, errorResult, exhaustedResult, flowResult] = await Promise.all([
    // 1. Billing reconciliation (AC-8.3)
    db.select().from(billingReconciliationStatus).limit(1),

    // 2. Unresolved event consumer errors in last 24h (AC-8.4)
    db.select({ count: sql<number>`count(*)::int` })
      .from(eventConsumerErrors)
      .where(and(
        eq(eventConsumerErrors.resolved, false),
        lt(sql`${eventConsumerErrors.createdAt}`, sql`now()`),
        sql`${eventConsumerErrors.createdAt} > ${twentyFourHoursAgo.toISOString()}::timestamptz`,
      )),

    // 3. Exhausted deferred actions in last 24h (AC-8.5)
    db.select({ count: sql<number>`count(*)::int` })
      .from(deferredActions)
      .where(and(
        eq(deferredActions.status, "exhausted"),
        sql`${deferredActions.createdAt} > ${twentyFourHoursAgo.toISOString()}::timestamptz`,
      )),

    // 4. Failed/escalated orchestrated flows (AC-8.6)
    db.select({ count: sql<number>`count(*)::int` })
      .from(orchestratedFlows)
      .where(inArray(orchestratedFlows.status, ["failed", "escalated"])),
  ])

  const signals: HealthSignal[] = []

  // 1. Billing reconciliation (AC-8.3: defaults to warning if no row)
  const billing = billingResult[0]
  if (!billing) {
    signals.push({
      name: "billing_reconciliation",
      status: "warning",
      detail: "No reconciliation run recorded",
      lastChecked: now,
    })
  } else {
    signals.push({
      name: "billing_reconciliation",
      status: billing.status === "failed" ? "critical" : billing.status === "anomaly_detected" ? "warning" : "healthy",
      detail: `Last run: ${billing.lastRunAt.toISOString()}. Status: ${billing.status}`,
      lastChecked: now,
    })
  }

  // 2. Event consumer errors (AC-8.4)
  const unresolvedErrors = errorResult[0]?.count ?? 0
  signals.push({
    name: "event_consumer_errors",
    status: unresolvedErrors > 10 ? "critical" : unresolvedErrors > 0 ? "warning" : "healthy",
    detail: `${unresolvedErrors} unresolved error(s) in last 24h`,
    lastChecked: now,
  })

  // 3. Deferred action failures (AC-8.5)
  const exhaustedActions = exhaustedResult[0]?.count ?? 0
  signals.push({
    name: "deferred_action_failures",
    status: exhaustedActions > 0 ? "warning" : "healthy",
    detail: `${exhaustedActions} exhausted action(s) in last 24h`,
    lastChecked: now,
  })

  // 4. Orchestrated flow failures (AC-8.6)
  const failedFlows = flowResult[0]?.count ?? 0
  signals.push({
    name: "orchestrated_flows",
    status: failedFlows > 0 ? "critical" : "healthy",
    detail: `${failedFlows} failed/escalated flow(s)`,
    lastChecked: now,
  })

  // 5. Paddle webhook silence (AC-8.7: >48h since last reconciliation = warning)
  const lastRunAt = billing?.lastRunAt
  const paddleSilent = !lastRunAt || lastRunAt < fortyEightHoursAgo
  signals.push({
    name: "paddle_webhook_silence",
    status: paddleSilent ? "warning" : "healthy",
    detail: lastRunAt
      ? `Last reconciliation: ${lastRunAt.toISOString()}`
      : "No Paddle reconciliation run recorded",
    lastChecked: now,
  })

  const overall = signals.some(s => s.status === "critical") ? "unhealthy"
    : signals.some(s => s.status === "warning") ? "degraded"
    : "healthy"

  return { overall, signals }
}

// --- Router ---

export function createAdminDashboardRouter(deps: AdminDashboardRouterDeps) {
  return router({
    getOverview: adminProcedure
      .query(async ({ ctx }): Promise<AdminOverview> => {
        const fourHoursFromNow = new Date(Date.now() + 4 * 60 * 60 * 1000)
        const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

        const [
          ticketCounts,
          taskCounts,
          taskByDomain,
          flowCounts,
          health,
          complianceCounts,
          billingResult,
          unread,
        ] = await Promise.all([
          // 1. Support tickets
          deps.db.select({
            open: sql<number>`count(*) filter (where ${supportTickets.status} = 'open')::int`,
            critical: sql<number>`count(*) filter (where ${supportTickets.priority} = 'critical' and ${supportTickets.status} in ('open', 'assigned'))::int`,
            approachingSLA: sql<number>`count(*) filter (where ${supportTickets.slaDeadline} is not null and ${supportTickets.slaDeadline} < ${fourHoursFromNow.toISOString()}::timestamptz and ${supportTickets.status} in ('open', 'assigned'))::int`,
          }).from(supportTickets),

          // 2. Task counts
          deps.db.select({
            pending: sql<number>`count(*) filter (where ${taskSpecs.status} = 'pending')::int`,
            overdue: sql<number>`count(*) filter (where ${taskSpecs.deadline} is not null and ${taskSpecs.deadline} < now() and ${taskSpecs.status} in ('pending', 'assigned', 'in_progress'))::int`,
          }).from(taskSpecs),

          // 3. Tasks by domain (active only)
          deps.db.execute(sql`
            select domain, count(*)::int as cnt
            from task_specs
            where status in ('pending', 'assigned', 'in_progress')
            group by domain
          `),

          // 4. Orchestrated flows
          deps.db.select({
            active: sql<number>`count(*) filter (where ${orchestratedFlows.status} in ('initiated', 'in_progress'))::int`,
            failed: sql<number>`count(*) filter (where ${orchestratedFlows.status} = 'failed')::int`,
            escalated: sql<number>`count(*) filter (where ${orchestratedFlows.status} = 'escalated')::int`,
          }).from(orchestratedFlows),

          // 5. Health signals
          computeHealthSignals(deps.db),

          // 6. Compliance
          deps.db.select({
            openDSARs: sql<number>`count(*) filter (where ${complianceRegister.type} = 'dsar' and ${complianceRegister.status} in ('open', 'in_progress'))::int`,
            approachingDeadlines: sql<number>`count(*) filter (where ${complianceRegister.deadline} is not null and ${complianceRegister.deadline} < ${sevenDaysFromNow.toISOString()}::timestamptz and ${complianceRegister.status} in ('open', 'in_progress'))::int`,
          }).from(complianceRegister),

          // 7. Billing reconciliation status
          deps.db.select().from(billingReconciliationStatus).limit(1),

          // 8. Admin notification unread count
          getUnreadCount(deps.notificationDb, ctx.session.accountId),
        ])

        // Build byDomain map
        const byDomain: Record<string, number> = {}
        const domainRows = taskByDomain.rows as Array<{ domain: string; cnt: number }>
        for (const row of domainRows) {
          byDomain[row.domain] = row.cnt
        }

        const billing = billingResult[0]

        return {
          tickets: {
            open: ticketCounts[0]?.open ?? 0,
            critical: ticketCounts[0]?.critical ?? 0,
            approachingSLA: ticketCounts[0]?.approachingSLA ?? 0,
          },
          tasks: {
            pending: taskCounts[0]?.pending ?? 0,
            overdue: taskCounts[0]?.overdue ?? 0,
            byDomain,
          },
          flows: {
            active: flowCounts[0]?.active ?? 0,
            failed: flowCounts[0]?.failed ?? 0,
            escalated: flowCounts[0]?.escalated ?? 0,
          },
          health: {
            status: health.overall,
            signals: health.signals,
          },
          compliance: {
            openDSARs: complianceCounts[0]?.openDSARs ?? 0,
            approachingDeadlines: complianceCounts[0]?.approachingDeadlines ?? 0,
          },
          billing: {
            status: billing?.status ?? "healthy",
            activeHolds: billing?.activeHolds ?? 0,
          },
          notifications: { unread },
        }
      }),
  })
}
