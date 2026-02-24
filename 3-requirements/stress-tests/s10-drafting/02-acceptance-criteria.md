# S10 Acceptance Criteria — Consolidated

**Total: 72 acceptance criteria**

## §1 GDPR Erasure Flow Wiring (10 AC)

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

## §2 processErasure Implementation (12 AC)

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

## §3 Account Closure Flow Wiring (8 AC)

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

## §4 Closure Data Operations (9 AC)

| # | Criterion | Test Type |
|---|-----------|-----------|
| AC-31 | Step 3 sets `senderAccountId = null` and `senderDisplayName = "[Account closed]"` on all `enquiry_records` where `senderAccountId = :accountId` | Integration |
| AC-32 | Step 3 preserves `messageContent` on provider-visible enquiry records (providers retain enquiry history without sender identity) | Integration |
| AC-33 | Step 4 calls `checkComplianceHold(accountId)` before any deletion — if hold exists, schedules `compliance_hold_recheck` deferred action for 7 days and sets `context.buyerDataDeferred = true` | Integration |
| AC-34 | Step 4 with no compliance hold deletes: `shortlists` (cascade deletes `shortlist_items`), `saved_searches`, `search_history` for the account | Integration |
| AC-35 | Step 4 per-table deletion — failure deleting `saved_searches` does not roll back prior `shortlists` deletion; retry re-attempts remaining tables | Integration |
| AC-36 | `compliance_hold_recheck` handler re-checks hold after 7 days — if hold cleared, executes `executeBuyerDataDeletion` and updates flow context | Integration |
| AC-37 | `compliance_hold_recheck` handler reschedules for another 7 days if hold still active (repeating cycle) | Integration |
| AC-38 | `compliance_hold_recheck` handler after hold clears updates `context.buyerDataDeleted = true` in the `orchestrated_flows` record | Integration |
| AC-39 | Step 6 `AccountClosedEvent.complianceHoldActive` reflects `context.buyerDataDeferred` — consumers know whether buyer data was fully deleted or deferred | Integration |

## §5 Concurrent Flow Interaction (6 AC)

| # | Criterion | Test Type |
|---|-----------|-----------|
| AC-40 | Erasure and closure flows for the same account each create independent `orchestrated_flows` rows with separate `flowId` values | Integration |
| AC-41 | Closure step 4, when `hasComplianceHold` returns true, sets `buyerDataDeferred: true` in context and schedules `compliance_hold_recheck` deferred action for 7 days | Integration |
| AC-42 | `compliance_hold_recheck` handler, when hold cleared and buyer data exists, deletes buyer data (shortlists, shortlist_items, saved_searches, buyer-side enquiry_records, email_preferences) | Integration |
| AC-43 | `compliance_hold_recheck` handler, when hold cleared and buyer data already deleted by processErasure, completes as no-op | Integration |
| AC-44 | `compliance_hold_recheck` handler, when hold still active, reschedules for another 7 days | Integration |
| AC-45 | processErasure succeeds when listings are already archived by a prior closure flow (idempotent anonymisation/deletion) | Integration |

## §6 End-to-End Validation & Failure Injection (12 AC)

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

## §7 Autonomy Graduation (7 AC)

| # | Criterion | Test Type |
|---|-----------|-----------|
| AC-58 | `evaluateGraduationCriteria("data-and-listings", "enrichment_cadence_adjustment")` returns `graduated: false` when fewer than 12 `enrichment_cadence_adjustment` decisions exist in the 6-month window (insufficient data) | Unit |
| AC-59 | `evaluateGraduationCriteria("data-and-listings", "enrichment_cadence_adjustment")` returns `graduated: true` when false positive rate is 1.5% and enrichment ROI is 1.3 (both within thresholds) | Unit |
| AC-60 | `evaluateCeremonyGraduation` returns `graduated: false` for any recommendation where `isFinancial = true`, regardless of precedent count | Unit |
| AC-61 | `evaluateCeremonyGraduation` returns `graduated: true` when `precedentCount >= 50` AND `isFinancial = false` AND `isUserVisible = false` | Unit |
| AC-62 | `dispatchGraduatedDecision` logs a `graduation_evaluation` decision via `logDecision` (SI §9.2) on every invocation, including both `graduated: true` and `graduated: false` outcomes | Integration |
| AC-63 | `withinGovernanceBounds("enrichment_cadence_adjustment")` returns `false` after 10 auto-applied adjustments in the current calendar month, causing the 11th to escalate | Integration |
| AC-64 | `admin.graduation.override` with `graduated: false` causes subsequent `evaluateGraduationCriteria` to return `graduated: false` (manual override takes precedence over computed metrics) | Integration |

## §8 Algorithm Versioning & Controlled Rollout (8 AC)

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
