---
template: work_item
id: CS-WORK-009
title: "Listing and profile CRUD routes"
type: feature
status: done
owner: null
created: 2026-02-20
spawned_by: null
spawned_children: []
chapter: CH-CS-002
arc: infrastructure
epoch: CS-E1
closed: 2026-02-23
priority: high
effort: large
traces_to:
  - REQ-CS-DATA-003
source_files:
  - D:/PROJECTS/callsheet/3-requirements/slices/slice-01-data-model.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/data-and-listings.md
acceptance_criteria:
  - "AC-16: listing.create runs integrity checks; flag_for_review blocks creation and returns reason"
  - "AC-17: listing.update verifies ownership; non-owner gets FORBIDDEN"
  - "AC-18: listing.update triggers search vector update and emits profile_edited event"
  - "AC-19: listing.archive sets lifecycleStatus = archived, emits listing_archived"
  - "AC-20: listing.reactivate sets lifecycleStatus = active, emits listing_reactivated"
  - "AC-21: profile.updateEmailPreferences persists; email service reads updated preferences"
  - "AC-22: taxonomy.search returns matches across all 3 levels with relevance ordering"
  - "AC-32: Freelancer listing generates valid Person JSON-LD"
  - "AC-33: Company listing generates valid LocalBusiness JSON-LD"
blocked_by: [CS-WORK-007, CS-WORK-011]
blocks: []
enables: []
queue_position: backlog
cycle_phase: backlog
node_history:
  - node: backlog
    entered: 2026-02-20T00:00:00
    exited: null
artifacts: []
cycle_docs: {}
memory_refs: []
extensions:
  project: CALLSHEET
  slice: S1
  spec_sections: "D&L §1-§4, SI §4, SI §7"
version: "2.0"
generated: 2026-02-20
last_updated: 2026-02-20T00:00:00
---

# CS-WORK-009: Listing and profile CRUD routes

## Context

tRPC routers for listing CRUD (create, update, archive, reactivate, getBySlug, search, listAll), account profile management (get, update, email preferences), taxonomy queries (getSectors, getServiceAreas, getSpecialisations, search), and engagement counter query interface. JSON-LD structured data generation for listing profiles (Person for freelancers, LocalBusiness for companies). Listing create calls integrity pipeline (CS-WORK-011). Archive/reactivate enforce pre-conditions including admin-suspended guard (AC-42 in CS-WORK-012).

## Deliverables

- [ ] `src/server/routers/listing.ts` — Listing CRUD + search routes
- [ ] `src/server/routers/profile.ts` — Account profile + email preferences
- [ ] `src/server/routers/taxonomy.ts` — Read-only taxonomy queries
- [ ] `src/server/routers/engagement.ts` — Engagement counter query interface (D&L §3.2)
- [ ] `src/lib/jsonld/listing.ts` — `generateListingJsonLd()`
- [ ] Tests for all 9 AC

## References

- `3-requirements/slices/slice-01-data-model.md` §4 CRUD, §7 JSON-LD
- `3-requirements/interfaces/data-and-listings.md` §3.2 (engagement query interface)
