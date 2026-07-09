## Implementation Plan — CS-WORK-090: Algorithm versioning and controlled rollout

**IO profile:** db-read-write, decision-log, deferred-action-schedule
**Blocked by:** CS-WORK-089 done — all clear
**Spec sources:** `07-autonomy-graduation.md` (§8), `00-router-plan.md` (§2), `shared-infrastructure.md` (§9.2)

### AC Summary

| AC | Description | Status | Evidence / Notes |
|----|-------------|--------|-----------------|
| AC-65 | `selectAlgorithmVersion` returns V2 for bucket<rollout%, V1 otherwise | needs-impl | Core function, no existing code |
| AC-66 | `selectAlgorithmVersion` is deterministic | needs-impl | Tested alongside AC-65 |
| AC-67 | `scoreListingDuringRollout` writes algorithmVersion=2 + logs algorithm_comparison | needs-impl | No existing code |
| AC-68 | `handleRolloutPercentageChange(10,25)` schedules recalc only for buckets 10-24 | needs-impl | No existing code |
| AC-69 | `checkAlgorithmRollbackTrigger` returns shouldRollback when declassification >10% | needs-impl | No existing code |
| AC-70 | `logDecision("graduation_evaluation")` called on every handleRolloutPercentageChange | needs-impl | Part of handleRolloutPercentageChange impl |
| AC-71 | Rollback to 0% schedules recalc for all V2 listings, all end with algorithmVersion=1 | needs-impl | Uses handleRolloutPercentageChange(current, 0) |
| AC-72 | `evaluateAlgorithmRolloutGraduation` returns graduated=true after 4 weeks stable at 100% | needs-impl | Stub exists in evaluate.ts, needs real impl |

**Pre-satisfied:** 0/8
**Needs implementation:** 8/8

### Type Alignment

- `quality_scores.algorithmVersion` — exists, integer, default 1. Aligned.
- `quality_score_recalculation` deferred action — registered with `{ listingId: UUID }`. Aligned.
- `graduation_evaluation` decision type — registered in 089. Consumed here for rollback logging.
- `algorithm_comparison` — NOT a registered decision type (text column, free-text value per spec §8.2). Can be used directly.
- `decisionType` column is `text`, not enum. No migration needed.
- `evaluate.ts` line 89-97: stub returns "not yet implemented" for `algorithm_rollout`. Must replace with real `evaluateAlgorithmRolloutGraduation()` call.
- `graduation.ts`: needs 2 new routes (`algorithmRollout`, `algorithmComparison`). Deps type needs `SchedulerDb`.
- CRC32: spec says `crc32(listingId)`. No npm `crc` package. Use a simple CRC32 implementation in TypeScript (deterministic, no crypto needed — just a hash for bucketing). Alternatively, use `hashCode` from string. The key requirement is determinism (D6).

### Implementation Order

1. **`algorithm-rollout.ts`** — Core module with all 5 functions:
   - `selectAlgorithmVersion(listingId, rolloutPercentage)` — CRC32 hash bucketing
   - `scoreListingDuringRollout(deps, listingId, rolloutPercentage)` — dual scoring + decision log
   - `handleRolloutPercentageChange(deps, previousPct, newPct)` — boundary detection + scheduling + decision log
   - `checkAlgorithmRollbackTrigger(deps)` — declassification rate check
   - `evaluateAlgorithmRolloutGraduation(db)` — 4-week stability check

2. **Update `evaluate.ts`** — Replace stub in `algorithm_rollout` case with real call to `evaluateAlgorithmRolloutGraduation`

3. **Update `graduation.ts`** — Add `algorithmRollout` mutation and `algorithmComparison` query routes. Update `AdminGraduationRouterDeps` to include `SchedulerDb`.

4. **Update `root.ts`** — If deps type changed, wire SchedulerDb into graduation router

5. **Unit tests** — `algorithm-rollout.test.ts` for AC-65, AC-66 (pure function, no DB)

6. **Integration tests** — `algorithm-rollout.integration.test.ts` for AC-67–AC-72 (DB operations, decision logging, deferred actions)

### Deliverables

- [ ] `src/domains/intelligence/graduation/algorithm-rollout.ts` — NEW. Core functions.
- [ ] `src/domains/intelligence/graduation/evaluate.ts` — MODIFY. Replace algorithm_rollout stub.
- [ ] `src/server/routers/admin/graduation.ts` — MODIFY. Add 2 routes, update deps type.
- [ ] `src/server/root.ts` — MODIFY if deps bag changes.
- [ ] `src/domains/intelligence/graduation/__tests__/algorithm-rollout.test.ts` — NEW. Unit tests.
- [ ] `src/domains/intelligence/graduation/__tests__/algorithm-rollout.integration.test.ts` — NEW. Integration tests.

### Key Patterns (from sibling — evaluate.ts / dispatch.ts)

- DB queries use Drizzle ORM with `sql` template literals for JSONB access (`inputs->>'subEntity'`)
- Decision logging via `logDecision(deps.decisionLogDb, { domain, decisionType, inputs, output })`
- Deferred actions via `scheduleDeferredAction(deps.schedulerDb, { action, params, executeAt })`
- Types: `GraduationDecision` = `{ graduated, reason, currentMetrics, thresholds }`
- Router pattern: `createAdminGraduationRouter(deps)` with injected db + decisionLogDb

### Spec Constants

```typescript
const SPEC_CONSTANTS = {
  DECLASSIFICATION_RATE_THRESHOLD: 0.10,  // §8.4 — rollback trigger
  GRADUATION_DECLASSIFICATION_THRESHOLD: 0.05,  // §8.5 — graduation requires <5%
  GRADUATION_WEEKS_REQUIRED: 4,  // §8.5 — 4 weeks stable at 100%
  GRADUATION_MIN_WEEKLY_CHECKS: 4,  // §8.5 — at least 4 evaluations in 4-week window
  GOVERNANCE_MAX_ROLLOUTS_PER_MONTH: 1,  // §7.2 — one rollout at a time
  FOUR_WEEKS_MS: 28 * 24 * 60 * 60 * 1000,
  SEVEN_DAYS_MS: 7 * 24 * 60 * 60 * 1000,
} as const
```

### CRC32 Implementation Note

Spec says `crc32(listingId) % 100`. Since UUIDs are strings, a simple deterministic hash suffices. Options:
1. Implement CRC32 lookup-table algorithm (~30 lines TypeScript)
2. Use a simpler `hashCode`-style function — as long as it's deterministic and distributes uniformly

Going with CRC32 lookup table for spec fidelity.
