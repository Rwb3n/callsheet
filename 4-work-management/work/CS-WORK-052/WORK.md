---
template: work_item
id: CS-WORK-052
title: "Implement enquiry submission"
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
priority: critical
effort: medium
traces_to:
  - REQ-CS-BUYER-003
source_files:
  - D:/PROJECTS/callsheet/3-requirements/slices/slice-06-buyer-experience/index.md
  - D:/PROJECTS/callsheet/3-requirements/slices/slice-06-buyer-experience/03-enquiry-submission.md
  - D:/PROJECTS/callsheet/3-requirements/slices/slice-06-buyer-experience/00-router-plan.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/platform-and-product.md
acceptance_criteria:
  - "AC-20: Branch A (claimed): creates enquiry_records row with status = unread, sends new_enquiry email to provider, schedules enquiry_response_reminder at 7 days"
  - "AC-21: Branch B (unclaimed+email): sends enquiry_forwarded email with claim CTA, queues in pending_enquiries with 90-day TTL"
  - "AC-22: Branch C (unclaimed, no email): returns NO_EMAIL with contact methods, no enquiry_records row created, no enquiry_submitted event emitted"
  - "AC-23: Branch D (disputed): enquiry queued silently, buyer sees normal confirmation identical to Branch A"
  - "AC-24: enquiry_submitted payload contains only enquiryId, listingId, timestamp — no PII (no senderEmail, no senderAccountId) [PP-ST-12]"
  - "AC-25: Honeypot non-empty -> rejected; rate limit: 11th enquiry from same email within 1 hour -> rejected; message under 20 chars -> Zod rejects"
  - "AC-26: Anonymous user must provide senderEmail; authenticated user senderEmail resolved from session (form input ignored); anonymous enquiry stored with senderAccountId = null"
  - "AC-27: Inactive listing (lifecycleStatus !== active) -> NOT_FOUND"
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
  spec_sections: "PP §1.3 (enquiry_submitted), PP §5 (enquiry submission)"
version: "2.0"
generated: 2026-02-24
last_updated: 2026-02-24T00:00:00
---

# CS-WORK-052: Implement enquiry submission

## Context

Enquiry submission with a four-branch decision tree based on listing claim status: (A) claimed → direct delivery with `new_enquiry` email + `enquiry_response_reminder` scheduling, (B) unclaimed+email → forwarding with `enquiry_forwarded` email + `pending_enquiries` queue, (C) unclaimed without email → contact fallback return with no record created, (D) disputed → silent queue with normal buyer confirmation. Open to anonymous users (email required). Spam prevention via honeypot field and rate limiting (10/email/hour). `enquiry_submitted` event carries no PII (PP-ST-12). S5's existing `enquiry.ts` router owns provider-side inbox; S6 adds `enquiry.submit` for buyer-side submission and `enquiry.listSent`/`enquiry.getSent` for buyer history.

**Type alignment:** `enquiry_response_reminder` handler exists at `src/lib/scheduler/handlers/enquiry-response-reminder.ts` (S5). `new_enquiry` and `enquiry_forwarded` templates registered in SI §5.2. `pending_enquiries` table exists in `src/db/schema/data-and-listings.ts`. `EnquirySubmittedEvent` in `EventPayloadMap` — S6 populates with `enquiryId`, `listingId`, `timestamp` only.

## Deliverables

- [x] `src/server/routers/enquiry.ts` — Extended with `submit`, `listSent`, `getSent` procedures
- [x] `src/server/routers/__tests__/enquiry-submit.integration.test.ts` — 18 integration tests for AC-20 through AC-27 + buyer read routes
- [x] `src/domains/platform/buyer/enquiry-routing.ts` — `routeEnquiry(listing, input, deps)` four-branch logic
- [x] `src/domains/platform/enquiry/email-templates.ts` — `registerNewEnquiryTemplate()` added
- [x] `src/lib/events/types.ts` — `EnquirySubmittedEvent` updated with `timestamp` field

## References

- `3-requirements/slices/slice-06-buyer-experience/03-enquiry-submission.md` §3 Enquiry Submission
- `3-requirements/slices/slice-06-buyer-experience/00-router-plan.md` §2.3 enquiry router
- `3-requirements/interfaces/platform-and-product.md` §1.3 (enquiry_submitted), §5 (enquiry flow)
