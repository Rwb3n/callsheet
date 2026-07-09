## Implementation Plan — CS-WORK-089: Autonomy graduation

**IO profile:** db-read-write, decision-log
**Blocked by:** None — all clear
**Spec sources:** `07-autonomy-graduation.md` §7, `00-router-plan.md` §2

### AC Summary

| AC | Description | Status | Notes |
|----|-------------|--------|-------|
| AC-58 | evaluateGraduationCriteria insufficient data (<12 decisions in 6mo) | needs-impl | Unit test |
| AC-59 | evaluateGraduationCriteria graduated=true (FP 1.5%, ROI 0.7) | needs-impl | Unit test |
| AC-60 | evaluateCeremonyGraduation graduated=false when isFinancial=true | needs-impl | Unit test |
| AC-61 | evaluateCeremonyGraduation graduated=true (precedent≥50, !financial, !userVisible) | needs-impl | Unit test |
| AC-62 | dispatchGraduatedDecision logs graduation_evaluation on every call | needs-impl | Integration test |
| AC-63 | withinGovernanceBounds returns false after 10 auto-applied in month | needs-impl | Integration test |
| AC-64 | admin.graduation.override with graduated=false overrides computed metrics | needs-impl | Integration test |

**Pre-satisfied:** 0 / 7
**Needs implementation:** 7 / 7

### Type Alignment

1. **Domain union:** `decisionDomainEnum` in `shared.ts` has 4 values. Need `"cross-domain"`. Also update `Domain` type in `logger.ts`. Requires `drizzle-kit push` after schema change.
2. **`graduation_evaluation` decision type:** `decisionType` is `text` (not enum) — just use the string. No schema change.
3. **`ceremony_runs` table:** exists in `intelligence.ts`. Has `ceremonyType`, `outputs`, `status` columns needed for precedent count query.
4. **`DecisionLogDb` interface:** `findByDomainAndType` returns minimal rows. Graduation needs raw SQL queries against `decision_logs` for filtering by JSONB fields — use `deps.db` (Drizzle) directly, not the `DecisionLogDb` wrapper.
5. **Admin router deps cascade:** Adding graduation router to `admin/index.ts` adds `AdminGraduationRouterDeps` to the `AdminRouterDeps` intersection. Need to verify `root.ts` passes all needed deps.

### Implementation Order

1. Schema: add `"cross-domain"` to `decisionDomainEnum` + update `Domain` type in logger.ts
2. Core logic: `evaluate.ts` (evaluateGraduationCriteria, evaluateCeremonyGraduation, withinGovernanceBounds)
3. Dispatch: `dispatch.ts` (dispatchGraduatedDecision)
4. Router: `graduation.ts` (3 routes: status, history, override)
5. Wiring: admin/index.ts + root.ts
6. Unit tests: evaluate.test.ts (AC-58, AC-59, AC-60, AC-61)
7. Integration tests: graduation.integration.test.ts (AC-62, AC-63, AC-64)

### Deliverables

- [ ] `src/db/schema/shared.ts` — add "cross-domain" to decisionDomainEnum
- [ ] `src/lib/decisions/logger.ts` — add "cross-domain" to Domain type
- [ ] `src/domains/intelligence/graduation/evaluate.ts` — core evaluation logic
- [ ] `src/domains/intelligence/graduation/dispatch.ts` — dispatchGraduatedDecision
- [ ] `src/server/routers/admin/graduation.ts` — 3 routes (status, history, override)
- [ ] `src/server/routers/admin/index.ts` — wire graduation router
- [ ] `src/server/root.ts` — pass deps to graduation router
- [ ] `src/domains/intelligence/graduation/__tests__/evaluate.test.ts` — unit tests
- [ ] `src/domains/intelligence/graduation/__tests__/graduation.integration.test.ts` — integration tests

### Key Patterns

- Router factory: `createAdminGraduationRouter(deps)` with `AdminGraduationRouterDeps = { db: Db; decisionLogDb: DecisionLogDb }`
- logDecision: `logDecision(deps.decisionLogDb, { domain, decisionType, inputs, output })`
- Unit tests: `createMockDecisionLogDb()` from test-fixtures for dispatch tests
- Integration tests: real DB with `resetDb()`, query `decision_logs` directly
- Admin routes: `adminProcedure` from `@/server/trpc`

### Spec Constants

```typescript
const SPEC_CONSTANTS = {
  // Enrichment cadence graduation
  MIN_SAMPLE_SIZE: 12,
  SIX_MONTH_WINDOW_MS: 180 * 24 * 60 * 60 * 1000,
  FALSE_POSITIVE_THRESHOLD: 0.02,
  ENRICHMENT_ROI_THRESHOLD: 0.5,

  // Ceremony graduation
  PRECEDENT_COUNT_THRESHOLD: 50,

  // Governance bounds
  ENRICHMENT_MAX_PER_MONTH: 10,
  CEREMONY_MAX_PER_MONTH: 5,
  ALGORITHM_MAX_PER_MONTH: 1,
} as const
```
