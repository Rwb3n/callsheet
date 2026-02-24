# S10 Pre-Draft Checklist — Hardening

**Generated:** 2026-02-15
**Slice:** `slices/slice-10-hardening/` (multi-file, S6+ format)
**Primary domain:** All (PP orchestrates closure, Ops orchestrates erasure, D&L owns processErasure, All consume completion events)
**Upstream specs:** `shared-infrastructure.md` (v9), `data-and-listings.md` (v6), `operations.md` (v4), `platform-and-product.md` (v7), `commercial-and-revenue.md` (v3)

---

## 1. Deferred Actions to Register

S10 introduces **0 new deferred actions**. All deferred actions referenced by S10 flows are already registered in SI §2.1/§2.2:

- `auto_escalation_check` — already registered (S0). Used by both erasure and closure flows.
- `compliance_hold_recheck` — already registered (S0). Used by closure step 4 (defer buyer data deletion when hold active).

No new `DeferredActionParamsMap` entries required. **Current total remains 34.**

---

## 2. Email Templates to Register

S10 introduces **0 new email templates**. All templates referenced by S10 flows are already registered:

- `dsar_acknowledgment` — Ops §5.2 (existing). Sent on DSAR receipt.
- `dsar_completion` — Ops §5.2 (existing). Sent on erasure completion.

**Current count remains 30 templates (SI §5.2).**

---

## 3. Event Emissions

S10 wires two event emissions that are already defined in interface specs but not yet connected to the generic orchestrator:

| Event | Emitted By | Key Payload Fields | P1 Check |
|-------|-----------|-------------------|----------|
| `erasure_completed` | D&L (within orchestrated flow step 6) | `accountHash: string`, `senderAccountId: UUID`, `listingIdsAnonymised: UUID[]`, `listingIdsDeleted: UUID[]`, `freelancerListingsDeleted: number`, `timestamp: ISO8601` | All present in D&L §1.9 ✅ |
| `account_closed` | PP (within orchestrated flow step 6) | `accountId: UUID`, `listingsArchived: UUID[]` | All present in PP §2.3 / D&L §2 ✅ |

Both payloads are already fully typed. No new `EventPayloadMap` entries.

---

## 4. Event Consumers

S10 wires **0 new event consumers**. All consumers for `erasure_completed` and `account_closed` are already registered in prior slices:

**`erasure_completed` consumers (already registered):**

| Consumer Domain | Mode | Handler | Registered In |
|----------------|------|---------|--------------|
| PP | async | Purge from search, ISR revalidation, remove from shortlists, notify shortlist owners, anonymise outbound enquiries | S6 (buyer experience) |
| CR | async | Cancel win-back schedules, anonymise churn log entries, clear conversion trigger state | S8 (commercial) |
| Ops | orchestrated (not bus) | Close DSAR case + create compliance audit record — called directly by orchestrator, not via event bus | S7 (operations) |

**`account_closed` consumers (already registered):**

| Consumer Domain | Mode | Handler | Registered In |
|----------------|------|---------|--------------|
| D&L (intelligence) | async | Cancel enrichment schedules for archived listings | S9 §6 |
| Ops | async | Close active support tickets for closed account | S7 §9 |
| CR | async | Record closure in churn analysis, clear conversion state | S8 §6 |

**No new EVENT_CONSUMER_MATRIX entries.** Delta: +0.

---

## 5. Schema Amendments

S10 introduces **0 new tables** and **0 schema amendments**. The `orchestrated_flows` table, `OrchestratedFlowProgress` type, and `updatedAt` column are already defined:

- `orchestrated_flows` table: S0 §4 (schema), S7 §6 (`updatedAt` amendment)
- All step definitions use the existing `OrchestratedFlowStep` type from SI §3.2

**Cumulative schema after S10:** 45 tables (unchanged from S9). 36 pgEnums (unchanged). 34 deferred actions (unchanged). 30 email templates (unchanged). 19 notification types (unchanged). 26 decision types (unchanged, unless S10 adds graduation-related types — see §7).

---

## 6. Upstream Flags to Resolve

### Direct S10 Targets (3 from S9)

| Flag | Source | Description | Resolution Needed |
|------|--------|-------------|-------------------|
| S9-1 | S9 §13 | Enrichment cadence auto-adjustment: `enrichment_cadence_adjustment` decisions logged but require principal review at V1 | S10 must implement graduated auto-apply with governance bounds. Define graduation criteria (false positive rate <2% over 6 months, enrichment ROI positive — from entity-architecture-frame §Design Principle 5). Implement auto-apply for decisions that meet criteria; continue escalating others. |
| S9-2 | S9 §13 | Ceremony auto-apply graduation: `ceremony_outcome_evaluation` with `disposition: "auto_apply"` are not auto-applied at V1 | S10 must implement graduated auto-apply for precedented, non-financial, non-user-visible recommendations. Define precedent matching logic. Taxonomy promotions with frequency ≥50 and clean mapping are the safest candidate for V1 auto-apply. |
| S9-3 | S9 §13 | Quality score algorithm versioning: `algorithmVersion` field enables A/B testing | S10 must implement controlled rollout: percentage-based traffic split, comparative scoring, rollback capability. Use `algorithmVersion` column to track which algorithm scored each listing. |

### Requirements (R-series) Targeting S10

| Flag | Source | Description | Resolution Needed |
|------|--------|-------------|-------------------|
| R2 | ST-9, SQ-2 | Paddle cancellation during closure: deferred actions + pending_cancellation local state | Wire closure step 2 into the generic orchestrator. S4 v2 has the pending_cancellation registry and `inferCancellationReason`. S10 must implement the orchestrator step that iterates subscriptions, creates pending_cancellation records, calls `PaymentService.cancelSubscription`, and handles API failures. PP §5 step 2 is the authoritative specification. |
| R12 | SQ-2 | End-to-end failure injection tests for orchestrated flows | Implement: (1) per-step failure injection for both flows, (2) retry verification (attempt counter, state preservation), (3) auto-escalation trigger verification, (4) skip constraint enforcement (server-side rejection for non-skippable steps), (5) context persistence across retries, (6) concurrent erasure+closure interaction. |

### Indirect S10 Targets (from S0–S8)

| Flag | Source | Description | Resolution Needed |
|------|--------|-------------|-------------------|
| S0-11 | S0 §15 | Generic orchestrator implementation gap: S0 defines types/contracts, implementation pending | S10 wires the erasure and closure step definitions into `executeOrchestratedFlow` (SI §3.3). Erasure step list per SI §13.1 (6 steps). Closure step list per SI §13.2 (6 steps). |
| SQ-3 | REQUIREMENTS-TRACKER | Deferred action retry policy for Paddle cancellations during account closure | Resolve in S10. Checklist default: `retry_3` with exponential backoff on `PaymentService.cancelSubscription` failure. If all retries exhausted, mark step as failed (not the deferred action mechanism — the orchestrator step itself handles retry). Paddle webhook may arrive independently regardless of API call outcome. |

---

## 7. Open Questions to Resolve

| # | Question | Expected Resolution |
|---|----------|-------------------|
| SQ-3 | Deferred action retry policy for Paddle cancellations during closure | **Checklist default:** The orchestrator step (not a deferred action) calls `PaymentService.cancelSubscription` per subscription. If the API call fails, the orchestrator step fails, admin retries via S7 flow admin UI. The step is skippable (SI §3.5). No separate deferred action for Paddle cancellation — the orchestrator step IS the retry mechanism. Paddle may webhook independently. |
| D&L-Q2 | Public API for external consumers (V2?) | **Not in S10 scope.** Defer to post-launch. S10 is hardening, not new API surface. Note in slice that this remains open. |

---

## 8. Notification Types

S10 introduces **0 new notification types**. Existing types cover all S10 scenarios:

- `account_closure_initiated` (SI §8.1) — already registered
- `compliance_deadline` (SI §8.1) — used for flow escalations (S7 §6.3)

**Current count remains 19 notification types.**

---

## 9. Decision Types

S10 may introduce **1–2 new decision types** for autonomy graduation:

| Decision Type | Domain | Trigger | Checklist Default |
|---------------|--------|---------|-------------------|
| `graduation_evaluation` | Cross-domain | Periodic evaluation of sub-entity graduation criteria against threshold metrics | **Checklist default: Include.** S9-1/S9-2/S9-3 all require graduated decision-making. A single `graduation_evaluation` decision type covering enrichment cadence, ceremony auto-apply, and algorithm rollout is simpler than three separate types. The decision log captures: `{ subEntity, capability, currentMetrics, thresholds, graduated: boolean, reason }`. |

**If included:** SI §9.2 needs +1 decision type → 27 total. Add during drafting.

---

## 10. processErasure Implementation Inventory

S10 must implement the full `processErasure` function. The authoritative specification is D&L concept design §6 (lines 1201–1254), adapted for the interface spec contracts. Key operations:

| Operation | Tables Affected | Transaction Boundary |
|-----------|----------------|---------------------|
| Resolve active disputes (auto-resolve in favour of competing claimant) | `listings` (claimStatus), `claim_disputes` (if exists, S3 schema) | Within processErasure transaction |
| Withdraw competing claims by erasing account | `listings` (claimStatus → claimed) | Within processErasure transaction |
| Freelancer listings: full delete | `listings`, `listing_taxonomy_tags`, `credits`, `media_items`, `social_profiles`, `accreditations`, `engagements`, `quality_scores`, `quality_score_explanations` | Cascade/manual within transaction |
| Company listings: anonymise + unlink | `listings` (accountId=null, claimStatus=unclaimed, contactEmail=null, verification tier=unclaimed), `pre_claim_snapshots` (delete) | Within processErasure transaction |
| Delete account-level personal data | `account_profiles` (anonymise), `auth` tables (delete sessions/tokens), `shortlists` + `shortlist_items` (delete), `saved_searches` (delete), `enquiry_records` (delete buyer-side), `email_preferences` (delete) | Within processErasure transaction |
| R2 object cleanup | `listings/{listingId}/images/*` (freelancer: deleteByPrefix), `claims/{claimId}/evidence/*` | Separate from DB transaction (external service) |
| Quality score recalculation | `quality_scores` (recalc for anonymised company listings) | Post-transaction |

**Key constraint:** The entire DB portion is a single PostgreSQL transaction. R2 cleanup is external and runs after the DB transaction commits. If R2 cleanup fails, the step is retryable (R2 operations are idempotent via prefix-based deletion).

---

## 11. Scope Summary + Partition Hint

### S10 Functional Areas

1. **GDPR Erasure Flow Wiring** — Connect 6 steps to `executeOrchestratedFlow`. Operations orchestrates. Step 4 (`processErasure`) is the novel implementation; other steps call existing S7 handlers.
2. **Account Closure Flow Wiring** — Connect 6 steps to `executeOrchestratedFlow`. Platform orchestrates. Steps 3/4/6 are novel; steps 1/2/5 call existing S4/S5 handlers.
3. **processErasure Implementation** — D&L domain. Full listing/account anonymisation/deletion logic per concept design §6. Single DB transaction + R2 cleanup.
4. **Closure Steps 3/4** — PP domain. Anonymise buyer enquiry data in provider inboxes (step 3). Delete/defer buyer data with compliance hold check (step 4).
5. **End-to-End Validation** — Integration test suite for both flows. Per-step failure injection, retry verification, auto-escalation, skip constraint enforcement, context persistence.
6. **Autonomy Graduation** — S9-1 (enrichment cadence), S9-2 (ceremony auto-apply), S9-3 (algorithm versioning). Graduation criteria definition + controlled rollout infrastructure.
7. **Concurrent Flow Interaction** — Validate that erasure and closure can coexist for the same account (DSAR hold blocks closure buyer data deletion; hold clears after erasure; closure resumes via deferred action).

### Partition Hint (Content Agent Groupings)

S10 is smaller and more focused than S7–S9. Suggested 4 content agents:

| Agent | Sections | Context Required | Rationale |
|-------|----------|-----------------|-----------|
| **A: Erasure flow** | §1 Erasure flow wiring, §2 processErasure implementation | SI §3, SI §13.1, D&L CD §6, Ops §5, S7 §5 (compliance), S7 §6 (flow admin) | Erasure is the most complex flow. Agent needs D&L schema (S1), dispute handling (S3), enrichment suspension (S9). |
| **B: Closure flow** | §3 Closure flow wiring, §4 Closure steps 3/4 | SI §3, SI §13.2, PP §5, S4 §5 (subscriptions/pending_cancellation), S5 §8 (account settings) | Closure shares orchestrator pattern but has different steps. Agent needs PP schema, compliance hold query (Ops §3.2). |
| **C: Validation & testing** | §5 End-to-end validation, §6 Failure injection tests | SI §3 (flow engine), SQ-2 (recovery model), S7 §6 (admin actions), both flow step definitions | Test agent needs both flow definitions plus the skip constraint matrix and auto-escalation rules. |
| **D: Autonomy graduation** | §7 Graduation criteria, §8 Algorithm versioning | S9 §1/§2/§4/§5 (intelligence decision types), entity-architecture-frame §Design Principle 5 | Graduation is conceptually distinct from flow wiring. Agent needs S9 decision architecture + entity-architecture-frame graduation criteria. |

### Cumulative Counts (from S9 authoritative snapshot)

| Category | S9 Cumulative | S10 Delta | S10 Total |
|----------|--------------|-----------|-----------|
| Tables | 45 | +0 | 45 |
| pgEnums | 36 | +0 | 36 |
| Deferred actions | 34 | +0 | 34 |
| Email templates | 30 | +0 | 30 |
| Notification types | 19 | +0 | 19 |
| Decision types | 26 | +1 (graduation_evaluation) | 27 |
| EVENT_CONSUMER_MATRIX entries (cumulative) | ~66 (3 sync + ~63 async) | +0 | ~66 |

### Key Risk Areas for Stress Test

1. **processErasure transaction scope** — single PG transaction covering dispute resolution, listing deletion/anonymisation, account anonymisation. Cascade delete correctness across 10+ tables.
2. **R2 cleanup after DB commit** — external service call outside transaction. If R2 fails after DB commits, listings are anonymised but images persist. Retry must handle this partial state.
3. **Concurrent erasure + closure** — DSAR compliance hold blocks closure buyer data deletion. What happens if erasure completes mid-closure? The compliance_hold_recheck deferred action must detect the cleared hold and resume.
4. **Orchestrator context serialisation** — `TContext` is persisted with the progress record. Both flows accumulate state across steps. Verify that `JSON.stringify` + restore handles all field types (UUID arrays, timestamps).
5. **Graduation criteria measurement** — S9-1/S9-2 reference specific metrics (false positive rate, ROI). The measurement queries must be specified, not just the thresholds.
6. **processErasure dispute resolution** — auto-resolving disputes during erasure is a destructive action. If the competing claimant's claim is also disputed, the resolution chain needs termination.
7. **Freelancer listing cascade delete** — must cover all related tables: `listing_taxonomy_tags`, `credits`, `media_items`, `social_profiles`, `accreditations`, `engagements`, `quality_scores`, `quality_score_explanations`, `enrichment_schedules`, `decay_signals`, `pending_enquiries`, `pre_claim_snapshots`.
