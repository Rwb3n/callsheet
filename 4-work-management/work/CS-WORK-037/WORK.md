---
template: work_item
id: CS-WORK-037
title: "Downgrade and re-upgrade data handling"
type: feature
status: done
owner: null
created: 2026-02-23
spawned_by: null
spawned_children: []
chapter: CH-CS-006
arc: onboarding-and-claims
epoch: CS-E1
closed: 2026-02-23
priority: high
effort: medium
traces_to:
  - REQ-CS-SUBS-003
source_files:
  - D:/PROJECTS/callsheet/3-requirements/slices/slice-04-subscriptions.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/commercial-and-revenue.md
acceptance_criteria:
  - "AC-20: Downgrade from premium to free hides excess media items (>5) with visibility = 'hidden'"
  - "AC-21: Downgrade from premium to free hides excess credits (>10) with visibility = 'hidden'"
  - "AC-22: Hidden media/credits are NOT deleted — present in DB, excluded from buyer-facing queries"
  - "AC-23: Re-upgrade restores hidden items up to new tier limit"
  - "AC-24: Upload route counts only visible items against tier limit"
  - "AC-25: Downgrade notification includes hidden item counts"
blocked_by: [CS-WORK-035]
blocks: [CS-WORK-039, CS-WORK-041]
enables: []
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
  slice: S4
  spec_sections: "CR §2.5 (concept design), S4 §5"
version: "2.0"
generated: 2026-02-23
last_updated: 2026-02-23T00:00:00
---

# CS-WORK-037: Downgrade and re-upgrade data handling

## Context

Implements data preservation on subscription tier changes. `applyDowngrade` hides excess media/credits by setting `visibility = "hidden"` (never deletes), emits `subscription_tier_changed`, and sends a downgrade notification with hidden item counts. `restoreHiddenItems` reverses the hiding on re-upgrade. The S1 media upload route (`src/server/routers/media.ts`) is amended to count only `visibility = "visible"` items against the tier limit. Requires the `media_visibility` pgEnum and `visibility` columns added by CS-WORK-035's migration. `suppressNotification` param on `applyDowngrade` prevents double notification when called from `finaliseSubscriptionEnd` [S4-ST-8].

## Deliverables

- [x] `src/domains/commercial/subscription/downgrade.ts` — `applyDowngrade()` with visibility hiding + notification
- [x] `src/domains/commercial/subscription/restore-hidden.ts` — `restoreHiddenItems()`
- [x] `src/server/routers/media.ts` — Amend upload route to count only visible items
- [x] `src/domains/commercial/subscription/__tests__/downgrade.integration.test.ts` — All 6 AC (10 tests)

## References

- `3-requirements/slices/slice-04-subscriptions.md` §5 Downgrade Data Handling
- `3-requirements/interfaces/commercial-and-revenue.md` §2.5 (concept design reference)
