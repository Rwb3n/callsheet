# S8 Pre-Draft Checklist — Commercial

**Generated:** 2026-02-14
**Slice:** `slices/slice-08-commercial/` (multi-file, S6+)
**Primary domain:** Commercial & Revenue
**Upstream specs:** CR v3, SI v7, Ops v4, D&L v5, PP v6

---

## 1. Deferred Actions to Register

S8 adds 2 new deferred actions. Both are CR-owned.

| Action | Params Type | Owner | Schedule | Retry | On Failure | Source |
|--------|-------------|-------|----------|-------|------------|--------|
| `win_back_evaluation` | `{ listingId: UUID; accountId: UUID }` | Commercial | 60 days after `subscription_ended` (paddle origin only) | `once` | `log` | CR concept design §2.4 |
| `check_quality_improvement` | `{ listingId: UUID; baselineScore: number }` | Commercial | 30 days after low-quality intervention fires | `once` | `log` | CR concept design §4.6 |

**`win_back_evaluation` already registered.** SI §2.1 and §2.2 already contain this entry (added during S4 spec work). No SI edit needed for this action.

**`check_quality_improvement` is NEW.** Must be added to SI §2.1 and §2.2 during drafting.

**SI §2.1 entry to add:**
```typescript
check_quality_improvement: { listingId: UUID; baselineScore: number }
```

**SI §2.2 row to add:**
```
| Commercial | `check_quality_improvement` | 30 days after low-quality intervention (§4.6) | `once` | `log` |
```

**Total DeferredActionParamsMap entries after S8:** 17 (current 16 + 1 new).

---

## 2. Email Templates to Register

S8 adds 0 new email templates. All conversion/win-back templates already registered in SI §5.2:
- `conversion_analytics_teaser` — already registered (Commercial Conversion group)
- `conversion_social_proof` — already registered
- `conversion_view_milestone` — already registered
- `conversion_engagement_summary` — already registered
- `winback` — already registered (Ops delivers, CR provides merge fields)

**Current count:** 26 templates (SI §5.2). After S8: **26** (no change).

**Verification:** S8 must specify the merge fields for each template it triggers. The templates exist; S8 specifies when and with what data they are invoked.

---

## 3. Event Emissions

S8 emits 4 events (all already in `EventPayloadMap`, SI §1.2). Verify payload compliance.

| Event | Emitted By | Key Payload Fields | P1 Check |
|-------|-----------|-------------------|----------|
| `conversion_milestone` | CR | `listingId`, `accountId`, `milestone: ConversionMilestoneId`, `milestoneLabel`, `timestamp` | All present in CR §1.1 ✓ |
| `churn_risk_detected` | CR | `listingId`, `accountId`, `riskFactors: ChurnRiskFactor[]`, `timestamp` | All present in CR §1.2 ✓ |
| `winback_eligible` | CR | `listingId`, `cancelledAccountId`, `mergeFields: { subject, body, listingName, enquiryCount?, viewCount? }`, `timestamp` | All present in CR §1.3 ✓ |
| `pending_cancellation_created` | CR | `paddleSubscriptionId`, `listingId`, `reason: CancellationReason`, `timestamp` | All present in CR §1.4 ✓ |

**S7-1 flag compliance:** `WinbackEligibleEvent.mergeFields` must populate all 5 fields matching the `winback` template. S8 drafter must specify merge field construction logic in the win-back evaluation handler.

**S7-5 flag compliance:** `ChurnRiskDetectedEvent.riskFactors` must include `"payment_at_risk"` when triggered by payment failure signals. S8 drafter must specify all churn risk detection paths and which `ChurnRiskFactor` values each path produces.

---

## 4. Event Consumers

S8 registers 8 event consumers. All are async.

| Event | Consumer Domain | Mode | Handler Description |
|-------|----------------|------|---------------------|
| `subscription_tier_changed` | CR | async | Update revenue metrics (MRR, tier distribution). Log conversion or downgrade. |
| `subscription_ended` | CR | async | Log churn with reason. If `origin === "paddle"`: schedule `win_back_evaluation` at 60 days. If `origin === "archival" \| "closure"`: churn log only (P3 branch). |
| `claim_approved` | CR | async | Log conversion funnel entry. Reset conversion trigger state for listing (CR-29). Cancel pending win-back schedules for the listing (CR-X-17). |
| `listing_archived` | CR | async | If `subscriptionTier !== "free"` AND `accountId !== null`: log churn (voluntary archival). |
| `quality_score_changed` | CR | async | If paid AND `newComposite < 40` AND subscription age >14 days: trigger low-quality intervention (§4.6). |
| `account_closed` | CR | async | Log churn. Cancel win-back schedules for all `listingsArchived`. Update per-listing revenue metrics from CR-local state. |
| `enquiry_submitted` | CR | async | Evaluate `first_enquiry` conversion trigger via D&L `getEngagementCounters(listingId)` query-in-handler. |
| `erasure_completed` | CR | async | Cancel win-back schedules for `listingIdsAnonymised ∪ listingIdsDeleted`. Anonymise churn log entries (replace `accountId` with `accountHash`). Clear conversion trigger state. |

**EVENT_CONSUMER_MATRIX delta:** +8 entries. All 8 consumers already exist in the matrix (registered during CR interface spec drafting). S8 implements them — no matrix additions needed.

**Checklist default:** S8 does NOT add new consumers to the matrix. It implements handlers for the 8 already-specified CR consumers. If the schema agent discovers a consumer not in the matrix, add it.

---

## 5. Schema Amendments

S8 adds 1 new table and amends 1 existing table. No new pgEnums.

### New Table: `commercial_state` (CR-owned)

CR stores per-listing commercial state — conversion trigger tracking, churn analysis, revenue metrics. This table is CR's local state (referenced in CR interface spec §2 as "CR's own stored data").

```typescript
// src/db/schema/commercial.ts
// New in S8

export const commercialState = pgTable("commercial_state", {
  listingId: uuid("listing_id").primaryKey().references(() => listings.id, { onDelete: "cascade" }),
  // Conversion trigger tracking (CR concept design §5.3)
  lastViewMilestoneFired: integer("last_view_milestone_fired"),        // 50 | 100 | 200 | null
  firstEnquiryTriggerFired: boolean("first_enquiry_trigger_fired").notNull().default(false),
  competitorUpgradedFired: integer("competitor_upgraded_fired").notNull().default(0), // firing count
  searchTermTeaseFired: integer("search_term_tease_fired").notNull().default(0),
  endowmentCtaShown: boolean("endowment_cta_shown").notNull().default(false),
  // Churn analysis (CR concept design §7.2)
  lastChurnEventAt: timestamp("last_churn_event_at", { withTimezone: true }),
  lastChurnReason: text("last_churn_reason"),
  // Revenue tracking (per-listing, for CR local state reads)
  effectivePriceAtSubscription: integer("effective_price_at_subscription"),  // CR §1.1a
  subscriptionStartDate: timestamp("subscription_start_date", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})
// Index: (listing_id) — PK covers this
```

**Checklist default:** `commercial_state` is a new table. The schema agent may consolidate some fields with the existing `listings.subscriptionStartDate` (S4 addition) to avoid duplication. If the schema agent finds overlap, prefer referencing `listings.subscriptionStartDate` and omitting it from `commercial_state`. Decision: schema agent resolves during Phase 1.

### New Table: `churn_analysis_log` (CR-owned)

Event log for churn, conversion, and revenue perception signals.

```typescript
export const churnAnalysisLog = pgTable("churn_analysis_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  listingId: uuid("listing_id").notNull().references(() => listings.id, { onDelete: "cascade" }),
  accountId: uuid("account_id"),                                        // nullable for anonymised entries
  accountHash: text("account_hash"),                                    // set after erasure
  eventType: text("event_type").notNull(),                              // "churn" | "conversion" | "downgrade" | "renewal" | "refund" | "win_back_sent" | "win_back_converted"
  reason: text("reason"),                                               // CancellationReason or conversion milestone
  subscriptionTier: text("subscription_tier"),                          // tier at time of event
  metadata: jsonb("metadata"),                                          // event-specific data
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})
// Index: (listing_id, created_at DESC)
// Index: (event_type, created_at DESC)
// Index: (account_id) WHERE account_id IS NOT NULL
```

### New Table: `sponsored_impressions` (CR-owned)

Fairness monitoring for sponsored placement (CR concept design §4.4).

```typescript
export const sponsoredImpressions = pgTable("sponsored_impressions", {
  id: uuid("id").primaryKey().defaultRandom(),
  listingId: uuid("listing_id").notNull().references(() => listings.id, { onDelete: "cascade" }),
  serviceAreaId: integer("service_area_id").notNull().references(() => taxonomyServiceAreas.id),
  impressionDate: timestamp("impression_date", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})
// Index: (listing_id, impression_date DESC)
// Index: (service_area_id, impression_date DESC) — fairness monitoring query
// Retention: 90 days. Cleanup inline or via deferred action.
```

**Checklist default:** If the schema agent determines sponsored impression tracking is too granular for V1, replace with a `sponsoredImpressionCount` integer on `commercial_state` incremented per impression. Decision: schema agent resolves. Default recommendation: use the table — fairness monitoring requires per-service-area breakdown.

### Amendment: `listings` table

No new columns needed. S8 reads `subscriptionTier`, `subscriptionStartDate`, `paddleSubscriptionId`, `paddleCustomerId`, `billingCadence` (all added by S4). S8 reads `lifecycleStatus`, `accountId` (S1 originals). No amendments.

**Cumulative snapshot after S8:** Total tables: **42** (39 from S7 + 3 new: `commercial_state`, `churn_analysis_log`, `sponsored_impressions`). Total pgEnums: **32** (unchanged).

---

## 6. Notification Types

S8 does not introduce new notification types. It creates notifications using existing types:

| Type | When | Source |
|------|------|--------|
| `conversion_milestone` | CR emits `conversion_milestone` → PP consumer creates notification | SI §8.1 (already registered) |
| `churn_risk_suggestion` | CR emits `churn_risk_detected` → PP consumer creates quality suggestions | SI §8.1 (already registered) |
| `quality_score_changed` | Low-quality intervention notification (§4.6) | SI §8.1 (already registered) |

**Checklist default:** 0 new notification types. If the content agent identifies a notification not in SI §8.1, add it.

---

## 7. Upstream Flags to Resolve

| Flag | Source | Description | Resolution Needed |
|------|--------|-------------|-------------------|
| S4-2 | S4 §14 | Churn intervention UI: retention data display, exit survey, win-back status | S8 specifies CR's churn detection rules and data that S5's UI surface renders. Must define `evaluateChurnIntervention` decision architecture with inputs/outputs. |
| S4-3 | S4 §14 | Win-back email content, merge field population, evaluation logic | S8 implements `evaluateWinBack` from CR §2.4. Must specify merge field construction for `WinbackEligibleEvent.mergeFields`. |
| S4-4 | S4 §14 | Conversion trigger evaluation (first_enquiry, competitor_upgraded, analytics_teaser, social_proof, view_milestone, engagement_summary) | S8 implements all 6 conversion triggers from CR §5.3. Must specify each trigger's condition, action, cooldown, and maxFirings. |
| S4-5 | S4 §14 | Revenue perception metrics (MRR, ARR, tier distribution, churn rate, conversion rate) | S8 implements `RevenuePerception` type and computation from CR §6. Must specify data sources and update cadence. |
| S4-9 | S4 §14 | Sponsored placement tier gating | S8 implements `selectSponsoredListings` from CR §4.4. Must specify selection algorithm, rotation, slot count, fairness monitoring. |
| S5-1 | S5 §19 | Churn intervention UI: exit survey, retention data, win-back status | Same scope as S4-2. S8 provides the CR evaluation logic; S5 renders. |
| S5-2 | S5 §19 | Sponsored placement badge display on listings | S8 implements selection logic; S5/S6 render "Sponsored" label. S8 must specify the `isSponsored` flag surface. |
| S6-1 | S6 §16 | Sponsored placement selection logic for search results | S8 implements the commercial logic. S6 renders the sponsored section. Must specify the integration surface (how the sponsored listing IDs reach the search results page). |
| S6-2 | S6 §16 | Conversion trigger from buyer engagement — CR consumes `enquiry_submitted` for `first_enquiry` trigger | S8 implements the conversion trigger evaluation that consumes this event. |
| S7-1 | S7 §20 | Win-back email template merge fields | S8 must populate `WinbackEligibleEvent.mergeFields` with all 5 fields: `subject`, `body`, `listingName`, `enquiryCount`, `viewCount`. |
| S7-5 | S7 §20 | Churn risk registry consumption — S8 must emit `churn_risk_detected` with `riskFactors` including `"payment_at_risk"` | S8 must specify all churn risk detection paths and map each to one or more `ChurnRiskFactor` values. |

**Total: 11 upstream flags.** Thematic grouping:
- **Churn & win-back:** S4-2, S4-3, S5-1, S7-1, S7-5 (5 flags)
- **Conversion triggers:** S4-4, S6-2 (2 flags)
- **Sponsored placement:** S4-9, S5-2, S6-1 (3 flags)
- **Revenue perception:** S4-5 (1 flag)

---

## 8. Open Questions to Resolve

| # | Question | Expected Resolution |
|---|----------|-------------------|
| CR-Q2 | Monthly price display (round up to clean number in 15–20% band — exact values) | S8 documents the exact monthly values (already stated in concept design: £19/£39/£69). Closes this question by confirming in the slice. |

**Checklist default:** CR-Q2 is resolved by citing CR concept design §1.1. No trade-off evaluation needed — values are settled. The drafter writes them as `PRICING` config values.

No other open questions target S8.

---

## 9. Query Interfaces Consumed

S8 reads from 3 query interfaces owned by other domains. No new query interfaces exposed.

| Query Interface | Source Domain | S8 Usage | Spec Reference |
|----------------|--------------|----------|----------------|
| `getEngagementCounters(listingId)` | D&L | `first_enquiry` trigger evaluation, `BasicAnalytics` computation | D&L §3.2 |
| `getListingAnalytics(listingId, period)` | PP | `EnquiryResponseInsights` computation, time-series data for conversion triggers | PP §3.1 |
| `getFeatureGateFrictionSummary(period)` | Ops | Monthly friction evaluation in `evaluateFeatureGateFriction` | Ops §3.4 |

**Note:** S8 also reads D&L's `computeTaxonomyOverlap(listingA, listingB)` for the `competitor_upgraded` conversion trigger. This is a D&L export, not a query interface — it's a pure function import (P4).

---

## 10. Decision Log Types

S8 adds 4 decision types to the structured decision logging framework (SI §9.2).

| Decision Type | Trigger | Inputs | Output |
|---------------|---------|--------|--------|
| `conversion_trigger_evaluation` | Event-driven (enquiry, quality change, claim) | Trigger name, listing state, engagement data | Fired / not fired + reason |
| `churn_intervention` | `subscription_ended` with `origin: "paddle"` | Cancellation reason, recent engagement, listing state | Show retention data / accept / grace period |
| `winback_evaluation` | 60-day deferred action | Days since cancellation, engagement since, listing ownership | Send email / no action + reason |
| `sponsored_placement_selection` | Search query with Premium/Partner matches | Query, candidate count, quality scores, rotation offset | Selected listing IDs (0–3) |

These are already listed in SI §9.2. S8 provides the implementation.

---

## 11. Scope Summary and Partition Hint

### Scope

S8 implements the Commercial & Revenue sub-entity's operational logic. It is primarily a **domain-logic slice** (not UI-heavy like S5/S6). The UI surfaces for CR logic already exist in S5 (provider dashboard) and S6 (search results, buyer experience). S8 provides:

1. **Conversion trigger engine** — evaluation logic for 6 triggers, state tracking, cooldown enforcement
2. **Churn detection and intervention** — `evaluateChurnIntervention`, risk factor detection, `churn_risk_detected` emission
3. **Win-back evaluation** — `evaluateWinBack` decision architecture, merge field construction, deferred action handler
4. **Sponsored placement** — `selectSponsoredListings` algorithm, rotation, fairness monitoring
5. **Revenue perception** — `RevenuePerception` type computation, threshold evaluation, revenue health decisions
6. **Feature gate friction evaluation** — monthly ceremony logic consuming Ops query interface
7. **8 event consumers** — handler implementations for all CR-consumed events
8. **Low-quality intervention** — §4.6 notification + deferred follow-up
9. **Refund evaluation** — `evaluateRefund` decision architecture (concept design §2.6, S7 provides ticket surface)

### Partition Hint (Content Agent Groupings)

Suggested 5-7 content agent partition based on concept design section locality + dependency coupling:

| Agent | Concept Design Sections | Content | Dependencies |
|-------|------------------------|---------|-------------|
| **A: Conversion Triggers** | CR §5.1–§5.4 | 6 triggers, state tracking, `commercial_state` writes, cooldown/maxFirings enforcement, `conversion_milestone` emission, endowment CTA, cold start intervention | Reads D&L counters, reads PP analytics, reads `commercial_state` |
| **B: Churn & Win-back** | CR §2.3–§2.4, §4.6 | `evaluateChurnIntervention`, win-back evaluation, merge field construction, low-quality intervention, `check_quality_improvement` handler, `churn_risk_detected` emission, `winback_eligible` emission, churn analysis logging | Reads `commercial_state`, reads D&L counters, schedules deferred actions |
| **C: Sponsored Placement** | CR §4.4 | `selectSponsoredListings`, rotation algorithm, fairness monitoring, `sponsored_impressions` table, cache constraint documentation | Reads quality scores, reads taxonomy overlap, reads subscription tier |
| **D: Revenue Perception** | CR §6.1–§6.3 | `RevenuePerception` type, `evaluateRevenueHealth` thresholds, feature gate friction evaluation, revenue metrics computation, multi-listing pricing evaluation (§3.2) | Reads `churn_analysis_log`, reads Ops friction summary, reads aggregate subscription data |
| **E: Event Consumers** | CR §7.1, CR interface spec §2 | All 8 event consumer handler implementations, P1 field usage, P3 origin branching, query-in-handler patterns | Reads/writes `commercial_state`, writes `churn_analysis_log`, schedules deferred actions |
| **F: Refund & Pricing** | CR §2.6, §1.1a, §1.3, §3 | `evaluateRefund` decision architecture, pricing change protocol, launch discount interaction, multi-listing pricing (no-discount V1), `PRICING` config documentation | Reads Paddle subscription data, calls `applyDowngrade` |

**Coupling notes:**
- Agents B and E share `churn_analysis_log` writes. Designate E (Event Consumers) as authoritative for consumer handler implementations. B specifies the decision architectures that E's handlers invoke.
- Agent A and E share `commercial_state` writes. A specifies trigger evaluation logic. E's `claim_approved` handler invokes A's state reset function.
- Pattern #14 risk: Agents B and E both describe churn-related handlers. Designate E as authoritative for the handler implementation; B provides the `evaluateChurnIntervention` pseudocode that E imports.

### Route Ownership Table

S8 has minimal tRPC surface. Most CR logic is event-driven (consumers) or deferred-action-driven (scheduled). The routes it adds are internal computation, not user-facing pages.

| Route | Purpose | Data-Owning Domain | Route-Owning Domain |
|-------|---------|-------------------|---------------------|
| `commercial.getSponsoredListings` | Called by search results SSR to get sponsored listings for a query | CR | PP (search is PP surface) |
| `commercial.getRevenuePerception` | Admin dashboard revenue panel | CR | PP (admin dashboard is PP surface) |
| `commercial.evaluateUpgradeSuggestion` | Provider dashboard upgrade CTA logic | CR | PP (dashboard is PP surface) |
| `commercial.getConversionTriggerState` | Internal: check trigger state for a listing | CR | CR (internal) |

**Checklist default:** These routes are preliminary. The router plan agent may consolidate or rename. The key pattern: CR owns the logic, PP owns the route surface for user-facing endpoints.

---

## 12. Risk Assessment

| Risk | Mitigation |
|------|-----------|
| **Content agent divergence (pattern #14):** Churn handler logic described in both B (decision architecture) and E (consumer implementation) | Designate E as authoritative for handler code. B provides pseudocode that E references. Phase 1 Decision Summary must include this designation. |
| **`competitor_upgraded` trigger exceeds 200ms** (CR-ST-17) | S8 must evaluate whether pre-computed taxonomy overlap neighbourhoods are needed at V1 scale (4,700 listings). Checklist default: implement naive approach with documented migration path. |
| **`commercial_state` vs `listings` column overlap** | `listings.subscriptionStartDate` already exists (S4). `commercial_state.subscriptionStartDate` would duplicate. Schema agent resolves: either reference `listings` column or document the CR-local copy as intentional (faster reads without joining listings). Default: use `listings.subscriptionStartDate` and omit from `commercial_state`. |
| **Conversion trigger state reset on reclaim** (CR-29) | `claim_approved` consumer must zero all `commercial_state` trigger fields. Verify the consumer handles both new claims (no prior state) and reclaims (prior state exists). |
| **Revenue perception computation at V1 scale** | ~200 paid subscribers. Aggregate queries over `churn_analysis_log` + listing subscription data. No materialised views needed at this scale. Document threshold for when materialisation becomes necessary. |
