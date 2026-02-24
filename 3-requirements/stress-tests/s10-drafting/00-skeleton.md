# S10 Skeleton — Hardening

**Status:** Phase 1 output (skeleton)
**Generated:** 2026-02-15
**Target:** `slices/slice-10-hardening/` (multi-file format)

---

## Document Structure

### Header Block

```markdown
# Slice 10: Hardening

**Status:** Draft v1
**Primary Owner:** All (PP orchestrates closure, Ops orchestrates erasure, D&L owns processErasure)
**Last updated:** 2026-02-15
**Dependencies:** S0 (event bus, deferred action scheduler, decision logging, orchestrated flow engine, email transport), S1 (Listing, Account, engagement counters, quality scores, verification tiers, claim_disputes schema), S2 (onboarding schema), S3 (claim approval event, claim_disputes table, claim_evaluation decision logs), S4 (subscription schema, Paddle subscription fields, pending_cancellation registry, PaymentService.cancelSubscription), S5 (account settings schema, provider dashboard surfaces), S6 (buyer experience schema, shortlists, saved searches, buyer enquiry records), S7 (orchestrated flow admin UI, compliance hold queries, support ticket queries, flow recovery actions, churn risk registry), S8 (commercial state schema, churn analysis log, conversion triggers, revenue perception), S9 (enrichment schedules, decay signals, perception aggregates, quality scoring, ceremony runs)
**Inputs:** `interfaces/shared-infrastructure.md` (v9), `interfaces/data-and-listings.md` (v6), `interfaces/operations.md` (v4), `interfaces/platform-and-product.md` (v7), `interfaces/commercial-and-revenue.md` (v3), `2-concept-design/data-and-listings.md` (v6), `2-concept-design/cross-domain-dependencies.md` (v3), `slices/slice-00-infrastructure.md` (v2), `slices/slice-01-data-model.md` (v2), `slices/slice-03-claim-verify.md` (v2), `slices/slice-04-subscriptions.md` (v2), `slices/slice-05-provider-experience.md` (v2), `slices/slice-06-buyer-experience/index.md` (v2), `slices/slice-07-operations/index.md` (v2), `slices/slice-08-commercial/index.md` (v2), `slices/slice-09-entity-intelligence/index.md` (v2), `0-strategic-frame/entity-architecture-frame.md` (v2)
**Downstream:** None (final slice)
```

### Summary Placeholder

```markdown
## Summary

S10 completes the requirements phase by wiring the GDPR erasure and account closure orchestrated flows, implementing the processErasure data operation, delivering end-to-end validation and failure injection tests, and implementing autonomy graduation for sub-entity intelligence capabilities. Erasure flow (6 steps) connects DSAR fulfilment via D&L's processErasure transaction. Closure flow (6 steps) connects Paddle cancellation, buyer data anonymisation, and compliance hold deferral. R12 validation suite covers per-step failure injection, retry verification, auto-escalation, skip constraint enforcement, and concurrent flow interaction. Autonomy graduation resolves S9-1 (enrichment cadence auto-adjustment), S9-2 (ceremony auto-apply), and S9-3 (algorithm versioning and controlled rollout). {N} acceptance criteria across 8 functional areas. 7 upstream flags resolved. SQ-3 resolved.
```

### V1 Scope Boundary Placeholder

```markdown
## V1 Scope Boundary

**In scope:** GDPR erasure flow wiring (6 steps), processErasure implementation (D&L transaction + R2 cleanup), account closure flow wiring (6 steps), closure steps 3/4 (buyer enquiry anonymisation, buyer data deletion with compliance hold check), concurrent flow interaction (erasure + closure coexistence, compliance hold lifecycle), end-to-end validation and failure injection tests (per-step retry, auto-escalation, skip constraint enforcement, context persistence), autonomy graduation criteria definition (S9-1/S9-2/S9-3), controlled rollout infrastructure (algorithm A/B testing, percentage-based traffic split, rollback capability), SQ-3 resolution (Paddle cancellation retry policy).

**Deferred:** Full autonomy (graduation criteria measurement post-launch), external analytics integration (S9 resolved as internal), ML-based prediction (rule-based heuristics only at V1), public API for external consumers (D&L-Q2 remains open).
```

---

## File Manifest

```markdown
## File Manifest

| # | File | Sections Covered |
|---|------|-----------------|
| 00 | `00-schema.md` | No new schema — cumulative snapshot only. +1 decision type: `graduation_evaluation` → SI §9.2 |
| 00 | `00-router-plan.md` | No new routes — flow wiring uses existing `admin.flows.*` from S7. Admin.graduation.* route group for graduation status queries. |
| 01 | `01-erasure-flow.md` | §1 GDPR Erasure Flow Wiring |
| 02 | `02-process-erasure.md` | §2 processErasure Implementation |
| 03 | `03-closure-flow.md` | §3 Account Closure Flow Wiring |
| 04 | `04-closure-data-ops.md` | §4 Closure Data Operations |
| 05 | `05-concurrent-flows.md` | §5 Concurrent Flow Interaction |
| 06 | `06-validation-testing.md` | §6 End-to-End Validation & Failure Injection |
| 07 | `07-autonomy-graduation.md` | §7 Autonomy Graduation |
| 08 | `08-algorithm-versioning.md` | §8 Algorithm Versioning & Controlled Rollout |
```

---

## Content Sections (§1–§8)

### §1 GDPR Erasure Flow Wiring

**Content file:** `01-erasure-flow.md`

**Scope:** Connects the 6-step GDPR erasure flow to the generic orchestrator. Operations domain orchestrates. Flow definition per SI §13.1. Steps: (1) resolve active disputes, (2) withdraw competing claims, (3) archive provider listings, (4) processErasure (D&L transaction — see §2), (5) close DSAR case, (6) create compliance audit record + emit `erasure_completed`. Steps 1-3 and 5-6 call existing handlers from S7/S9. Step 4 is the novel implementation. Handles context serialisation, per-step retry, auto-escalation on failure, skip constraint enforcement (processErasure is NOT skippable — SI §3.5).

**Key outputs:**
- `ERASURE_FLOW_STEPS: OrchestratedFlowStep[]` type definition
- `executeOrchestratedFlow("erasure", ...)` wiring
- `erasure_completed` event emission (D&L §1.9)
- Admin flow UI integration (S7 surfaces)

**Upstream dependencies:** SI §3.3 (orchestrator engine), SI §13.1 (erasure step specification), Ops §5 (DSAR case schema), S7 §6 (flow admin UI), S9 §2 (enrichment suspension), S3 schema (claim_disputes).

**Downstream:** §5 (concurrent flow interaction), §6 (validation testing).

---

### §2 processErasure Implementation

**Content file:** `02-process-erasure.md`

**Scope:** Implements the full `processErasure` function per D&L concept design §6. Single PostgreSQL transaction covering: dispute resolution (auto-resolve competing claims in favour of competitor), freelancer listing full deletion (cascade across 12+ tables), company listing anonymisation (accountId=null, claimStatus=unclaimed, verification tier reverted, contact data removed), account personal data deletion (account_profiles anonymisation, auth sessions/tokens deleted, shortlists/saved searches/enquiries deleted, email preferences deleted). R2 cleanup runs post-transaction (freelancer images deleteByPrefix, claim evidence cleanup). Transaction boundary explicitly scoped. Cascade delete correctness across all related tables. Quality score recalculation scheduled for anonymised company listings (verification dimension -10).

**Key outputs:**
- `processErasure(accountId: UUID, context: ErasureContext): ProcessErasureResult` function
- Transaction block pseudocode (single PG transaction)
- R2 cleanup operations (external service, post-commit)
- Cascade delete path verification (12+ tables for freelancer)
- `quality_score_recalculation` scheduling for anonymised company listings

**Upstream dependencies:** D&L CD §6 (processErasure specification), S1 schema (Listing, Account, related tables), S3 schema (claim_disputes), S9 schema (enrichment_schedules, decay_signals, perception_aggregates), SI §2 (deferred action scheduler), D&L §4 (quality scoring).

**Downstream:** §1 (called by erasure flow step 4), §6 (validation testing).

---

### §3 Account Closure Flow Wiring

**Content file:** `03-closure-flow.md`

**Scope:** Connects the 6-step account closure flow to the generic orchestrator. Platform domain orchestrates. Flow definition per SI §13.2. Steps: (1) mark account as closing, (2) cancel Paddle subscriptions (iterates pending_cancellation registry, calls PaymentService.cancelSubscription, handles API failures — resolves R2 and SQ-3), (3) anonymise buyer enquiry data in provider inboxes, (4) delete/defer buyer data (compliance hold check — defers if hold active, schedules compliance_hold_recheck), (5) archive provider listings, (6) mark account as closed + emit `account_closed`. Steps 3/4/6 are novel. Steps 1/2/5 call existing handlers from S4/S5. Handles Paddle API failure retry policy (SQ-3 resolution: orchestrator step handles retry, not separate deferred action). Skip constraints: step 2 is skippable (Paddle webhook may independently cancel), steps 3/4/6 are NOT skippable.

**Key outputs:**
- `CLOSURE_FLOW_STEPS: OrchestratedFlowStep[]` type definition
- `executeOrchestratedFlow("closure", ...)` wiring
- `account_closed` event emission (PP §2.3 / D&L §2)
- Paddle cancellation retry logic (R2/SQ-3 resolution)
- Compliance hold deferral logic (step 4)

**Upstream dependencies:** SI §3.3 (orchestrator engine), SI §13.2 (closure step specification), PP §5 (closure flow specification), S4 schema (subscriptions, pending_cancellation, PaymentService), S7 §6 (flow admin UI), Ops §3.2 (compliance hold query).

**Downstream:** §5 (concurrent flow interaction), §6 (validation testing).

---

### §4 Closure Data Operations

**Content file:** `04-closure-data-ops.md`

**Scope:** Implements closure steps 3 and 4. Step 3: anonymise buyer enquiry data in provider inboxes — replace enquiry records' sender account references with anonymised placeholder, preserve message content for providers, delete buyer-side enquiry records. Step 4: delete/defer buyer data with compliance hold check — queries Ops `hasComplianceHold(accountId)`. If hold active: defer buyer data deletion via `compliance_hold_recheck` deferred action (schedules next check for 7 days). If no hold: delete shortlists, shortlist_items, saved_searches, buyer-side enquiry records, email preferences. Account row marked `lifecycleStatus = "closed"`. Emits `account_closed` event on step 6 completion.

**Key outputs:**
- `anonymiseBuyerEnquiryData(accountId: UUID): AnonymisationResult` function
- `deleteBuyerData(accountId: UUID, context: ClosureContext): DeletionResult` function
- `hasComplianceHold` query integration (Ops §3.2)
- `compliance_hold_recheck` deferred action scheduling
- Transaction boundaries (each step individually transactional)

**Upstream dependencies:** S6 schema (shortlists, shortlist_items, saved_searches, enquiry_records), S1 schema (Account), Ops §3.2 (hasComplianceHold), SI §2 (deferred action scheduler).

**Downstream:** §3 (called by closure flow steps 3/4), §5 (concurrent flow interaction), §6 (validation testing).

---

### §5 Concurrent Flow Interaction

**Content file:** `05-concurrent-flows.md`

**Scope:** Validates that erasure and closure flows can coexist for the same account. Scenario: DSAR received (erasure initiated) while account closure is in progress. Compliance hold blocks closure step 4 (buyer data deletion). Erasure completes → compliance hold clears → `compliance_hold_recheck` deferred action detects cleared hold → closure resumes from step 4. Also handles: closure initiated while erasure in progress (rare, requires admin coordination). Both flows use `orchestrated_flows` table to track progress independently. Context serialisation ensures resumption from correct step. Validates skip constraint matrix interaction (erasure processErasure NOT skippable, closure Paddle cancellation skippable).

**Key outputs:**
- Concurrent flow state diagram (Mermaid)
- Compliance hold lifecycle interaction specification
- `compliance_hold_recheck` handler logic (detects hold clear, resumes flow)
- Context persistence validation (flow resumption after hold clears)
- Admin UI guidance for concurrent flow scenarios

**Upstream dependencies:** SI §3 (orchestrated flow engine), Ops §3.2 (hasComplianceHold), SI §2 (compliance_hold_recheck deferred action), S7 §6 (flow admin UI).

**Downstream:** §6 (validation testing includes concurrent flow scenarios).

---

### §6 End-to-End Validation & Failure Injection

**Content file:** `06-validation-testing.md`

**Scope:** Implements R12 validation suite covering both flows. Tests: (1) per-step failure injection for all 12 steps (6 erasure + 6 closure), (2) retry verification (attempt counter increments, state preserved across retries), (3) auto-escalation trigger verification (failures exceeding threshold trigger escalation_check deferred action), (4) skip constraint enforcement (server-side rejection for non-skippable steps — processErasure, closure steps 3/4/6), (5) context persistence across retries (TContext JSON serialisation + restoration), (6) concurrent flow interaction (erasure blocks closure via compliance hold, hold clears, closure resumes). Integration test suite structure. Failure injection via mock adapters (Paddle API failure, R2 cleanup failure, DB transaction rollback). Acceptance criteria map directly to R12 requirements.

**Key outputs:**
- Integration test suite structure (file tree)
- Failure injection mock adapters (Paddle, R2, DB)
- Per-step retry verification test cases (12 tests)
- Skip constraint enforcement tests (4 non-skippable steps)
- Concurrent flow interaction test suite
- Context serialisation round-trip tests

**Upstream dependencies:** SI §3 (orchestrated flow engine, skip constraint matrix), S7 §6 (flow admin UI surfaces), SQ-2 (orchestrated flow recovery model), §1-§4 (flow step implementations).

**Downstream:** None (validation tests are terminal outputs).

---

### §7 Autonomy Graduation

**Content file:** `07-autonomy-graduation.md`

**Scope:** Resolves S9-1 (enrichment cadence auto-adjustment) and S9-2 (ceremony auto-apply). Defines graduation criteria per entity-architecture-frame §Design Principle 5. S9-1: enrichment cadence adjustments auto-apply when false positive rate <2% over 6 months AND enrichment ROI positive. S9-2: ceremony recommendations auto-apply when precedented (frequency ≥50), non-financial, non-user-visible. Taxonomy promotions with clean mapping are the safest V1 candidate. Implements graduated decision-making: decisions meeting criteria bypass principal review and auto-execute. Decisions not meeting criteria continue escalating. Logs `graduation_evaluation` decision type (SI §9.2) monthly. Implements governance bounds: auto-apply ceiling (max N changes per month), rollback mechanism (revert to escalation mode on quality regression).

**Key outputs:**
- `evaluateGraduationCriteria(subEntity, capability): GraduationDecision` function
- S9-1 enrichment cadence graduation criteria (false positive rate, ROI thresholds)
- S9-2 ceremony auto-apply graduation criteria (precedent matching, constraint matrix)
- `graduation_evaluation` decision type specification
- Governance bounds (auto-apply ceiling, rollback triggers)
- Graduated decision dispatch logic (auto-execute vs escalate)

**Upstream dependencies:** S9 §4 (ceremony automation), S9 §2 (enrichment cadence adjustment), entity-architecture-frame §Design Principle 5 (autonomy graduation), SI §9.2 (decision logging), S9 §5 (learning hypotheses).

**Downstream:** §8 (algorithm versioning extends graduation pattern).

---

### §8 Algorithm Versioning & Controlled Rollout

**Content file:** `08-algorithm-versioning.md`

**Scope:** Resolves S9-3 (quality score algorithm versioning). Implements A/B testing infrastructure for scoring algorithm updates. Uses `quality_scores.algorithmVersion` column to track which algorithm scored each listing. Percentage-based traffic split: V2 algorithm applied to X% of listings, V1 to (100-X)%. Comparative scoring: both algorithms run for the same listing, results logged for analysis. Rollback capability: revert all listings to V1 if V2 produces quality regression (band declassification rate >10%). Controlled rollout sequence: 10% → 25% → 50% → 100% over 4 weeks. Logs `graduation_evaluation` decision with `subEntity: "quality_scoring"`. Extends autonomy graduation pattern from §7 to algorithm updates.

**Key outputs:**
- `selectAlgorithmVersion(listingId: UUID, rolloutPercentage: number): AlgorithmVersion` function
- Percentage-based traffic split logic (deterministic hash on listingId)
- Comparative scoring pipeline (run both V1 and V2, log diff)
- Rollback trigger detection (quality regression threshold)
- Controlled rollout sequence specification (10% → 25% → 50% → 100%)
- `graduation_evaluation` decision logging for algorithm rollouts

**Upstream dependencies:** S9 §1 (`quality_scores.algorithmVersion` column, quality scoring), S1 schema (quality_scores table), SI §9.2 (decision logging), entity-architecture-frame §Design Principle 5 (autonomy graduation).

**Downstream:** None (algorithm versioning is terminal capability).

---

## Tail Sections (§9–§19)

### §9 Event Consumers Registered in S10

**Content file:** `index.md` (tail sections)

```markdown
## §9 Event Consumers Registered in S10

S10 introduces **0 new event consumer registrations**. All consumers for `erasure_completed` and `account_closed` are already registered in prior slices (S6, S7, S8, S9).

**Existing consumers wired in S10:**

| Event | Consumer Domain | Mode | Handler | Registered In |
|-------|----------------|------|---------|--------------|
| `erasure_completed` | PP | async | Purge from search, ISR revalidation, remove from shortlists, notify shortlist owners, anonymise outbound enquiries | S6 |
| `erasure_completed` | CR | async | Cancel win-back schedules, anonymise churn log entries, clear conversion trigger state | S8 |
| `erasure_completed` | Ops | orchestrated | Close DSAR case + compliance audit record (called directly by erasure flow step 5, not via event bus) | S7 |
| `account_closed` | D&L | async | Cancel enrichment schedules for archived listings | S9 |
| `account_closed` | Ops | async | Close active support tickets for closed account | S7 |
| `account_closed` | CR | async | Record closure in churn analysis, clear conversion state | S8 |

**EVENT_CONSUMER_MATRIX delta:** +0 new consumer entries.
```

---

### §10 Deferred Actions Registered in S10

**Content file:** `index.md` (tail sections)

```markdown
## §10 Deferred Actions Registered in S10

S10 introduces **0 new deferred actions**. All deferred actions referenced by S10 flows are already registered in SI §2.1/§2.2:

| Action | Params Type | Owner | Schedule | Registered In | New? |
|--------|-------------|-------|----------|--------------|------|
| `auto_escalation_check` | `{ flowId: UUID }` | SI | On retry threshold exceeded (3 failures) | S0 | No |
| `compliance_hold_recheck` | `{ accountId: UUID }` | Ops | 7 days after closure step 4 deferred | S0 | No |
| `quality_score_recalculation` | `{ listingId: UUID }` | D&L | Event-driven (erasure anonymises company listings) | S9 | No |

**Total DeferredActionParamsMap entries after S10:** 34 (unchanged from S9).
```

---

### §11 Email Templates Registered in S10

**Content file:** `index.md` (tail sections)

```markdown
## §11 Email Templates Registered in S10

S10 introduces **0 new email templates**. All templates referenced by S10 flows are already registered:

| Template ID | Category | Trigger | Registered In | New? |
|-------------|----------|---------|--------------|------|
| `dsar_acknowledgment` | `transactional` | DSAR receipt (Ops domain) | Ops §5.2 (S7) | No |
| `dsar_completion` | `transactional` | Erasure completion (Ops domain) | Ops §5.2 (S7) | No |

**Current count remains 30 templates (SI §5.2).**
```

---

### §12 Notification Types Used in S10

**Content file:** `index.md` (tail sections)

```markdown
## §12 Notification Types Used in S10

S10 introduces **0 new notification types**. Existing types cover all S10 scenarios:

| Type | Trigger | Registered In | New? |
|------|---------|--------------|------|
| `account_closure_initiated` | Account closure flow starts | SI §8.1 (S0) | No |
| `compliance_deadline` | Flow escalation (S7 §6.3) | SI §8.1 (S0) | No |

**Current count remains 19 notification types.**
```

---

### §13 Schema Additions

**Content file:** `00-schema.md`

```markdown
## §13 Schema Additions

S10 introduces **0 new tables** and **0 schema amendments** except decision type registration.

**Decision type addition:**

| Decision Type | Domain | Trigger | New? |
|---------------|--------|---------|------|
| `graduation_evaluation` | Cross-domain | Periodic evaluation of sub-entity graduation criteria (enrichment cadence, ceremony auto-apply, algorithm rollout) | Yes |

**Cumulative schema after S10:** 45 tables (unchanged from S9). 36 pgEnums (unchanged). 34 deferred actions (unchanged). 30 email templates (unchanged). 19 notification types (unchanged). 27 decision types (26 from S9 + `graduation_evaluation`).

**Tables referenced (no new columns):** `orchestrated_flows` (S0/S7), `quality_scores` (S1/S9 — `algorithmVersion` column already exists), `listings` (S1), `account_profiles` (S1), `subscriptions` (S4), `pending_cancellation` (S4), `shortlists` (S6), `shortlist_items` (S6), `saved_searches` (S6), `enquiry_records` (S6), `claim_disputes` (S3), `enrichment_schedules` (S9), `decay_signals` (S9), `perception_aggregates` (S9), `ceremony_runs` (S9), `learning_hypotheses` (S9).

**Cumulative snapshot:** Full schema written to `00-schema.md` including all S0-S9 tables + pgEnums + amendments.
```

---

### §14 Upstream Flag Resolutions

**Content file:** `index.md` (tail sections)

```markdown
## §14 Upstream Flag Resolutions

S10 resolves 7 upstream flags.

| Flag | Source | Section | Resolution |
|------|--------|---------|-----------|
| S9-1 | S9 §13 | §7 | Enrichment cadence auto-adjustment: graduated auto-apply when false positive rate <2% over 6 months AND enrichment ROI positive. |
| S9-2 | S9 §13 | §7 | Ceremony auto-apply graduation: graduated auto-apply for precedented (frequency ≥50), non-financial, non-user-visible recommendations. Taxonomy promotions with clean mapping are safest V1 candidate. |
| S9-3 | S9 §13 | §8 | Quality score algorithm versioning: A/B testing infrastructure with percentage-based traffic split, comparative scoring, rollback capability. |
| R2 | ST-9, SQ-2 | §3 | Paddle cancellation during closure: orchestrator step 2 iterates pending_cancellation registry, calls PaymentService.cancelSubscription. Retry handled by orchestrator (not separate deferred action). Step is skippable. |
| R12 | SQ-2 | §6 | End-to-end failure injection tests: per-step failure, retry verification, auto-escalation trigger, skip constraint enforcement, context persistence, concurrent flow interaction. |
| S0-11 | S0 §15 | §1, §3 | Generic orchestrator implementation gap: S10 wires erasure (SI §13.1) and closure (SI §13.2) step definitions into executeOrchestratedFlow. |
| SQ-3 | REQUIREMENTS-TRACKER | §3 | Deferred action retry policy for Paddle cancellations: orchestrator step handles retry (not deferred action). `retry_3` with exponential backoff on PaymentService.cancelSubscription failure. Step is skippable (Paddle webhook may independently cancel). |
```

---

### §15 Downstream Flags

**Content file:** `index.md` (tail sections)

```markdown
## §15 Downstream Flags

S10 produces **0 downstream flags**. It is the final slice in the requirements sequence. All remaining work moves to phase 4 (Work Management).

**Post-requirements work (outside slice scope):**
- Phase 4: Work Management — implementation sequencing, acceptance test authoring, deployment planning
- D&L-Q2 (public API for external consumers) remains open — deferred to post-launch operational decision
```

---

### §16 Open Question Resolutions

**Content file:** `index.md` (tail sections)

```markdown
## §16 Open Question Resolutions

S10 resolves 1 open question.

| # | Question | Resolution |
|---|----------|-----------|
| SQ-3 | Deferred action retry policy for Paddle cancellations during account closure | Orchestrator step (not a deferred action) calls `PaymentService.cancelSubscription` per subscription. If API call fails, orchestrator step fails, admin retries via S7 flow admin UI. Step is skippable (SI §3.5). No separate deferred action for Paddle cancellation — the orchestrator step IS the retry mechanism. Paddle may webhook independently regardless of API call outcome. Policy: `retry_3` with exponential backoff (1s, 2s, 4s). |

**Remaining open questions:** D&L-Q2 (public API for external consumers — V2 consideration, deferred to post-launch).
```

---

### §17 Acceptance Criteria

**Content file:** `index.md` (tail sections)

```markdown
## §17 Acceptance Criteria

**Placeholder.** Populated by Phase 2.5 extraction agent.

**Estimated total: 60-70 acceptance criteria** across 8 functional areas (§1-§8).

### Grouping structure (to be populated):

- §1 GDPR Erasure Flow Wiring (~10 AC)
- §2 processErasure Implementation (~12 AC)
- §3 Account Closure Flow Wiring (~8 AC)
- §4 Closure Data Operations (~10 AC)
- §5 Concurrent Flow Interaction (~6 AC)
- §6 End-to-End Validation & Failure Injection (~10 AC)
- §7 Autonomy Graduation (~6 AC)
- §8 Algorithm Versioning & Controlled Rollout (~6 AC)
```

---

### §18 Stress Test Resolution Log

**Content file:** `index.md` (tail sections)

```markdown
## §18 Stress Test Resolution Log (v2)

**Empty in v1.** Populated by stress test + fix-applier skill.
```

---

### §19 Cross-References

**Content file:** `index.md` (tail sections)

```markdown
## Cross-References

| Document | Relationship |
|----------|-------------|
| `shared-infrastructure.md` (v9) | §1 event bus + P1-P5 principles, §2 deferred actions (0 new, references existing 34), §3 orchestrated flow engine (erasure + closure wiring), §4.1 `AuthSession` type, §5 email transport (0 new templates), §8 notification types (0 new), §9 decision logging (+1 new: `graduation_evaluation` → 27 total), §13.1 erasure flow specification, §13.2 closure flow specification |
| `data-and-listings.md` (v6 interface) | §1.9 `erasure_completed` event, §2 `account_closed` event, §4 quality scoring contract, processErasure specification (D&L CD §6) |
| `operations.md` (v4 interface) | §3.2 `hasComplianceHold` query, §5 DSAR case schema, compliance audit record creation |
| `platform-and-product.md` (v7 interface) | §2.3 `account_closed` event, §5 closure flow specification |
| `commercial-and-revenue.md` (v3 interface) | `erasure_completed` consumer (win-back cancellation), `account_closed` consumer (churn analysis) |
| `data-and-listings.md` (v6 concept design) | §6 processErasure full specification (lines 1201-1254) |
| `cross-domain-dependencies.md` (v3) | Event contracts, query interface contracts, orchestrated flow specifications |
| `entity-architecture-frame.md` (v2) | §Design Principle 5 (autonomy graduation criteria — false positive rate, ROI thresholds, governance bounds) |
| `slices/slice-00-infrastructure.md` (v2) | Event bus, deferred action scheduler, orchestrated flow engine, decision logging framework |
| `slices/slice-01-data-model.md` (v2) | Listing schema, Account schema, quality_scores table, verification tiers |
| `slices/slice-03-claim-verify.md` (v2) | claim_disputes schema, claim_evaluation decision logs, claim approval event |
| `slices/slice-04-subscriptions.md` (v2) | Subscription schema, pending_cancellation registry, PaymentService.cancelSubscription, R2 resolution |
| `slices/slice-05-provider-experience.md` (v2) | Account settings schema, provider dashboard surfaces |
| `slices/slice-06-buyer-experience/index.md` (v2) | Shortlists schema, saved searches schema, enquiry records schema, buyer surfaces |
| `slices/slice-07-operations/index.md` (v2) | Orchestrated flow admin UI, compliance hold queries, support ticket queries, flow recovery actions, DSAR case schema |
| `slices/slice-08-commercial/index.md` (v2) | Commercial state schema, churn analysis log, `erasure_completed` / `account_closed` consumers |
| `slices/slice-09-entity-intelligence/index.md` (v2) | Enrichment schedules schema, decay signals schema, perception aggregates schema, ceremony runs schema, quality scoring implementation, `algorithmVersion` column, `account_closed` enrichment suspension consumer |
```

---

## Summary

Skeleton establishes 8 content sections (§1-§8) + 11 tail sections (§9-§19) + header + summary + scope + file manifest. Multi-file format targeting `slices/slice-10-hardening/`. Ready for Phase 2 (Foundations: schema, router plan, decisions) and Phase 3 (Content agents: 4 agents per partition hint in checklist §11).

**Section partition mapping (for Phase 3):**
- Agent A: §1 (erasure flow), §2 (processErasure)
- Agent B: §3 (closure flow), §4 (closure data ops)
- Agent C: §5 (concurrent flows), §6 (validation/testing)
- Agent D: §7 (autonomy graduation), §8 (algorithm versioning)

**Key structural choices:**
- 0 new schema except `graduation_evaluation` decision type
- 0 new deferred actions / event consumers / email templates / notification types
- All flow wiring reuses existing S7 orchestrator surfaces
- processErasure is the largest novel implementation (§2)
- R12 validation suite is integration-test heavy (§6)
- Autonomy graduation is conceptually distinct from flow wiring (§7-§8 separate from §1-§6)

Next: Phase 2 agents (schema, router plan, decisions).
