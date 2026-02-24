<!-- Part of slice-10-hardening v2 -->

# S10 Router Plan — Hardening

**Generated:** 2026-02-15
**Covers:** tRPC route surface for S10. Identifies existing routes consumed by S10 flows and specifies the 5 new admin graduation routes.

---

## §1 Existing Routes Used (No Modifications)

S10 wires flow step definitions into the existing generic orchestrator from S7. These routes serve both erasure and closure flows without modification:

| Route | Auth | Source | S10 Usage |
|-------|------|--------|-----------|
| `admin.flows.list` | `adminProcedure` | S7 §6 | Lists all orchestrated flows. Erasure and closure flows appear here after registration. |
| `admin.flows.get` | `adminProcedure` | S7 §6 | Flow detail with per-step status, attempt counts, error context. Admin monitors erasure/closure progress here. |
| `admin.flows.retryStep` | `adminProcedure` | S7 §6 | Retries a failed step. Used when processErasure R2 cleanup fails (D2: context tracks `dbTransactionCompleted`, retry skips DB sub-step) or Paddle cancellation fails (D1: `retry_3` exhausted, admin manual retry). |
| `admin.flows.skipStep` | `adminProcedure` | S7 §6 | Skips a skippable step. Enforces skip constraint matrix (SI §3.5). Erasure: steps 2, 3, 6 skippable; steps 1, 4, 5 NOT skippable. Closure: steps 2, 3, 4, 6 skippable; steps 1, 5 NOT skippable. Server rejects skip attempts on non-skippable steps. |
| `admin.flows.escalate` | `adminProcedure` | S7 §6 | Escalates a failed flow to principal. Used when retry exhaustion and skip are both unacceptable. |

S10 registers `ERASURE_FLOW_STEPS` and `CLOSURE_FLOW_STEPS` as `OrchestratedFlowStep[]` arrays (SI §3.2). The existing routes consume these definitions via `executeOrchestratedFlow` (SI §3.3). No route signatures, input types, or return types change.

---

## §2 New Routes — Graduation Status

Five new routes in a single `admin.graduation` router group. All use `adminProcedure` (SI §4.1 `AuthSession` with `role: "admin"`).

| Route | Method | Input | Return | Description |
|-------|--------|-------|--------|-------------|
| `admin.graduation.status` | query | `{ subEntity?: string, capability?: string }` | `GraduationStatusResponse[]` | Current graduation status for each sub-entity/capability pair. Reads `decision_logs` WHERE `decisionType = 'graduation_evaluation'`, aggregated to latest per sub-entity + capability. Optional filters narrow the result set. |
| `admin.graduation.history` | query | `{ subEntity: string, capability: string, limit?: number }` | `GraduationEvaluationLog[]` | Historical graduation evaluations for a specific sub-entity + capability. Reads `decision_logs` filtered by `input->>'subEntity'` and `input->>'capability'`, ordered by `createdAt DESC`. Default limit: 20. |
| `admin.graduation.override` | mutation | `{ subEntity: string, capability: string, graduated: boolean, reason: string }` | `{ success: boolean }` | Manually override graduation status. Creates a `graduation_evaluation` decision log entry with `reason: "manual_override"` and the specified `graduated` value. Used to force-graduate a capability (skip waiting for threshold) or force-revert (disable auto-apply after quality regression). |
| `admin.graduation.algorithmRollout` | mutation | `{ rolloutPercentage: number }` | `{ updated: boolean, affectedListings: number }` | Set algorithm V2 rollout percentage (0-100). Validates range. Persists to `graduation_evaluation` decision log with `capability: "algorithm_rollout"`. Schedules `quality_score_recalculation` deferred actions for listings whose algorithm assignment changes (D6: deterministic hash means only listings crossing the new threshold boundary need re-scoring). Does NOT re-score synchronously. |
| `admin.graduation.algorithmComparison` | query | `{}` | `AlgorithmComparisonResult` | Compare V1 vs V2 quality band distributions. Queries `quality_scores` grouped by `algorithmVersion` and `qualityBand`. Returns per-band counts, declassification rate (% of V2 listings with lower band than their V1 equivalent), and sample sizes. Used for D7 weekly monitoring during rollout. |

### Types

```typescript
type GraduationStatusResponse = {
  subEntity: string
  capability: string
  graduated: boolean
  lastEvaluatedAt: ISO8601 | null
  currentMetrics: Record<string, number>
  thresholds: Record<string, number>
}

type GraduationEvaluationLog = {
  id: UUID
  subEntity: string
  capability: string
  graduated: boolean
  reason: string
  currentMetrics: Record<string, number>
  evaluatedAt: ISO8601
}

type AlgorithmComparisonResult = {
  v1: Record<QualityBand, number>   // { excellent: N, good: N, fair: N, poor: N }
  v2: Record<QualityBand, number>
  declassificationRate: number       // % of V2 listings with lower band than V1
  sampleSize: { v1: number; v2: number }
}
```

`GraduationStatusResponse.currentMetrics` and `.thresholds` are capability-specific. For `enrichment_cadence_adjustment`: `{ falsePositiveRate: number, enrichmentROI: number }` with thresholds `{ falsePositiveRate: 0.02, enrichmentROI: 1.0 }`. For `ceremony_auto_apply`: `{ precedentCount: number }` with threshold `{ precedentCount: 50 }`. For `algorithm_rollout`: `{ declassificationRate: number, rolloutPercentage: number }` with threshold `{ declassificationRate: 0.10 }`.

---

## §3 Query Patterns

All graduation routes read from `decision_logs` (S0 §4, SI §9.2). No new tables. Query patterns:

**`admin.graduation.status`** — latest evaluation per sub-entity + capability:
```sql
SELECT DISTINCT ON (input->>'subEntity', input->>'capability')
  input->>'subEntity' AS "subEntity",
  input->>'capability' AS capability,
  output->>'graduated' AS graduated,
  created_at AS "lastEvaluatedAt",
  input->'currentMetrics' AS "currentMetrics",
  input->'thresholds' AS thresholds
FROM decision_logs
WHERE decision_type = 'graduation_evaluation'
ORDER BY input->>'subEntity', input->>'capability', created_at DESC
```

**`admin.graduation.algorithmComparison`** — band distribution comparison:
```sql
SELECT algorithm_version, quality_band, COUNT(*) AS count
FROM quality_scores
GROUP BY algorithm_version, quality_band
```

Declassification rate requires a self-join on `listing_id` WHERE both V1 and V2 scores exist (comparative scoring logs both). This is feasible because comparative scoring (§8) writes both V1 and V2 rows for the rollout cohort.

---

## §4 File Tree

```
src/server/routers/
└── admin/
    └── graduation.ts          -- NEW: 5 routes (status, history, override, algorithmRollout, algorithmComparison)

src/server/flows/
├── erasure.ts                 -- NEW: ERASURE_FLOW_STEPS definition + processErasure step implementation
└── closure.ts                 -- NEW: CLOSURE_FLOW_STEPS definition + closure step implementations
```

No new pages. All admin interaction via existing S7 flow admin UI (`admin.flows.*` routes) plus the new `admin.graduation.*` routes. Graduation routes are server-side admin queries — no client pages required.

---

## §5 Rendering Strategy

All 5 new routes use `adminProcedure` (server-side only, `role: "admin"` gated). No SSR/CSR/ISR considerations. The S7 flow admin UI already renders orchestrated flow state; S10 registers flow step definitions that appear in that existing UI. Graduation status queries are consumed by admin dashboard components added in future work management (phase 4) — S10 defines the data layer only.

---

## §6 Route Count Summary

| Category | Count |
|----------|-------|
| Existing routes consumed (no modifications) | 5 (`admin.flows.*`) |
| New routes | 5 (`admin.graduation.*`) |
| New router files | 1 (`graduation.ts`) |
| New flow definition files | 2 (`erasure.ts`, `closure.ts`) |
| New page files | 0 |
