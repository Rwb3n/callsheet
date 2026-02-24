---
template: work_item
id: CS-WORK-023
title: "Article 14 compliance handlers"
type: feature
status: done
owner: null
created: 2026-02-22
spawned_by: null
spawned_children: []
chapter: CH-CS-004
arc: onboarding-and-claims
epoch: CS-E1
closed: 2026-02-23
priority: medium
effort: small
traces_to:
  - REQ-CS-ONBOARD-009
source_files:
  - D:/PROJECTS/callsheet/3-requirements/slices/slice-02-onboarding.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/operations.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/shared-infrastructure.md
acceptance_criteria:
  - "AC-42: article_14_progress_check deferred action alerts principal if <80% sent by day 20"
  - "AC-43: Claiming a 4rfv listing removes on-page Article 14 notice (article14NoticeDisplayed = false) on claim approval (not on submission) [S2-ST-6]"
  - "AC-44: article_14_progress_check correctly computes days elapsed since importDate and percentage sent vs total"
blocked_by: [CS-WORK-022]
blocks: []
enables: []
queue_position: backlog
cycle_phase: backlog
node_history:
  - node: backlog
    entered: 2026-02-22T00:00:00
    exited: null
artifacts: []
cycle_docs: {}
memory_refs: []
extensions:
  project: CALLSHEET
  slice: S2
  spec_sections: "Ops §5, SI §2, S2 §11, S2 §12"
version: "2.0"
generated: 2026-02-22
last_updated: 2026-02-22T00:00:00
---

# CS-WORK-023: Article 14 compliance handlers

## Context

Implements the behavioral logic for the `article_14_progress_check` deferred action handler and the on-page Article 14 notice lifecycle. The handler (registered in CS-WORK-022) computes days elapsed since `importDate` and percentage of Article 14 emails sent vs total, alerting the principal if <80% sent by day 20. The self-perpetuating pattern (daily re-scheduling) follows S0 S3.2. AC-43 tests that claiming a 4rfv listing removes the on-page notice on claim approval (S3 handler sets `article14NoticeDisplayed = false`), not on submission -- the banner persists during `pending_review` because the claim is unverified (S2-ST-6). The `article_14_notice_displayed` column migration and handler registration are in CS-WORK-022 (CH-CS-003); this work item implements the handler logic and claim-path interaction.

## Deliverables

- [ ] `src/lib/scheduler/handlers/article14-progress.ts` -- `article_14_progress_check` handler logic (alert threshold, days computation, percentage computation)
- [ ] `src/lib/compliance/article14-notice.ts` -- On-page notice lifecycle (rendering flag check, claim-approval removal)
- [ ] `src/lib/compliance/__tests__/article14.integration.test.ts` -- All 3 AC

## References

- `3-requirements/slices/slice-02-onboarding.md` S6.5 Phase 5 Article 14, S11 On-Page Notice, S12 Deferred Actions
- `3-requirements/interfaces/operations.md` S5 (Article 14 compliance)
- `3-requirements/interfaces/shared-infrastructure.md` S2 (deferred actions)
