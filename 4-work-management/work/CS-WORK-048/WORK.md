---
template: work_item
id: CS-WORK-048
title: "Implement profile editor enhancements and 90-day reminder"
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
priority: high
effort: large
traces_to:
  - REQ-CS-PROV-006
source_files:
  - D:/PROJECTS/callsheet/3-requirements/slices/slice-05-provider-experience.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/platform-and-product.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/shared-infrastructure.md
acceptance_criteria:
  - "AC-31: Concurrent edit on listing triggers CONFLICT error (optimistic lock via version column)"
  - "AC-32: Successful edit increments version and emits profile_edited with accountId and changedFields array [S5-ST-13]"
  - "AC-33: Media upload section shows tier limit and hidden item count"
  - "AC-34: Custom tags section shows available with Standard prompt for free-tier listings"
  - "AC-45: Editing an archived or suspended listing returns FORBIDDEN [S5-ST-17]"
  - "AC-35: Profile edit schedules listing_update_reminder deferred action at 90 days"
  - "AC-36: Subsequent profile edit cancels existing reminder and reschedules (clock reset)"
  - "AC-37: listing_update_reminder handler sends email and reschedules itself (self-perpetuating)"
blocked_by: [CS-WORK-043]
blocks: []
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
  spec_sections: "PP §1.7 (profile_edited), SI §2.1 (DeferredActionParamsMap), SI §3 (deferred actions)"
version: "2.0"
generated: 2026-02-24
last_updated: 2026-02-24T00:00:00
---

# CS-WORK-048: Implement profile editor enhancements and 90-day reminder

## Context

Enhances the S2 profile editor with optimistic concurrency control (version column), lifecycle guards (no edits on archived/suspended listings), feature-gated editor sections, and the 90-day listing update reminder. Schema migration adds `version` column to `listings` table. The `listing_update_reminder` deferred action handler is a self-perpetuating pattern (S0 §3) — on execution it sends the reminder email and schedules itself again. The `profile_edited` consumer (existing at `src/domains/data-and-listings/consumers/quality.ts`) is extended with cancel/reschedule logic for the 90-day reminder.

**Type alignment:** `DeferredActionParamsMap` already includes `listing_update_reminder: { listingId: UUID }` at `src/lib/scheduler/types.ts`. Listing edit mutation exists at `src/server/routers/listing.ts` — enhance with `version` input field, version check, and lifecycle guard. `profile_edited` event emission already includes `accountId` per S5-ST-13 fix.

## Deliverables

- [ ] `src/db/migrations/0007_*.sql` or `0008_*.sql` — Add `version` column to `listings` table (coordinate migration numbering)
- [ ] `src/db/schema/data-and-listings.ts` — Add `version` column to `listings` definition
- [ ] `src/server/routers/listing.ts` — Enhance `editListing` mutation: version input, optimistic lock, lifecycle guard, profile_edited emission with accountId
- [ ] `src/app/dashboard/listings/[listingId]/edit/page.tsx` — Enhanced profile editor page (feature-gated sections)
- [ ] `src/domains/platform/reminders/listing-update-reminder.ts` — `listing_update_reminder` deferred action handler (self-perpetuating)
- [ ] `src/domains/data-and-listings/consumers/quality.ts` — Extend `profileEditedHandler` with 90-day reminder scheduling
- [ ] `src/server/routers/__tests__/listing-edit.integration.test.ts` — Integration tests for AC-31, AC-32, AC-45
- [ ] `src/domains/platform/reminders/__tests__/listing-update-reminder.integration.test.ts` — Integration tests for AC-35, AC-36, AC-37

## References

- `3-requirements/slices/slice-05-provider-experience.md` §8 Profile Editor Enhancements, §9 90-Day Listing Update Reminder
- `3-requirements/interfaces/platform-and-product.md` §1.7 (profile_edited)
- `3-requirements/interfaces/shared-infrastructure.md` §2.1 (DeferredActionParamsMap), §3 (deferred actions)
