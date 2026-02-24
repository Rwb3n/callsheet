---
template: work_item
id: CS-WORK-016
title: "Claim path and pre-claim snapshots"
type: feature
status: done
owner: null
created: 2026-02-22
spawned_by: null
spawned_children: []
chapter: CH-CS-004
arc: onboarding-and-claims
epoch: CS-E1
closed: 2026-02-22
priority: high
effort: large
traces_to:
  - REQ-CS-ONBOARD-004
source_files:
  - D:/PROJECTS/callsheet/3-requirements/slices/slice-02-onboarding.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/platform-and-product.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/data-and-listings.md
acceptance_criteria:
  - "AC-16: Claim form pre-populates with existing listing data; profile strength uses fallback [S2-ST-10]"
  - "AC-17: Endowment messaging: shows view count when >= 5 views, category-level when < 5"
  - "AC-18: Pre-claim snapshot created and stored; includes provider edits (held, not applied) [S2-ST-14]"
  - "AC-19: Claim submission sets claimStatus = pending_review (S2 stub; S3 provides full logic)"
  - "AC-20: Claim-path progressive disclosure NOT scheduled at submission -- deferred to S3 claim_approved handler [S2-ST-17]"
  - "AC-21: pre_claim_snapshot_cleanup deferred action scheduled (90 days) with correct listingId param [S2-ST-1]"
  - "AC-45: pre_claim_snapshot_cleanup handler deletes snapshot; idempotent if already deleted"
blocked_by: [CS-WORK-013]
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
  spec_sections: "PP §4.4, D&L §3.1, SI §2.2, S2 §5, S2 §12"
version: "2.0"
generated: 2026-02-22
last_updated: 2026-02-22T00:00:00
---

# CS-WORK-016: Claim path and pre-claim snapshots

## Context

Implements the `claimRouter` with `getClaimContext` (pre-population + endowment messaging + fallback profile strength) and `submitClaim` (snapshot creation, integrity checks, status to `pending_review`, 90-day cleanup scheduling). Critical S2/S3 boundary: edits are stored in the pre-claim snapshot but NOT applied to the listing (S2-ST-14). S3 applies on approval, discards on rejection. Progressive disclosure for claim paths is NOT scheduled during submission (S2-ST-17) -- S3's `claim_approved` handler calls `scheduleClaimProgressiveDisclosure`. S2 provides the function (S7.2); S3 invokes it. The `pre_claim_snapshot_cleanup` deferred action handler and `deliverPendingEnquiries` stub are included. AC-16 (pre-populated claim form) is E2E but the query response shape is integration-testable.

## Deliverables

- [x] `src/server/routers/claim.ts` -- `getClaimContext` query, `submitClaim` mutation
- [x] `src/lib/onboarding/endowment-messaging.ts` -- `getEndowmentMessaging()` with view count threshold
- [x] `src/lib/onboarding/schedule-claim-progressive-disclosure.ts` -- `scheduleClaimProgressiveDisclosure()` (exported for S3)
- [x] `src/lib/onboarding/deliver-pending-enquiries.ts` -- `deliverPendingEnquiries()` stub (S2-2 downstream flag)
- [x] `src/lib/onboarding/pre-claim-snapshot-cleanup.ts` -- cleanup handler
- [x] `src/lib/onboarding/__tests__/claim-path.integration.test.ts` -- All 7 AC (17 tests)

## References

- `3-requirements/slices/slice-02-onboarding.md` S5 Path C, S5.2 Endowment Messaging, S5.3 Pending Enquiry Delivery, S7.2 Claim Progressive Disclosure, S12 Deferred Actions
- `3-requirements/interfaces/platform-and-product.md` S4.4
- `3-requirements/interfaces/data-and-listings.md` S3.1 (integrity), S1.13 (pre-claim snapshots)
