---
template: work_item
id: CS-WORK-032
title: "Implement manual review and competing claims"
type: feature
status: done
owner: null
created: 2026-02-23
spawned_by: null
spawned_children: []
chapter: CH-CS-005
arc: onboarding-and-claims
epoch: CS-E1
closed: 2026-02-23
priority: high
effort: large
traces_to:
  - REQ-CS-CLAIM-003
source_files:
  - D:/PROJECTS/callsheet/3-requirements/slices/slice-03-claim-verify.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/operations.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/shared-infrastructure.md
acceptance_criteria:
  - "AC-26: Manual review TaskSpec includes all 5 checklist items"
  - "AC-27: resolveManualReview(approve) triggers full onClaimApproved pipeline"
  - "AC-28: resolveManualReview(reject) triggers full onClaimRejected pipeline"
  - "AC-29: resolveManualReview on listing not in pending_review/disputed throws BAD_REQUEST"
  - "AC-30: Manual review decision logged in decision_logs with reviewer's accountId"
  - "AC-31: Competing claim sets claimStatus = disputed and creates high-priority dispute TaskSpec"
  - "AC-32: Existing claimant receives dispute notification (email + in-app)"
  - "AC-33: dispute_escalation_check fires after 14 days if dispute unresolved"
  - "AC-34: Unresolved dispute after 14 days suspends listing and creates principal escalation TaskSpec"
  - "AC-35: Dispute resolved in favour of new claimant transfers ownership (full onClaimApproved pipeline)"
  - "AC-36: Dispute resolved in favour of existing claimant restores claimStatus = claimed, notifies new claimant"
  - "AC-44: S3 registers 1 deferred action handler (dispute_escalation_check)"
  - "AC-47: dispute_escalation_check reads actual lifecycleStatus (not hardcoded active) for listing_suspended event"
blocked_by: [CS-WORK-030]
blocks: []
enables: []
queue_position: backlog
cycle_phase: backlog
node_history:
  - node: backlog
    entered: 2026-02-23T00:00:00
    exited: null
artifacts:
  - src/domains/data-and-listings/claim/manual-review.ts
  - src/domains/data-and-listings/claim/competing-claim.ts
  - src/server/routers/claim.ts
  - src/lib/events/types.ts
  - src/domains/data-and-listings/claim/__tests__/manual-review.integration.test.ts
  - src/domains/data-and-listings/claim/__tests__/competing-claim.integration.test.ts
cycle_docs: {}
memory_refs: []
extensions:
  project: CALLSHEET
  slice: S3
  spec_sections: "Ops §4.1, D&L §1.1–§1.2, SI §2.1, SI §9"
version: "2.0"
generated: 2026-02-23
last_updated: 2026-02-23T00:00:00
---

# CS-WORK-032: Implement manual review and competing claims

## Context

Implements the manual review and competing claim paths: TaskSpec builders (`buildManualReviewTaskSpec`, `buildDisputeTaskSpec`), the `resolveManualReview` adminProcedure, and the `dispute_escalation_check` deferred action handler. CS-WORK-030 routes claims to manual review or dispute state; this work item provides what happens next. `resolveManualReview` calls `onClaimApproved` or `onClaimRejected` from CS-WORK-031 — both must be complete before this work item's integration tests can pass. The `dispute_escalation_check` handler is registered on S0's scheduler; after 14 unresolved days it suspends the listing and creates a principal escalation TaskSpec. TaskSpec type contract is defined in Ops §4.1. S3 §5, §6, and §10 specify the full implementation.

## Deliverables

- [ ] `src/domains/data-and-listings/claim/manual-review.ts` — `buildManualReviewTaskSpec()`, `buildDisputeTaskSpec()`, `buildPortfolioReviewTaskSpec()`, `onManualReviewComplete()`
- [ ] `src/domains/data-and-listings/claim/competing-claim.ts` — dispute notification logic, `dispute_escalation_check` action handler registration
- [ ] `src/server/routers/claim.ts` — complete `resolveManualReview` adminProcedure (stub added in CS-WORK-030)
- [ ] `src/domains/data-and-listings/claim/__tests__/manual-review.integration.test.ts` — AC-26 through AC-30
- [ ] `src/domains/data-and-listings/claim/__tests__/competing-claim.integration.test.ts` — AC-31 through AC-36, AC-44, AC-47

## References

- `3-requirements/slices/slice-03-claim-verify.md` §5 Manual Review — TaskSpec Generation
- `3-requirements/slices/slice-03-claim-verify.md` §6 Competing Claims
- `3-requirements/slices/slice-03-claim-verify.md` §10 Deferred Actions Registered in S3
- `3-requirements/interfaces/operations.md` §4.1 TaskSpec type
- `3-requirements/interfaces/shared-infrastructure.md` §2.1 Deferred Action Scheduler
