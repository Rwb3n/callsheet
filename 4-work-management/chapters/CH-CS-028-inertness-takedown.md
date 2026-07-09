---
id: CH-CS-028
title: Inertness & Takedown
arc: venture-p1
epoch: CS-E2
status: Active
depends: []
work_items: [CS-WORK-129, CS-WORK-130, CS-WORK-131, CS-WORK-132, CS-WORK-133]
---

# Chapter: Inertness & Takedown

## Scope

Make P1's inertness claim verifiable and its publishing posture lawful. Five work items: env-gate the S9/S8 event consumers with a verification test, fail-close the Resend inbound webhook, hide auth/enquiry UI behind a P1 mode, replace the Article 14 ghost-scheduler send path with a direct send, and build the accountless correction/removal route. Sources: venture spike deliverables 3 (flag matrix) and 6 (P1-A, B.5, B.6); local re-audit 2026-07-09.

## Work Items

| ID | Title | AC | Blocked By | Status |
|----|-------|----|------------|--------|
| CS-WORK-129 | Consumer registration env gates + inertness verification | 6 | — | todo |
| CS-WORK-130 | Fail-closed Resend inbound webhook | 3 | — | todo |
| CS-WORK-131 | P1 UI mode — hide signup/login/enquiry entry points | 4 | — | todo |
| CS-WORK-132 | Article 14 direct-send path | 4 | — | todo |
| CS-WORK-133 | Accountless correction/removal route | 5 | — | todo |

**Total: 22 AC across 5 work items.**

## Acceptance Criteria

### CS-WORK-129 — Consumer registration env gates + inertness verification

- AC-01: `registerIntelligenceConsumers()` in `src/lib/events/singleton.ts` is skipped unless `ENABLE_INTELLIGENCE_CONSUMERS=true` (integration test both states)
- AC-02: `registerCommercialConsumers()` gated identically behind `ENABLE_COMMERCIAL_CONSUMERS=true`
- AC-03: `EVENT_CONSUMER_MATRIX` startup validation passes in both gated and ungated states (matrix entries marked gated are exempt from the presence check when the gate is off)
- AC-04: With P1 env, `search.query` and profile page render produce zero rows in intelligence tables (`perception_aggregates`, `decay_signals`, `enrichment_schedules`) — integration test
- AC-05: With P1 env, public reads produce zero rows in `deferred_actions` — integration test
- AC-06: Inertness verification test asserts the registered-consumer set under P1 env equals the expected P1 allowlist (exact match, not subset)

### CS-WORK-130 — Fail-closed Resend inbound webhook

- AC-01: `POST /api/webhooks/email/events` returns 503 when `RESEND_WEBHOOK_SECRET` is unset (currently falls through to `NoOpWebhookVerifier` — `route.ts:17`)
- AC-02: `NoOpWebhookVerifier` is no longer reachable from the production route (test-only export)
- AC-03: Existing webhook integration tests pass with an injected test verifier; a new test covers the unset-secret rejection

### CS-WORK-131 — P1 UI mode

- AC-01: `NEXT_PUBLIC_P1_MODE=true` hides signup/login links (homepage, nav) and the enquiry form/CTA on listing profiles
- AC-02: `/login`, `/signup` redirect to `/` in P1 mode (middleware); `/dashboard`, `/admin` behaviour unchanged (session-gated — admin remains reachable for the principal)
- AC-03: `enquiry.submit` tRPC route rejects with `FORBIDDEN` in P1 mode (route guard, not just hidden UI)
- AC-04: With P1 mode off, all hidden surfaces return (reversal switch for P2 — no code change, env flip only)

### CS-WORK-132 — Article 14 direct-send path

- AC-01: Import pipeline phase-5 sends Article 14 notices via `EmailService` directly at import time — no `scheduleDeferredAction` dependency
- AC-02: Sends are recorded in `correspondence_log` with category `compliance` (existing LoggingEmailService path)
- AC-03: `article_14_progress_check` compliance monitoring still functions: progress computation reads the correspondence log (poller-independent)
- AC-04: Listings without a contact email retain the on-page notice path (`article14NoticeDisplayed`) — regression test

### CS-WORK-133 — Accountless correction/removal route

- AC-01: Public page (linked from every listing footer) accepts a correction/removal request: listing, requester contact, request type (correct | remove), free-text grounds — no account required
- AC-02: Submission creates an Ops `task_spec` (domain: compliance, priority: high for removal) and a `compliance_register` entry for removal requests (30-day deadline)
- AC-03: Removal execution reuses the S10 anonymisation/deletion substrate (`processErasure` company path) scoped to a single unclaimed listing
- AC-04: Requester receives acknowledgment email (direct send, correspondence-logged)
- AC-05: Rate-limited (per-IP) and honeypot-protected — no auth means abuse surface

## Dependency Graph

```
CS-WORK-129 (Env Gates + Verification, 6 AC)
CS-WORK-130 (Fail-Closed Webhook, 3 AC)
CS-WORK-131 (P1 UI Mode, 4 AC)
CS-WORK-132 (Article 14 Direct Send, 4 AC)
CS-WORK-133 (Correction/Removal Route, 5 AC)

All 5 items independent — fully parallelisable.
```
