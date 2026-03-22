---
template: work_item
id: CS-WORK-064
title: "Feature gate friction tracking"
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
priority: medium
effort: small
traces_to:
  - REQ-CS-OPS-008
source_files:
  - D:/PROJECTS/callsheet/3-requirements/slices/slice-07-operations/index.md
  - D:/PROJECTS/callsheet/3-requirements/slices/slice-07-operations/12-friction-tracking.md
  - D:/PROJECTS/callsheet/3-requirements/slices/slice-07-operations/00-router-plan.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/operations.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/commercial-and-revenue.md
acceptance_criteria:
  - "AC-12.1: admin.friction.getSummary returns friction ratios grouped by gate name for specified period"
  - "AC-12.2: Query aggregates tickets WHERE category = feature_gating_confusion grouped by details->>'gate'"
  - "AC-12.3: Return type matches FeatureGateFrictionSummary"
  - "AC-12.4: Response time <500ms p95"
  - "AC-12.5: Displayed as sub-section on /admin/health page"
  - "AC-12.6: Rows exceeding escalation threshold highlighted in red"
  - "AC-12.7: Gate names correspond to TIER_LIMITS keys"
  - "AC-12.8: support_tickets includes details JSONB column for gate identification"
blocked_by: [CS-WORK-057, CS-WORK-058]
blocks: []
enables: [CS-WORK-062]
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
  - src/domains/operations/friction/queries.ts
  - src/server/routers/admin/friction.ts
  - src/server/routers/admin/index.ts
  - src/app/admin/health/page.tsx
  - src/domains/operations/friction/__tests__/queries.integration.test.ts
  - src/server/routers/__tests__/admin-friction.integration.test.ts
cycle_docs: {}
memory_refs: []
extensions:
  project: CALLSHEET
  slice: S7
  spec_sections: "S7 §12, Ops §3.4 (getFeatureGateFrictionSummary), CR §4.1 (TIER_LIMITS keys)"
  io_profile: "db-read"
version: "2.0"
generated: 2026-02-25
last_updated: 2026-02-25T00:00:00
---

# CS-WORK-064: Feature gate friction tracking

## Context

Implements `getFeatureGateFrictionSummary()` query (Ops §3.4) — aggregates `support_tickets` with `category = 'feature_gating_confusion'` grouped by `details->>'gate'` to produce friction ratios per gate name. Gate names correspond to `TIER_LIMITS` keys from CR §4.1. Displayed as a sub-section on the health page (AC-8.9 in CS-WORK-062). Escalation threshold highlighting is a display concern — rows exceeding the threshold rendered in red.

The `support_tickets.details` JSONB column is created by CS-WORK-057 schema. Support ticket creation with `category = 'feature_gating_confusion'` and populated `details.gate` field is handled by CS-WORK-058's triage pipeline.

**Type alignment notes:**
- `FeatureGateFrictionSummary` return type per Ops §3.4 (updated by S7-ST-6). Verify shape matches implementation.
- `TIER_LIMITS` keys at `src/domains/commercial/subscription/` — cross-reference gate names.

## Deliverables

- [ ] `src/domains/operations/friction/queries.ts` — `getFeatureGateFrictionSummary(db, period)` query
- [ ] `src/domains/operations/friction/__tests__/queries.integration.test.ts` — Integration tests (AC-12.1 through AC-12.4, AC-12.7, AC-12.8)
- [ ] `src/server/routers/admin-health.ts` — Add `getFrictionSummary` procedure (or compose into existing `getStatus` response)
- [ ] `src/server/routers/__tests__/admin-health.integration.test.ts` — Friction-specific integration test (AC-12.2, AC-12.3)

## References

- `3-requirements/slices/slice-07-operations/12-friction-tracking.md` §12
- `3-requirements/interfaces/operations.md` §3.4 (`getFeatureGateFrictionSummary`)
- `3-requirements/interfaces/commercial-and-revenue.md` §4.1 (`TIER_LIMITS` keys)
