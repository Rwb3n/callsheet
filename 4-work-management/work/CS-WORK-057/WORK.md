---
template: work_item
id: CS-WORK-057
title: "Operations schema and admin dashboard"
type: feature
status: done
owner: null
created: 2026-02-25
spawned_by: null
spawned_children: []
chapter: CH-CS-009
arc: buyer-and-operations
epoch: CS-E1
closed: 2026-02-25
priority: critical
effort: large
traces_to:
  - REQ-CS-OPS-001
source_files:
  - D:/PROJECTS/callsheet/3-requirements/slices/slice-07-operations/index.md
  - D:/PROJECTS/callsheet/3-requirements/slices/slice-07-operations/00-schema.md
  - D:/PROJECTS/callsheet/3-requirements/slices/slice-07-operations/00-router-plan.md
  - D:/PROJECTS/callsheet/3-requirements/slices/slice-07-operations/01-admin-dashboard.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/operations.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/shared-infrastructure.md
acceptance_criteria:
  - "AC-1.1: Unauthenticated users visiting /admin are redirected to /login?redirect=/admin"
  - "AC-1.2: Authenticated users with role !== 'admin' visiting /admin are redirected to /dashboard"
  - "AC-1.3: adminProcedure returns FORBIDDEN for non-admin AuthSession"
  - "AC-1.4: Admin sidebar renders 8 navigation items with correct route links"
  - "AC-1.5: Sidebar badge counts are sourced from AdminOverview response (no independent fetches)"
  - "AC-1.6: admin.dashboard.getOverview returns all 7 aggregate panels with correct types"
  - "AC-1.7: Overview query completes in <500ms p95"
  - "AC-1.8: Notification badge displays unread count from existing getNotifications(ctx.session.accountId)"
  - "AC-1.9: Three new notification types (task_overdue, billing_anomaly, compliance_deadline) are delivered via existing Notification table with accountId = admin account ID"
blocked_by: []
blocks: [CS-WORK-058, CS-WORK-059, CS-WORK-060, CS-WORK-061, CS-WORK-062, CS-WORK-063, CS-WORK-064, CS-WORK-065]
enables: []
queue_position: done
cycle_phase: done
node_history:
  - node: backlog
    entered: 2026-02-25T00:00:00
    exited: 2026-02-25T00:00:00
  - node: done
    entered: 2026-02-25T00:00:00
    exited: null
artifacts:
  - src/db/schema/operations.ts
  - src/db/schema/shared.ts
  - src/lib/events/types.ts
  - drizzle/0012_damp_hulk.sql
  - src/server/routers/admin/dashboard.ts
  - src/server/routers/admin/index.ts
  - src/app/admin/layout.tsx
  - src/app/admin/admin-sidebar.tsx
  - src/app/admin/page.tsx
  - src/app/admin/overview-content.tsx
  - src/server/routers/__tests__/admin-dashboard.integration.test.ts
  - src/db/test-utils.ts
cycle_docs: {}
memory_refs: []
extensions:
  project: CALLSHEET
  slice: S7
  spec_sections: "Ops §1, §2, §3, §4, §5 (schema); SI §7.1 (CSR admin), SI §8.1 (notification types), SI §9 (decision logging)"
  io_profile: "db-write"
version: "2.0"
generated: 2026-02-25
last_updated: 2026-02-25T00:00:00
---

# CS-WORK-057: Operations schema and admin dashboard

## Context

Foundation work item for S7. Creates 7 new tables (`support_tickets`, `task_specs`, `churn_risk_registry`, `pending_cancellations` amendments, `billing_holds`, `compliance_register`, `billing_reconciliation_status`), 3 schema amendments (`orchestrated_flows` +`updatedAt`, `event_consumer_errors` +`resolved`/+`resolvedAt`, `support_tickets` +`details` JSONB), 7 pgEnums, the admin application shell with role-guarded access, sidebar navigation, and overview aggregate route. The admin dashboard is CSR (SI §7.1) — no SSR/SSG. The `adminProcedure` guard checks `role.startsWith("admin")` on `AuthSession`. Three new notification types (`task_overdue`, `billing_anomaly`, `compliance_deadline`) already exist in `NotificationType` union — this item wires delivery via existing `Notification` table.

**Type alignment notes:**
- `SubscriptionEndedEvent.reason` union is currently `"cancellation" | "grace_period_expired" | "account_closure"` — needs `"paddle_reconciliation"` added (S7-ST-3 sibling fix). Add during this work item so CS-WORK-059 can emit it.
- `event_consumer_errors` table is missing `resolved` boolean and `resolvedAt` timestamp columns (S0-11 flag). Add via migration.
- `orchestrated_flows` table is missing `updatedAt` column (S0-3 flag). Add via migration.
- `DecaySignalDetectedEvent`, `ChurnRiskDetectedEvent`, `WinbackEligibleEvent`, `WinbackDeliveryResultEvent` are placeholder stubs — populate real fields during CS-WORK-063.

## Deliverables

- [ ] `src/db/schema/operations.ts` — Add 5 new tables (`support_tickets`, `task_specs`, `churn_risk_registry`, `billing_holds`, `compliance_register`, `billing_reconciliation_status`), 7 pgEnums. Extend existing `pendingCancellations` if needed.
- [ ] `src/db/schema/shared.ts` — Amend `orchestratedFlows` (+`updatedAt`), `eventConsumerErrors` (+`resolved`, +`resolvedAt`). Add partial index on `event_consumer_errors(created_at DESC) WHERE resolved = false`.
- [ ] `drizzle/` — Migration for all new tables and amendments
- [ ] `src/lib/events/types.ts` — Add `"paddle_reconciliation"` to `SubscriptionEndedEvent.reason` union
- [ ] `src/server/trpc.ts` — Add `adminProcedure` (role guard)
- [ ] `src/server/routers/admin-dashboard.ts` — `createAdminDashboardRouter(deps)` with `getOverview` (7 parallel COUNT queries)
- [ ] `src/server/root.ts` — Wire admin dashboard router under `admin.dashboard` namespace
- [ ] `src/app/admin/layout.tsx` — Admin layout with sidebar, role redirect, notification badge
- [ ] `src/app/admin/page.tsx` — Overview page rendering 7 aggregate panels
- [ ] `src/server/routers/__tests__/admin-dashboard.integration.test.ts` — Integration tests for AC-1.3, AC-1.6, AC-1.7, AC-1.9
- [ ] `src/db/test-utils.ts` — Add new tables to `TRUNCATE_ALL_TABLES_SQL` and `DELETE_ALL_TABLES_SQL`

## References

- `3-requirements/slices/slice-07-operations/00-schema.md` — 7 new tables, 3 amendments, 7 pgEnums
- `3-requirements/slices/slice-07-operations/00-router-plan.md` — 34 tRPC routes, admin file tree
- `3-requirements/slices/slice-07-operations/01-admin-dashboard.md` §1
- `3-requirements/interfaces/shared-infrastructure.md` §7.1 (CSR admin), §8.1 (notification types)
