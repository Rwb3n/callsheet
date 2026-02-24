---
template: work_item
id: CS-WORK-043
title: "Implement dashboard overview and listing context"
type: feature
status: active
owner: null
created: 2026-02-24
spawned_by: null
spawned_children: []
chapter: CH-CS-007
arc: provider-experience
epoch: CS-E1
closed: null
priority: critical
effort: medium
traces_to:
  - REQ-CS-PROV-001
source_files:
  - D:/PROJECTS/callsheet/3-requirements/slices/slice-05-provider-experience.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/platform-and-product.md
acceptance_criteria:
  - "AC-1: Unauthenticated access to /dashboard redirects to /login?redirect=/dashboard"
  - "AC-2: Dashboard overview shows all owned listings as cards with name, tier, verification badge, and all-time engagement totals"
  - "AC-3: Archived listings appear greyed-out with Reactivate button; admin-suspended listings show Suspended with no reactivate action"
  - "AC-4: Listing detail page returns 404 for listings not owned by authenticated user"
  - "AC-5: Dashboard overview loads in <500ms p95 for accounts with up to 50 listings"
blocked_by: []
blocks: [CS-WORK-044, CS-WORK-045, CS-WORK-046, CS-WORK-047, CS-WORK-048, CS-WORK-049]
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
  slice: S5
  spec_sections: "PP §6, SI §4"
version: "2.0"
generated: 2026-02-24
last_updated: 2026-02-24T00:00:00
---

# CS-WORK-043: Implement dashboard overview and listing context

## Context

Dashboard shell and listing context provider — the foundational layout that all other S5 work items render within. Auth guard redirects unauthenticated users. Overview page loads all owned listings via a single join query (listings + engagements + quality scores). Listing-scoped layout verifies ownership and provides `ListingContext` + `FeatureAccess` to child routes. All other S5 work items depend on this layout and context infrastructure.

**Type alignment:** `computeFeatureAccess` exists at `src/domains/commercial/subscription/feature-access.ts`. `getEngagementCounters` is a D&L query interface. `listings.version` column does not yet exist — added by CS-WORK-048.

## Deliverables

- [ ] `src/app/dashboard/layout.tsx` — Auth guard + dashboard shell (session check, redirect)
- [ ] `src/app/dashboard/page.tsx` — Overview page: listing cards grid
- [ ] `src/app/dashboard/listings/[listingId]/layout.tsx` — Listing context provider (ownership check, feature access)
- [ ] `src/server/routers/dashboard.ts` — `createDashboardRouter(deps)` with `getOverview` query (join query)
- [ ] `src/server/routers/__tests__/dashboard.test.ts` — Unit tests for overview query
- [ ] `src/server/routers/__tests__/dashboard.integration.test.ts` — Integration tests for AC-4, AC-5

## References

- `3-requirements/slices/slice-05-provider-experience.md` §1 Dashboard Routes, §2 Multi-Listing Management
- `3-requirements/interfaces/platform-and-product.md` §6
