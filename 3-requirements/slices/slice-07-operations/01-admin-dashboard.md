<!-- Part of slice-07-operations v2 -->

# S7 §1 — Admin Dashboard Layout & Navigation

---

The admin dashboard is a role-guarded CSR application shell with a sidebar navigator and a 7-panel overview page. All data flows through `adminProcedure` queries; the overview aggregates 7 parallel COUNT queries into a single `AdminOverview` response.

## 1.1 Admin Layout Guard

Two enforcement layers prevent non-admin access. The App Router layout redirects unauthenticated or non-admin users before any admin page renders. The tRPC `adminProcedure` middleware rejects API calls from non-admin sessions. Both use `role.startsWith("admin")` to ease V2 migration to scoped roles. [Source: `shared-infrastructure.md` — §4.1]

```typescript
// src/app/admin/layout.tsx
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session) redirect("/login?redirect=/admin")
  if (!session.role.startsWith("admin")) redirect("/dashboard")

  return <AdminShell session={session}>{children}</AdminShell>
}
```

`AdminShell` is a layout component rendering the sidebar navigation and notification badge. It passes `session` to child components for audit trail attribution (`ctx.session.accountId`). [Source: `01-router-plan.md` — §2.2]

All admin pages use CSR. No SSG or ISR — authenticated, role-guarded pages with no SEO value and interactive controls requiring client-side state. [Source: `shared-infrastructure.md` — §7.1]

## 1.2 Sidebar Navigation Structure

The sidebar provides access to 8 admin areas. Each maps to a route group under `src/app/admin/`.

```
Admin Dashboard
├── Overview        /admin              (§1 — aggregate stats)
├── Tasks           /admin/tasks        (§3 — TaskSpec queue)
├── Support         /admin/support      (§2 — ticket management)
├── Billing         /admin/billing      (§4 — reconciliation + refunds)
├── Compliance      /admin/compliance   (§5 — DSAR, obligations)
├── Flows           /admin/flows        (§6 — erasure + closure)
├── Events          /admin/events       (§7 — failed event view)
└── Health          /admin/health       (§8 — platform health + §12 friction)
```

Each sidebar item displays a count badge when the section has items requiring attention:
- **Tasks:** count of `pending` + `assigned` tasks
- **Support:** count of `open` + `assigned` tickets
- **Billing:** "!" indicator when `status !== "healthy"`
- **Compliance:** count of entries with `deadline < now() + 7d` AND `status IN ('open', 'in_progress')`
- **Flows:** count of `failed` + `escalated` flows
- **Events:** count of unresolved errors

These badge counts are not fetched independently — they are embedded in the `AdminOverview` response to avoid N+1 sidebar queries.

## 1.3 Notification Badge

The admin notification badge in the sidebar header reuses the existing `getNotifications(accountId)` query from S5. Admin is a standard account with `role: "admin"` — the notification infrastructure treats admin identically to any other account. [Source: `01-decisions.md` — D4]

Three new notification types are delivered to the admin's `accountId` via the existing `Notification` table:

| Type | Trigger | Link |
|------|---------|------|
| `task_overdue` | TaskSpec approaching or past timeout | `/admin/tasks/[taskId]` |
| `billing_anomaly` | Billing reconciliation detected anomaly | `/admin/billing` |
| `compliance_deadline` | Compliance obligation approaching deadline | `/admin/compliance/[entryId]` |

No separate `getAdminNotifications` query. The unread count appears in the `AdminOverview` response as `notifications.unread`. [Source: `shared-infrastructure.md` — §8.1]

## 1.4 Overview Page — 7-Panel Layout

`/admin` renders a 7-panel card layout. Each panel displays summary metrics for one operational area.

| Panel | Source Query | Metrics Shown |
|-------|-------------|---------------|
| **Support** | `COUNT` on `support_tickets` | Open tickets, critical tickets, approaching SLA deadline |
| **Tasks** | `COUNT` on `task_specs` | Pending tasks, overdue tasks, breakdown by domain |
| **Flows** | `COUNT` on `orchestrated_flows` | Active flows, failed flows, escalated flows |
| **Health** | Health signal aggregation | Overall status (healthy/degraded/unhealthy), signal list |
| **Compliance** | `COUNT` on `compliance_register` | Open DSARs, approaching deadlines |
| **Billing** | `SELECT` on `billing_reconciliation_status` | Status, active holds count |
| **Notifications** | `getNotifications(accountId)` count | Unread notification count |

## 1.5 `admin.dashboard.getOverview` Implementation

Contract: `01-router-plan.md` — §3.1. Returns `AdminOverview`.

```
admin.dashboard.getOverview():
  // 7 parallel queries — merged server-side
  [tickets, tasks, flows, health, compliance, billing, notifications] = await Promise.all([

    // 1. Support tickets
    db.select({
      open: count().filter(eq(supportTickets.status, "open")),
      critical: count().filter(
        and(eq(supportTickets.priority, "critical"), inArray(supportTickets.status, ["open", "assigned"]))
      ),
      approachingSLA: count().filter(
        and(
          isNotNull(supportTickets.slaDeadline),
          lt(supportTickets.slaDeadline, now() + interval("4 hours")),
          inArray(supportTickets.status, ["open", "assigned"])
        )
      ),
    }).from(supportTickets),

    // 2. TaskSpec queue
    db.select({
      pending: count().filter(eq(taskSpecs.status, "pending")),
      overdue: count().filter(
        and(isNotNull(taskSpecs.deadline), lt(taskSpecs.deadline, now()),
            inArray(taskSpecs.status, ["pending", "assigned", "in_progress"]))
      ),
      byDomain: sql`jsonb_object_agg(domain, cnt)
        FROM (SELECT domain, count(*) as cnt FROM task_specs
              WHERE status IN ('pending','assigned','in_progress')
              GROUP BY domain)`,
    }).from(taskSpecs),

    // 3. Orchestrated flows
    db.select({
      active: count().filter(inArray(orchestratedFlows.status, ["initiated", "in_progress"])),
      failed: count().filter(eq(orchestratedFlows.status, "failed")),
      escalated: count().filter(eq(orchestratedFlows.status, "escalated")),
    }).from(orchestratedFlows),

    // 4. Health signals — delegates to admin.health.getStatus logic
    computeHealthSignals(),

    // 5. Compliance
    db.select({
      openDSARs: count().filter(
        and(eq(complianceRegister.type, "dsar"), inArray(complianceRegister.status, ["open", "in_progress"]))
      ),
      approachingDeadlines: count().filter(
        and(
          isNotNull(complianceRegister.deadline),
          lt(complianceRegister.deadline, now() + interval("7 days")),
          inArray(complianceRegister.status, ["open", "in_progress"])
        )
      ),
    }).from(complianceRegister),

    // 6. Billing reconciliation — single-row read
    db.select().from(billingReconciliationStatus).limit(1),

    // 7. Admin notification unread count
    getNotificationCount(ctx.session.accountId),
  ])

  return {
    tickets: { open: tickets.open, critical: tickets.critical, approachingSLA: tickets.approachingSLA },
    tasks: { pending: tasks.pending, overdue: tasks.overdue, byDomain: tasks.byDomain },
    flows: { active: flows.active, failed: flows.failed, escalated: flows.escalated },
    health: { status: health.overall, signals: health.signals },
    compliance: { openDSARs: compliance.openDSARs, approachingDeadlines: compliance.approachingDeadlines },
    billing: { status: billing?.status ?? "healthy", activeHolds: billing?.activeHolds ?? 0 },
    notifications: { unread: notifications },
  }
```

**Performance target:** <500ms p95 for all 7 parallel queries combined. Each individual query targets a partial index or small-table scan — no full table scans at V1 scale. The `billing_reconciliation_status` read is a single-row lookup. The `computeHealthSignals()` call reuses the same aggregation logic as `admin.health.getStatus` (§8).

## 1.6 Data Flow Diagram

```mermaid
flowchart LR
    subgraph "Admin Overview Page"
        OV[admin.dashboard.getOverview]
    end

    subgraph "7 Parallel Queries"
        ST[support_tickets<br/>COUNT by status/priority/SLA]
        TS[task_specs<br/>COUNT by status/domain/deadline]
        OF[orchestrated_flows<br/>COUNT by status]
        HS[Health Signal<br/>Aggregation]
        CR[compliance_register<br/>COUNT by type/deadline]
        BR[billing_reconciliation_status<br/>Single-row SELECT]
        NF[notifications<br/>Unread COUNT]
    end

    OV --> ST
    OV --> TS
    OV --> OF
    OV --> HS
    OV --> CR
    OV --> BR
    OV --> NF

    ST --> |open, critical, SLA| OV
    TS --> |pending, overdue, byDomain| OV
    OF --> |active, failed, escalated| OV
    HS --> |overall, signals[]| OV
    CR --> |openDSARs, deadlines| OV
    BR --> |status, activeHolds| OV
    NF --> |unread count| OV
```

## 1.7 Acceptance Criteria (§1)

| # | Criterion |
|---|-----------|
| AC-1.1 | Unauthenticated users visiting `/admin` are redirected to `/login?redirect=/admin` |
| AC-1.2 | Authenticated users with `role !== "admin"` visiting `/admin` are redirected to `/dashboard` |
| AC-1.3 | `adminProcedure` returns `FORBIDDEN` for non-admin `AuthSession` |
| AC-1.4 | Admin sidebar renders 8 navigation items with correct route links |
| AC-1.5 | Sidebar badge counts are sourced from `AdminOverview` response (no independent fetches) |
| AC-1.6 | `admin.dashboard.getOverview` returns all 7 aggregate panels with correct types |
| AC-1.7 | Overview query completes in <500ms p95 |
| AC-1.8 | Notification badge displays unread count from existing `getNotifications(ctx.session.accountId)` |
| AC-1.9 | Three new notification types (`task_overdue`, `billing_anomaly`, `compliance_deadline`) are delivered via existing `Notification` table with `accountId` = admin account ID |
