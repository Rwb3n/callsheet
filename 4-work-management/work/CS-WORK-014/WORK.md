---
template: work_item
id: CS-WORK-014
title: "Freelancer listing creation"
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
priority: high
effort: medium
traces_to:
  - REQ-CS-ONBOARD-002
source_files:
  - D:/PROJECTS/callsheet/3-requirements/slices/slice-02-onboarding.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/platform-and-product.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/data-and-listings.md
acceptance_criteria:
  - "AC-06: Freelancer listing created with correct defaults: entityType = freelancer, claimStatus = claimed, verificationTier = claimed, subscriptionTier = free"
  - "AC-07: Integrity checks run before creation; flag_for_review blocks listing and returns reason"
  - "AC-08: listing_created event emitted after successful creation"
  - "AC-09: Progressive disclosure deferred actions scheduled: Day 1, 3, 7"
  - "AC-10: listing_live email sent after creation"
blocked_by: [CS-WORK-013]
blocks: [CS-WORK-018]
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
  spec_sections: "PP §4.2, D&L §3.1, SI §2, S2 §3"
version: "2.0"
generated: 2026-02-22
last_updated: 2026-02-22T00:00:00
---

# CS-WORK-014: Freelancer listing creation

## Context

Implements `createFreelancer` on the `listingCreationRouter`. The mutation enforces the verified-email guard (CS-WORK-013), runs S1 integrity checks (`checkDuplicate`, `checkCHUniqueness`), creates the listing with one-to-one rows (two-phase pattern from S1 S10), creates taxonomy tags, emits `listing_created`, schedules progressive disclosure deferred actions (Day 1/3/7/14), sends `listing_live` email, and returns the listing slug. This is the first end-to-end listing creation path. AC-09 schedules deferred actions; their execution is tested in CS-WORK-018. `listing_live` and `welcome` email templates registered here.

## Deliverables

- [ ] `src/server/routers/listing-creation.ts` -- `createFreelancer` mutation with Zod schema
- [ ] `src/lib/onboarding/schedule-progressive-disclosure.ts` -- `scheduleProgressiveDisclosure()` for Paths A+B
- [ ] Email template registration: `welcome`, `listing_live`
- [ ] `src/lib/onboarding/__tests__/freelancer-creation.integration.test.ts` -- All 5 AC

## References

- `3-requirements/slices/slice-02-onboarding.md` S3 Path A, S7.1 Progressive Disclosure, S10 Email Templates
- `3-requirements/interfaces/platform-and-product.md` S1.6 (`listing_created` event)
- `3-requirements/interfaces/data-and-listings.md` S3.1 (integrity rules)
