## Implementation Plan — CS-WORK-079: Ceremony automation

**IO profile:** db-read-write, email-send
**Blocked by:** CS-WORK-075 (done), CS-WORK-076 (done), CS-WORK-077 (done) — all clear
**Spec sources:** `04-ceremony-automation.md`, `shared-infrastructure.md` §2.1/§5.2/§9.2, `operations.md` §3

### AC Summary

| AC | Description | Status | Evidence / Notes |
|----|-------------|--------|-----------------|
| AC-55 | Every ceremony handler schedules next run as final step (self-perpetuating) | needs-impl | — |
| AC-56 | Duplicate ceremony run prevented by inputsHash check | needs-impl | — |
| AC-57 | evaluateCeremonyOutcome logs ceremony_outcome_evaluation decision | needs-impl | — |
| AC-58 | taxonomy_review returns insufficient_data when tags empty, schedules next | needs-impl | — |
| AC-59 | verification_calibration returns insufficient_data when no claim decisions | needs-impl | — |
| AC-60 | conversion_funnel returns insufficient_data when no trigger decisions | needs-impl | — |
| AC-61 | multi_listing_pricing returns insufficient_data when <20 accounts | needs-impl | — |
| AC-62 | contractor_performance returns insufficient_data when no tasks | needs-impl | — |
| AC-63 | multi_listing_pricing checks 20+ threshold first, after idempotency | needs-impl | — |
| AC-64 | principal_briefing aggregates monthly ceremony outputs, stores in principal_briefings | needs-impl | — |
| AC-65 | principal_briefing sends email, updates sentAt | needs-impl | — |
| AC-66 | credit_confirmation_outreach sent annually for verifiedAt 330-365 days | needs-impl | — |
| AC-67 | taxonomy_promotion_evaluation decision for promotable tags (freq>=20, clean) | needs-impl | — |
| AC-68 | conversion_threshold_adjustment decision for <5% or >50% firing rate | needs-impl | — |
| AC-69 | Every ceremony logged to ceremony_runs with all fields | needs-impl | — |

**Pre-satisfied:** 0 / 15
**Needs implementation:** 15 / 15

### Type Alignment

- **Deferred actions:** All 12 ceremony actions + `credit_confirmation_outreach` action already in `DeferredActionParamsMap` (types.ts) with `Record<string, never>` params. No type changes needed.
- **Email templates:** `principal_briefing`, `credit_confirmation_outreach`, `decay_final_notice`, `enrichment_confirmation_request` already in `EmailTemplateId` union. Need `registerTemplate()` calls.
- **Decision types:** `ceremony_outcome_evaluation` and `taxonomy_promotion_evaluation` use `text` column (`decisionType` in `decision_logs`). No schema change needed — just use the string.
- **Schema:** `ceremony_runs`, `principal_briefings`, `learning_hypotheses` tables already exist (CS-WORK-075). `ceremonyTypeEnum` already has all 12 values.
- **Credits table mismatch:** Spec references `credit.clientEmail` but schema has `clientCommissioner` (name) + `clientCompanyName`. No email column on credits. Column is `verificationDate` (not `verifiedAt`). Sourcing method enum value is `"client_confirmed"`. For credit_confirmation_outreach, use the listing's `contactEmail` as destination.
- **Admin route:** `admin.intelligence` router exists but no `ceremonies` route yet. Need to add it.
- **DecisionLogDb adapter gap:** `findByDomainAndType` only filters by domain, not by type. Ceremony handlers needing decision log queries (verification calibration, conversion funnel) must query `decision_logs` table directly via `db`.
- **`logDecision` signature:** `logDecision(db, { domain, decisionType, inputs, output, confidence?, listingId?, accountId?, additionalContext? })`. Confidence is 0-1 float (stored as 0-100 int).

### Implementation Order

1. **Ceremony infrastructure** — `src/domains/intelligence/ceremony/infrastructure.ts`: `checkCeremonyIdempotency`, `logCeremonyRun`, `evaluateCeremonyOutcome`, `scheduleCeremonyNextRun`, `ceremonyDomainMap`, period helpers
2. **Infrastructure unit tests** — AC-55, AC-56, AC-69 core infrastructure tests
3. **D&L ceremony handlers** — taxonomy_review, data_health_review, verification_calibration, provider_outreach
4. **CR ceremony handlers** — conversion_funnel_analysis, multi_listing_pricing_evaluation
5. **Ops ceremony handlers** — operational_health_review, contractor_performance_review, principal_briefing_generation
6. **Credit confirmation outreach** handler
7. **Email template registration** — 4 templates
8. **Admin route** — `ceremonies` endpoint listing recent ceremony_runs
9. **Integration tests** — AC-57 through AC-68

### Deliverables

- [ ] `src/domains/intelligence/ceremony/infrastructure.ts` — shared ceremony utilities (NEW)
- [ ] `src/lib/scheduler/handlers/taxonomy-review-preparation.ts` (NEW)
- [ ] `src/lib/scheduler/handlers/data-health-review.ts` (NEW)
- [ ] `src/lib/scheduler/handlers/verification-calibration-review.ts` (NEW)
- [ ] `src/lib/scheduler/handlers/provider-outreach-ranking.ts` (NEW)
- [ ] `src/lib/scheduler/handlers/conversion-funnel-analysis.ts` (NEW)
- [ ] `src/lib/scheduler/handlers/multi-listing-pricing-evaluation.ts` (NEW)
- [ ] `src/lib/scheduler/handlers/principal-briefing-generation.ts` (NEW)
- [ ] `src/lib/scheduler/handlers/credit-confirmation-outreach.ts` (NEW)
- [ ] `src/domains/intelligence/ceremony/__tests__/infrastructure.test.ts` (NEW)
- [ ] `src/lib/scheduler/handlers/__tests__/ceremony-handlers.integration.test.ts` (NEW)
- [ ] `src/server/routers/admin/intelligence.ts` — add `ceremonies` route (MODIFY)

### Key Patterns (from sibling)

- **Handler registration:** `registerXxxHandler(registry, deps)` with typed `Deps` bag. Handler calls `registry.register("action_name", async (params) => { ... })`.
- **Self-perpetuating:** Final step calls `scheduleDeferredAction(schedulerDb, { action, params, executeAt, retryPolicy, onFailure, createdBy })`.
- **Mock scheduler in tests:** `createMockSchedulerDb()` — returns `{ db, getScheduled() }`. Also `createMockDecisionLogDb()` — returns `{ db, getDecisions() }`.
- **Test helper:** `invokeHandler(registry, "action_name", params)` from `__tests__/invoke-handler.ts`.
- **waitUntilFn:** `const waitUntilFn = (p: Promise<unknown>) => { p.catch(() => {}) }` in tests.

### Sub-Agent Delegation Assessment

**Effort:** large (15 AC, 12 handler files). **Delegation recommended.**

**Parallelisable workstreams:**
1. **Infrastructure + unit tests** (infrastructure.ts, infrastructure.test.ts) — shared types consumed by all handlers
2. **D&L ceremonies** (4 handlers: taxonomy, data-health, verification, outreach) — share no files with CR/Ops
3. **CR + Ops ceremonies + credit outreach** (5 handlers: conversion, multi-listing, ops-health, contractor, principal-briefing, credit-outreach) — share no files with D&L
4. **Integration tests + admin route** — depends on all handlers

**Sequencing constraint:** Infrastructure (1) must complete first — all handlers import from it. Then (2) and (3) can run in parallel. Then (4) runs after (2) and (3) merge.

**Max parallel agents:** 2 (after infrastructure completes in main context). D&L handlers vs CR+Ops handlers.

**Delegation plan:**
- **Main context:** Infrastructure module + unit tests + email template registration + admin route + integration tests + final wiring
- **Agent A:** 4 D&L ceremony handlers
- **Agent B:** 5 CR + Ops ceremony handlers + credit confirmation outreach

#### Spec Constants Block

```typescript
const SPEC_CONSTANTS = {
  // Cadences
  MONTHLY_MS: 30 * 24 * 60 * 60 * 1000,
  QUARTERLY_MS: 90 * 24 * 60 * 60 * 1000,
  WEEKLY_MS: 7 * 24 * 60 * 60 * 1000,

  // Thresholds
  MULTI_LISTING_MIN_ACCOUNTS: 20,
  TAXONOMY_PROMOTION_MIN_FREQUENCY: 20,
  TAXONOMY_SIMILARITY_THRESHOLD: 0.8,
  CONVERSION_FIRING_RATE_LOW: 0.05,
  CONVERSION_FIRING_RATE_HIGH: 0.50,
  VERIFICATION_ACCURACY_TIGHTEN: 0.90,
  VERIFICATION_ACCURACY_LOOSEN: 0.98,
  DECAY_TREND_ESCALATION_RATIO: 2, // newSignals > 2 * resolved -> escalate
  ENRICHMENT_COVERAGE_MIN: 0.80,
  CREDIT_CONFIRMATION_START_DAYS: 330,
  CREDIT_CONFIRMATION_END_DAYS: 365,
  SECONDARY_CHURN_THRESHOLD: 0.30,
  PRICING_TICKET_THRESHOLD: 10,
  OUTREACH_TOP_N: 50,

  // Decision types
  DECISION_CEREMONY_OUTCOME: "ceremony_outcome_evaluation",
  DECISION_TAXONOMY_PROMOTION: "taxonomy_promotion_evaluation",
  DECISION_CONVERSION_THRESHOLD: "conversion_threshold_adjustment",

  // Domain map
  CEREMONY_DOMAIN_MAP: {
    taxonomy_review: "data-and-listings",
    data_health_review: "data-and-listings",
    verification_calibration: "data-and-listings",
    provider_outreach: "data-and-listings",
    conversion_funnel_analysis: "commercial",
    multi_listing_pricing: "commercial",
    revenue_review: "commercial",
    sponsored_placement_learning: "commercial",
    operational_health_review: "operations",
    contractor_performance_review: "operations",
    principal_briefing: "operations",
    learning_hypothesis_analysis: "operations",
  },
} as const
```

**Agent prompt rules:**
- Each agent prompt MUST include the spec constants block above
- Each agent prompt MUST end with: "After making changes, run `npx tsc --noEmit` to verify types compile. Then run `git add -A && git commit -m 'Agent: {description}'` to persist your changes."
- Each agent prompt MUST list the exact function signatures and type shapes
- Infrastructure module must complete before dispatching agents
