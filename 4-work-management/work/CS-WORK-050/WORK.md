---
template: work_item
id: CS-WORK-050
title: "Implement search router and ranking"
type: feature
status: todo
owner: null
created: 2026-02-24
spawned_by: null
spawned_children: []
chapter: CH-CS-008
arc: buyer-and-operations
epoch: CS-E1
closed: null
priority: critical
effort: large
traces_to:
  - REQ-CS-BUYER-001
source_files:
  - D:/PROJECTS/callsheet/3-requirements/slices/slice-06-buyer-experience/index.md
  - D:/PROJECTS/callsheet/3-requirements/slices/slice-06-buyer-experience/01-search.md
  - D:/PROJECTS/callsheet/3-requirements/slices/slice-06-buyer-experience/00-router-plan.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/platform-and-product.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/commercial-and-revenue.md
acceptance_criteria:
  - "AC-1: /search renders SSR with TTFB <500ms p95 for queries against 4,700 listings"
  - "AC-2: Query parameters (q, sectors, serviceAreas, location, sort, cursor) round-trip correctly; invalid filter values silently dropped"
  - "AC-3: Ranking formula: finalScore = (relevance * 30) + (quality * 0.45) + paidBoost + freshness + coldStart + jitter(±3); TIER_LIMITS[tier].rankingBoost imported from CR §4.1 (P4 compliance)"
  - "AC-4: Facet counts for sectors, service areas, locations, and verification tiers returned with results; each facet excludes its own dimension from the filter"
  - "AC-5: Sponsored section shows max 3 premium/partner listings matching query, labelled Sponsored, separate from organic results; sponsored listings also appear at natural organic rank (dual placement)"
  - "AC-6: search.suggest returns max 10 autocomplete results from taxonomy + synonyms for prefixes >= 2 characters"
  - "AC-7: Zero-result searches insert a zero_result_queries row and return suggestedFilters (broadened) + zeroResultSuggestions (nearest matches)"
  - "AC-8: search_performed event emitted with exact SearchPerformedEvent payload: query is empty string (not undefined) for filter-only searches, filters is SearchFilters, sessionId is ctx.session.accountId for authenticated users or null for anonymous [S6-ST-4]"
  - "AC-9: Authenticated searches insert search_history row; anonymous searches do not"
  - "AC-10: Only listings with lifecycle_status = active appear in search results; subscriptionTier never included in client response [PP-1, PP-33]"
blocked_by: []
blocks: [CS-WORK-054, CS-WORK-055, CS-WORK-056]
enables: [CS-WORK-051]
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
  spec_sections: "PP §1.1 (search_performed), PP §2 (search), CR §4.1 (TIER_LIMITS/rankingBoost)"
version: "2.0"
generated: 2026-02-24
last_updated: 2026-02-24T00:00:00
---

# CS-WORK-050: Implement search router and ranking

## Context

Dedicated buyer-facing search router with full-text search, ranking, faceted filtering, autocomplete, sponsored placement, zero-result handling, and event emission. S1 already implements `listing.search` with `executeSearch()` and the ranking formula — S6 extracts this into a dedicated `search` router with richer capabilities (autocomplete, facets, save). The search route is SSR (query-dependent). `TIER_LIMITS[tier].rankingBoost` imported from CR §4.1 (P4 compliance). `search_performed` event emitted with P1-compliant payload. Authenticated searches additionally record to `search_history` (S6 schema addition).

**Type alignment:** `SearchFilters` type exists at `src/lib/search/ranking.ts` — S6 search router extends the filter surface (sectors array, serviceAreas array, location string). `EventPayloadMap` has `SearchPerformedEvent` stub — S6 populates full payload. `listing.search` procedure already exists on the listing router — S6's `search.query` becomes the canonical buyer endpoint; the S1 `listing.search` remains for backward compatibility.

## Deliverables

- [ ] `src/db/schema/data-and-listings.ts` — Add `searchHistory` table definition (accountId, query, filters jsonb, resultCount, createdAt)
- [ ] `drizzle/` — Migration for `search_history` table
- [ ] `src/server/routers/search.ts` — `createSearchRouter(deps)` with `query`, `suggest`, `saveSearch`, `getSavedSearches`, `deleteSavedSearch`
- [ ] `src/server/routers/__tests__/search.integration.test.ts` — Integration tests for AC-2 through AC-10
- [ ] `src/server/root.ts` — Wire search router
- [ ] `src/app/search/page.tsx` — SSR search results page

## References

- `3-requirements/slices/slice-06-buyer-experience/01-search.md` §1 Search Implementation, §5 Saved Searches
- `3-requirements/slices/slice-06-buyer-experience/00-router-plan.md` §2.1 search router
- `3-requirements/interfaces/platform-and-product.md` §1.1 (search_performed), §2 (search)
- `3-requirements/interfaces/commercial-and-revenue.md` §4.1 (TIER_LIMITS)
