# Slice 10: Hardening

**Status:** Draft v2 (STRESS TESTED)
**Primary Owner:** All (PP orchestrates closure, Ops orchestrates erasure, D&L owns processErasure)
**Last updated:** 2026-02-16
**Dependencies:** S0 (event bus, deferred action scheduler, decision logging, orchestrated flow engine, email transport), S1 (Listing, Account, engagement counters, quality scores, verification tiers, claim_disputes schema), S2 (onboarding schema), S3 (claim approval event, claim_disputes table, claim_evaluation decision logs), S4 (subscription schema, Paddle subscription fields, pending_cancellation registry, PaymentService.cancelSubscription), S5 (account settings schema, provider dashboard surfaces), S6 (buyer experience schema, shortlists, saved searches, buyer enquiry records), S7 (orchestrated flow admin UI, compliance hold queries, support ticket queries, flow recovery actions, churn risk registry), S8 (commercial state schema, churn analysis log, conversion triggers, revenue perception), S9 (enrichment schedules, decay signals, perception aggregates, quality scoring, ceremony runs)
**Inputs:** `interfaces/shared-infrastructure.md` (v9), `interfaces/data-and-listings.md` (v6), `interfaces/operations.md` (v4), `interfaces/platform-and-product.md` (v7), `interfaces/commercial-and-revenue.md` (v3), `2-concept-design/data-and-listings.md` (v6), `2-concept-design/cross-domain-dependencies.md` (v3), `slices/slice-00-infrastructure.md` (v2), `slices/slice-01-data-model.md` (v2), `slices/slice-03-claim-verify.md` (v2), `slices/slice-04-subscriptions.md` (v2), `slices/slice-05-provider-experience.md` (v2), `slices/slice-06-buyer-experience/index.md` (v2), `slices/slice-07-operations/index.md` (v2), `slices/slice-08-commercial/index.md` (v2), `slices/slice-09-entity-intelligence/index.md` (v2), `0-strategic-frame/entity-architecture-frame.md` (v2) [spec versions current as of S10 v2]
**Downstream:** None (final slice)

---

## Summary

S10 completes the requirements phase by wiring the GDPR erasure and account closure orchestrated flows, implementing the processErasure data operation, delivering end-to-end validation and failure injection tests, and implementing autonomy graduation for sub-entity intelligence capabilities. Erasure flow (6 steps) connects DSAR fulfilment via D&L's processErasure transaction. Closure flow (6 steps) connects Paddle cancellation, buyer data anonymisation, and compliance hold deferral. R12 validation suite covers per-step failure injection, retry verification, auto-escalation, skip constraint enforcement, and concurrent flow interaction. Autonomy graduation resolves S9-1 (enrichment cadence auto-adjustment), S9-2 (ceremony auto-apply), and S9-3 (algorithm versioning and controlled rollout). 72 acceptance criteria across 8 functional areas. 7 upstream flags resolved. SQ-3 resolved. 0 downstream flags.

## V1 Scope Boundary

**In scope:** GDPR erasure flow wiring (6 steps), processErasure implementation (D&L transaction + R2 cleanup), account closure flow wiring (6 steps), closure steps 3/4 (buyer enquiry anonymisation, buyer data deletion with compliance hold check), concurrent flow interaction (erasure + closure coexistence, compliance hold lifecycle), end-to-end validation and failure injection tests (per-step retry, auto-escalation, skip constraint enforcement, context persistence), autonomy graduation criteria definition (S9-1/S9-2/S9-3), controlled rollout infrastructure (algorithm A/B testing, percentage-based traffic split, rollback capability), SQ-3 resolution (Paddle cancellation retry policy).

**Deferred:** Full autonomy (graduation criteria measurement post-launch), external analytics integration (S9 resolved as internal), ML-based prediction (rule-based heuristics only at V1), public API for external consumers (D&L-Q2 remains open).

---

## File Manifest

| # | File | Sections Covered |
|---|------|-----------------|
| 00 | `00-schema.md` | Schema delta (0 new tables), decision type registration (+1 graduation_evaluation) |
| 00 | `00-router-plan.md` | Route surface (5 existing admin.flows.*, 5 new admin.graduation.*) |
| 01 | `01-erasure-flow.md` | §1 GDPR Erasure Flow Wiring, §2 processErasure Implementation |
| 03 | `03-closure-flow.md` | §3 Account Closure Flow Wiring, §4 Closure Data Operations |
| 05 | `05-concurrent-flows.md` | §5 Concurrent Flow Interaction, §6 End-to-End Validation & Failure Injection |
| 07 | `07-autonomy-graduation.md` | §7 Autonomy Graduation, §8 Algorithm Versioning & Controlled Rollout |

---

## §9 Event Consumers Registered in S10

S10 introduces **0 new event consumer registrations**. All consumers for `erasure_completed` and `account_closed` are already registered in prior slices (S6, S7, S8, S9).

**Existing consumers wired in S10:**

| Event | Consumer Domain | Mode | Handler | Registered In |
|-------|----------------|------|---------|--------------|
| `erasure_completed` | PP | async | Purge from search, ISR revalidation, remove from shortlists, notify shortlist owners, anonymise outbound enquiries | S6 |
| `erasure_completed` | CR | async | Cancel win-back schedules for listings in listingIdsAnonymised ∪ listingIdsDeleted, anonymise churn log entries by listingId (CR-ST-15), clear conversion trigger state [S10-ST-11] | S8 |
| `erasure_completed` | Ops | orchestrated | Close DSAR case + compliance audit record (called directly by erasure flow step 5, not via event bus) | S7 |
| `account_closed` | D&L | async | Cancel enrichment schedules for archived listings | S9 |
| `account_closed` | Ops | async | Close active support tickets for closed account | S7 |
| `account_closed` | CR | async | Record closure in churn analysis, clear conversion state | S8 |

**EVENT_CONSUMER_MATRIX delta:** +0 new consumer entries.

---

## §10 Deferred Actions Registered in S10

S10 introduces **0 new deferred actions**. All deferred actions referenced by S10 flows are already registered in SI §2.1/§2.2:

| Action | Params Type | Owner | Schedule | Registered In | New? |
|--------|-------------|-------|----------|--------------|------|
| `auto_escalation_check` | `{ flowId: UUID, flowType: "erasure" \| "closure" }` | SI | On retry threshold exceeded (3 failures) | S0 | No |
| `compliance_hold_recheck` | `{ accountId: UUID, flowId: UUID }` | Ops | 7 days after closure step 4 deferred | S0 | No |
| `quality_score_recalculation` | `{ listingId: UUID }` | D&L | Event-driven (erasure anonymises company listings) | S9 | No |

**Total DeferredActionParamsMap entries after S10:** 34 (unchanged from S9).

---

## §11 Email Templates Registered in S10

S10 introduces **0 new email templates**. All templates referenced by S10 flows are already registered:

| Template ID | Category | Trigger | Registered In | New? |
|-------------|----------|---------|--------------|------|
| `dsar_acknowledgment` | `transactional` | DSAR receipt (Ops domain) | Ops §5.2 (S7) | No |
| `dsar_completion` | `transactional` | Erasure completion (Ops domain) | Ops §5.2 (S7) | No |

**Current count remains 30 templates (SI §5.2).**

---

## §12 Notification Types Used in S10

S10 introduces **0 new notification types**. Existing types cover all S10 scenarios:

| Type | Trigger | Registered In | New? |
|------|---------|--------------|------|
| `account_closure_initiated` | Account closure flow starts | SI §8.1 (S0) | No |
| `compliance_deadline` | Flow escalation (S7 §6.3) | SI §8.1 (S0) | No |

**Current count remains 19 notification types.**

---

## §13 Schema Additions

S10 introduces **0 new tables** and **0 schema amendments** except decision type registration.

**Decision type addition:**

| Decision Type | Domain | Trigger | New? |
|---------------|--------|---------|------|
| `graduation_evaluation` | Cross-domain | Periodic evaluation of sub-entity graduation criteria (enrichment cadence, ceremony auto-apply, algorithm rollout) | Yes |

**Cumulative schema after S10:** 45 tables (unchanged from S9). 36 pgEnums (unchanged). 34 deferred actions (unchanged). 30 email templates (unchanged). 19 notification types (unchanged). 27 decision types (26 from S9 + `graduation_evaluation`).

**Tables referenced (no new columns):** `orchestrated_flows` (S0/S7), `quality_scores` (S1/S9 — `algorithmVersion` column already exists), `listings` (S1), `account_profiles` (S1), `subscriptions` (S4), `pending_cancellation` (S4), `shortlists` (S6), `shortlist_items` (S6), `saved_searches` (S6), `enquiry_records` (S6), `claim_disputes` (S3), `enrichment_schedules` (S9), `decay_signals` (S9), `perception_aggregates` (S9), `ceremony_runs` (S9), `learning_hypotheses` (S9).

**Cumulative snapshot:** Full schema written to `00-schema.md` including all S0-S9 tables + pgEnums + amendments.

---

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

---

## §15 Downstream Flags

S10 produces **0 downstream flags**. It is the final slice in the requirements sequence. All remaining work moves to phase 4 (Work Management).

**Post-requirements work (outside slice scope):**
- Phase 4: Work Management — implementation sequencing, acceptance test authoring, deployment planning
- D&L-Q2 (public API for external consumers) remains open — deferred to post-launch operational decision

---

## §16 Open Question Resolutions

S10 resolves 1 open question.

| # | Question | Resolution |
|---|----------|-----------|
| SQ-3 | Deferred action retry policy for Paddle cancellations during account closure | Orchestrator step (not a deferred action) calls `PaymentService.cancelSubscription` per subscription. If API call fails, orchestrator step fails, admin retries via S7 flow admin UI. Step is skippable (SI §3.5). No separate deferred action for Paddle cancellation — the orchestrator step IS the retry mechanism. Paddle may webhook independently regardless of API call outcome. Policy: `retry_3` with exponential backoff (1s, 2s, 4s). |

**Remaining open questions:** D&L-Q2 (public API for external consumers — V2 consideration, deferred to post-launch).

---

## §17 Acceptance Criteria

**Total: 72 acceptance criteria**

### §1 GDPR Erasure Flow Wiring (10 AC)

| # | Criterion | Test Type |
|---|-----------|-----------|
| AC-1 | `ERASURE_FLOW_STEPS` contains exactly 6 steps in order: verify_identity, extract_account_data, close_active_tickets, process_erasure, close_dsar_case, emit_erasure_completed. | Unit |
| AC-2 | `executeOrchestratedFlow("erasure", ...)` creates an `OrchestratedFlowProgress` record with `flowType: "erasure"`, `status: "initiated"`, and a 30-day deadline. | Integration |
| AC-3 | Steps 1 (verify_identity), 4 (process_erasure), and 5 (close_dsar_case) have `skippable: false`. `admin.flows.skipStep` returns an error when invoked for these steps. | Integration |
| AC-4 | Steps 2 (extract_account_data), 3 (close_active_tickets), and 6 (emit_erasure_completed) have `skippable: true`. `admin.flows.skipStep` succeeds with mandatory `skipReason` text. | Integration |
| AC-5 | Step 5 (close_dsar_case) calls Operations' `closeDSARCase` directly — not dispatched via the event bus. No `EVENT_CONSUMER_MATRIX` entry exists for Ops handling of `erasure_completed`. | Unit |
| AC-6 | Step 6 emits `erasure_completed` event with payload matching `ErasureCompletedEvent` type: `accountHash` (string), `senderAccountId` (UUID), `listingIdsAnonymised` (UUID[]), `listingIdsDeleted` (UUID[]), `freelancerListingsDeleted` (number), `timestamp` (ISO8601). | Integration |
| AC-7 | `ErasureContext` is serialised to JSON with the `OrchestratedFlowProgress` record. After step failure and admin retry, the context is restored with all previously written fields intact (UUID arrays, timestamps, booleans). | Integration |
| AC-8 | Auto-escalation fires after 3 consecutive failures on any step. For erasure flows, deadline proximity alerts fire at 7 days and 3 days remaining. | Integration |
| AC-9 | Step 5 updates `compliance_register` to `status: 'completed'` for the DSAR case and inserts a new `compliance_register` row with `type: 'erasure_audit'` containing deletion/anonymisation counts and listing IDs. | Integration |
| AC-10 | After step 5 completes, `checkComplianceHold(accountId)` returns `holdExists: false` for the DSAR-related hold (clearing the hold for any concurrent closure flow). | Integration |

### §2 processErasure Implementation (12 AC)

| # | Criterion | Test Type |
|---|-----------|-----------|
| AC-11 | `processErasure` resolves active disputes where the erasing account is the current owner: listing `claimStatus` changes to `"claimed"`, `accountId` changes to the competing claimant's ID. | Integration |
| AC-12 | `processErasure` withdraws competing claims filed by the erasing account: listing `claimStatus` restored to `"claimed"` for the existing owner, `pre_claim_snapshot` for the withdrawn claim is deleted. | Integration |
| AC-13 | Dispute chain termination: if the competing claimant's own claim is also disputed, only the immediate dispute is resolved. No cascading resolution. | Unit |
| AC-14 | Freelancer listings (`entityType = "freelancer"`) are fully deleted. After `processErasure`, `SELECT * FROM listings WHERE id = ?` returns zero rows. All 16 child tables (listing_taxonomy_tags through perception_aggregates) have zero rows referencing the deleted listing ID. | Integration |
| AC-15 | Company listings (`entityType != "freelancer"`) are anonymised: `accountId = null`, `claimStatus = "unclaimed"`, `contactEmail = null`, `contactPhone = null`. Verification tier reverted to `"unclaimed"`. Listing row persists (not deleted). | Integration |
| AC-16 | Company listing anonymisation deletes `pre_claim_snapshots`, `enrichment_schedules`, `decay_signals`, and `perception_aggregates` for that listing. | Integration |
| AC-17 | Account personal data deletion: `account_profiles.fullName` set to `"Deleted User"`, `emailPreferences` set to all-false. Buyer-side `enquiry_records` (WHERE `senderAccountId = accountId`) deleted. `shortlists`, `shortlist_items`, `saved_searches`, `search_history` deleted. Auth sessions revoked. | Integration |
| AC-18 | The entire DB operation executes in a single PostgreSQL transaction. If any step throws, the transaction rolls back and no tables are modified. | Integration |
| AC-19 | R2 cleanup deletes objects under `listings/{listingId}/images/` for each deleted freelancer listing and `claims/{claimId}/evidence/` for each claim filed by the erasing account. | Integration |
| AC-20 | D2 idempotent retry: if DB transaction succeeds but R2 cleanup fails, the step fails with `context.dbTransactionCompleted = true`. On retry, the DB transaction is skipped and only R2 cleanup executes. | Integration |
| AC-21 | `quality_score_recalculation` deferred action is scheduled for each anonymised company listing. Count matches `companyListingsAnonymised`. | Integration |
| AC-22 | `claimIdsForR2Cleanup` is captured from `pre_claim_snapshots` BEFORE the DB transaction executes (pre-transaction query), ensuring R2 evidence cleanup references survive snapshot deletion. | Unit |

### §3 Account Closure Flow Wiring (8 AC)

| # | Criterion | Test Type |
|---|-----------|-----------|
| AC-23 | `CLOSURE_FLOW_STEPS` registers 6 steps in order: archive_listings, cancel_paddle_subscriptions, anonymise_enquiry_data, delete_defer_buyer_data, deactivate_account, emit_account_closed | Unit |
| AC-24 | `executeOrchestratedFlow("closure", accountId, CLOSURE_FLOW_STEPS, initialContext)` creates an `orchestrated_flows` record with `flowType = "closure"` and `status = "initiated"` | Integration |
| AC-25 | Step 1 archives all active listings for the account — each emits `listing_archived` (sync: search index removal) — and accumulates archived IDs in `context.listingsArchived` | Integration |
| AC-26 | Step 2 creates `pending_cancellation` record with `reason: "account_closed"` BEFORE calling `PaymentService.cancelSubscription` for each paid listing | Integration |
| AC-27 | Step 2 failure (Paddle API throws) halts the flow at step 2 with `status: "failed"` and preserves context showing which subscriptions succeeded and which failed | Integration |
| AC-28 | Step 2 retry after partial completion skips already-cancelled subscriptions (idempotent: pending_cancellation record exists, Paddle returns success for already-cancelled) | Integration |
| AC-29 | Step 5 sets `account.lifecycleStatus = "closed"` — server rejects admin skip attempt (step 5 is NOT skippable per SI §3.5) | Integration |
| AC-30 | Step 6 emits `account_closed` with payload matching PP §1.9 `AccountClosedEvent`: `accountId`, `listingsArchived` (from context), `buyerDataDeleted`, `complianceHoldActive`, `paddleCancellationsPending`, `timestamp` | Integration |

### §4 Closure Data Operations (9 AC)

| # | Criterion | Test Type |
|---|-----------|-----------|
| AC-31 | Step 3 sets `senderAccountId = null` and `senderDisplayName = "[Account closed]"` on all `enquiry_records` where `senderAccountId = :accountId` | Integration |
| AC-32 | Step 3 preserves `messageContent` on provider-visible enquiry records (providers retain enquiry history without sender identity) | Integration |
| AC-33 | Step 4 calls `checkComplianceHold(accountId)` before any deletion — if hold exists, schedules `compliance_hold_recheck` deferred action with `{ accountId, flowId }` for 7 days and sets `context.buyerDataDeferred = true` [S10-ST-2] | Integration |
| AC-34 | Step 4 with no compliance hold deletes: `shortlists` (cascade deletes `shortlist_items`), `saved_searches`, `search_history` for the account | Integration |
| AC-35 | Step 4 per-table deletion — failure deleting `saved_searches` does not roll back prior `shortlists` deletion; retry re-attempts remaining tables | Integration |
| AC-36 | `compliance_hold_recheck` handler re-checks hold after 7 days — if hold cleared, executes `executeBuyerDataDeletion` and updates flow context | Integration |
| AC-37 | `compliance_hold_recheck` handler reschedules for another 7 days if hold still active (repeating cycle) | Integration |
| AC-38 | `compliance_hold_recheck` handler after hold clears updates `context.buyerDataDeleted = true` in the `orchestrated_flows` record | Integration |
| AC-39 | Step 6 `AccountClosedEvent.complianceHoldActive` reflects `context.buyerDataDeferred` — consumers know whether buyer data was fully deleted or deferred | Integration |

### §5 Concurrent Flow Interaction (6 AC)

| # | Criterion | Test Type |
|---|-----------|-----------|
| AC-40 | Erasure and closure flows for the same account each create independent `orchestrated_flows` rows with separate `flowId` values | Integration |
| AC-41 | Closure step 4, when `checkComplianceHold` returns `holdExists: true`, sets `buyerDataDeferred: true` in context and schedules `compliance_hold_recheck` deferred action with `{ accountId, flowId }` for 7 days [S10-ST-2, S10-ST-6] | Integration |
| AC-42 | `compliance_hold_recheck` handler, when hold cleared and buyer data exists, deletes buyer data (shortlists, shortlist_items, saved_searches, search_history) [S10-ST-8] | Integration |
| AC-43 | `compliance_hold_recheck` handler, when hold cleared and buyer data already deleted by processErasure, completes as no-op | Integration |
| AC-44 | `compliance_hold_recheck` handler, when hold still active, reschedules for another 7 days | Integration |
| AC-45 | processErasure succeeds when listings are already archived by a prior closure flow (idempotent anonymisation/deletion) | Integration |

### §6 End-to-End Validation & Failure Injection (12 AC)

| # | Criterion | Test Type |
|---|-----------|-----------|
| AC-46 | Per-step failure injection for all 6 erasure steps: injected failure halts flow, sets step status to `"failed"`, preserves context, admin retry succeeds | Integration |
| AC-47 | Per-step failure injection for all 6 closure steps: same verification as AC-46 | Integration |
| AC-48 | Attempt counter increments on each retry and is persisted to `orchestrated_flows` | Integration |
| AC-49 | Context JSON serialisation round-trip preserves UUID arrays, ISO8601 timestamps, booleans, and nested objects | Integration |
| AC-50 | Prior completed steps are NOT re-executed when admin retries a failed step (orchestrator resumes from `currentStep`) | Integration |
| AC-51 | processErasure retry with `dbTransactionCompleted: true` in context skips DB transaction and retries R2 cleanup only | Integration |
| AC-52 | After 3 consecutive failures on the same step, `auto_escalation_check` deferred action is scheduled | Integration |
| AC-53 | Erasure deadline proximity triggers escalation: 7-day alert, 3-day auto-escalate, deadline-passed critical alert | Integration |
| AC-54 | Skip attempt on non-skippable steps (erasure 1/4/5, closure 1/5) is rejected server-side with error message | Integration |
| AC-55 | Skip attempt on skippable steps succeeds, sets step status to `"skipped"`, requires non-empty `reason` and `adminId` | Integration |
| AC-56 | Concurrent erasure + closure flows for the same account coexist: closure defers buyer data on compliance hold, processErasure deletes it, `compliance_hold_recheck` is no-op | Integration |
| AC-57 | `compliance_hold_recheck` reschedules when hold still active, deletes buyer data when hold cleared | Integration |

### §7 Autonomy Graduation (7 AC)

| # | Criterion | Test Type |
|---|-----------|-----------|
| AC-58 | `evaluateGraduationCriteria("data-and-listings", "enrichment_cadence_adjustment")` returns `graduated: false` when fewer than 12 `enrichment_cadence_adjustment` decisions exist in the 6-month window (insufficient data) | Unit |
| AC-59 | `evaluateGraduationCriteria("data-and-listings", "enrichment_cadence_adjustment")` returns `graduated: true` when false positive rate is 1.5% and enrichment ROI is 0.7 (both within thresholds) | Unit |
| AC-60 | `evaluateCeremonyGraduation` returns `graduated: false` for any recommendation where `isFinancial = true`, regardless of precedent count | Unit |
| AC-61 | `evaluateCeremonyGraduation` returns `graduated: true` when `precedentCount >= 50` AND `isFinancial = false` AND `isUserVisible = false` | Unit |
| AC-62 | `dispatchGraduatedDecision` logs a `graduation_evaluation` decision via `logDecision` (SI §9.2) on every invocation, including both `graduated: true` and `graduated: false` outcomes | Integration |
| AC-63 | `withinGovernanceBounds("enrichment_cadence_adjustment")` returns `false` after 10 auto-applied adjustments in the current calendar month, causing the 11th to escalate | Integration |
| AC-64 | `admin.graduation.override` with `graduated: false` causes subsequent `evaluateGraduationCriteria` to return `graduated: false` (manual override takes precedence over computed metrics) | Integration |

### §8 Algorithm Versioning & Controlled Rollout (8 AC)

| # | Criterion | Test Type |
|---|-----------|-----------|
| AC-65 | `selectAlgorithmVersion(listingId, 10)` returns `2` for a listing whose `crc32(listingId) % 100` is 7, and returns `1` for a listing whose bucket is 15 | Unit |
| AC-66 | `selectAlgorithmVersion` is deterministic: same `listingId` and same `rolloutPercentage` always returns the same version across multiple invocations | Unit |
| AC-67 | During rollout, `scoreListingDuringRollout` for a V2-cohort listing writes `algorithmVersion = 2` to `quality_scores` AND logs an `algorithm_comparison` entry in `decision_logs` containing both V1 and V2 scores | Integration |
| AC-68 | `handleRolloutPercentageChange(10, 25)` schedules `quality_score_recalculation` deferred actions only for listings in buckets 10-24 (those crossing the boundary), not for buckets 0-9 (already V2) or 25-99 (still V1) | Integration |
| AC-69 | `checkAlgorithmRollbackTrigger` returns `shouldRollback: true` when declassification rate exceeds 10% and logs a `graduation_evaluation` decision with `graduated: false` and `reason` containing "quality regression" | Integration |
| AC-70 | `logDecision("graduation_evaluation", ...)` is called on every `handleRolloutPercentageChange` invocation, capturing `previousPercentage`, `newPercentage`, and `affectedListings` in the decision log | Integration |
| AC-71 | Rollback (setting rollout to 0%) schedules `quality_score_recalculation` for all listings with `algorithmVersion = 2`, and after re-scoring, all listings have `algorithmVersion = 1` | Integration |
| AC-72 | `evaluateAlgorithmRolloutGraduation` returns `graduated: true` when V2 has been stable at 100% for 4 weeks with declassification rate <5% across all weekly checks | Integration |

---

## §18 Stress Test Resolution Log (v2)

19 scenarios targeting S10's implementation against SI v9, D&L v6, Ops v4, PP v7, CR v3. 2 High, 7 Medium, 3 Low, 7 Pass. 8 slice fixes applied (4 sibling-only scenarios handled by Agent B).

Full analysis: `stress-tests/s10-stress-test.md`

| # | Scenario | Severity | Resolution |
|---|----------|----------|------------|
| S10-ST-1 | `graduation_evaluation` decision type missing from SI §9.2 | **Medium** | Sibling fix only: SI §9.2 +graduation_evaluation to Cross-domain row. No slice change. |
| S10-ST-2 | `compliance_hold_recheck` params mismatch — SI requires `flowId` | **High** | Added `flowId` to scheduling calls in §4.2, §5.4, handler params, and §10 deferred actions table. Handler lookup changed to `params.flowId` direct query. |
| S10-ST-3 | `processErasureR2Cleanup` contradictory call sites in §2.2 vs §2.7 | **High** | Removed stale §2.2 code block, replaced with cross-reference to §2.7 authoritative implementation. |
| S10-ST-4 | `account_closed` event payload correct against PP §1.9 | **Pass** | Correct. No fix needed. |
| S10-ST-5 | `closeDSARCase` not exported in Ops interface contract | **Medium** | Sibling fix only: Ops §3.6 new mutation interface. No slice change. |
| S10-ST-6 | `hasComplianceHold` vs `checkComplianceHold` name inconsistency | **Medium** | Renamed to `checkComplianceHold` throughout §5.1, §5.2, §5.4, AC-41, §19, 00-schema.md. Updated return type handling to `holdResult.holdExists`. |
| S10-ST-7 | `auto_escalation_check` params missing `flowType` | **Medium** | Added `flowType: "erasure" \| "closure"` to §10 deferred actions table. |
| S10-ST-8 | AC-42 lists non-existent `email_preferences` in deletion set | **Medium** | Removed `buyer-side enquiry_records, email_preferences` from AC-42, replaced with `search_history`. Updated §5.4 handler comment. |
| S10-ST-9 | `compliance_hold_recheck` handler divergence §4 vs §5 (pattern #14) | **Medium** | Replaced §4.3 implementation with cross-reference to §5.4. Removed status filter in §5.4 flow lookup. |
| S10-ST-10 | Autonomy graduation admin routes absent from PP spec | **Medium** | Sibling fix only: PP §6 new admin graduation surface. No slice change. |
| S10-ST-11 | CR `erasure_completed` consumer win-back scope | **Low** | Added listing scope (`listingIdsAnonymised ∪ listingIdsDeleted`) to §9 handler description. |
| S10-ST-12 | `algorithm_comparison` telemetry type undocumented in SI §9.2 | **Low** | Sibling fix only: SI §9.2 telemetry types note. No slice change. |
| S10-ST-13 | `erasure_completed` payload field coverage | **Low** | Correct. No fix needed. |
| S10-ST-14 | Erasure step 6 domain attribution | **Pass** | Correct. No fix needed. |
| S10-ST-15 | Skip constraint matrix alignment — erasure | **Pass** | Correct. No fix needed. |
| S10-ST-16 | Skip constraint matrix alignment — closure | **Pass** | Correct. No fix needed. |
| S10-ST-17 | CR `account_closed` consumer free-tier churn log exclusion | **Pass** | Correct. No fix needed. |
| S10-ST-18 | Quality score recalculation after anonymisation | **Pass** | Correct. No fix needed. |
| S10-ST-19 | Closure flow step ordering matches SI §13.2 and PP §5 | **Pass** | Correct. No fix needed. |

---

## §19 Cross-References

| Document | Relationship |
|----------|-------------|
| `shared-infrastructure.md` (v9) | §1 event bus + P1-P5 principles, §2 deferred actions (0 new, references existing 34), §3 orchestrated flow engine (erasure + closure wiring), §4.1 `AuthSession` type, §5 email transport (0 new templates), §8 notification types (0 new), §9 decision logging (+1 new: `graduation_evaluation` → 27 total), §13.1 erasure flow specification, §13.2 closure flow specification |
| `data-and-listings.md` (v6 interface) | §1.9 `erasure_completed` event, §2 `account_closed` event, §4 quality scoring contract, processErasure specification (D&L CD §6) |
| `operations.md` (v4 interface) | §3.2 `checkComplianceHold` query [S10-ST-6], §5 DSAR case schema, compliance audit record creation |
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
