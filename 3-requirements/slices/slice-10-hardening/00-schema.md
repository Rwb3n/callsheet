<!-- Part of slice-10-hardening v2 -->

# S10 Schema Foundation — Hardening

**Generated:** 2026-02-15
**Covers:** Schema delta (0 new tables, 0 amendments), decision type registration (+1), cumulative snapshot reference, table access inventory

---

## 1. Schema Delta

S10 adds 0 new tables, 0 new columns, and 0 new pgEnums. Every schema element S10 requires already exists in prior slices.

The `algorithmVersion` column on `quality_scores` (S9 amendment) supports A/B traffic split without modification. The `orchestrated_flows` table (S0, amended S7) stores erasure and closure flow state without modification. The `decision_logs` table (S0) accepts the new `graduation_evaluation` decision type via its existing `decisionType: text` column — no enum constraint, no schema change.

### Tables Referenced by S10 (no modifications)

| Table | Schema File | Owner | S10 Access Pattern | Authoritative Source |
|-------|-------------|-------|--------------------|---------------------|
| `orchestrated_flows` | shared.ts | Shared | Read/write — flow state tracking for erasure (6 steps) and closure (6 steps) | S0 §1.2, S7 (+updatedAt) |
| `decision_logs` | shared.ts | Shared | Write — `graduation_evaluation` decision logging | S0 §1.2 |
| `deferred_actions` | shared.ts | Shared | Write — `compliance_hold_recheck` scheduling (closure step 4), `quality_score_recalculation` (post-erasure) | S0 §1.2 |
| `listings` | data-and-listings.ts | D&L | Read/write — archive (closure step 1), anonymise company listings (processErasure), delete freelancer listings (processErasure) | S1 §1.2 |
| `account_profiles` | data-and-listings.ts | D&L | Read/write — anonymisation (processErasure: fullName, emailPreferences) | S1 §2.1 |
| `quality_scores` | data-and-listings.ts | D&L | Read/write — `algorithmVersion` for A/B traffic split (D6), recalculation scheduling post-erasure | S1 §1.4, S9 (+calculatedBy, +algorithmVersion) |
| `verifications` | data-and-listings.ts | D&L | Write — revert tier to `unclaimed` for anonymised company listings (processErasure) | S1 §1.3 |
| `shortlists` | data-and-listings.ts | D&L | Delete — closure step 4 (buyer data deletion) | S1 §2.2 |
| `shortlist_items` | data-and-listings.ts | D&L | Delete — cascade from shortlists deletion (closure step 4) | S1 §2.2 |
| `saved_searches` | data-and-listings.ts | D&L | Delete — closure step 4 (buyer data deletion) | S1 §2.2 |
| `enquiry_records` | data-and-listings.ts | PP | Read/write — anonymise sender references in provider inboxes (closure step 3), delete buyer-side records (closure step 4, processErasure) | S1 §2.2, S5 (+status) |
| `pre_claim_snapshots` | data-and-listings.ts | D&L | Delete — processErasure (freelancer: cascade, company: explicit delete) | S1 §1.13 |
| `listing_taxonomy_tags` | data-and-listings.ts | D&L | Delete — processErasure freelancer cascade | S1 §1.7 |
| `credits` | data-and-listings.ts | D&L | Delete — processErasure freelancer cascade | S1 §1.8 |
| `media_items` | data-and-listings.ts | D&L | Delete — processErasure freelancer cascade | S1 §1.9 |
| `social_profiles` | data-and-listings.ts | D&L | Delete — processErasure freelancer cascade | S1 §1.10 |
| `accreditations` | data-and-listings.ts | D&L | Delete — processErasure freelancer cascade | S1 §1.11 |
| `engagements` | data-and-listings.ts | D&L | Delete — processErasure freelancer cascade | S1 §1.6 |
| `quality_score_explanations` | data-and-listings.ts | D&L | Delete — processErasure freelancer cascade | S1 §1.5 |
| `pending_enquiries` | data-and-listings.ts | D&L | Delete — processErasure freelancer cascade | S1 §1.12 |
| `pending_cancellations` | operations.ts | Ops | Read — closure step 2 iterates active subscriptions | S4 §1.3 / S7 §2.4 |
| `enrichment_schedules` | intelligence.ts | D&L | Delete — processErasure (freelancer: cascade, company: cancel schedules) | S9 §2.1 |
| `decay_signals` | intelligence.ts | D&L | Delete — processErasure (delete signals for erased listings) | S9 §2.2 |
| `perception_aggregates` | intelligence.ts | All | Delete — processErasure (delete aggregates for erased listings) | S9 §2.3 |
| `ceremony_runs` | intelligence.ts | All | Read — graduation evaluation queries precedent counts | S9 §2.4 |
| `learning_hypotheses` | intelligence.ts | Ops | Read — graduation evaluation references hypothesis measurement | S9 §2.5 |
| `compliance_register` | operations.ts | Ops | Read — `checkComplianceHold(accountId)` query (closure step 4) [S10-ST-6] | S7 §2.6 |

---

## 2. Decision Type Registration

S10 adds 1 decision type to SI §9.2: `graduation_evaluation`. [Source: 01-decisions.md — D3]

**Decision type name:** `graduation_evaluation`
**Domain:** Cross-domain
**Trigger:** Periodic evaluation of sub-entity graduation criteria (enrichment cadence auto-adjustment, ceremony auto-apply, algorithm rollout)

**Log payload type:**

```typescript
type GraduationEvaluationDecision = {
  subEntity: "data-and-listings" | "operations" | "platform" | "commercial"
  capability: "enrichment_cadence_adjustment" | "ceremony_auto_apply" | "algorithm_rollout"
  currentMetrics: Record<string, number>   // e.g., { falsePositiveRate: 0.015, enrichmentROI: 1.2 }
  thresholds: Record<string, number>       // e.g., { falsePositiveRate: 0.02, enrichmentROI: 1.0 }
  graduated: boolean                       // true if all thresholds met
  reason: string                           // "All criteria met" | "FP rate above threshold" | ...
}
```

**Rationale:** The three capabilities (S9-1, S9-2, S9-3) are variants of the same graduated autonomy pattern. Single decision type with structured payload is simpler than three separate types. The `capability` field distinguishes enrichment cadence, ceremony auto-apply, and algorithm rollout. The `subEntity` field identifies which domain's graduation is being evaluated.

**SI §9.2 amendment:** +1 decision type. Total after S10: 27 (was 26 in S9).

**Query patterns:**

- S9-1 (enrichment cadence): `WHERE decisionType = 'graduation_evaluation' AND input->>'capability' = 'enrichment_cadence_adjustment' AND createdAt >= now() - interval '6 months'`
- S9-2 (ceremony auto-apply): `WHERE decisionType = 'graduation_evaluation' AND input->>'capability' = 'ceremony_auto_apply' AND createdAt >= last_ceremony_run`
- S9-3 (algorithm rollout): `WHERE decisionType = 'graduation_evaluation' AND input->>'capability' = 'algorithm_rollout' AND createdAt >= now() - interval '7 days'`

---

## 3. Cumulative Schema Snapshot

The cumulative schema (authoritative in `references/cumulative-schema.md`) contains 45 tables and 36 pgEnums after S9. S10 does not modify it. No new tables, no new columns, no new enums.

The `decision_logs.decisionType` column is `text`, not an enum. Adding `graduation_evaluation` requires no DDL change — the new value is enforced at the application layer via TypeScript const exports. [Source: shared-infrastructure.md — §9.2, settled decision: schema versioning via TypeScript const exports]

The `quality_scores.algorithmVersion` column (integer, default 1) already supports the A/B traffic split mechanism. `selectAlgorithmVersion` writes `1` or `2` to this column based on `hash(listingId) % 100 < rolloutPercentage`. [Source: 01-decisions.md — D6]

---

## 4. Cumulative Counts

| Category | S9 Total | S10 Delta | S10 Total |
|----------|----------|-----------|-----------|
| Tables | 45 | +0 | 45 |
| pgEnums | 36 | +0 | 36 |
| Deferred actions | 34 | +0 | 34 |
| Email templates | 30 | +0 | 30 |
| Notification types | 19 | +0 | 19 |
| Decision types | 26 | +1 (`graduation_evaluation`) | 27 |
| EVENT_CONSUMER_MATRIX entries | ~66 | +0 | ~66 |
