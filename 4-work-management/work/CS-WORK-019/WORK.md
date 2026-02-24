---
template: work_item
id: CS-WORK-019
title: "Intelligent taxonomy suggestions"
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
  - REQ-CS-ONBOARD-007
source_files:
  - D:/PROJECTS/callsheet/3-requirements/slices/slice-02-onboarding.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/platform-and-product.md
acceptance_criteria:
  - "AC-36: Curated suggestions return for Camera, Post-Production, Sound sectors"
  - "AC-37: Suggestions exclude already-selected tags"
  - "AC-38: Generic fallback returns top 5 service areas by listing count (empty when no listings)"
blocked_by: []
blocks: []
enables: []
queue_position: done
cycle_phase: done
node_history:
  - node: backlog
    entered: 2026-02-22T00:00:00
    exited: null
artifacts:
  - src/lib/onboarding/suggestions.ts
  - src/lib/onboarding/__tests__/suggestions.test.ts
  - src/lib/onboarding/__tests__/suggestions.integration.test.ts
cycle_docs: {}
memory_refs: []
extensions:
  project: CALLSHEET
  slice: S2
  spec_sections: "PP §4.5, S2 §9"
version: "2.0"
generated: 2026-02-22
last_updated: 2026-02-22T00:00:00
---

# CS-WORK-019: Intelligent taxonomy suggestions

## Context

Rule-based taxonomy suggestion system for the onboarding flow. Three curated sectors (Camera, Post-Production, Sound) have hardcoded `SUGGESTION_MAP` rules that map sector+serviceArea triggers to specialisation suggestions with confidence scores and reasoning text. Non-curated sectors use a generic fallback that queries top 5 service areas by listing count within the sector (returns empty at launch). Suggestions exclude already-selected tags and are capped at 5 results sorted by confidence. AC-36 and AC-37 are unit-testable (pure function); AC-38 requires integration test (DB query). UX guard: suggestions are additive only, never auto-selected.

## Deliverables

- [x] `src/lib/onboarding/suggestions.ts` -- `SUGGESTION_MAP`, `getSuggestions()`, `getGenericSuggestions()`
- [x] `src/lib/onboarding/__tests__/suggestions.test.ts` -- Unit tests for AC-36, AC-37 (14 tests)
- [x] `src/lib/onboarding/__tests__/suggestions.integration.test.ts` -- Integration test for AC-38 (4 tests)

## References

- `3-requirements/slices/slice-02-onboarding.md` S9 Intelligent Taxonomy Suggestions
- `3-requirements/interfaces/platform-and-product.md` S4.5
