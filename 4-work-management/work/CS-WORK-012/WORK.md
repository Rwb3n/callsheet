---
template: work_item
id: CS-WORK-012
title: "Event consumers and query interfaces"
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
effort: medium
traces_to:
  - REQ-CS-DATA-006
source_files:
  - D:/PROJECTS/callsheet/3-requirements/slices/slice-01-data-model.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/data-and-listings.md
acceptance_criteria:
  - "AC-34: profile_viewed increments engagement.profileViews by 1"
  - "AC-35: enquiry_submitted increments engagement.enquiriesReceived; if unclaimed, adds pendingEnquiry"
  - "AC-36: subscription_tier_changed updates listing.subscriptionTier to event.newTier"
  - "AC-37: account_closed consumer registered and executes without error (no-op at S1)"
  - "AC-38: profile_viewed event increments counter; V1 accepts approximate counting. Two distinct events produce +2"
  - "AC-39: getEngagementCounters returns correct counters for listing, <50ms"
  - "AC-41: search_performed with resultCount === 0 creates zero_result_queries entry queryable by date range"
  - "AC-42: listing.reactivate on an admin-suspended listing returns FORBIDDEN"
blocked_by: [CS-WORK-007]
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
  spec_sections: "D&L §2, D&L §3, SI §1"
version: "2.0"
generated: 2026-02-20
last_updated: 2026-02-20T00:00:00
---

# CS-WORK-012: Event consumers and query interfaces

## Context

D&L event consumer registrations: 9 consumers (all async) for `listing_created`, `profile_edited`, `search_performed`, `profile_viewed`, `enquiry_submitted`, `enquiry_responded`, `contact_attempt`, `subscription_tier_changed`, `account_closed`. Handlers update engagement counters, queue pending enquiries for unclaimed listings, log zero-result queries, and update subscription tiers. Also implements `getEngagementCounters` query interface (D&L §3.2) and updates `EVENT_CONSUMER_MATRIX` with S1 registrations. AC-42 (admin-suspended reactivation guard) is here because it's a route pre-condition enforced via listing lifecycle status checks.

## Deliverables

- [ ] `src/domains/data-and-listings/consumers/` — Event consumer handlers (one file per event type or grouped by concern)
- [ ] `src/lib/events/types.ts` — Update `EVENT_CONSUMER_MATRIX` with 9 S1 consumer entries
- [ ] Tests for all 8 AC

## References

- `3-requirements/slices/slice-01-data-model.md` §10 Event Consumers, §12 AC
- `3-requirements/interfaces/data-and-listings.md` §2 (consumed events), §3 (query interfaces)
