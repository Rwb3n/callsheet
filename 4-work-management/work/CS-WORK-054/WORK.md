---
template: work_item
id: CS-WORK-054
title: "Implement saved searches, search history, and cleanup"
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
effort: small
traces_to:
  - REQ-CS-BUYER-005
source_files:
  - D:/PROJECTS/callsheet/3-requirements/slices/slice-06-buyer-experience/index.md
  - D:/PROJECTS/callsheet/3-requirements/slices/slice-06-buyer-experience/01-search.md
  - D:/PROJECTS/callsheet/3-requirements/slices/slice-06-buyer-experience/00-router-plan.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/shared-infrastructure.md
acceptance_criteria:
  - "AC-33: search.saveSearch creates saved_searches row; rejects at 20 saved searches per account"
  - "AC-34: search.deleteSavedSearch deletes only if savedSearch.accountId === session.accountId; returns NOT_FOUND otherwise"
  - "AC-35: searchHistory.list returns at most limit entries (default 10, max 50), ordered by createdAt DESC, for authenticated user only"
  - "AC-36: searchHistory.clear deletes all search_history rows for the authenticated user and no other accounts"
  - "AC-37: search_history_cleanup deferred action deletes rows older than 365 days, self-schedules next execution, and is registered in DeferredActionParamsMap (SI §2.1)"
blocked_by: [CS-WORK-050]
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
  spec_sections: "PP §7.1 (saved searches), SI §2.1/§2.2 (search_history_cleanup deferred action)"
version: "2.0"
generated: 2026-02-24
last_updated: 2026-02-24T00:00:00
---

# CS-WORK-054: Implement saved searches, search history, and cleanup

## Context

Saved search CRUD (max 20 per account) on the `saved_searches` table (S1 schema). Search history read/clear on the `search_history` table (S6 schema, created by CS-WORK-050). `searchHistory.list` returns paginated history ordered by `createdAt DESC`. `searchHistory.clear` deletes all rows for the authenticated user. `search_history_cleanup` is a self-perpetuating daily deferred action that deletes rows older than 365 days. Saved search write uses `search.saveSearch`/`search.deleteSavedSearch` (on the search router from CS-WORK-050). Search history read uses a dedicated `searchHistory` router.

**Type alignment:** `saved_searches` table exists in `src/db/schema/accounts.ts` with `filters` column as JSONB — should be annotated `$type<SearchFilters>()` at implementation time. `DeferredActionParamsMap` already has `search_history_cleanup: Record<string, never>` entry. Self-perpetuating pattern documented in S0 §3.3 — handler deletes + re-schedules.

## Deliverables

- [x] `src/server/routers/search-history.ts` — `createSearchHistoryRouter(deps)` with `list`, `clear`
- [x] `src/lib/scheduler/handlers/search-history-cleanup.ts` — Self-perpetuating daily handler
- [x] `src/lib/scheduler/handlers/__tests__/search-history-cleanup.integration.test.ts` — Integration tests for AC-37 (4 tests)
- [x] `src/server/routers/__tests__/search-history.integration.test.ts` — Integration tests for AC-33 through AC-36 (13 tests)
- [x] `src/server/root.ts` — Wire searchHistory router

## References

- `3-requirements/slices/slice-06-buyer-experience/01-search.md` §5 Saved Searches & Search History
- `3-requirements/slices/slice-06-buyer-experience/00-router-plan.md` §2.1 (saveSearch/deleteSavedSearch), §2.4 (searchHistory router)
- `3-requirements/interfaces/shared-infrastructure.md` §2.1 (DeferredActionParamsMap), §2.2 (registered actions)
