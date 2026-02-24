---
template: work_item
id: CS-WORK-045
title: "Implement enquiry inbox and response tracking"
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
effort: medium
traces_to:
  - REQ-CS-PROV-003
source_files:
  - D:/PROJECTS/callsheet/3-requirements/slices/slice-05-provider-experience.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/platform-and-product.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/shared-infrastructure.md
acceptance_criteria:
  - "AC-16: Enquiry inbox displays all enquiries for listing with cursor-based pagination (20 per page)"
  - "AC-17: Enquiry status filter (all, unread, responded, stale) correctly filters results"
  - "AC-18: respondToEnquiry updates status to responded, sends response email (skipped if senderEmail null after GDPR erasure), and emits enquiry_responded [S5-ST-20]"
  - "AC-19: Responding to an already-responded enquiry returns BAD_REQUEST"
  - "AC-20: enquiry_response_reminder marks enquiry as stale and sends reminder email 7 days after delivery if unresponded"
  - "AC-21: enquiry_response_reminder is a no-op if enquiry was already responded"
  - "AC-22: enquiry_responded event payload includes responseTimeMinutes computed from enquiry.createdAt to response time"
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
  spec_sections: "PP §1.4 (enquiry_responded), SI §2.1 (DeferredActionParamsMap), SI §5.2 (enquiry_response template)"
version: "2.0"
generated: 2026-02-24
last_updated: 2026-02-24T00:00:00
---

# CS-WORK-045: Implement enquiry inbox and response tracking

## Context

Provider-side enquiry management — inbox with filtering, response mutation with email delivery, and 7-day stale reminder. Requires a schema migration adding `enquiry_status` pgEnum and `status` column to `enquiry_records` (currently has `respondedAt` but no explicit status). The `enquiry_response_reminder` deferred action handler is registered here. The `enquiry_response` email template must be registered in the template system. Response emits `enquiry_responded` (existing event — consumer already exists at `src/domains/data-and-listings/consumers/response-metrics.ts`).

**Type alignment:** `DeferredActionParamsMap` already includes `enquiry_response_reminder: { enquiryId: UUID; listingId: UUID }` at `src/lib/scheduler/types.ts`. `enquiry_records` table at `src/db/schema/accounts.ts` lacks `status` column — migration needed. `senderEmail` is nullable (null guard for GDPR erasure per S5-ST-20).

## Deliverables

- [ ] `src/db/migrations/0007_*.sql` — Add `enquiry_status` pgEnum + `status` column to `enquiry_records`
- [ ] `src/db/schema/accounts.ts` — Add `enquiryStatusEnum` + `status` column to `enquiryRecords` definition
- [ ] `src/app/dashboard/listings/[listingId]/enquiries/page.tsx` — Enquiry inbox page
- [ ] `src/server/routers/enquiry.ts` — `createEnquiryRouter(deps)` with `getInbox`, `respondToEnquiry`
- [ ] `src/domains/platform/enquiry/response-reminder.ts` — `enquiry_response_reminder` deferred action handler
- [ ] `src/server/routers/__tests__/enquiry.integration.test.ts` — Integration tests for all 7 AC
- [ ] `src/domains/platform/enquiry/__tests__/response-reminder.integration.test.ts` — Integration tests for AC-20, AC-21

## References

- `3-requirements/slices/slice-05-provider-experience.md` §5 Enquiry Management
- `3-requirements/interfaces/platform-and-product.md` §1.4 (enquiry_responded)
- `3-requirements/interfaces/shared-infrastructure.md` §2.1 (DeferredActionParamsMap), §5.2 (templates)
