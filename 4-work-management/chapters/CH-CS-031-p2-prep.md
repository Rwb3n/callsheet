---
id: CH-CS-031
title: P2 Prep (build-ahead)
arc: venture-p1
epoch: CS-E2
status: Planned
depends: [CH-CS-028]
work_items: [CS-WORK-139, CS-WORK-140, CS-WORK-141]
---

# Chapter: P2 Prep

## Scope

Build-ahead for the claim loop during the P1 window (Amendment 1, `phase-gate-model.md`), so tranche-1 claim invitations can send at week 4–6 of P1. Three work items: real Companies House client, claim-invitation pipeline with deliverability instrumentation, and the P2 enablement switch. **Build is unrestricted; enablement (sending tranche 1, un-hiding auth UI) requires a dated Gate Record entry.** The auth verification-email fix is pre-satisfied (CS-WORK-101: production Resend when `RESEND_API_KEY` set).

## Work Items

| ID | Title | AC | Blocked By | Status |
|----|-------|----|------------|--------|
| CS-WORK-139 | Real Companies House client | 5 | principal P0.3 (API key) | todo |
| CS-WORK-140 | Claim invitation pipeline + deliverability instrumentation | 6 | CH-CS-028 (132) | todo |
| CS-WORK-141 | P2 enablement switch + checklist | 3 | 139, 140 | todo |

**Total: 14 AC across 3 work items.**

## Acceptance Criteria

### CS-WORK-139 — Real Companies House client

- AC-01: `CompaniesHouseService` implementation calling the live CH API (company profile by number; officers not required at P2), 500ms rate-limited per existing pipeline convention
- AC-02: Selected via env (`COMPANIES_HOUSE_API_KEY` present → real client), replacing the hardcoded `InMemoryCompaniesHouseService` in `createProductionServices()`
- AC-03: Response mapped to the existing `CompaniesHouseCompany` type consumed by `evaluateClaim` — no changes to claim decision logic
- AC-04: Error taxonomy: 404 → no-match (claim path handles), 429/5xx → retryable error distinct from no-match (claim queues for manual review, never auto-rejects on API failure)
- AC-05: Smoke check added to `callsheet smoke` (CH reachability with key)

### CS-WORK-140 — Claim invitation pipeline

- AC-01: `claim_invitation` email template registered: listing name, view count if ≥5 (endowment messaging reuse), claim URL with listing-scoped token
- AC-02: Tranche tooling (CLI or script): given a listing cut (≤100 for tranche 1), sends invitations via `EmailService`, correspondence-logged with a tranche identifier in merge fields
- AC-03: Idempotent per listing — a listing never receives two invitations from re-runs
- AC-04: Deliverability read per tranche: bounce rate and delivered % computed from `correspondence_log` — the Amendment 2 validity condition, queryable via `admin.gates` or CLI
- AC-05: Claim landing page renders for invited (unclaimed) listings with the token, pre-auth: shows listing preview + endowment stats + signup CTA (P1 UI mode carve-out for tokened claim URLs)
- AC-06: Invitation sends are refused while P1 mode is on unless the tranche is explicitly authorised (`--gate-record <date>` flag referencing the Gate Record row)

### CS-WORK-141 — P2 enablement switch + checklist

- AC-01: Documented env flip set for P2 (unset `NEXT_PUBLIC_P1_MODE`, set `RESEND_WEBHOOK_SECRET`, enable claim routes) — one page, verified against CS-WORK-131 AC-04
- AC-02: P2 gate instrumentation verified pre-send: claim events, time-to-claim, and profile-edit tracking queryable (claim rate read cannot be blocked on missing data)
- AC-03: Dry-run against staging/preview: full invite → claim → approve path with the real CH client in test mode, deliverability read produced

## Dependency Graph

```
CS-WORK-139 (CH Client, 5 AC) ──┐
CS-WORK-140 (Invitations, 6 AC) ├──▶ CS-WORK-141 (Enablement, 3 AC) ──▶ [Gate Record entry → tranche 1]
```
