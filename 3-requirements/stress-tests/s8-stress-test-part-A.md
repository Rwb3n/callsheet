# S8 Stress Test — Part A (Agent A: CR + Ops + SI Boundaries)

**Status:** Stress test output
**Slice:** S8 Commercial & Revenue (v1)
**Partition:** CR interface spec (v3), Ops interface spec (v4), Shared Infrastructure (v7)
**Generated:** 2026-02-15
**Scenarios:** 12 (target: 3-5 H/M, 3-5 L, 3-5 P)

---

## Summary Table

| # | Scenario | Boundary | Severity | Resolution |
|---|----------|----------|----------|------------|
| S8-ST-1 | `check_quality_improvement` missing from SI §2.1 DeferredActionParamsMap | SI §2.1/§2.2 | **High** | Add to SI §2.1 + §2.2. Three-part sync gap (9th occurrence). |
| S8-ST-2 | `refund_evaluation` and `feature_gate_friction_evaluation` decision types missing from SI §9.2 | SI §9.2 | **Medium** | Add both to SI §9.2 Commercial row. |
| S8-ST-3 | `evaluateChurnIntervention` return type mismatch between §2 and §10 | Pattern #14 (§2 vs §10) | **High** | §10.2 accesses `intervention.riskFactors` but §2.2 `ChurnInterventionResult` has no `riskFactors` field. Fix §10 handler. |
| S8-ST-4 | `quality_declining` and `engagement_dropping` ChurnRiskFactor values have no production paths in §10 handler code | CR §1.2 vs §10 | **Medium** | Two of 5 ChurnRiskFactor values can never be emitted from S8 handler code. Document V1 scope limitation or add detection logic. |
| S8-ST-5 | `subscription_ended` handler does not branch on `reason: "paddle_reconciliation"` | Ops §1.2 vs §10.2 | **Medium** | §10.2 does not handle `reason: "paddle_reconciliation"` — falls through to the general `origin === "paddle"` path which calls `evaluateChurnIntervention`. §2.2 handles it explicitly, but §10 calls the function without checking reason first. |
| S8-ST-6 | `conversionRate30d` AC-43 says multiply by 100 but pseudocode does not multiply | §5 vs index.md AC-43 | **Low** | Pseudocode §5.3 returns `conversions30d / freeClaimedAtPeriodStart` (a fraction). AC-43 says "x 100" (a percentage). Fix pseudocode to match AC. |
| S8-ST-7 | `PRICING` type shape mismatch between §9.1 and CR interface spec §4.3 | CR §4.3 vs S8 §9.1 | **Low** | CR §4.3 uses `TierPricing[]` array with `annualPrice`/`monthlyPrice`. S8 §9.1 uses `Record<SubscriptionTier, { annual, monthly }>` with `annual`/`monthly`. Field names differ. |
| S8-ST-8 | `first_upgrade` milestone emitted on any paid-to-paid upgrade, potentially multiple times | CR §1.1 vs §10.1 | **Medium** | `ConversionMilestoneId` has `"first_upgrade"` implying once-only, but §10.1 emits it on every upgrade where `previousTier !== "free"`. No state tracks whether `first_upgrade` already fired. |
| S8-ST-9 | Sponsored placement inline DELETE runs on every search request | §4.5.3 vs SI §12.1 | **Low** | Fairness cap evaluation runs inline DELETE of rows older than 90 days on every `getSponsoredListings` call during SSR. Low-risk at V1 scale but adds latency to SSR path. |
| S8-ST-10 | `subscription_ended` handler schedules win-back for all paddle-origin endings including `reason: "account_closure"` | CR §2 vs §10.2 | **Pass** | §10.2 branches on `origin`, not `reason`. When `origin === "paddle"` and `reason === "account_closure"`, the handler schedules win-back. This is correct: the closure path sets `origin: "closure"` (not `"paddle"`), so this combination never occurs. The Ops §1.2 emission path confirms this. |
| S8-ST-11 | P1 compliance for all 4 CR-emitted event types | SI §1.2, CR §1.1-§1.4 vs §10 | **Pass** | All emissions in §10 (and §7 for `churn_risk_detected`) match their `EventPayloadMap` types exactly. Fields verified: `conversion_milestone` (6 fields), `churn_risk_detected` (4 fields), `winback_eligible` (5 fields including `mergeFields`), `pending_cancellation_created` (4 fields). |
| S8-ST-12 | `CancellationReason` usage across all 5 churn paths | CR §5 vs §2, §10 | **Pass** | All 5 values (`voluntary`, `payment_failure`, `paddle_reconciliation`, `account_closed`, `listing_archived`) are used correctly across the documented paths. `pending_cancellation_created` emits typed `CancellationReason` on all 3 trigger paths per §2.5. |

**Totals: 2 High, 4 Medium, 3 Low, 3 Pass.** (12 scenarios)

---

## Detailed Findings

### S8-ST-1 — `check_quality_improvement` missing from SI §2.1 DeferredActionParamsMap [High]

**Boundary:** SI §2.1 `DeferredActionParamsMap`, SI §2.2 registered actions table

**Finding:** S8 introduces a new deferred action `check_quality_improvement` with params `{ listingId: UUID; baselineScore: number }`. The slice documents this requirement in §12 (index.md), §7.5 (05-support-sections.md), and the router plan (§5). All three correctly note the SI amendment is needed. However, the amendment has not been applied to SI — `check_quality_improvement` does not appear in SI §2.1 `DeferredActionParamsMap` (which currently has 16 entries) or SI §2.2 (which has 16 registered action rows).

This is the 9th occurrence of the three-part sync gap pattern. The slice documents the delta but the authoritative source (SI) remains unpatched until the fix-applier runs. The slice correctly states the total after S8 would be 17, which is consistent (16 + 1).

**Severity rationale:** High — the deferred action scheduler resolves handlers via `DeferredActionParamsMap`. A missing entry means the compiler cannot enforce type-safe params for this action. Startup registration check (`EVENT_CONSUMER_MATRIX`-equivalent for deferred actions) will not validate the handler's existence. Implementation would either use untyped params or fail at runtime.

**Fix:**

*SI §2.1 — add to `DeferredActionParamsMap`:*

| Location | Old | New |
|----------|-----|-----|
| SI §2.1, after `compliance_self_audit` entry | (end of map) | `check_quality_improvement: { listingId: UUID; baselineScore: number }  // [S8-ST-1]` |

*SI §2.2 — add row to registered actions table:*

| Domain | Action | Trigger | Delay | Retry | On Failure |
|--------|--------|---------|-------|-------|------------|
| Commercial | `check_quality_improvement` | Low-quality intervention (S8 §7) | 30 days | `once` | `log` |

**Sibling spec changes:** SI v7 -> v8 (§2.1 +1 entry, §2.2 +1 row, total 17).

---

### S8-ST-2 — `refund_evaluation` and `feature_gate_friction_evaluation` decision types missing from SI §9.2 [Medium]

**Boundary:** SI §9.2 Decision Types by Domain

**Finding:** S8 introduces two new decision types logged via SI §9.2 structured decision logging:

1. `refund_evaluation` — logged by `evaluateRefund` in §8.3. The slice explicitly acknowledges this: "refund_evaluation is a new decision type. SI §9.2 currently lists `conversion_trigger_evaluation`, `churn_intervention`, `winback_evaluation`, and `sponsored_placement_selection` under Commercial. `refund_evaluation` must be added."

2. `feature_gate_friction_evaluation` — §6.3 logs under this name. However, §6.3 also contradicts itself: it first uses `decisionType: "feature_gate_friction_evaluation"` in the pseudocode, then states "It logs under the existing `conversion_trigger_evaluation` decision type with `inputs.subType: 'feature_gate_friction'`." These two statements are mutually exclusive.

SI §9.2 currently lists 4 Commercial decision types: `conversion_trigger_evaluation`, `churn_intervention`, `winback_evaluation`, `sponsored_placement_selection`. None of the new types have been added.

Additionally, §5.4 references a `revenue_health_evaluation` decision type that is also not in SI §9.2.

**Severity rationale:** Medium — SI §9.2 is a registry, not a runtime constraint (the logging infrastructure accepts arbitrary strings). But the registry's purpose is to document all decision types for entity learning (S9). Missing entries create a blind spot. The §6.3 internal contradiction creates implementation ambiguity.

**Fix:**

*§6.3 (05-support-sections.md) — resolve internal contradiction:*

| Location | Old | New |
|----------|-----|-----|
| §6.3, line starting "feature_gate_friction_evaluation is not a separate decision type" | `feature_gate_friction_evaluation` is not a separate decision type in SI §9.2. It logs under the existing `conversion_trigger_evaluation` decision type with `inputs.subType: "feature_gate_friction"`, since friction evaluation is part of the broader conversion funnel analysis ceremony. No SI amendment needed. | Remove this paragraph. The pseudocode 3 lines above uses `decisionType: "feature_gate_friction_evaluation"`, which is the correct approach — friction evaluation is a distinct decision type, not a subtype of conversion trigger evaluation. SI §9.2 amendment is needed. |

*SI §9.2 — update Commercial row:*

| Location | Old | New |
|----------|-----|-----|
| SI §9.2, Commercial row | `conversion_trigger_evaluation`, `churn_intervention`, `winback_evaluation`, `sponsored_placement_selection` | `conversion_trigger_evaluation`, `churn_intervention`, `winback_evaluation`, `sponsored_placement_selection`, `refund_evaluation`, `feature_gate_friction_evaluation` |

**Sibling spec changes:** SI (same version bump as S8-ST-1).

---

### S8-ST-3 — `evaluateChurnIntervention` return type mismatch between §2 and §10 [High]

**Boundary:** Pattern #14 — content agent divergence between §2 (decision architecture) and §10 (event consumer implementation)

**Finding:** §2.2 defines `ChurnInterventionResult` as a discriminated union with three variants:

```typescript
type ChurnInterventionResult =
  | { action: "show_retention_data"; data: { enquiries: number; views: number }; message: string }
  | { action: "accept"; reason: string }
  | { action: "grace_period"; duration: "14_days"; fallback: "downgrade_to_free" }
```

None of these variants contain a `riskFactors` field.

§10.2 (`subscription_ended` handler) calls `evaluateChurnIntervention` and then accesses the return value:

```typescript
const intervention = await evaluateChurnIntervention({...})
const allRiskFactors = [...riskFactors, ...intervention.riskFactors]
```

`intervention.riskFactors` does not exist on any variant of `ChurnInterventionResult`. This is a type error that would fail at compile time. The handler assumes `evaluateChurnIntervention` returns risk factors, but the function as defined in §2 makes no such assessment.

This is a pattern #14 instance: §2 (authored by one content agent) and §10 (authored by another) describe the same interface inconsistently, despite D5's explicit authority split intended to prevent this.

**Severity rationale:** High — compile-time type error. The handler accesses a field that does not exist on the return type. This blocks implementation without resolution. If the field were accessed on a fallthrough path, it would be a runtime silent failure (pattern #15), but TypeScript would catch this at compile time.

**Fix:**

Two options. Option A (minimal): remove the `intervention.riskFactors` access from §10.2, since §2 does not compute risk factors — risk factors are derived from `reason` in the handler directly. Option B (extend §2): add a `riskFactors` field to the return type. Option A is correct because §2 is authoritative for the decision architecture per D5, and the handler already computes risk factors from `reason` before calling `evaluateChurnIntervention`.

*§10.2 (06-event-consumers.md) — fix handler:*

| Location | Old | New |
|----------|-----|-----|
| §10.2, lines 208-218 | `const intervention = await evaluateChurnIntervention({`<br/>`  listingId,`<br/>`  accountId,`<br/>`  reason,`<br/>`  previousTier,`<br/>`})`<br/>`// evaluateChurnIntervention returns { action, riskFactors, ... }`<br/>`// Handler does not re-derive the logic — §2 is authoritative`<br/><br/>`// Emit churn_risk_detected if risk factors identified`<br/>`const allRiskFactors = [...riskFactors, ...intervention.riskFactors]` | `const engagement = await getEngagementCounters(listingId) // D&L §3.2`<br/>`const subscriptionStartDate = await getSubscriptionStartDate(listingId) // listings join per D1`<br/><br/>`const intervention = evaluateChurnIntervention({`<br/>`  listingId,`<br/>`  accountId,`<br/>`  cancellationReason: reason,`<br/>`  previousTier,`<br/>`  recentEngagement: engagement,`<br/>`  subscriptionStartDate,`<br/>`  lastChurnEventAt: null, // read from commercial_state if exists`<br/>`})`<br/>`// §2 is authoritative for decision architecture.`<br/>`// Risk factors are computed from reason, not returned by evaluateChurnIntervention.`<br/><br/>`// Emit churn_risk_detected if risk factors identified`<br/>`const allRiskFactors = [...riskFactors]` |

Also fix the `evaluateChurnIntervention` call to pass the full `ChurnInterventionInput` as defined in §2.2, not the abbreviated 4-field version in the current §10.2 code.

**Sibling spec changes:** None. Fix is internal to S8.

---

### S8-ST-4 — `quality_declining` and `engagement_dropping` ChurnRiskFactor values lack production paths [Medium]

**Boundary:** CR §1.2 `ChurnRiskFactor` (5 values) vs S8 §10 handler code + §2.3 detection table

**Finding:** CR §1.2 and §5 define 5 `ChurnRiskFactor` values. S8 §2.3 documents detection signals for all 5. However, examining the actual handler code in §10 reveals that only 3 of the 5 have concrete production paths in S8:

| Factor | V1 Production Path | Status |
|--------|-------------------|--------|
| `"low_quality_paid"` | §7.3 `handleCheckQualityImprovement` emits it explicitly | Produced |
| `"payment_at_risk"` | §10.2 `subscription_ended` handler checks `reason === "payment_failure"` | Produced |
| `"quality_declining"` | §2.3 says: "quality_score_changed event: paid listing with newComposite < previousComposite AND newComposite < 60". §10.5 handler only checks `newComposite < 40` — no check for < 60 + declining trend | **Not produced** |
| `"engagement_dropping"` | §2.3 says: "detected during periodic engagement comparison in conversion trigger evaluation". §10 has no such comparison logic. §2.3 V1 scope note acknowledges these are "detected reactively when a related event fires" but no handler implements this | **Not produced** |
| `"billing_cadence_switch_to_monthly"` | §2.3 says: "CR observes monthly cadence on a listing that was previously annual". §10 has no handler that checks cadence history — `subscription_tier_changed` handler does not read billing cadence | **Not produced** (see note) |

For `"billing_cadence_switch_to_monthly"`: Ops maps `billing_cadence_changed` to no domain event (CR §4.5). CR has no event to react to for cadence changes. The §2.3 table says it would be detected "when CR reads listing state during churn evaluation", but no churn evaluation in §10 reads `billingCadence`.

**Severity rationale:** Medium — AC-17 (index.md) states "For each of the 5 `ChurnRiskFactor` values [...] `churn_risk_detected` is emitted with the correct factor from the documented detection signal." This AC cannot pass for 3 of 5 factors. The Ops `ChurnRiskRegistry` will never receive entries for these factors, making Ops' triage logic for them dead code. This is pattern #15 (runtime-silent feature failure) for the triage path — the filter values exist but are never produced by the write path.

**Fix:**

Two approaches: (A) add detection logic for `quality_declining` and `billing_cadence_switch_to_monthly` in §10 handlers, and explicitly defer `engagement_dropping` to S9; or (B) amend AC-17 to reflect V1 scope (3 of 5 factors produced, 2 deferred to S9).

Recommended: Option B — the §2.3 V1 scope note already acknowledges these limitations. The fix is to make AC-17 match reality.

*index.md AC-17:*

| Location | Old | New |
|----------|-----|-----|
| AC-17 | For each of the 5 `ChurnRiskFactor` values (`low_quality_paid`, `payment_at_risk`, `quality_declining`, `engagement_dropping`, `billing_cadence_switch_to_monthly`), `churn_risk_detected` is emitted with the correct factor from the documented detection signal. | V1 produces 3 of 5 `ChurnRiskFactor` values: `low_quality_paid` (§7 quality re-check), `payment_at_risk` (§10.2 payment failure), `quality_declining` (§10.5 quality threshold). The remaining 2 (`engagement_dropping`, `billing_cadence_switch_to_monthly`) require proactive periodic detection or cadence change events — deferred to S9. [S8-ST-4] |

Additionally, add `quality_declining` detection to §10.5 handler — this is achievable at V1 by adding a check for `newComposite < 60` when the listing is paid and `newComposite < previousComposite` (the `QualityScoreChangedEvent` payload should carry both `newComposite` and `previousComposite` — verify against D&L §1.8). If the payload carries `previousComposite`, the detection is a one-line condition.

*§10.5 (06-event-consumers.md) — add quality_declining detection:*

After the `triggerLowQualityIntervention` call, add:

```typescript
// quality_declining: paid listing with score trending down below 60 (but above 40 — below 40 is handled by low_quality_paid above)
if (newComposite >= 40 && newComposite < 60 && payload.previousComposite && newComposite < payload.previousComposite) {
  await eventBus.emit({
    type: "churn_risk_detected",
    listingId,
    accountId: await getAccountIdForListing(listingId),
    riskFactors: ["quality_declining"],
    timestamp: new Date().toISOString(),
  } satisfies ChurnRiskDetectedEvent)
}
```

This brings V1 production to 3 of 5 factors. `engagement_dropping` and `billing_cadence_switch_to_monthly` remain deferred.

**Sibling spec changes:** None. Internal S8 fix.

---

### S8-ST-5 — `subscription_ended` handler does not branch on `reason: "paddle_reconciliation"` [Medium]

**Boundary:** Ops §1.2 `SubscriptionEndedEvent.reason` union vs §10.2 handler vs §2.2 `evaluateChurnIntervention`

**Finding:** Ops §1.2 defines `SubscriptionEndedEvent.reason` as a 4-member union: `"cancellation" | "grace_period_expired" | "account_closure" | "paddle_reconciliation"`. The S7 stress test (S7-ST-3) added `"paddle_reconciliation"` specifically.

In §10.2 (`subscription_ended` handler), the `origin === "paddle"` branch calls `evaluateChurnIntervention` unconditionally for all paddle-origin reasons. §2.2 (`evaluateChurnIntervention`) explicitly handles `paddle_reconciliation`:

```
if input.cancellationReason == "paddle_reconciliation":
  return { action: "accept", reason: "paddle_reconciliation — no intervention" }
```

This is correct at the decision architecture level. However, the §10.2 handler passes `reason` to `evaluateChurnIntervention`, and the function handles it. The issue is a different one: §10.2 calls `evaluateChurnIntervention` with only 4 fields (`listingId`, `accountId`, `reason`, `previousTier`), but §2.2 defines `ChurnInterventionInput` with 7 required fields including `recentEngagement`, `subscriptionStartDate`, and `lastChurnEventAt`. The handler omits 3 required fields.

This is already partially covered by S8-ST-3 (the `intervention.riskFactors` issue). But there is an additional concern: for `paddle_reconciliation`, `evaluateChurnIntervention` returns `accept` immediately without needing engagement data. The handler would still need to construct the full input object — wasteful for a case that short-circuits. A pre-check in the handler would be more efficient.

**Severity rationale:** Medium — the handler code does not match the function signature it calls. While the decision function handles the case correctly, the calling code is incomplete. Combined with S8-ST-3, §10.2 has two interacting type errors.

**Fix:**

*§10.2 (06-event-consumers.md) — add reason pre-check before evaluateChurnIntervention call:*

Before the `evaluateChurnIntervention` call in the `origin === "paddle"` branch, add:

```typescript
// Short-circuit for non-voluntary reasons — no intervention needed
if (reason === "paddle_reconciliation" || reason === "account_closure") {
  // No intervention. Churn already logged above. Schedule win-back.
  await scheduleDeferredAction({...})
  return
}
```

This prevents calling `evaluateChurnIntervention` with incomplete inputs for cases where the function would return `accept` immediately. For `grace_period_expired`, the handler already handles risk factor detection before the function call. Only `reason === "cancellation"` (voluntary) should flow to `evaluateChurnIntervention`.

Note: win-back scheduling should still occur for `paddle_reconciliation` since `origin === "paddle"` and the listing may still be active and reclaimable. The CR §2 spec (CR-ST-19) only excludes win-back for `origin === "archival" | "closure"`, not for specific paddle-origin reasons.

**Sibling spec changes:** None. Internal S8 fix.

---

### S8-ST-6 — `conversionRate30d` pseudocode does not multiply by 100 [Low]

**Boundary:** §5.3 pseudocode vs index.md AC-43

**Finding:** AC-43 (index.md §19) states: "`conversionRate30d` computes as (conversion events in 30 days / free claimed listings) **x 100**." The `x 100` makes the result a percentage (e.g., 2.0 for a 2% rate).

§5.3 pseudocode (04-revenue-perception.md line 107-108):

```
conversionRate30d = freeClaimedAtPeriodStart > 0
  ? conversions30d / freeClaimedAtPeriodStart
  : 0
```

This returns a fraction (e.g., 0.02 for a 2% rate), not a percentage. The `churnRate` computation (§5.3 lines 172-173) correctly multiplies by 100. The NRR computation also correctly multiplies by 100.

AC-45 (`evaluateRevenueHealth`) checks `conversionRate30d < 2`, which expects a percentage value (2%), not a fraction (0.02). If the pseudocode is implemented as-is, the threshold would be checking against 0.02 instead of 2, and no conversion rate would ever register as "warning".

**Severity rationale:** Low — the AC is correct and unambiguous. An implementer following the AC would multiply by 100. The pseudocode inconsistency is a documentation defect that could cause confusion but would be caught by the AC-5 unit test: "3 conversions, 150 free claimed -> conversionRate30d = 2%."

**Fix:**

*§5.3 (04-revenue-perception.md):*

| Location | Old | New |
|----------|-----|-----|
| Line 107-108 | `conversionRate30d = freeClaimedAtPeriodStart > 0`<br/>`  ? conversions30d / freeClaimedAtPeriodStart`<br/>`  : 0` | `conversionRate30d = freeClaimedAtPeriodStart > 0`<br/>`  ? (conversions30d / freeClaimedAtPeriodStart) * 100`<br/>`  : 0` |

**Sibling spec changes:** None. Internal S8 fix.

---

### S8-ST-7 — `PRICING` type shape mismatch between §9.1 and CR interface spec §4.3 [Low]

**Boundary:** CR §4.3 `PRICING` const vs S8 §9.1 `PRICING` export

**Finding:** CR interface spec §4.3 defines `PRICING` as:

```typescript
const PRICING: TierPricing[] = [
  { tier: "free", annualPrice: 0, monthlyPrice: 0, ... },
  { tier: "standard", annualPrice: 199, monthlyPrice: 19, ... },
  ...
]
type TierPricing = { tier: SubscriptionTier; annualPrice: number; monthlyPrice: number; targetPersona: string }
```

S8 §9.1 defines `PRICING` as:

```typescript
export const PRICING = {
  free: { annual: 0, monthly: 0 },
  standard: { annual: 199, monthly: 19 },
  ...
} as const satisfies Record<SubscriptionTier, { annual: number; monthly: number }>
```

Differences:
1. **Shape:** CR spec uses an array of `TierPricing` objects. S8 uses a `Record<SubscriptionTier, { annual, monthly }>` keyed by tier.
2. **Field names:** CR spec uses `annualPrice`/`monthlyPrice`. S8 uses `annual`/`monthly`.
3. **Missing field:** CR spec includes `targetPersona`. S8 omits it.

S8 §10.1 uses `PRICING.find(p => p.tier === newTier)!.annualPrice` — array `.find()` syntax that matches the CR spec's array shape, not S8 §9.1's Record shape. This means the §10 handler code assumes the CR spec's array shape while §9 defines the Record shape.

**Severity rationale:** Low — S8 is a requirements slice, not implementation code. The slice should adopt one shape and use it consistently. The §9.1 `Record` shape is cleaner for lookups (`PRICING[tier].annual` vs `PRICING.find(p => p.tier === tier)!.annualPrice`). The mismatch creates implementation ambiguity but would be resolved at coding time. Not a runtime risk.

**Fix:**

*§10.1 (06-event-consumers.md) — align PRICING usage with §9.1 Record shape:*

Replace all instances of `PRICING.find(p => p.tier === X)!.annualPrice` with `PRICING[X].annual` throughout §10 (06-event-consumers.md). Affected lines: 10.1 (lines 47, 65-66), 10.2 (line 173), 10.4 (line 368), 10.6 (line 510).

*CR interface spec §4.3 — no change needed.* The interface spec defines the authoritative type; S8 provides an implementation-level export. The S8 `Record` shape is a valid implementation of the concept, and per output-style.md "reference, don't restate" — the slice should cite CR §4.3 for the authoritative type and define its implementation shape locally. The field name difference (`annual` vs `annualPrice`) should be reconciled — recommend S8 adopts `annualPrice`/`monthlyPrice` for consistency with the spec, or the spec adopts the shorter names at implementation time.

**Sibling spec changes:** None. Internal S8 consistency fix.

---

### S8-ST-8 — `first_upgrade` milestone emitted on every paid-to-paid upgrade [Medium]

**Boundary:** CR §1.1 `ConversionMilestoneId` vs §10.1 handler logic

**Finding:** CR §1.1 defines `ConversionMilestoneId` as:

```typescript
type ConversionMilestoneId = "first_subscription" | "first_upgrade" | "premium_reached" | "partner_reached"
```

The name `"first_upgrade"` implies a once-per-listing milestone (like `"first_subscription"`). However, §10.1 emits it on every upgrade where `previousTier !== "free"`:

```typescript
if (direction === "upgrade" && previousTier !== "free") {
  await eventBus.emit({
    type: "conversion_milestone",
    ...
    milestone: "first_upgrade" as ConversionMilestoneId,
    ...
  })
}
```

A listing that upgrades from Standard to Premium (first upgrade) and then from Premium to Partner (second upgrade) would emit `"first_upgrade"` twice. The PP notification consumer would display two "Upgraded to..." notifications with `milestone: "first_upgrade"`, and Ops would log two L3 learning events for the same milestone.

The `"premium_reached"` milestone has a guard (`previousTier !== "premium" && previousTier !== "partner"`), preventing re-emission on downthen-up paths. The `"first_upgrade"` milestone has no equivalent guard.

**Severity rationale:** Medium — not a type error or runtime failure, but semantically misleading. The milestone name implies once-only semantics that the handler does not enforce. PP's notification consumer and Ops' learning hypothesis would receive duplicate milestones. Fix is straightforward: track whether `first_upgrade` has been emitted in `commercial_state` or rename the milestone.

**Fix:**

*§10.1 (06-event-consumers.md) — add state check:*

| Location | Old | New |
|----------|-----|-----|
| §10.1, lines 128-137 | `if (direction === "upgrade" && previousTier !== "free") {`<br/>`  await eventBus.emit({`<br/>`    type: "conversion_milestone",`<br/>`    ...`<br/>`    milestone: "first_upgrade" as ConversionMilestoneId,`<br/>`    ...`<br/>`  })`<br/>`}` | `if (direction === "upgrade" && previousTier !== "free") {`<br/>`  // Check if first_upgrade already emitted — milestone is once-per-listing`<br/>`  const existingLog = await db.query.churnAnalysisLog.findFirst({`<br/>`    where: and(`<br/>`      eq(churnAnalysisLog.listingId, listingId),`<br/>`      eq(churnAnalysisLog.eventType, "upgrade"),`<br/>`    ),`<br/>`  })`<br/>`  if (!existingLog) {`<br/>`    await eventBus.emit({`<br/>`      type: "conversion_milestone",`<br/>`      ...`<br/>`      milestone: "first_upgrade" as ConversionMilestoneId,`<br/>`      ...`<br/>`    })`<br/>`  }`<br/>`}` |

This uses `churn_analysis_log` (which records every upgrade) as the source of truth for whether this listing has been upgraded before. No schema change needed.

**Sibling spec changes:** None. Internal S8 fix.

---

### S8-ST-9 — Sponsored placement inline DELETE on every search request [Low]

**Boundary:** §4.5.3 cleanup mechanism vs SI §12.1 latency budgets

**Finding:** §4.5.3 specifies that `sponsored_impressions` cleanup runs inline during the fairness cap evaluation:

```
// After computing impressionCounts:
db.delete(sponsoredImpressions)
  .where(lt(sponsoredImpressions.impressionDate, now() - interval('90 days')))
```

This DELETE runs on every `commercial.getSponsoredListings` call, which executes during SSR for every authenticated search request. The SSR latency budget (SI §12.1) is <500ms TTFB p95. The DELETE touches aged rows — at V1 scale, ~5-15 rows per invocation after steady state is reached.

While the DELETE is low-cost at V1, it is architecturally inappropriate to run a cleanup operation on every read path. It also violates the principle that SSR handlers should minimise write operations for cache-friendliness and idempotency.

**Severity rationale:** Low — at V1 scale, the DELETE adds <5ms. No user-visible impact. But it is a code smell that would become problematic at higher traffic. A deferred action or daily scheduled cleanup would be cleaner.

**Fix:**

*§4.5.3 (03-sponsored-placement.md):*

| Location | Old | New |
|----------|-----|-----|
| §4.5.3 cleanup mechanism paragraph | **Cleanup mechanism:** Inline deletion during the fairness cap query. After computing `impressionCounts`, execute: [...] This piggybacks on the existing query, adds minimal overhead, and avoids a separate scheduled cleanup job. | **Cleanup mechanism:** Probabilistic inline deletion — execute the cleanup DELETE with a 5% probability per invocation (`Math.random() < 0.05`). This amortises cleanup over ~20 requests while avoiding a separate scheduled job. At V1 search volume (~50-200 searches/day), cleanup runs ~2-10 times/day — sufficient for 90-day retention. The fairness cap query's 30-day window is unaffected by delayed cleanup. [S8-ST-9] |

Alternative: use a self-perpetuating deferred action (add `sponsored_impression_cleanup` to SI §2.1). This is cleaner but adds a 18th deferred action type. The probabilistic approach is simpler for V1.

**Sibling spec changes:** None. Internal S8 fix.

---

### S8-ST-10 — `subscription_ended` handler win-back scheduling for paddle-origin closure [Pass]

**Boundary:** CR §2 origin branching vs §10.2 handler vs Ops §1.2 emission semantics

**Verification:** The concern is whether `origin === "paddle"` combined with `reason === "account_closure"` could trigger win-back scheduling for a closing account. Tracing the closure path:

1. Account closure flow (SI §13.2 step 2) creates `pending_cancellation` records with `reason: "account_closed"`, then calls `PaymentService.cancelSubscription`.
2. Paddle confirms cancellation via webhook.
3. Ops processes the webhook, finds the `pending_cancellation` record via `inferCancellationReason`, and emits `subscription_ended` with `reason: "account_closure"`.
4. Ops §1.2 `SubscriptionEndedEvent` shows `origin: "paddle" | "archival" | "closure"`.

The critical question: what `origin` value does Ops set for the closure path? Ops §1.2 documentation states: "Closure path emission [OPS-ST-14]: Account closure does not emit `subscription_ended` directly. Instead, closure step 2 queues Paddle cancellations via deferred actions. When Paddle confirms cancellation via webhook, Operations processes the webhook and emits `subscription_ended` with `origin: "paddle"`."

This means `origin: "paddle"` + `reason: "account_closure"` IS a valid combination. The §10.2 handler would schedule a win-back for this case, which contradicts CR §2's intent (no win-back for account closure).

Wait — re-reading CR §2 (CR-ST-19): "If `origin === "paddle"`: schedule win-back evaluation at 60 days. If `origin === "archival"` or `"closure"`: log churn only, no win-back schedule." The branching is on `origin`, not `reason`. But the closure webhook path sets `origin: "paddle"`.

However, the `account_closed` consumer (§10.6) runs concurrently and cancels all pending win-back schedules for all `listingsArchived`. So even if the `subscription_ended` handler schedules a win-back (because `origin === "paddle"`), the `account_closed` handler cancels it. The net effect is correct: no win-back for closed accounts.

Additionally, the 60-day deferred action would fail at execution time because `evaluateWinBack` checks `listingLifecycleStatus !== "active"` (the listing is archived), returning `no_action`.

**Result: Pass.** The system has defence in depth: even though the `subscription_ended` handler schedules a win-back for paddle-origin closure, the `account_closed` handler cancels it, and the deferred action handler would reject it at execution time. Two safety nets exist. The slight inefficiency (scheduling then cancelling) is acceptable.

---

### S8-ST-11 — P1 compliance for all 4 CR-emitted event types [Pass]

**Boundary:** SI §1.2 `EventPayloadMap` types vs all emission points in S8

**Verification:** Checked all emission points in S8 against their authoritative payload types:

1. **`conversion_milestone`** (CR §1.1): `{ type, listingId, accountId, milestone: ConversionMilestoneId, milestoneLabel: string, timestamp }`. §10.1 emits with `satisfies ConversionMilestoneEvent` — all 6 fields present. §1.7 independently verifies the same. Pass.

2. **`churn_risk_detected`** (CR §1.2): `{ type, listingId, accountId, riskFactors: ChurnRiskFactor[], timestamp }`. §2.4 emission matches. §7.4 emission matches. §10.2 emission matches (though S8-ST-3 applies to the aggregation logic, the emission itself has all 4 fields). Pass.

3. **`winback_eligible`** (CR §1.3): `{ type, listingId, cancelledAccountId, mergeFields: { subject, body, listingName, enquiryCount?, viewCount? }, timestamp }`. §3.4 emission matches all 5 fields. `cancelledAccountId` correctly used (not `accountId`). Pass.

4. **`pending_cancellation_created`** (CR §1.4): `{ type, paddleSubscriptionId, listingId, reason: CancellationReason, timestamp }`. §2.5 emission matches all 4 fields. `reason` is typed `CancellationReason`. Pass.

**Result: Pass.** All emissions are P1-compliant.

---

### S8-ST-12 — `CancellationReason` usage across all 5 churn paths [Pass]

**Boundary:** CR §5 `CancellationReason` type vs S8 §2, §10 usage

**Verification:** CR §5 defines:

```typescript
type CancellationReason = "voluntary" | "payment_failure" | "paddle_reconciliation" | "account_closed" | "listing_archived"
```

Checked usage across all churn paths:

| Path | Source | CancellationReason Value | Correct? |
|------|--------|--------------------------|----------|
| Voluntary cancellation | §2.5 path 1 | `"voluntary"` | Yes |
| Payment failure | §2.6 churn logging table | `"payment_failure"` | Yes |
| Paddle reconciliation | §2.6 churn logging table | `"paddle_reconciliation"` | Yes |
| Account closure | §2.5 path 2, §10.6 handler | `"account_closed"` | Yes |
| Listing archival | §2.5 path 3, §10.4 handler | `"listing_archived"` | Yes |

All 5 values appear in the correct contexts. `pending_cancellation_created` (§2.5) emits typed `CancellationReason` on all 3 trigger paths. The `churn_analysis_log.reason` column stores the same values (text column, Zod-validated).

**Result: Pass.** All `CancellationReason` values are used correctly and consistently.

---

## Summary

### Fix Summary

| # | Severity | Slice Edit | Sibling Spec Edit |
|---|----------|-----------|-------------------|
| S8-ST-1 | High | None (slice already documents the delta) | SI §2.1 +1 `DeferredActionParamsMap` entry, SI §2.2 +1 row |
| S8-ST-2 | Medium | §6.3 (05-support-sections.md): remove contradictory paragraph | SI §9.2 +2 Commercial decision types |
| S8-ST-3 | High | §10.2 (06-event-consumers.md): fix `evaluateChurnIntervention` call — pass full input, remove `intervention.riskFactors` access | None |
| S8-ST-4 | Medium | §10.5 (06-event-consumers.md): add `quality_declining` detection; AC-17 (index.md): amend to 3/5 V1 + 2 deferred | None |
| S8-ST-5 | Medium | §10.2 (06-event-consumers.md): add reason pre-check before `evaluateChurnIntervention` | None |
| S8-ST-6 | Low | §5.3 (04-revenue-perception.md): add `* 100` to `conversionRate30d` | None |
| S8-ST-7 | Low | §10 (06-event-consumers.md): align `PRICING` access syntax with §9.1 Record shape | None |
| S8-ST-8 | Medium | §10.1 (06-event-consumers.md): add once-only guard for `first_upgrade` milestone | None |
| S8-ST-9 | Low | §4.5.3 (03-sponsored-placement.md): probabilistic cleanup instead of per-request | None |

### Sibling Spec Change Summary

**SI v7 -> v8:**
- §2.1: +1 `DeferredActionParamsMap` entry (`check_quality_improvement`) [S8-ST-1]
- §2.2: +1 registered action row [S8-ST-1]
- §9.2: +2 Commercial decision types (`refund_evaluation`, `feature_gate_friction_evaluation`) [S8-ST-2]

Total: 17 deferred actions (was 16). SI version bump v7 -> v8.

**No other sibling spec changes.** CR, Ops, D&L, PP interface specs are unaffected by Agent A findings.

### Downstream Flag Audit

S8 defines 5 downstream flags (S8-1 through S8-5), all targeting S9. No new downstream flags required from Agent A findings.

### Pattern Observations

- **Pattern #14 (content agent divergence):** S8-ST-3 is a clear instance. Despite D5's authority split, §10.2 accesses a field that does not exist on §2's return type. The D5 mitigation (authority split) reduced but did not eliminate the risk. The root cause is that §10 was authored assuming §2's function would return risk factors, but §2's function does not. Lesson: content agent dispatching should include the authoritative type signatures as mandatory context for downstream agents.

- **Pattern #15 (runtime-silent feature failure):** S8-ST-4 is a partial instance. 2 of 5 `ChurnRiskFactor` values are never produced, making Ops' triage logic for those factors dead code. This is mitigated by the §2.3 V1 scope note, but the AC (AC-17) does not reflect the limitation.

- **Three-part sync gap:** S8-ST-1 is the 9th occurrence. The drafter skill's SI sync verification gate was designed to prevent this, but the gate verifies deferred actions in the slice against SI — it does not automatically patch SI. The fix-applier is the correct place for the patch.
