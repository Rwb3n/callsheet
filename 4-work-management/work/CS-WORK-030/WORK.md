---
template: work_item
id: CS-WORK-030
title: "Implement evaluateClaim decision engine"
type: feature
status: done
owner: null
created: 2026-02-23
spawned_by: null
spawned_children: []
chapter: CH-CS-005
arc: onboarding-and-claims
epoch: CS-E1
closed: null
priority: critical
effort: large
traces_to:
  - REQ-CS-CLAIM-001
source_files:
  - D:/PROJECTS/callsheet/3-requirements/slices/slice-03-claim-verify.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/data-and-listings.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/shared-infrastructure.md
acceptance_criteria:
  - "AC-1: evaluateClaim auto-approves when claimEmail domain matches listing websiteUrl domain (no CH number)"
  - "AC-2: evaluateClaim auto-rejects when CH number maps to dissolved entity — even if email domain matches"
  - "AC-3: evaluateClaim routes to manual review when CH active but no domain match"
  - "AC-4: evaluateClaim routes to manual review for freelancer without CH number"
  - "AC-5: Optimistic lock prevents concurrent claim evaluation on same listing (second caller gets CONFLICT)"
  - "AC-6: Claim on pending_review listing returns CONFLICT"
  - "AC-7: Claim on claimed listing transitions to disputed and creates dispute TaskSpec"
  - "AC-8: Claim on suspended listing is auto-rejected"
  - "AC-9: Every evaluateClaim invocation produces a decision_logs row with decisionType = claim_evaluation"
  - "AC-10: evaluateClaim calls CompaniesHouseService.lookup (not a direct HTTP call) — testable via mock"
  - "AC-42: S3 registers 4 email templates at module init (claim_approved, claim_rejected, claim_pending_review, claim_dispute_notification)"
  - "AC-43: claim_approved and claim_rejected emails are transactional (not unsubscribable)"
  - "AC-45: CH dissolution check precedes email domain match — dissolved company with matching domain is rejected"
  - "AC-46: submitClaim stores claimantAccountId in snapshot JSONB and cancels pre_claim_snapshot_cleanup"
blocked_by: []
blocks: [CS-WORK-031, CS-WORK-032]
enables: [CS-WORK-033]
queue_position: backlog
cycle_phase: backlog
node_history:
  - node: backlog
    entered: 2026-02-23T00:00:00
    exited: null
artifacts: []
cycle_docs: {}
memory_refs: []
extensions:
  project: CALLSHEET
  slice: S3
  spec_sections: "D&L §1.1–§1.2, SI §2.1, SI §5, SI §9, SI §10"
version: "2.0"
generated: 2026-02-23
last_updated: 2026-02-23T00:00:00
---

# CS-WORK-030: Implement evaluateClaim decision engine

## Context

Replaces S2's `submitClaim` stub (which set all claims to `pending_review`) with the full `evaluateClaim()` decision architecture: CH dissolution guard, email domain match, optimistic locking, and routing to auto-approve / auto-reject / manual-review / dispute. The evaluation logic lives in `src/domains/data-and-listings/claim/evaluate-claim.ts`; the `submitClaim` tRPC route (S2's `src/server/routers/claim.ts`) is amended to call it. The CH service is injected via `ctx.services.companiesHouse` (SI §10 service abstraction). S3 §1.3 specifies the exact ordering: dissolution check before email domain match (AC-45). S3 §2 specifies the two S2 amendments: `claimantAccountId` in snapshot JSONB (AC-46) and `pre_claim_snapshot_cleanup` cancellation (AC-46).

## Deliverables

- [x] `src/domains/data-and-listings/claim/types.ts` — `ClaimDecision` and `ClaimRequest` local types
- [x] `src/domains/data-and-listings/claim/evaluate-claim.ts` — `evaluateClaim()`, `acquireClaimLock()`, `emailDomainMatches()`
- [x] `src/server/routers/claim.ts` — amend S2's `submitClaim` mutation: add eval call, snapshot amendment, cleanup cancellation; add `resolveManualReview` adminProcedure stub (full implementation in CS-WORK-032)
- [x] `src/domains/data-and-listings/claim/email-templates.ts` — register 4 templates (`claim_approved`, `claim_rejected`, `claim_pending_review`, `claim_dispute_notification`) with `registerTemplate()` guard pattern
- [x] `src/domains/data-and-listings/claim/__tests__/evaluate-claim.integration.test.ts` — All 14 AC (28 tests)

## References

- `3-requirements/slices/slice-03-claim-verify.md` §1 Claim Evaluation — evaluateClaim()
- `3-requirements/slices/slice-03-claim-verify.md` §2 tRPC Route — Claim Submission
- `3-requirements/slices/slice-03-claim-verify.md` §9 Email Templates Registered in S3
- `3-requirements/interfaces/shared-infrastructure.md` §9 Decision Logging, §10 Service Abstraction
- `3-requirements/interfaces/data-and-listings.md` §1.1 claim_approved, §1.2 claim_rejected
