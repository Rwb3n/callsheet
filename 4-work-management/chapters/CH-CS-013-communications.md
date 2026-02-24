---
id: CH-CS-013
title: Communications Infrastructure
arc: infrastructure
epoch: CS-E1
status: Done
depends: null
work_items: [CS-WORK-025, CS-WORK-026, CS-WORK-027, CS-WORK-028]
---

# Chapter: Communications Infrastructure

## Problem

Every email CALLSHEET sends is unaccountable. `EmailService.send()` returns a `messageId` and `status`, then discards both. No record persists. This blocks GDPR Article 15 compliance (data subjects can request communication history), breaks the `processErasure` flow (no email records to include in DSAR extract), and leaves the entity blind to its own communication state.

## Requirements

Source: `1-investigation/communications-infrastructure.md` (all 7 OQs resolved). Phase 1 of 4-phase build.

17 acceptance criteria across 4 work items:
- **CS-WORK-025** (4 AC): Correspondence log schema, suppressed_emails table, suppressedAt/suppressionReason on account_profiles, retry_bounced_email deferred action type
- **CS-WORK-026** (4 AC): LoggingEmailService decorator, system suppression check, correspondence logging, merge fields hash, thread ID handling
- **CS-WORK-027** (5 AC): Resend webhook endpoint, status lifecycle transitions, signature verification, bounce delegation
- **CS-WORK-028** (4 AC): Hard/soft bounce handling, suppression, admin notification threshold, DSAR extract/anonymise

## Work Items

| ID | Title | ACs | Effort | Priority | Blocked By |
|---|---|---|---|---|---|
| CS-WORK-025 | Correspondence log schema and migration | 4 (AC-01..AC-04) | small | high | — |
| CS-WORK-026 | EmailService correspondence logging | 4 (AC-05..AC-08) | medium | high | CS-WORK-025 |
| CS-WORK-027 | Outbound event webhook and status lifecycle | 5 (AC-09..AC-13) | medium | high | CS-WORK-025, CS-WORK-026 |
| CS-WORK-028 | Bounce handling, suppression, and DSAR extension | 4 (AC-14..AC-17) | medium | high | CS-WORK-025, CS-WORK-027 |

## Success Criteria

- [x] `correspondence_log` table with 6 indexes, direction/status enums, self-referencing FK
- [x] `suppressed_emails` table with email PK, FK to correspondence_log
- [x] `account_profiles.suppressedAt` and `suppressionReason` columns
- [x] `LoggingEmailService` decorator wraps any `EmailService`, logs every send
- [x] System suppression blocks ALL categories including transactional
- [x] Resend webhook processes delivery/open/click/bounce/complaint events
- [x] Hard bounce → suppress + decision log. Soft bounce → retry in 24h. 3+ bounces → admin alert
- [x] DSAR extract and anonymise functions ready (not wired to flow until S10)
- [x] All 17 AC verified (17 unit + 19 integration tests). 0 type errors.

## Note

MX record configuration for `callsheet.co.uk` is a manual DNS task, not code. Required before Phase 2 (inbound email).
