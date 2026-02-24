---
template: work_item
id: CS-WORK-033
title: "Implement verification upgrade path"
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
priority: medium
effort: small
traces_to:
  - REQ-CS-CLAIM-004
source_files:
  - D:/PROJECTS/callsheet/3-requirements/slices/slice-03-claim-verify.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/data-and-listings.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/shared-infrastructure.md
acceptance_criteria:
  - "AC-37: evaluateVerificationUpgrade reads from verifications table (not Listing) and returns eligible: false for non-claimed"
  - "AC-38: Score computation: CH active = +1, trade body = +1, client credits (max +4), threshold = 6"
  - "AC-39: Score >= 6 without portfolio review returns pending_human_review with TaskSpec"
  - "AC-40: applyVerificationUpgrade emits verification_tier_changed event"
  - "AC-41: Upgrade decision logged in decision_logs"
blocked_by: []
blocks: []
enables: []
queue_position: backlog
cycle_phase: backlog
node_history:
  - node: backlog
    entered: 2026-02-23T00:00:00
    exited: null
artifacts:
  - src/domains/operations/types.ts
  - src/domains/data-and-listings/verification/types.ts
  - src/domains/data-and-listings/verification/evaluate-upgrade.ts
  - src/server/routers/verification.ts
  - src/domains/data-and-listings/verification/__tests__/evaluate-upgrade.integration.test.ts
  - src/lib/events/types.ts
cycle_docs: {}
memory_refs: []
extensions:
  project: CALLSHEET
  slice: S3
  spec_sections: "D&L §1.6, SI §9"
version: "2.0"
generated: 2026-02-23
last_updated: 2026-02-23T00:00:00
---

# CS-WORK-033: Implement verification upgrade path

## Context

Implements the claimed → verified upgrade evaluation: `evaluateVerificationUpgrade()` scores a claimed listing against CH status, trade body membership, and client-confirmed credits (max 4 points; threshold 6). Scores ≥ 6 route to portfolio review via a TaskSpec; approval calls `applyVerificationUpgrade()` which updates the `verifications` table and emits `verification_tier_changed`. The `requestUpgrade` tRPC route is the provider-facing entry point (owning account only). Helper queries `checkTradeBodyMembership` and `countClientConfirmedCredits` read S1 tables (`accreditations`, `credits`). Calibration of the scoring formula is deferred to S9. The `buildPortfolioReviewTaskSpec` context must include `callbackType: "verification_upgrade"` and `newTier: "verified"` for S7's completion callback to consume (S3 §7.1, S7-ST-11). This work item is independent of CS-WORK-030/031/032 — it can be built in parallel.

## Deliverables

- [ ] `src/domains/data-and-listings/verification/evaluate-upgrade.ts` — `evaluateVerificationUpgrade()`, `applyVerificationUpgrade()`, `checkTradeBodyMembership()`, `countClientConfirmedCredits()`, `buildPortfolioReviewTaskSpec()`
- [ ] `src/domains/data-and-listings/verification/types.ts` — `UpgradeDecision` local type
- [ ] `src/server/routers/verification.ts` — `verificationRouter` with `requestUpgrade` protectedProcedure
- [ ] `src/domains/data-and-listings/verification/__tests__/evaluate-upgrade.test.ts` — AC-37, AC-38 (unit)
- [ ] `src/domains/data-and-listings/verification/__tests__/evaluate-upgrade.integration.test.ts` — AC-39, AC-40, AC-41

## References

- `3-requirements/slices/slice-03-claim-verify.md` §7 Verification Upgrade — evaluateVerificationUpgrade()
- `3-requirements/slices/slice-03-claim-verify.md` §7.1 Upgrade Evaluation
- `3-requirements/slices/slice-03-claim-verify.md` §7.2 Upgrade Application
- `3-requirements/slices/slice-03-claim-verify.md` §7.3 tRPC Route — Request Verification Upgrade
- `3-requirements/interfaces/data-and-listings.md` §1.6 verification_tier_changed
- `3-requirements/interfaces/shared-infrastructure.md` §9 Decision Logging
