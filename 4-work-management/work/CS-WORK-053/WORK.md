---
template: work_item
id: CS-WORK-053
title: "Implement shortlist management"
type: feature
status: done
owner: null
created: 2026-02-24
spawned_by: null
spawned_children: []
chapter: CH-CS-008
arc: buyer-and-operations
epoch: CS-E1
closed: 2026-02-24
priority: high
effort: medium
traces_to:
  - REQ-CS-BUYER-004
source_files:
  - D:/PROJECTS/callsheet/3-requirements/slices/slice-06-buyer-experience/index.md
  - D:/PROJECTS/callsheet/3-requirements/slices/slice-06-buyer-experience/04-shortlist-dashboard.md
  - D:/PROJECTS/callsheet/3-requirements/slices/slice-06-buyer-experience/00-router-plan.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/platform-and-product.md
acceptance_criteria:
  - "AC-28: shortlist.create creates a shortlist; rejects with error when account has 10 shortlists"
  - "AC-29: shortlist.addItem inserts with status = active, emits shortlist_added with P1-compliant payload (listingId, accountId, timestamp); rejects duplicate (unique constraint) and at 50 items"
  - "AC-30: shortlist.removeItem sets shortlist_items.status to removed (soft delete); shortlist.delete cascade-deletes items via FK"
  - "AC-31: shortlist.getItems returns listing display data via single JOIN; items with shortlist_items.status of archived/suspended included in results with lifecycle badge; WHERE si.status != removed filter (not = active) [S6-ST-1]"
  - "AC-32: Shortlist items for archived listings render based on shortlist_items.status = archived (consumer-written by PP [XP-15]), not listings.lifecycleStatus join; suspended listings show Unavailable based on shortlist_items.status = suspended; erased listings cascade-deleted (no stale references) [S6-ST-1]"
blocked_by: []
blocks: [CS-WORK-055]
enables: []
queue_position: backlog
cycle_phase: backlog
node_history:
  - node: backlog
    entered: 2026-02-24T00:00:00
    exited: null
artifacts: []
cycle_docs: {}
memory_refs: []
extensions:
  project: CALLSHEET
  slice: S6
  spec_sections: "PP §1.5 (shortlist_added), PP §7.2 (shortlist management)"
version: "2.0"
generated: 2026-02-24
last_updated: 2026-02-24T00:00:00
---

# CS-WORK-053: Implement shortlist management

## Context

Shortlist CRUD with capacity limits (10 shortlists per account, 50 items per shortlist). All routes require authentication. `shortlist.addItem` emits `shortlist_added` with P1-compliant payload. Item removal is soft delete (`status = "removed"`). Shortlist deletion cascade-deletes items via FK. `shortlist.getItems` returns listing display data via single JOIN — no N+1. Items with `archived`/`suspended` status (written by PP consumers on `listing_archived`/`listing_suspended` events) are included in results with lifecycle badges. Filter is `WHERE status != 'removed'`, not `= 'active'` (S6-ST-1).

**Type alignment:** `shortlists` and `shortlistItems` tables exist in `src/db/schema/accounts.ts`. `shortlistItemStatusEnum` (S1-ST-7) has `active`/`archived`/`suspended`/`removed` values. `ShortlistAddedEvent` stub exists in `EventPayloadMap` — S6 populates with `listingId`, `accountId`, `timestamp`.

## Deliverables

- [x] `src/server/routers/shortlist.ts` — `createShortlistRouter(deps)` with `list`, `getItems`, `create`, `rename`, `delete`, `addItem`, `removeItem`
- [x] `src/server/routers/__tests__/shortlist.integration.test.ts` — Integration tests for AC-28 through AC-32 (20 tests)
- [x] `src/server/root.ts` — Wire shortlist router
- [x] `src/lib/events/types.ts` — Populate `ShortlistAddedEvent` payload (listingId, accountId, timestamp)

## References

- `3-requirements/slices/slice-06-buyer-experience/04-shortlist-dashboard.md` §4 Shortlist Management
- `3-requirements/slices/slice-06-buyer-experience/00-router-plan.md` §2.2 shortlist router
- `3-requirements/interfaces/platform-and-product.md` §1.5 (shortlist_added), §7.2 (shortlists)
