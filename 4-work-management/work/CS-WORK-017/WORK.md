---
template: work_item
id: CS-WORK-017
title: "Profile strength meter"
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
priority: medium
effort: small
traces_to:
  - REQ-CS-ONBOARD-005
source_files:
  - D:/PROJECTS/callsheet/3-requirements/slices/slice-02-onboarding.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/platform-and-product.md
acceptance_criteria:
  - "AC-29: Profile strength computed from quality score completeness dimension (0-25 -> 0-100%)"
  - "AC-30: Missing field identification returns ranked actions with impact estimates"
  - "AC-31: Fallback field-presence check works when quality score explanations absent (pre-S9)"
blocked_by: []
blocks: []
enables: []
queue_position: done
cycle_phase: done
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
  spec_sections: "PP §4.6, S2 §8"
version: "2.0"
generated: 2026-02-22
last_updated: 2026-02-22T00:00:00
---

# CS-WORK-017: Profile strength meter

## Context

Pure computation module with no DB writes. Maps D&L `qualityScore.completeness` (0-25) to a 0-100% display percentage with five named levels (Getting Started through Excellent). `identifyMissingFields` reads quality score explanations to surface ranked next actions with percentage-point impact estimates and time estimates. Until S9 provides real quality score explanations, a fallback (`identifyMissingFieldsFallback`) inspects listing field presence directly. All 3 AC are unit-testable. The `profileStrengthRouter.get` tRPC route is also included (ownership verification + computation call).

## Deliverables

- [x] `src/lib/onboarding/profile-strength.ts` -- `computeProfileStrength()`, `identifyMissingFields()`, `identifyMissingFieldsFallback()`, `computeFallbackProfileStrength()`, field weight/display/time maps
- [x] `src/server/routers/profile-strength.ts` -- `get` query with ownership verification (real quality score path + fallback)
- [x] `src/lib/onboarding/__tests__/profile-strength.test.ts` -- 30 unit tests for all 3 AC
- [x] `src/server/routers/claim.ts` -- refactored: removed inline `computeFallbackProfileStrength`, imports from shared module

## References

- `3-requirements/slices/slice-02-onboarding.md` S8 Profile Strength Meter
- `3-requirements/interfaces/platform-and-product.md` S4.6
