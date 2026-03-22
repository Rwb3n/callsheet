---
template: work_item
id: CS-WORK-058
title: "Support triage and ticket management"
type: feature
status: todo
owner: null
created: 2026-02-25
spawned_by: null
spawned_children: []
chapter: CH-CS-009
arc: buyer-and-operations
epoch: CS-E1
closed: null
priority: critical
effort: large
traces_to:
  - REQ-CS-OPS-002
source_files:
  - D:/PROJECTS/callsheet/3-requirements/slices/slice-07-operations/index.md
  - D:/PROJECTS/callsheet/3-requirements/slices/slice-07-operations/02-support-triage.md
  - D:/PROJECTS/callsheet/3-requirements/slices/slice-07-operations/00-router-plan.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/operations.md
acceptance_criteria:
  - "AC-2.1: classifyTicket assigns one of 8 categories based on keyword matching against subject + body"
  - "AC-2.2: Base priority is deterministic per category: data_request/claim_dispute/refund_request = high; billing_support/account_access = normal; feature_gating_confusion/profile_support = low; other = normal"
  - "AC-2.3: Churn risk elevation: high_risk accounts have priority elevated by one level; at_risk accounts receive badge only; expired entries ignored"
  - "AC-2.4: SLA deadline computed from priority: critical=4h, high=24h, normal=72h, low=7d (calendar time)"
  - "AC-2.5: sla_breach_warning deferred action scheduled at 80% of SLA duration on ticket creation with non-null slaDeadline"
  - "AC-2.6: sla_breach_warning cancelled when ticket status transitions to resolved or closed"
  - "AC-2.7: support_acknowledgment email sent on ticket creation when accountId is present with email"
  - "AC-2.8: KB deflection returns suggested article URL for 5 categories"
  - "AC-2.9: hasActiveTicket(listingId) returns ActiveTicketRecord | null with <50ms p95"
  - "AC-2.10: hasActiveTicket returns null when no tickets with status IN (open, assigned) exist"
  - "AC-2.11: Every ticket creation and status change produces a decision_logs entry"
  - "AC-2.12: admin.support.list supports cursor-based pagination with filters; default sort sla_deadline ASC NULLS LAST"
  - "AC-2.13: admin.support.getDetail returns ticket with account email, listing name, churn risk level via LEFT JOINs"
  - "AC-2.14: Priority change recomputes SLA deadline and reschedules sla_breach_warning for active tickets"
  - "AC-2.15: admin.support.updateStatus is idempotent"
blocked_by: [CS-WORK-057]
blocks: [CS-WORK-062, CS-WORK-064, CS-WORK-065]
enables: [CS-WORK-063]
queue_position: backlog
cycle_phase: backlog
node_history:
  - node: backlog
    entered: 2026-02-25T00:00:00
    exited: null
artifacts: []
cycle_docs: {}
memory_refs: []
extensions:
  project: CALLSHEET
  slice: S7
  spec_sections: "S7 §2, Ops §3.1 (hasActiveTicket), SI §2.1 (sla_breach_warning), SI §5.2 (support_acknowledgment template)"
  io_profile: "db-write"
version: "2.0"
generated: 2026-02-25
last_updated: 2026-02-25T00:00:00
---

# CS-WORK-058: Support triage and ticket management

## Context

Implements the 6-step support triage pipeline: classify ticket (keyword matching against 8 categories), assign base priority, check churn risk registry for priority elevation, compute SLA deadline (calendar time), attempt KB deflection, create ticket. Registers `sla_breach_warning` deferred action handler (schedule at 80% SLA, cancel on resolution). Implements `hasActiveTicket(listingId)` query interface (Ops §3.1) — the first of 5 Operations query interfaces. Registers `support_acknowledgment` email template. All admin routes behind `adminProcedure`.

**Type alignment notes:**
- `churn_risk_registry` table created by CS-WORK-057. Triage reads it for priority elevation (LEFT JOIN).
- `support_tickets.details` JSONB column (for §12 friction gate tracking) is created by CS-WORK-057 schema.
- `sla_breach_warning` params already in `DeferredActionParamsMap` — `{ ticketId: UUID, slaDeadline: ISO8601 }`. Handler implementation lands here.

## Deliverables

- [ ] `src/domains/operations/support/triage.ts` — `classifyTicket`, `computePriority`, `computeSlaDeadline`, `kbDeflection` pure functions
- [ ] `src/domains/operations/support/queries.ts` — `hasActiveTicket(db, listingId)` query implementation
- [ ] `src/domains/operations/support/__tests__/triage.test.ts` — Unit tests for classification, priority, SLA, KB deflection (AC-2.1 through AC-2.4, AC-2.8)
- [ ] `src/server/routers/admin-support.ts` — `createAdminSupportRouter(deps)` with `list`, `getDetail`, `create`, `updateStatus`, `updatePriority`
- [ ] `src/server/routers/__tests__/admin-support.integration.test.ts` — Integration tests (AC-2.5 through AC-2.15)
- [ ] `src/lib/scheduler/handlers/sla-breach-warning.ts` — Handler + registration
- [ ] `src/server/root.ts` — Wire admin support router under `admin.support` namespace
- [ ] `src/lib/email/templates.ts` — Register `support_acknowledgment` template

## References

- `3-requirements/slices/slice-07-operations/02-support-triage.md` §2
- `3-requirements/interfaces/operations.md` §3.1 (`hasActiveTicket`)
- `3-requirements/interfaces/shared-infrastructure.md` §2.1 (`sla_breach_warning`), §5.2 (`support_acknowledgment`)
