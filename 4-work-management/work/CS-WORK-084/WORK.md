---
template: work_item
id: CS-WORK-084
title: "processErasure implementation"
type: feature
status: todo
owner: null
created: 2026-03-28
spawned_by: null
spawned_children: []
chapter: CH-CS-012
arc: hardening
epoch: CS-E1
closed: null
priority: high
effort: large
traces_to:
  - REQ-CS-HARDEN-002
source_files:
  - D:/PROJECTS/callsheet/3-requirements/slices/slice-10-hardening/01-erasure-flow.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/data-and-listings.md
  - D:/PROJECTS/callsheet/2-concept-design/data-and-listings.md
acceptance_criteria:
  - "AC-11: processErasure resolves active disputes where erasing account is current owner: listing claimStatus changes to 'claimed', accountId to competing claimant's ID"
  - "AC-12: processErasure withdraws competing claims filed by erasing account: listing claimStatus restored to 'claimed' for existing owner, pre_claim_snapshot deleted"
  - "AC-13: Dispute chain termination: if competing claimant's claim is also disputed, only immediate dispute resolved. No cascading resolution"
  - "AC-14: Freelancer listings (entityType = 'freelancer') fully deleted. All 16 child tables have zero rows referencing deleted listing ID"
  - "AC-15: Company listings (entityType != 'freelancer') anonymised: accountId = null, claimStatus = 'unclaimed', contactEmail = null, contactPhone = null. Verification tier reverted to 'unclaimed'. Row persists"
  - "AC-16: Company listing anonymisation deletes pre_claim_snapshots, enrichment_schedules, decay_signals, perception_aggregates for that listing"
  - "AC-17: Account personal data deletion: fullName = 'Deleted User', emailPreferences all-false. Buyer enquiry_records deleted. Shortlists, shortlist_items, saved_searches, search_history deleted. Auth sessions revoked"
  - "AC-18: Entire DB operation in single PostgreSQL transaction. Any throw rolls back all tables"
  - "AC-19: R2 cleanup deletes objects under listings/{listingId}/images/ for deleted freelancer listings and claims/{claimId}/evidence/ for claims filed by erasing account"
  - "AC-20: Idempotent retry: if DB succeeds but R2 fails, step fails with context.dbTransactionCompleted = true. Retry skips DB, retries R2 only"
  - "AC-21: quality_score_recalculation deferred action scheduled for each anonymised company listing. Count matches companyListingsAnonymised"
  - "AC-22: claimIdsForR2Cleanup captured from pre_claim_snapshots BEFORE DB transaction (pre-transaction query), ensuring R2 evidence cleanup references survive snapshot deletion"
blocked_by: [CS-WORK-083]
blocks: [CS-WORK-087, CS-WORK-088]
enables: []
queue_position: null
cycle_phase: null
node_history: []
artifacts: []
cycle_docs: {}
memory_refs: []
extensions:
  project: CALLSHEET
  slice: S10
  spec_sections: "S10 §2 (processErasure implementation), D&L CD §6 (processErasure specification)"
  io_profile: "db-read-write, r2-delete, deferred-action-schedule, transaction"
version: "2.0"
generated: 2026-03-28
last_updated: 2026-03-28T00:00:00
---

# CS-WORK-084: processErasure implementation

## Context

Implements the `processErasure` function — step 4 of the erasure flow. This is the D&L sub-entity's core data operation for GDPR right-to-erasure. Executes in a single PostgreSQL transaction: resolves active disputes (transferring listings to competing claimants), withdraws competing claims filed by the erasing account, fully deletes freelancer listings (+ 16 child tables), anonymises company listings (null PII, revert to unclaimed), and deletes account personal data. R2 cleanup runs after the DB transaction — images for deleted listings, evidence for withdrawn claims. Idempotent retry pattern: if DB succeeds but R2 fails, context flag `dbTransactionCompleted` gates re-execution.

**Type alignment notes:**
- `quality_score_recalculation` deferred action already registered in `DeferredActionParamsMap` with `{ listingId: UUID }` — aligned.
- 16 child tables for freelancer deletion: verify against current schema (listing_taxonomy_tags, listing_credits, quality_scores, engagement_counters, enrichment_schedules, decay_signals, perception_aggregates, pre_claim_snapshots, claim_disputes, listing_images, listing_social_links, listing_service_areas, listing_showreels, enquiry_records [by listingId], decision_logs [by listingId], ceremony_runs [by listingId]).
- `StorageService.deletePrefix()` in `src/lib/storage/` — verify R2 delete-by-prefix exists.
- `pre_claim_snapshots` table in `src/db/schema/data-and-listings.ts` — verify exists for AC-12, AC-22.

## Deliverables

- [ ] `src/domains/data-and-listings/erasure/process-erasure.ts` — Main `processErasure(db, storageService, schedulerDb, context)` function
- [ ] `src/domains/data-and-listings/erasure/process-erasure.ts` — Dispute resolution sub-functions (resolve active, withdraw competing)
- [ ] `src/domains/data-and-listings/erasure/process-erasure.ts` — Freelancer deletion, company anonymisation, account data deletion
- [ ] `src/domains/data-and-listings/erasure/process-erasure.ts` — R2 cleanup + idempotent retry gating
- [ ] `src/domains/data-and-listings/erasure/__tests__/process-erasure.test.ts` — Unit tests for AC-13, AC-22
- [ ] `src/domains/data-and-listings/erasure/__tests__/process-erasure.integration.test.ts` — Integration tests for AC-11, AC-12, AC-14, AC-15, AC-16, AC-17, AC-18, AC-19, AC-20, AC-21

## References

- `3-requirements/slices/slice-10-hardening/01-erasure-flow.md` — §2 processErasure spec
- `2-concept-design/data-and-listings.md` §6 — processErasure full specification
- `3-requirements/interfaces/data-and-listings.md` §1.9 — `ErasureCompletedEvent` payload
