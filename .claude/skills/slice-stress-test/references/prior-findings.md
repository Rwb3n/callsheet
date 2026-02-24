# Prior Stress Test Patterns (S0–S7)

## Recurring Issue Categories

### 1. Three-Part Registry Sync (S0, S2, S3, S4, S5, S6, S7 — 8 occurrences)
Every deferred action or email template needs THREE things in sync:
- Entry in SI §2.1 `DeferredActionParamsMap` (for deferred actions)
- Handler registration in SI §2.2 registered actions table (for deferred actions)
- Template row in SI §5.2 + PP §4 (for email templates)
- Scheduling call in the slice code

**STATUS: Promoted to pre-drafting checklist item.** If the slice being tested adds deferred actions or templates, verify sync was done during drafting. If not, classify as Medium (not High) — it's a known mechanical gap, not a structural discovery.

### 2. Event Payload P1 Compliance (S0, S1, S2, S3, S4, S5)
Most common High finding: event payload missing a field that consumers need, forcing a DB read in the handler (P1 violation). Check every consumer's P1 fields table against the emitter's payload type. S5-ST-13: `profile_edited` missing `accountId`.

### 3. Schema Amendment Debt (S3, S4, S5)
Later slices add columns to S0/S1 tables that didn't exist when those slices were drafted. S5-ST-5: notification table needed `readAt`/`dismissed`/`dismissedAt` (S0 had `read: boolean`). S5-ST-14: `enquiry_records` needed `status` column (S1 had only `respondedAt`). Check whether the slice references columns that don't exist in the authoritative schema.

### 4. pgEnum Extraction (S0, S1)
Drizzle pgEnum must be standalone named constants, not inline. Any new enum columns need `export const xxxEnum = pgEnum("xxx", [...])` before the table definition.

### 5. Two-Phase Pattern (S1, S2)
Listing creation uses two-phase: mutation creates zero-initialised rows, async consumer computes real values. Any new table rows created with incomplete data should follow the same pattern.

### 6. Nullable Composite Unique Indexes (S1)
PostgreSQL NULL != NULL in unique constraints. If a composite unique index has a nullable column, it needs a partial unique index with `WHERE column IS NOT NULL`.

### 7. Event Emission Ownership (S1)
tRPC routes are Platform surface — PP emits events from routes. D&L provides schema and domain logic. If the slice has tRPC routes that emit events, verify the emission is attributed to the correct domain.

### 8. P3 Context Defensiveness (S1, S4)
Events with multiple trigger paths need `origin`/`reason` fields. `subscription_ended` has `origin: "paddle" | "archival" | "closure"`. Consumers MUST branch on origin. S4-ST-3: reason mapping catch-all was inverted.

### 9. Admin-Suspended Guard (S1, S5)
Admin-suspended listings cannot be provider-reactivated or edited — requires FORBIDDEN guard. S5-ST-17: added lifecycle guard for archived/suspended listings on edit.

### 10. Account Closure / GDPR Erasure Complexity (Cross-interface, S4, S5)
Most complex cross-domain flows. Key constraints:
- pending_cancellation_created: 3 trigger paths (CR, D&L, PP)
- subscription_ended: 3 origins (paddle, archival, closure)
- Erasure flow: 6 steps, step 5 (Ops DSAR closure) NOT skippable (XI-11)
- PP writes directly to Ops-owned `pending_cancellations` for closure path only (documented exception)

### 11. Prose-Code Contradictions (S4, S5)
When a slice contains both prose descriptions and pseudocode, they can diverge. S5-ST-16: §2.1 said "single query joins" but §2.2 used N+1 `Promise.all`. S4-ST-3: reason mapping catch-all was inverted in code vs description. Cross-check prose claims against pseudocode.

### 12. Notification Schema (S5)
S0's notification table had `read: boolean`. S5 needed `readAt`, `dismissed`, `dismissedAt`. Any slice that adds notification lifecycle behaviour should check compatibility with SI §8.1 `Notification` type and S0 §1.4 schema.

### 13. Enquiry Lifecycle (S5)
S1's `enquiry_records` had no `status` column. S5 added `unread`/`responded`/`stale` three-state lifecycle. Any slice touching enquiry display or processing should verify the column exists.

### 14. Content Agent Divergence (S6, S7)
When multiple content files describe the same handler or mechanism, contradictions arise. S6-ST-1: three content files described mutually exclusive shortlist lifecycle approaches. S7-ST-2: `09-event-consumers.md` used correct `"listing_status"` EmailCategory while `11-email-delivery.md` used non-existent `"operations_compliance"`. Root cause: content agents independently implement the same behaviour without a single authoritative source. Multi-file slices increase this risk. Prevention: for any handler described in multiple sections, designate one section as authoritative and have others reference it. The Phase 1 Decision Summary helps but does not cover implementation details like email categories.

### 15. Runtime Silent Failure (S7)
Code that filters by a value no code path produces. S7-ST-8: `admin.refunds.list` filters `WHERE category = "refund_request"` but `classifyTicket` never assigns this category — the query always returns zero results. Invisible to type checking (`text` column, not enum). Invisible to unit tests (the query runs without error, just returns empty). Only caught by integration-level scenario that traces data flow from ticket creation through to admin list query. Any slice that adds admin filtered views should verify the filter values are producible by the upstream write path.

## Pre-Drafting Checklist

Before stress-testing, verify the drafter ran these checks:
1. **Deferred actions** → SI §2.1 `DeferredActionParamsMap` + SI §2.2 registered actions table entries exist
2. **Email templates** → SI §5.2 + PP §4 rows exist, template count updated
3. **Schema amendments** → §16 includes cumulative snapshot of amended tables
4. **Event emissions** → payload matches `EventPayloadMap` in SI §1.2, all P1 fields present
5. **Upstream flags** → all claimed resolutions are complete and accurate

6. **Admin filter views** → every `WHERE column = "value"` in admin list queries has a corresponding write path that produces that value (pattern #15)
7. **Multi-file handler dedup** → any handler described in multiple content sections has one authoritative file; others reference it (pattern #14)

If the drafter skipped these, the stress test will find 3-5 mechanical issues. Classify them as Medium (not High) unless the gap renders a feature non-functional at runtime (classify as High per amended severity rubric).

## UI-Heavy Slice Calibration

S5 (Provider Experience) had 8/20 Pass (40%) — highest pass rate. UI-surfacing slices generate fewer cross-domain contract findings because they primarily render existing data. For S6 (Buyer Experience) and S8 (Commercial), consider:
- 15 scenarios instead of 20
- Focus on: data access patterns (N+1 queries, missing joins), feature gate rendering accuracy, event emission correctness, schema column existence
- Reduce coverage on: Paddle webhooks, orchestrated flows, compliance paths (unless the slice touches them directly)

## Slice-Specific Pre-Identified Concerns

### S6 (Buyer Experience)
1. `enquiry_submitted` emission: PP-owned event. Does S6 emit it correctly from the enquiry submission form?
2. `shortlist_added` event: no cross-domain consumers — does S6 need to emit it at all?
3. Anonymous enquiry flow: `enquiry_records.senderAccountId` is nullable. Does the S6 form handle both authenticated and anonymous enquiries?
4. Saved search: `savedSearches.filters` is `Record<string, unknown>` in S1. Does S6 type it more strictly?
5. Enquiry response display: S5 added `status` column to `enquiry_records`. Does S6 read it correctly for buyer-side enquiry status?
6. Feature-gated contact visibility: which fields are hidden for free-tier listings? Does S6 import `computeFeatureAccess` from CR (P4)?

### S7 (Operations)
1. TaskSpec type: does S7's implementation match Ops §4.1?
2. Failed event admin view: uses `event_consumer_errors` table (S0). Does S7 add `resolved`/`resolvedAt` columns (S0-11 flag)?
3. Orchestrated flow admin: uses `orchestrated_flows` table. Does S7 add `updatedAt` column (S0-3 flag)?
4. Skip constraint enforcement: does the admin UI enforce SI §3.5 matrix?
5. Paddle webhook processing: Ops owns webhook handler. Is signature verification documented?
6. Billing reconciliation: daily deferred action. Does S7 specify reconciliation logic or just UI?
7. Human procurement: TaskSpec creation for manual review, dispute resolution, portfolio review. All task types covered?

### S8 (Commercial)
1. Conversion triggers: CR evaluates, PP/S5 displays. Does S8 specify the evaluation logic?
2. Churn intervention: CR detects, S5 provides surface. Does S8 specify the detection rules?
3. Win-back: 60-day schedule via deferred action. Ops delivers email. Does S8 specify CR's merge field generation? S7-1 flag: `WinbackEligibleEvent.mergeFields` must match the `winback` template.
4. Sponsored placement: selection algorithm. Does S8 specify ranking/weighting?
5. Revenue perception: dashboard data. Does S8 specify the computation?
6. Churn risk events: S7-5 flag — S8 must emit `churn_risk_detected` with `riskFactors` array including `"payment_at_risk"` for S7's high-risk classification to work.
7. Content agent divergence risk: S8 has both UI and domain-logic components across CR and PP boundaries. Verify any handler described in both CR evaluation logic and PP display surface uses consistent types and field names (pattern #14).

### S9 (Entity Intelligence)
1. Quality scoring algorithms: replaces S1's zero-initialised values. Does S9 specify all 5 dimension scoring functions?
2. Decay detection: freshness signals. Does S9 specify thresholds and response actions?
3. Enrichment scheduling: cadence per listing. Does S9 specify the scheduling algorithm?
4. P2 deduplication: S1-8 flag. Does S9 implement event deduplication for `profile_viewed`?
5. `account_closed` consumer: S1-11 flag. Does S9 implement enrichment suspension?

### S10 (Hardening)
1. GDPR erasure orchestrator: full 6-step flow. All steps implemented?
2. Account closure orchestrator: full 6-step flow. All steps implemented?
3. End-to-end validation: cross-domain flow testing.
4. Failure injection: per-step failure for both orchestrated flows.
5. Skip constraint enforcement: integration test for every non-skippable step.
