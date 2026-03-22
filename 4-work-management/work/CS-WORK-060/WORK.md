---
template: work_item
id: CS-WORK-060
title: "Compliance management"
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
effort: medium
traces_to:
  - REQ-CS-OPS-004
source_files:
  - D:/PROJECTS/callsheet/3-requirements/slices/slice-07-operations/index.md
  - D:/PROJECTS/callsheet/3-requirements/slices/slice-07-operations/05-compliance.md
  - D:/PROJECTS/callsheet/3-requirements/slices/slice-07-operations/00-router-plan.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/operations.md
acceptance_criteria:
  - "AC-5.1: checkComplianceHold(accountId) returns correct hold status; <100ms p95"
  - "AC-5.2: getDSARStatus() returns open DSARs, approaching deadlines, recent erasures, upcoming deadlines; <200ms p95"
  - "AC-5.3: compliance_schedule_check creates compliance_deadline notification for entries within 7 days. Marks overdue. Self-perpetuates."
  - "AC-5.4: compliance_self_audit checks data retention, GDPR register completeness, DSAR status. Escalates on failure. Self-perpetuates."
  - "AC-5.5: DSAR creation sends dsar_acknowledgment email"
  - "AC-5.6: DSAR completion sends dsar_completion email"
  - "AC-5.7: DSAR entry defaults deadline to receivedAt + 30 days"
  - "AC-5.8: Only dsar, complaint, investigation types with status = open create holds"
  - "AC-5.9: Billing holds NOT checked by checkComplianceHold"
  - "AC-5.10: Every create and updateStatus produces a decision_logs entry"
blocked_by: [CS-WORK-057]
blocks: []
enables: [CS-WORK-062]
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
  spec_sections: "S7 §5, Ops §3.2 (checkComplianceHold), Ops §3.3 (getDSARStatus), SI §2.1 (compliance_schedule_check, compliance_self_audit), SI §5.2 (dsar_acknowledgment, dsar_completion)"
  io_profile: "db-write"
version: "2.0"
generated: 2026-02-25
last_updated: 2026-02-25T00:00:00
---

# CS-WORK-060: Compliance management

## Context

Implements the compliance register serving three purposes: DSAR case management (30-day statutory deadline), obligation calendar, and audit trail. Implements `checkComplianceHold(accountId)` (Ops §3.2) and `getDSARStatus()` (Ops §3.3) query interfaces. `checkComplianceHold` returns hold status based on `compliance_register` entries with types `dsar`/`complaint`/`investigation` and `status = 'open'` — explicitly does NOT check `billing_holds`. Registers two deferred action handlers: `compliance_schedule_check` (daily, creates notifications for entries within 7 days) and `compliance_self_audit` (daily, checks retention/completeness/DSAR status). Both self-perpetuating. Registers `dsar_acknowledgment` and `dsar_completion` email templates.

**Type alignment notes:**
- `compliance_schedule_check` and `compliance_self_audit` already in `DeferredActionParamsMap` with `Record<string, never>` params. Handler implementations land here.
- `compliance_register` table created by CS-WORK-057. Uses `compliance_entry_type` and `compliance_entry_status` pgEnums.

## Deliverables

- [x] `src/domains/operations/compliance/queries.ts` — `checkComplianceHold(db, accountId)`, `getDSARStatus(db)` query implementations
- [x] `src/domains/operations/compliance/__tests__/queries.integration.test.ts` — 16 integration tests (AC-5.1, AC-5.2, AC-5.8, AC-5.9)
- [x] `src/server/routers/admin/compliance.ts` — `createAdminComplianceRouter(deps)` with `list`, `getDetail`, `create`, `updateStatus`
- [x] `src/server/routers/__tests__/admin-compliance.integration.test.ts` — 18 integration tests (AC-5.5 through AC-5.7, AC-5.10)
- [x] `src/lib/scheduler/handlers/compliance-schedule-check.ts` — Handler + registration (AC-5.3), 5 integration tests
- [x] `src/lib/scheduler/handlers/compliance-self-audit.ts` — Handler + registration (AC-5.4), 5 integration tests
- [x] `src/server/routers/admin/index.ts` — Wire admin compliance router under `admin.compliance` namespace
- [x] `src/domains/operations/compliance/email-templates.ts` — Register `dsar_acknowledgment` and `dsar_completion` templates

## References

- `3-requirements/slices/slice-07-operations/05-compliance.md` §5
- `3-requirements/interfaces/operations.md` §3.2 (`checkComplianceHold`), §3.3 (`getDSARStatus`)
- `3-requirements/interfaces/shared-infrastructure.md` §2.1 (`compliance_schedule_check`, `compliance_self_audit`), §5.2 (`dsar_acknowledgment`, `dsar_completion`)
