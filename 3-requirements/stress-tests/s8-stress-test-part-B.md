# S8 Stress Test — Part B (D&L, PP, Internal Consistency, Downstream Flags)

**Slice:** `slices/slice-08-commercial/` (v1, multi-file)
**Tested against:** `data-and-listings.md` (v5), `platform-and-product.md` (v6), `commercial-and-revenue.md` (v3), `shared-infrastructure.md` (v7)
**Date:** 2026-02-15
**Agent:** B
**Boundary partition:** D&L interface, PP interface, internal consistency (pattern #14, AC vs pseudocode), downstream flag accuracy
**Scenarios:** 8
**Severity distribution:** 2 High, 2 Medium, 1 Low, 3 Pass
**Total fixes:** 4

---

## Scenario Table

| # | Scenario | Severity | Slice § | Spec § | Finding |
|---|----------|----------|---------|--------|---------|
| S8-ST-13 | `computeTaxonomyOverlap` signature mismatch: D&L §3.1 accepts `(tagsA: TaxonomyTag[], tagsB: TaxonomyTag[])` but §1.1.3 calls it as `computeTaxonomyOverlap(targetListingId, upgradedListingId)` | **High** | `01-conversion-triggers.md` §1.1.3 | D&L §3.1 | S8 passes two `UUID` listing IDs; the D&L export takes two `TaxonomyTag[]` arrays. Calling convention mismatch. |
| S8-ST-14 | `evaluateChurnIntervention` return type in §2.2 has no `riskFactors` field, but §10.2 spreads `intervention.riskFactors` into the churn_risk_detected emission array | **High** | `06-event-consumers.md` §10.2 | `02-churn-and-winback.md` §2.2 | Pattern #14: §10 handler accesses `intervention.riskFactors` which does not exist on the `ChurnInterventionResult` type. Runtime crash or empty spread. |
| S8-ST-15 | `shortlistCount` merge field in `conversion_analytics_teaser` mapped to `searchAppearances` — semantic mismatch between field name and data source | Medium | `01-conversion-triggers.md` §1.3 | D&L §3.2 | The merge field is named `shortlistCount` but populated from `engagement.searchAppearances`. D&L `EngagementCounters` has no `shortlistsCount` field. Misleading field name for email template. |
| S8-ST-16 | AC-80 claims all handlers are idempotent (P2) but `churn_analysis_log` is append-only — duplicate `subscription_ended` events produce duplicate churn rows | Medium | `index.md` §19 AC-80 | SI §1.4 P2 | Append-only log with no dedup key means duplicate events produce duplicate rows. `commercial_state` converges but the log diverges. Revenue perception churn rate inflates on replays. |
| S8-ST-17 | Cross-reference says PP `getListingAnalytics` (§3.1) is "consumed by §5" but §5 content says it is NOT consumed directly | Low | `index.md` cross-refs vs `04-revenue-perception.md` §5.6 | PP §3.1 | Cross-reference table states `getListingAnalytics` is consumed by §5; §5 explicitly says it uses aggregate queries instead. Cross-ref is stale. |
| S8-ST-18 | `listing_archived` handler reads `subscriptionTier` from event payload — P1 compliance verified against D&L §1.3 which carries `subscriptionTier: SubscriptionTier` | Pass | `06-event-consumers.md` §10.4 | D&L §1.3 | Correct. `ListingArchivedEvent` carries `subscriptionTier` per DL-ST-18. Handler reads from payload, not DB. |
| S8-ST-19 | `quality_score_changed` handler reads `newComposite` correctly from event — D&L §1.8 `QualityScoreChangedEvent` carries `newComposite: number` | Pass | `06-event-consumers.md` §10.5 | D&L §1.8 | Correct. Handler accesses `payload.newComposite`, field exists on `QualityScoreChangedEvent`. |
| S8-ST-20 | Downstream flags S8-1 through S8-5 — accuracy and completeness audit | Pass | `index.md` §17 | All specs | All 5 flags correctly target S9. Descriptions match the V1 scope boundaries and deferred items. No missing flags identified. |

---

## Detailed Findings

### S8-ST-13: `computeTaxonomyOverlap` calling convention mismatch

**Severity:** High
**Slice section:** `01-conversion-triggers.md` §1.1.3
**Upstream reference:** D&L §3.1

**Problem:** D&L §3.1 defines `computeTaxonomyOverlap` as:

```typescript
function computeTaxonomyOverlap(
  tagsA: TaxonomyTag[],
  tagsB: TaxonomyTag[]
): number  // 0-1, Jaccard similarity at Service Area level
```

The function takes two `TaxonomyTag[]` arrays and computes Jaccard similarity. S8 §1.1.3 calls it as `computeTaxonomyOverlap(targetListingId, upgradedListingId)` — passing two UUIDs, not tag arrays. The caller must first resolve listing IDs to their taxonomy tags, then pass the tag arrays. The current pseudocode would fail at compile time (type mismatch) or at runtime (treating UUIDs as tag arrays).

This is a structural gap — the `competitor_upgraded` trigger needs to load both listings' taxonomy tags before calling the D&L export. The D3 performance note in §1.9 correctly describes the flow ("compute `computeTaxonomyOverlap` per candidate against the upgraded listing") but the pseudocode in §1.1.3 skips the tag resolution step.

**Fix — slice:**
- Section: `01-conversion-triggers.md` §1.1.3, the `evaluateCompetitorUpgraded` function
- Old:
```
  // Taxonomy overlap — P4 import from D&L
  const overlap = computeTaxonomyOverlap(targetListingId, upgradedListingId) // D&L export
```
- New:
```
  // Taxonomy overlap — P4 import from D&L
  // Resolve listing IDs to taxonomy tag arrays before calling D&L export
  const targetTags = await getListingTaxonomyTags(targetListingId)
  const upgradedTags = await getListingTaxonomyTags(upgradedListingId)
  const overlap = computeTaxonomyOverlap(targetTags, upgradedTags) // D&L §3.1: (TaxonomyTag[], TaxonomyTag[]) → 0-1
```

**Fix — sibling specs:** None. D&L §3.1 signature is correct and should not change.

**Acceptance criteria impact:** None. AC-4 tests `competitor_upgraded` behaviour but does not specify the calling convention.

---

### S8-ST-14: `evaluateChurnIntervention` return type missing `riskFactors` — pattern #14

**Severity:** High
**Slice section:** `06-event-consumers.md` §10.2
**Upstream reference:** `02-churn-and-winback.md` §2.2

**Problem:** This is pattern #14 (content agent divergence). Two content files describe the same mechanism with contradictory assumptions about the return type.

§2.2 defines `ChurnInterventionResult` as:
```typescript
type ChurnInterventionResult =
  | { action: "show_retention_data"; data: { enquiries: number; views: number }; message: string }
  | { action: "accept"; reason: string }
  | { action: "grace_period"; duration: "14_days"; fallback: "downgrade_to_free" }
```

No `riskFactors` field exists on any variant.

§10.2 (`subscription_ended` handler) then does:
```typescript
const intervention = await evaluateChurnIntervention({ ... })
const allRiskFactors = [...riskFactors, ...intervention.riskFactors]
```

`intervention.riskFactors` does not exist on `ChurnInterventionResult`. The spread would produce a runtime error (cannot spread `undefined`). The handler separately computes `riskFactors` from the event payload `reason` field (checking for `payment_failure`), which is correct. The `intervention.riskFactors` access is the error — `evaluateChurnIntervention` is a retention UI decision, not a risk factor detector.

The §10.2 handler should use only the locally computed `riskFactors` array for the `churn_risk_detected` emission. The `evaluateChurnIntervention` call determines the retention UI action; risk factor detection is a separate concern handled in the handler itself.

**Fix — slice:**
- Section: `06-event-consumers.md` §10.2, the `handleSubscriptionEnded` function
- Old:
```typescript
    const intervention = await evaluateChurnIntervention({
      listingId,
      accountId,
      reason,
      previousTier,
    })
    // evaluateChurnIntervention returns { action, riskFactors, ... }
    // Handler does not re-derive the logic — §2 is authoritative

    // Emit churn_risk_detected if risk factors identified
    const allRiskFactors = [...riskFactors, ...intervention.riskFactors]
    if (allRiskFactors.length > 0) {
```
- New:
```typescript
    // Read engagement for retention evaluation — D&L §3.2
    const engagement = await getEngagementCounters(listingId)
    const subscriptionStartDate = await getSubscriptionStartDate(listingId) // listings.subscriptionStartDate via join (D1)

    const intervention = await evaluateChurnIntervention({
      listingId,
      accountId,
      cancellationReason: reason,
      previousTier,
      recentEngagement: engagement,
      subscriptionStartDate,
      lastChurnEventAt: null, // read from commercial_state if exists
    })
    // evaluateChurnIntervention returns { action: "show_retention_data" | "accept" | "grace_period" }
    // It determines the retention UI response — §2 is authoritative for that decision.
    // Risk factor detection is separate, handled below.

    // Emit churn_risk_detected if risk factors identified
    if (riskFactors.length > 0) {
```

Also fix the `evaluateChurnIntervention` call arguments. The current call passes `{ listingId, accountId, reason, previousTier }` but the §2.2 `ChurnInterventionInput` type requires 7 fields: `listingId`, `accountId`, `cancellationReason`, `previousTier`, `recentEngagement`, `subscriptionStartDate`, `lastChurnEventAt`. The call is missing 4 required fields. The fix above adds the missing reads and passes the full input.

**Fix — sibling specs:** None. §2.2 `ChurnInterventionResult` type is correct — it should not carry `riskFactors`.

**Acceptance criteria impact:**
- AC-14 (index.md §19): Wording already says "calls `evaluateChurnIntervention` with engagement data from `getEngagementCounters(listingId)`" which is correct but the §10.2 implementation does not perform this read. The fix aligns the implementation with the AC.
- AC-68 (index.md §19): Unaffected — tests `churn_risk_detected` emission for `payment_failure`, which is driven by the locally computed `riskFactors` array, not `intervention.riskFactors`.

---

### S8-ST-15: `shortlistCount` merge field semantic mismatch

**Severity:** Medium
**Slice section:** `01-conversion-triggers.md` §1.3 (action resolution for `analytics_teaser`)
**Upstream reference:** D&L §3.2 `EngagementCounters`

**Problem:** The `conversion_analytics_teaser` email template declares a merge field `shortlistCount`. The action resolution code (§1.3) populates it as:

```typescript
shortlistCount: ctx.engagement.searchAppearances, // search appearances as proxy for shortlists
```

D&L `EngagementCounters` (§3.2) returns: `{ profileViews, searchAppearances, enquiriesReceived, enquiryResponseRate?, enquiryResponseTime? }`. There is no `shortlistsCount` field. S8 maps `searchAppearances` to the `shortlistCount` merge field, but the comment "search appearances as proxy for shortlists" acknowledges these are different metrics.

The index.md §13 also declares the merge field as `shortlistCount`. The email template registered in PP §4.4 (`conversion_analytics_teaser`) will render this merge field label in the email. If the email says "Your listing was shortlisted X times" but the value is actually search appearances, the provider receives inaccurate information.

Two options: (a) rename the merge field to `searchAppearanceCount` to match the data, or (b) keep `shortlistCount` but source it from PP's buyer shortlist data (which S6 owns). Option (a) is correct for V1 — shortlist data requires a PP query that is not specified in S8.

**Fix — slice:**
- Section: `01-conversion-triggers.md` §1.3, the `analytics_teaser` action resolution
- Old:
```typescript
    case "analytics_teaser":
      return {
        type: "send_email",
        template: "conversion_analytics_teaser",
        mergeFields: {
          listingName: ctx.listingName,
          viewCount: ctx.engagement.profileViews,
          shortlistCount: ctx.engagement.searchAppearances, // search appearances as proxy for shortlists
          upgradeUrl: buildUpgradeUrl(ctx.listingId),
        },
      }
```
- New:
```typescript
    case "analytics_teaser":
      return {
        type: "send_email",
        template: "conversion_analytics_teaser",
        mergeFields: {
          listingName: ctx.listingName,
          viewCount: ctx.engagement.profileViews,
          searchAppearanceCount: ctx.engagement.searchAppearances,
          upgradeUrl: buildUpgradeUrl(ctx.listingId),
        },
      }
```

- Section: `01-conversion-triggers.md` §1.8, the `conversion_analytics_teaser` merge field table
- Old: `| `shortlistCount` | `number` | `engagements.searchAppearances` via D&L §3.2 |`
- New: `| `searchAppearanceCount` | `number` | `engagements.searchAppearances` via D&L §3.2 |`

- Section: `01-conversion-triggers.md` §1.8, the email send call
- Old: `data: { listingName, viewCount, shortlistCount, upgradeUrl },`
- New: `data: { listingName, viewCount, searchAppearanceCount, upgradeUrl },`

- Section: `index.md` §13, merge fields for `conversion_analytics_teaser`
- Old: `| `conversion_analytics_teaser` | Commercial Conversion | Analytics tease trigger (§1) | `listingName`, `viewCount`, `shortlistCount`, `upgradeUrl` | No |`
- New: `| `conversion_analytics_teaser` | Commercial Conversion | Analytics tease trigger (§1) | `listingName`, `viewCount`, `searchAppearanceCount`, `upgradeUrl` | No |`

**Fix — sibling specs:**
- Document: `platform-and-product.md` (v6)
- Section: §4.4, `conversion_analytics_teaser` template row (if merge fields are listed there — the template is registered but merge field names are not specified in the PP spec, so no PP-side change needed; the template renders whatever merge fields CR provides)

**Acceptance criteria impact:**
- AC-8 (index.md §19): Change `shortlistCount` to `searchAppearanceCount` in the AC text: "Merge fields for `conversion_analytics_teaser` include `listingName`, `viewCount`, `searchAppearanceCount`, `upgradeUrl`."

---

### S8-ST-16: P2 idempotency claim for append-only `churn_analysis_log`

**Severity:** Medium
**Slice section:** `index.md` §19 AC-80 / `06-event-consumers.md` §10 AC-10-17
**Upstream reference:** SI §1.4 P2 (idempotency)

**Problem:** AC-80 states: "All 8 consumer handlers are idempotent (P2). Duplicate event delivery produces the same outcome as single delivery. Specifically: `churn_analysis_log` entries are append-only but `commercial_state` upserts converge to the same final state regardless of replay count."

The `commercial_state` upsert convergence claim is correct — the `ON CONFLICT DO UPDATE` pattern produces the same final row state regardless of duplicate deliveries.

However, `churn_analysis_log` is append-only with no deduplication key. If `subscription_ended` fires twice for the same event (which can happen under at-least-once delivery), two identical churn rows are inserted. This inflates `churnRate30d` and `churnRate90d` in `RevenuePerception` (§5), which counts churn events in the period. The revenue perception computation double-counts the churn, producing inaccurate health signals.

P2 requires "duplicate event delivery produces the same outcome as single delivery." The append-only log does not satisfy this for revenue-affecting entries. The fix is to document the limitation honestly in the AC — `churn_analysis_log` is not strictly idempotent, but at V1 scale with an in-process event bus (no network-level duplicates), duplicates occur only on request retry. The risk is low but the AC claim should be qualified.

**Fix — slice:**
- Section: `index.md` §19, AC-80
- Old: `| AC-80 | All 8 consumer handlers are idempotent (P2). Duplicate event delivery produces the same outcome as single delivery. Specifically: `churn_analysis_log` entries are append-only but `commercial_state` upserts converge to the same final state regardless of replay count. | Integration |`
- New: `| AC-80 | All 8 consumer handlers satisfy P2 for `commercial_state` (upserts converge to the same final state regardless of replay count). `churn_analysis_log` is append-only with no dedup key — duplicate events produce duplicate rows. At V1 (in-process bus, no network duplicates), this is acceptable. If the bus migrates to Inngest (at-least-once delivery), add a `(listingId, eventType, idempotencyKey)` unique constraint where `idempotencyKey` is derived from the event payload hash. | Integration |`

- Section: `06-event-consumers.md` §10 AC-10-17
- Old: `**AC-10-17:** All 8 consumer handlers are idempotent (P2). Duplicate event delivery produces the same outcome as single delivery. Specifically: `churn_analysis_log` entries are append-only but `commercial_state` upserts converge to the same final state regardless of replay count.`
- New: `**AC-10-17:** All 8 consumer handlers satisfy P2 for `commercial_state` (upserts converge to the same final state regardless of replay count). `churn_analysis_log` is append-only with no dedup key — duplicate events produce duplicate rows. At V1 (in-process bus, no network duplicates), this is acceptable. Migration trigger: when bus moves to Inngest (at-least-once delivery), add a `(listingId, eventType, idempotencyKey)` unique constraint.`

**Fix — sibling specs:** None.

**Acceptance criteria impact:** AC-80 reworded (see above). Count unchanged.

---

### S8-ST-17: Cross-reference table stale on `getListingAnalytics` consumption

**Severity:** Low
**Slice section:** `index.md` cross-references / `04-revenue-perception.md` §5.6
**Upstream reference:** PP §3.1 `getListingAnalytics`

**Problem:** The `index.md` cross-reference table states:

> `platform-and-product.md` (v6 interface) | §3.1 `getListingAnalytics` query interface (consumed by §5)

And `00-router-plan.md` cross-references also state:

> `platform-and-product.md` (v6 interface) | §3.1 `getListingAnalytics` — consumed by `RevenuePerception` computation

However, §5 (`04-revenue-perception.md`) §5.6 cross-references table explicitly clarifies:

> `platform-and-product.md` (v6 interface) §3.1 | `getListingAnalytics` — **not consumed by §5 directly** (§5 uses aggregate queries, not per-listing analytics).

The data sources diagram in §5.6 confirms that `computeRevenuePerception` reads from `listings` table aggregate queries and `churn_analysis_log`, not from PP's `getListingAnalytics`. The `getListingAnalytics` query is consumed by CR for `EnquiryResponseInsights` computation (CR §5, the shared type) and win-back evaluation, but not by the `RevenuePerception` computation in §5.

The cross-reference in `index.md` and `00-router-plan.md` is inaccurate — it implies §5 calls `getListingAnalytics` directly.

**Fix — slice:**
- Section: `index.md` cross-references
- Old: `| `platform-and-product.md` (v6 interface) | §3.1 `getListingAnalytics` query interface (consumed by §5) |`
- New: `| `platform-and-product.md` (v6 interface) | §3.1 `getListingAnalytics` query interface (consumed by §3 win-back evaluation and CR `EnquiryResponseInsights` — not consumed by §5 `RevenuePerception`) |`

- Section: `00-router-plan.md` cross-references
- Old: `| `platform-and-product.md` (v6 interface) | §3.1 `getListingAnalytics` — consumed by `RevenuePerception` computation |`
- New: `| `platform-and-product.md` (v6 interface) | §3.1 `getListingAnalytics` — consumed by win-back evaluation (§3) and `EnquiryResponseInsights` (CR §5 shared type). Not consumed by `RevenuePerception` computation (§5). |`

**Fix — sibling specs:** None.

**Acceptance criteria impact:** None.

---

## Summary

S8 v1 is a well-structured domain-logic slice with strong D5 authority-split discipline that prevented most pattern #14 risks. Two High findings require fixes: (1) the `computeTaxonomyOverlap` calling convention passes listing IDs where the D&L export expects tag arrays — a compile-time type error that would block implementation; (2) the `subscription_ended` handler accesses `intervention.riskFactors` which does not exist on the `ChurnInterventionResult` type, a pattern #14 divergence between §2 and §10 that would crash at runtime. Both are localised to specific handler code and do not require structural changes.

The Medium findings are a misleading merge field name (`shortlistCount` sourced from `searchAppearances`) and a qualified P2 idempotency claim for the append-only log. Both are correctness hygiene, not structural gaps. The Low finding is a stale cross-reference. Three checks passed cleanly: `listing_archived` P1 payload consumption, `quality_score_changed` field access, and downstream flag accuracy.

### Downstream Flag Audit

| Flag | Status | Notes |
|------|--------|-------|
| S8-1 | Correct | Advanced revenue health — §5 provides foundation signals, S9 extends. Data sources documented. |
| S8-2 | Correct | Conversion-denominated friction — §6.3 documents V1 ticket-denominated approach with explicit S9 handoff for conversion attribution. |
| S8-3 | Correct | Learned churn prediction — §2.3 documents reactive V1 detection, S9 handoff for proactive periodic detection. Decision logs provide training data. |
| S8-4 | Correct | Multi-listing pricing — §5.5 / §9.4 document V1 per-listing stance with data foundation for S9 evaluation. |
| S8-5 | Correct | Sponsored placement learning — §4.9 / §4.10 document decision logging with explicit S9 learning targets. |

### Sibling Spec Changes Required

| Document | Section | Change | Source Scenario |
|----------|---------|--------|-----------------|
| (none) | — | No sibling spec changes required from Part B findings | — |

All fixes are slice-internal. The D&L `computeTaxonomyOverlap` signature is correct as specified; S8 must adapt its calling code. The `ChurnInterventionResult` type in §2 is correct; §10 must stop accessing a non-existent field. No interface spec amendments needed.
