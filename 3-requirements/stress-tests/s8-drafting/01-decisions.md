# S8 Phase 1A — Decisions

**Status:** Phase 1 output
**Slice:** S8 Commercial & Revenue
**Generated:** 2026-02-14

---

## Binding Decisions

All 6 decision points resolved. No new spec amendments required beyond the `check_quality_improvement` SI addition already documented in the checklist §1. No decisions deferred to content agents.

| # | Decision | Options | Recommendation | Rationale |
|---|----------|---------|----------------|-----------|
| D1 | `commercial_state.subscriptionStartDate` overlap with `listings.subscriptionStartDate` | **(A)** Omit from `commercial_state`, read `listings.subscriptionStartDate` via join. **(B)** Duplicate as CR-local copy for faster reads without joining. | **A — Omit. Use `listings.subscriptionStartDate`.** | `subscriptionStartDate` is authoritative on `listings` (S4). CR's only use is the 14-day grace check in `quality_score_changed` handler and the win-back evaluation timer. Both are async consumers with a 5s budget — a single indexed join adds <5ms. Duplicating creates a sync obligation (CR must update its copy on every `subscription_tier_changed` event) with zero user-facing benefit. One source of truth is cheaper than a consistency invariant. |
| D2 | Sponsored impression tracking: per-event table vs aggregate counter on `commercial_state` | **(A)** `sponsored_impressions` table with per-row records (listingId, serviceAreaId, impressionDate). **(B)** `sponsoredImpressionCount` integer on `commercial_state`, incremented per impression. | **A — Use the `sponsored_impressions` table.** | Fairness monitoring (CR concept design §4.4) requires per-service-area breakdown: "no listing receives >3x the mean impressions for its service area in a 30-day window." An aggregate counter cannot answer this query. The table has a 90-day retention policy with cleanup via inline deletion or deferred action, keeping row count bounded. At V1 scale (~50 Premium/Partner listings, ~10 impressions/listing/day), the table holds ~45K rows max — trivial for PostgreSQL. |
| D3 | `competitor_upgraded` trigger: naive taxonomy overlap vs pre-computed neighbourhoods | **(A)** Naive: on each `subscription_tier_changed` event where `newTier > previousTier`, query all free-tier listings, compute `computeTaxonomyOverlap` per candidate, filter by overlap threshold. **(B)** Pre-computed: maintain a `taxonomy_neighbourhoods` materialised view updated on listing profile edits. | **A — Naive computation with documented migration path.** | At V1 scale (~4,700 listings, ~200 paid), the worst case is ~4,500 Jaccard comparisons per upgrade event. `computeTaxonomyOverlap` is a pure function operating on in-memory tag arrays (D&L §3.1 NFR: <50ms p95). The event consumer is async with a 5s budget. Even at 10ms/comparison (pessimistic), 4,500 comparisons = 45s — exceeds the budget. However, the trigger filters by service area overlap first (same sector + at least one shared service area), which reduces candidates to ~50–200 per event at V1 distribution. This keeps total computation well under 5s. Migration path: when `competitor_upgraded` consumer p95 exceeds 2s, pre-compute overlap neighbourhoods as a materialised view refreshed on `profile_edited`. Document this threshold in §1. |
| D4 | Monthly pricing display values | **(A)** £19/£39/£69 as stated in CR concept design §1.1. **(B)** Recalculate from annual prices using 15–20% premium band. | **A — £19/£39/£69. Settled.** | CR concept design v4 §1.1 specifies these values. CR interface spec §4.3 `PRICING` const already carries them (`monthlyPrice: 19 | 39 | 69`). CR-ST-11 confirmed the Standard monthly price (14.6% premium) is an intentional deviation from the 15% floor. No recalculation needed. S8 §9 cites these values verbatim from the `PRICING` export. |
| D5 | Churn handler authority (pattern #14 risk) — which content file is authoritative for churn/win-back handler code? | **(A)** §2/§3 (Churn & Win-back) is authoritative for both decision architecture and handler code. **(B)** §10 (Event Consumers) is authoritative for handler code; §2/§3 specify decision architecture pseudocode that §10 imports. | **B — §10 (Event Consumers) is authoritative for handler implementation; §2/§3 specify decision architecture.** | Pattern #14 (S6-ST-1, S7-ST-2) occurs when two content files independently describe the same mechanism and contradict each other. The mitigation is a clear authority split: §2 defines `evaluateChurnIntervention` pseudocode, §3 defines `evaluateWinBack` pseudocode. §10 implements the event consumer handlers that *call* these functions. §10 is the single place where `subscription_ended`, `account_closed`, `quality_score_changed`, and `listing_archived` handler bodies appear. §2/§3 provide the imported decision logic — they do not duplicate handler wiring. Content agents B (Churn & Win-back) and E (Event Consumers) must follow this split. E references B's exported functions by name; E does not re-derive the decision logic. |
| D6 | `erasure_completed` consumer dispatch mechanism | **(A)** Dispatched via event bus (async consumer). **(B)** Called directly by erasure orchestrator (like Ops' DSAR case closure). | **A — Event bus dispatch (async).** | SI §13.1 is explicit: step 6 of the GDPR erasure flow is "D&L: emit `erasure_completed`" which "triggers reactive consumers (PP, CR) via the event bus." D&L §1.9 confirms CR's `erasure_completed` consumer is listed as "Async (bus)" — not "Orchestrator direct call." Only the Ops "close DSAR case + audit record" action (step 5) is called directly by the orchestrator. CR's consumer — cancel win-back schedules, anonymise churn log entries, clear conversion trigger state — is a standard async bus consumer registered in `EVENT_CONSUMER_MATRIX`. S8's `erasure_completed` handler implementation follows the same pattern as all other CR async consumers. |

---

## Resulting Amendments

**Spec amendments:** None. All decisions align with existing spec text. No sibling spec edits needed.

**Schema changes from decisions:**
- D1: Remove `subscriptionStartDate` column from `commercial_state` table definition. Schema agent must omit this field. CR reads `listings.subscriptionStartDate` via join when needed (async consumers only — no latency concern).
- D2: Retain `sponsored_impressions` table as specified in checklist §5. No change.

**New deferred actions from decisions:** None. The `check_quality_improvement` action (checklist §1) is already identified — it is not a decision outcome, it is a checklist input.

**Content agent instructions from D5:**
- Agent B (Churn & Win-back): Write `evaluateChurnIntervention` and `evaluateWinBack` as exported decision architecture pseudocode. Do NOT write event consumer handler bodies.
- Agent E (Event Consumers): Write all 8 consumer handler implementations. Import `evaluateChurnIntervention` and `evaluateWinBack` from §2/§3 by function name. Handler bodies for `subscription_ended`, `account_closed`, `quality_score_changed`, `listing_archived` live exclusively in §10.

**D3 documentation requirement:** §1 (Conversion Triggers) must include a performance note on `competitor_upgraded`: "V1 uses naive `computeTaxonomyOverlap` over sector-filtered candidates. Migration trigger: consumer p95 >2s. Migration path: materialised `taxonomy_neighbourhoods` view refreshed on `profile_edited`."
