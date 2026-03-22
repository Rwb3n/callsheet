---
template: work_item
id: CS-WORK-055
title: "Implement buyer dashboard"
type: feature
status: done
owner: null
created: 2026-02-24
spawned_by: null
spawned_children: []
chapter: CH-CS-008
arc: buyer-and-operations
epoch: CS-E1
closed: 2026-02-25
priority: high
effort: medium
traces_to:
  - REQ-CS-BUYER-006
source_files:
  - D:/PROJECTS/callsheet/3-requirements/slices/slice-06-buyer-experience/index.md
  - D:/PROJECTS/callsheet/3-requirements/slices/slice-06-buyer-experience/04-shortlist-dashboard.md
  - D:/PROJECTS/callsheet/3-requirements/slices/slice-06-buyer-experience/00-router-plan.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/platform-and-product.md
acceptance_criteria:
  - "AC-38: /dashboard/enquiries-sent displays sent enquiries with status indicators: grey Awaiting response (unread), green Responded (responded), amber No response after 7 days (stale)"
  - "AC-39: /dashboard/shortlists displays shortlist summary cards with active item count and most recent addition"
  - "AC-40: /dashboard/searches renders Recent Searches (last 5 from history) and Saved Searches with re-run functionality (navigates to /search?q=...&sectors=...)"
  - "AC-41: Dashboard data loading uses Promise.all for parallel queries (enquiries, shortlists, history, saved searches); buyer sections visible to all authenticated accounts regardless of provider status"
blocked_by: [CS-WORK-050, CS-WORK-051, CS-WORK-052, CS-WORK-053, CS-WORK-054]
blocks: []
enables: []
queue_position: done
cycle_phase: done
node_history:
  - node: backlog
    entered: 2026-02-24T00:00:00
    exited: 2026-02-25T00:00:00
  - node: done
    entered: 2026-02-25T00:00:00
    exited: null
artifacts:
  - src/app/dashboard/enquiries-sent/page.tsx
  - src/app/dashboard/shortlists/page.tsx
  - src/app/dashboard/searches/page.tsx
  - src/server/routers/__tests__/buyer-dashboard.integration.test.ts
cycle_docs: {}
memory_refs: []
extensions:
  project: CALLSHEET
  slice: S6
  spec_sections: "PP §6.1 (buyer dashboard sections)"
version: "2.0"
generated: 2026-02-24
last_updated: 2026-02-25T00:00:00
---

# CS-WORK-055: Implement buyer dashboard

## Context

Three buyer dashboard pages under S5's existing `/dashboard/layout.tsx` auth guard: "Enquiries Sent" (AC-38), "Your Shortlists" (AC-39), "Recent Searches / Saved Searches" (AC-40). All pages use CSR, require authentication, but do NOT require provider listing ownership — buyer sections are visible to all authenticated accounts regardless of provider status. Data loading uses `Promise.all` for parallel queries. Pages consume routes from CS-WORK-050 (`search.getSavedSearches`), CS-WORK-052 (`enquiry.listSent`), CS-WORK-053 (`shortlist.list`), and CS-WORK-054 (`searchHistory.list`).

**Type alignment:** `enquiry_records.status` has enum values `unread`/`responded`/`stale` (S5 §5). Dashboard status indicators map directly: grey=unread, green=responded, amber=stale. Shortlist summary cards use `shortlist.list` which returns `itemCount` (COUNT of active items). Recent searches use `searchHistory.list` (last 5). Saved searches use `search.getSavedSearches`.

## Deliverables

- [x] `src/app/dashboard/enquiries-sent/page.tsx` — Buyer enquiries sent page with status indicators
- [x] `src/app/dashboard/shortlists/page.tsx` — Shortlist summary cards page
- [x] `src/app/dashboard/searches/page.tsx` — Recent searches + saved searches page
- [x] `src/server/routers/__tests__/buyer-dashboard.integration.test.ts` — Integration tests for AC-41 (parallel loading, auth-only access)

## References

- `3-requirements/slices/slice-06-buyer-experience/04-shortlist-dashboard.md` §6 Buyer Dashboard
- `3-requirements/slices/slice-06-buyer-experience/00-router-plan.md` §1 File Tree (dashboard pages)
- `3-requirements/interfaces/platform-and-product.md` §6.1 (buyer dashboard)
