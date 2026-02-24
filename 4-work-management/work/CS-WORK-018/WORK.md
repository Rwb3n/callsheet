---
template: work_item
id: CS-WORK-018
title: "Progressive disclosure handlers and emails"
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
effort: medium
traces_to:
  - REQ-CS-ONBOARD-006
source_files:
  - D:/PROJECTS/callsheet/3-requirements/slices/slice-02-onboarding.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/shared-infrastructure.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/platform-and-product.md
acceptance_criteria:
  - "AC-32: send_progressive_email handler skips email if target action already complete"
  - "AC-33: send_progressive_email handler skips email if listing no longer active"
  - "AC-34: Day 14 in-app notification created only if profile strength < 80%"
  - "AC-35: Email preference unsubscribe for profile_nudge suppresses progressive emails"
  - "AC-48: onboarding_day14_prompt handler creates notification only if profile strength < 80%; skips if listing inactive [S2-ST-2]"
  - "AC-49: Day 14 deferred action scheduled during scheduleProgressiveDisclosure (Paths A+B) [S2-ST-2]"
blocked_by: [CS-WORK-014, CS-WORK-015]
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
  spec_sections: "PP §4.6, SI §2, SI §5, S2 §7, S2 §12"
version: "2.0"
generated: 2026-02-22
last_updated: 2026-02-22T00:00:00
---

# CS-WORK-018: Progressive disclosure handlers and emails

## Context

Implements the two deferred action handlers (`send_progressive_email`, `onboarding_day14_prompt`) and their integration with S0's email transport and notification system. The `send_progressive_email` handler checks listing lifecycle status and whether the targeted action is already complete before sending -- both are suppression conditions. The `onboarding_day14_prompt` handler creates an in-app notification only if profile strength is below 80%. Email preference unsubscribe for the `profile_nudge` category must suppress progressive emails. AC-49 verifies that `scheduleProgressiveDisclosure` (implemented in CS-WORK-014) includes the Day 14 scheduling call. Email templates `profile_day1`, `profile_day3`, `profile_day7` registered here. Extends `DeferredActionParamsMap` with `send_progressive_email` and `onboarding_day14_prompt` types.

## Deliverables

- [ ] `src/lib/scheduler/handlers/progressive-email.ts` -- `send_progressive_email` action handler
- [ ] `src/lib/scheduler/handlers/day14-prompt.ts` -- `onboarding_day14_prompt` action handler
- [ ] `src/lib/onboarding/progressive-check.ts` -- `isProgressiveActionComplete()` suppression logic
- [ ] Email template registration: `profile_day1`, `profile_day3`, `profile_day7`
- [ ] `DeferredActionParamsMap` extension for both action types
- [ ] `src/lib/onboarding/__tests__/progressive-disclosure.integration.test.ts` -- All 6 AC

## References

- `3-requirements/slices/slice-02-onboarding.md` S7 Progressive Disclosure, S7.4 Day 14 Prompt, S12 Deferred Actions
- `3-requirements/interfaces/shared-infrastructure.md` S2 (deferred actions), S5 (email transport, preference enforcement)
- `3-requirements/interfaces/platform-and-product.md` S4.6
