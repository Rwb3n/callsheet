---
template: work_item
id: CS-WORK-063
title: "Event consumers and email delivery"
type: feature
status: done
owner: null
created: 2026-02-25
spawned_by: null
spawned_children: []
chapter: CH-CS-009
arc: buyer-and-operations
epoch: CS-E1
closed: 2026-02-25
priority: high
effort: large
traces_to:
  - REQ-CS-OPS-007
source_files:
  - D:/PROJECTS/callsheet/3-requirements/slices/slice-07-operations/index.md
  - D:/PROJECTS/callsheet/3-requirements/slices/slice-07-operations/09-event-consumers.md
  - D:/PROJECTS/callsheet/3-requirements/slices/slice-07-operations/10-registries.md
  - D:/PROJECTS/callsheet/3-requirements/slices/slice-07-operations/11-email-delivery.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/operations.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/data-and-listings.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/platform-and-product.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/commercial-and-revenue.md
acceptance_criteria:
  - "AC-11.1: winback_eligible consumer resolves email and calls EmailService.send('winback', ...) with CR-provided mergeFields"
  - "AC-11.2: winback_delivery_result emitted after every processing — delivered or failed"
  - "AC-11.3: winback_delivery_result.accountId carries through cancelledAccountId (not looked up separately)"
  - "AC-11.4: decay_signal_detected consumer skips email when activeSupportTicket present"
  - "AC-11.5: Suppressed decay warnings produce decision log with action: decay_warning_suppressed"
  - "AC-11.6: Decay handler resolves listing owner; skips for unclaimed listings"
  - "AC-11.7: Decay warning email includes signalType, signalSeverity, listingName as merge fields"
  - "AC-11.7a: Decay warning email uses category: listing_status — EmailService suppresses send if account has unsubscribed from this category"
  - "AC-11.8: Email send failures caught via try/catch and do NOT propagate to event_consumer_errors"
  - "AC-11.9: Win-back uses category: conversion_marketing — suppressed if unsubscribed"
  - "AC-11.10: Suppressed win-back still emits winback_delivery_result with status: failed"
blocked_by: [CS-WORK-057]
blocks: []
enables: []
queue_position: done
cycle_phase: done
node_history:
  - node: backlog
    entered: 2026-02-25T00:00:00
    exited: 2026-02-25T00:00:00
  - node: done
    entered: 2026-02-25T00:00:00
    exited: null
artifacts:
  - src/domains/operations/consumers/claim-volume.ts
  - src/domains/operations/consumers/listing-lifecycle.ts
  - src/domains/operations/consumers/decay-outreach.ts
  - src/domains/operations/consumers/account-closed.ts
  - src/domains/operations/consumers/listing-created.ts
  - src/domains/operations/consumers/contact-attempt.ts
  - src/domains/operations/consumers/churn-risk.ts
  - src/domains/operations/consumers/winback-delivery.ts
  - src/domains/operations/consumers/index.ts
  - src/domains/operations/email-templates.ts
  - src/domains/operations/consumers/__tests__/ops-consumers.integration.test.ts
  - src/domains/operations/consumers/__tests__/email-delivery.integration.test.ts
cycle_docs: {}
memory_refs: []
extensions:
  project: CALLSHEET
  slice: S7
  spec_sections: "S7 §9, §10, §11, Ops §2 (all 12 consumer entries), Ops §1.3 (winback_delivery_result), Ops §7 (email delivery)"
  io_profile: "db-write"
version: "2.0"
generated: 2026-02-25
last_updated: 2026-02-25T00:00:00
---

# CS-WORK-063: Event consumers and email delivery

## Context

Implements all 12 Operations event bus consumer registrations (all async, domain: "operations") plus win-back and decay warning email delivery. The 12 consumers cover: claim volume tracking (×2), listing lifecycle reactions (archive/suspend/reactivate), decay outreach, account closure cleanup, listing creation tracking, contact attempt prioritisation, churn risk registry upsert, win-back delivery, and pending cancellation storage. The existing `pending_cancellation_created` consumer at `src/domains/operations/paddle/consumers.ts` already handles one — 11 new consumer implementations plus 1 existing handler extension.

Win-back delivery: receives `winback_eligible` event with CR-provided `mergeFields`, resolves email, sends `winback` template (category: `conversion_marketing`), emits `winback_delivery_result` with `status: "delivered" | "failed"`.

Decay warning delivery: receives `decay_signal_detected`, checks `hasActiveTicket` (suppresses if present + decision log), resolves listing owner (skips unclaimed), sends `listing_decay_warning` template (category: `listing_status`).

**Type alignment notes:**
- `DecaySignalDetectedEvent`, `ChurnRiskDetectedEvent`, `WinbackEligibleEvent`, `WinbackDeliveryResultEvent` are stubs — populate real fields per interface spec §1 payloads.
- `EVENT_CONSUMER_MATRIX` needs 11 new entries (the `pending_cancellation_created` → `storeAndCancel` entry already exists).
- `winback` and `listing_decay_warning` email templates: register during this work item.

## Deliverables

- [ ] `src/domains/operations/consumers/index.ts` — Barrel exporting all 12 consumer handler factories
- [ ] `src/domains/operations/consumers/claim-volume.ts` — `claim_approved` + `claim_rejected` handlers
- [ ] `src/domains/operations/consumers/listing-lifecycle.ts` — `listing_archived`, `listing_suspended`, `listing_reactivated` handlers
- [ ] `src/domains/operations/consumers/decay-outreach.ts` — `decay_signal_detected` handler with email delivery (AC-11.4 through AC-11.8)
- [ ] `src/domains/operations/consumers/account-closed.ts` — `account_closed` handler (close tickets + compliance)
- [ ] `src/domains/operations/consumers/listing-created.ts` — `listing_created` onboarding tracking handler
- [ ] `src/domains/operations/consumers/contact-attempt.ts` — `contact_attempt` outreach prioritisation handler
- [ ] `src/domains/operations/consumers/churn-risk.ts` — `churn_risk_detected` handler (upsert `churn_risk_registry`)
- [ ] `src/domains/operations/consumers/winback-delivery.ts` — `winback_eligible` handler with email delivery (AC-11.1 through AC-11.3, AC-11.9, AC-11.10)
- [ ] `src/lib/events/types.ts` — Populate `DecaySignalDetectedEvent`, `ChurnRiskDetectedEvent`, `WinbackEligibleEvent`, `WinbackDeliveryResultEvent` with real fields
- [ ] `src/lib/events/types.ts` — Add 11 new `EVENT_CONSUMER_MATRIX` entries for operations domain
- [ ] `src/domains/operations/consumers/__tests__/consumers.integration.test.ts` — Integration tests for all consumer handlers
- [ ] `src/domains/operations/consumers/__tests__/email-delivery.integration.test.ts` — Integration tests for AC-11.1 through AC-11.10
- [ ] `src/lib/events/singleton.ts` — Register operations consumer set
- [ ] `src/lib/email/templates.ts` — Register `winback` and `listing_decay_warning` templates

## References

- `3-requirements/slices/slice-07-operations/09-event-consumers.md` §9 (12 consumer specs)
- `3-requirements/slices/slice-07-operations/10-registries.md` §10 (churn risk, pending cancellation registries)
- `3-requirements/slices/slice-07-operations/11-email-delivery.md` §11 (win-back + decay warning delivery)
- `3-requirements/interfaces/operations.md` §1 (emitted events), §2 (consumed events)
- `3-requirements/interfaces/data-and-listings.md` §1.1–§1.9 (consumed event payloads)
- `3-requirements/interfaces/platform-and-product.md` §1.6, §1.8, §1.9 (consumed event payloads)
- `3-requirements/interfaces/commercial-and-revenue.md` §1.2–§1.4 (consumed event payloads)
