---
template: work_item
id: CS-WORK-031
title: "Implement claim approval and rejection pipelines"
type: feature
status: done
owner: null
created: 2026-02-23
spawned_by: null
spawned_children: []
chapter: CH-CS-005
arc: onboarding-and-claims
epoch: CS-E1
closed: 2026-02-23T00:00:00
priority: high
effort: large
traces_to:
  - REQ-CS-CLAIM-002
source_files:
  - D:/PROJECTS/callsheet/3-requirements/slices/slice-03-claim-verify.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/data-and-listings.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/shared-infrastructure.md
acceptance_criteria:
  - "AC-11: On approval: claimStatus set to claimed, accountId set to claimant, verification.tier set to claimed"
  - "AC-12: On approval: pre-claim snapshot edits applied to listing"
  - "AC-13: On approval: pending enquiries delivered to claimant (notification + email)"
  - "AC-14: On approval: progressive disclosure scheduled for claim path"
  - "AC-15: On approval: Article 14 banner cleared (article14NoticeDisplayed = false)"
  - "AC-16: On approval: quality score recalculated (verification dimension)"
  - "AC-17: On approval: pre-claim snapshot deleted"
  - "AC-18: On approval: claim_approved event emitted with correct method field"
  - "AC-19: On approval: approval email and in-app notification sent to claimant"
  - "AC-20: Pending enquiries past expiresAt are NOT delivered (filtered out)"
  - "AC-21: On rejection: claimStatus reset — pending_review → unclaimed, disputed → claimed"
  - "AC-22: On rejection: pre-claim snapshot deleted, edits discarded"
  - "AC-23: On rejection: claim_rejected event emitted with claimantAccountId and reason"
  - "AC-24: On rejection: rejection email sent to claimant with reason"
  - "AC-25: Dispute rejection restores existing claimant's claimed status, does NOT reset to unclaimed"
  - "AC-48: deliverPendingEnquiries fetches listing once before loop (no N+1)"
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
  - src/domains/data-and-listings/claim/claim-approved.ts
  - src/domains/data-and-listings/claim/claim-rejected.ts
  - src/lib/onboarding/deliver-pending-enquiries.ts
  - src/lib/events/types.ts
  - src/server/routers/claim.ts
  - src/lib/onboarding/email-templates.ts
  - src/domains/data-and-listings/claim/__tests__/claim-approved.integration.test.ts
  - src/domains/data-and-listings/claim/__tests__/claim-rejected.integration.test.ts
cycle_docs: {}
memory_refs: []
extensions:
  project: CALLSHEET
  slice: S3
  spec_sections: "D&L §1.1–§1.2, SI §2.1, SI §5, SI §8.1, SI §9"
version: "2.0"
generated: 2026-02-23
last_updated: 2026-02-23T00:00:00
---

# CS-WORK-031: Implement claim approval and rejection pipelines

## Context

Implements `onClaimApproved()` and `onClaimRejected()` post-processing logic and the full `deliverPendingEnquiries()` function (S2 provided the stub). On approval, the pipeline applies snapshot edits, transfers listing ownership, clears the Article 14 banner, delivers held enquiries in batches of 5, schedules claim-path progressive disclosure, recalculates quality score, and emits `claim_approved`. On rejection, it branches on current `claimStatus`: `pending_review` → reset to `"unclaimed"`; `disputed` → restore to `"claimed"` (existing claimant upheld). S3 §3 and §4 specify both pipelines; S3 §3.2 specifies `deliverPendingEnquiries` including the single-listing-fetch requirement (AC-48). `onClaimApproved` is called from the `submitClaim` route (CS-WORK-030) and from `resolveManualReview` (CS-WORK-032).

## Deliverables

- [ ] `src/domains/data-and-listings/claim/claim-approved.ts` — `onClaimApproved()`, `applySnapshotEdits()`
- [ ] `src/domains/data-and-listings/claim/claim-rejected.ts` — `onClaimRejected()`
- [ ] `src/domains/platform/enquiry-delivery.ts` — `deliverPendingEnquiries()` (completes S2 stub)
- [ ] `src/domains/data-and-listings/claim/__tests__/claim-approved.integration.test.ts` — AC-11 through AC-20, AC-48
- [ ] `src/domains/data-and-listings/claim/__tests__/claim-rejected.integration.test.ts` — AC-21 through AC-25

## References

- `3-requirements/slices/slice-03-claim-verify.md` §3 Post-Approval Pipeline — onClaimApproved()
- `3-requirements/slices/slice-03-claim-verify.md` §3.1 Snapshot Edit Application
- `3-requirements/slices/slice-03-claim-verify.md` §3.2 deliverPendingEnquiries Implementation
- `3-requirements/slices/slice-03-claim-verify.md` §4 Rejection Pipeline — onClaimRejected()
- `3-requirements/interfaces/data-and-listings.md` §1.1 claim_approved, §1.2 claim_rejected
- `3-requirements/interfaces/shared-infrastructure.md` §8.1 Notification Types
