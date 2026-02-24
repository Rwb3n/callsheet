---
template: work_item
id: CS-WORK-046
title: "Implement notification centre and schema migration"
type: feature
status: active
owner: null
created: 2026-02-24
spawned_by: null
spawned_children: []
chapter: CH-CS-007
arc: provider-experience
epoch: CS-E1
closed: null
priority: high
effort: medium
traces_to:
  - REQ-CS-PROV-004
source_files:
  - D:/PROJECTS/callsheet/3-requirements/slices/slice-05-provider-experience.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/shared-infrastructure.md
acceptance_criteria:
  - "AC-23: Notification centre displays notifications ordered by newest first, with cursor-based pagination"
  - "AC-24: Dismiss notification soft-deletes (excluded from list, retained in DB)"
  - "AC-25: Unread notification count badge updates on mark-read and on new notification"
  - "AC-26: Unread count query returns within <50ms p95"
blocked_by: [CS-WORK-043]
blocks: []
enables: []
queue_position: backlog
cycle_phase: backlog
node_history:
  - node: backlog
    entered: 2026-02-24T00:00:00
    exited: null
artifacts: []
cycle_docs: {}
memory_refs: []
extensions:
  project: CALLSHEET
  slice: S5
  spec_sections: "SI §8 (notifications), S0 §1.4 (notification schema)"
version: "2.0"
generated: 2026-02-24
last_updated: 2026-02-24T00:00:00
---

# CS-WORK-046: Implement notification centre and schema migration

## Context

Notification centre UI and backing tRPC router — list, dismiss, mark-read, and unread count. Requires creating the `notifications` Drizzle table in `src/db/schema/shared.ts` with the `readAt`/`dismissed`/`dismissedAt` lifecycle from S5-ST-5 (replacing S0's `read: boolean` design). The `NotificationDb` interface exists at `src/lib/notifications/notifications.ts` as an abstract layer — this work item creates the real Drizzle-backed implementation and wires it into the notification router. The `NoOpNotificationDb` in webhook routes can then be replaced.

**Type alignment:** `Notification` type at `src/lib/notifications/types.ts` already uses `readAt?`, `dismissed`, `dismissedAt?` fields — matches the S5-ST-5 schema. `NotificationType` union has 19 members, all matching SI §8.1. Table creation is a new migration (likely `0007` or `0008` depending on whether CS-WORK-045 migration runs first).

## Deliverables

- [ ] `src/db/schema/shared.ts` — Add `notifications` table (id, accountId, type, title, body, link, readAt, dismissed, dismissedAt, createdAt)
- [ ] `src/db/migrations/0007_*.sql` or `0008_*.sql` — Create `notifications` table (coordinate with CS-WORK-045 migration numbering)
- [ ] `src/lib/notifications/drizzle-notification-db.ts` — Drizzle-backed `NotificationDb` implementation
- [ ] `src/server/routers/notification.ts` — `createNotificationRouter(deps)` with `list`, `dismiss`, `markRead`, `getUnreadCount`
- [ ] `src/app/dashboard/notifications/page.tsx` — Notification centre page
- [ ] `src/server/routers/__tests__/notification.integration.test.ts` — Integration tests for all 4 AC
- [ ] `src/db/test-utils.ts` — Add `notifications` to `resetDb()` truncation list

## References

- `3-requirements/slices/slice-05-provider-experience.md` §6 Notification Centre
- `3-requirements/interfaces/shared-infrastructure.md` §8 (notifications)
