<!-- Part of slice-07-operations v2 -->

# §8 Platform Health Monitoring

The health monitoring page aggregates 5 signal sources into a single point-in-time status for admin consumption. Each signal maps to a three-level severity (`healthy` / `warning` / `critical`); the overall status is the worst-case across all signals.

---

## Route

`admin.health.getStatus` — single query, no input parameters. Returns `PlatformHealthStatus`. [Source: router plan §3.8]

```typescript
type PlatformHealthStatus = {
  overall: "healthy" | "degraded" | "unhealthy"
  signals: HealthSignal[]
}

type HealthSignal = {
  name: string
  status: "healthy" | "warning" | "critical"
  detail: string                               // human-readable summary, e.g. "3 unresolved errors in last 24h"
  lastChecked: ISO8601
}
```

---

## Health Signal Sources

### 1. Billing Reconciliation

Read from `billing_reconciliation_status` single-row table [D6]. Direct field mapping:

| `billing_reconciliation_status.status` | Signal Status |
|---------------------------------------|---------------|
| `"healthy"` | `healthy` |
| `"anomaly_detected"` | `warning` |
| `"failed"` | `critical` |

Detail string includes `lastRunAt` and `activeHolds` count. If no row exists (first deployment, pre-first-run), signal defaults to `warning` with detail `"No reconciliation run recorded"`.

### 2. Event Consumer Errors

COUNT unresolved errors in last 24 hours from `event_consumer_errors` WHERE `resolved = false` AND `timestamp > now() - interval '24 hours'`. Uses the partial index added in S0-11.

| Unresolved Count | Signal Status |
|-----------------|---------------|
| 0 | `healthy` |
| 1–10 | `warning` |
| >10 | `critical` |

Detail string: `"{count} unresolved consumer errors in last 24h"`.

### 3. Deferred Action Failures

COUNT from `deferred_actions` WHERE `status = 'exhausted'` AND `updated_at > now() - interval '24 hours'`. An exhausted action is one that has exceeded its retry policy without success. [Source: shared-infrastructure.md — §2.1]

| Exhausted Count | Signal Status |
|----------------|---------------|
| 0 | `healthy` |
| >0 | `warning` |

No `critical` threshold — exhausted deferred actions are operational signals, not outages. The action's `onFailure` policy (`log` or `alert_principal`) handles immediate escalation; the health page provides aggregate visibility.

### 4. Orchestrated Flow Failures

COUNT from `orchestrated_flows` WHERE `status IN ('failed', 'escalated')`. These are active failures, not historical — completed or resolved flows do not count.

| Failed/Escalated Count | Signal Status |
|------------------------|---------------|
| 0 | `healthy` |
| >0 | `critical` |

Detail string: `"{count} flows in failed/escalated state"`. Critical because orchestrated flows (erasure, closure) carry statutory deadlines.

### 5. Paddle Webhook Silence

Check the timestamp of the most recent Paddle-originating event. At V1 scale (~50–200 events/day), at least one subscription-related event is expected within 48 hours (daily reconciliation alone produces at least a status check).

```
lastPaddleEvent = MAX(timestamp) FROM event_consumer_errors
                  UNION
                  SELECT last_run_at FROM billing_reconciliation_status
```

Simpler implementation: check `billing_reconciliation_status.lastRunAt`. If the last run was >48h ago, the reconciliation deferred action has likely failed (which signal 3 would also catch). Redundancy is acceptable — the admin sees both signals.

| Time Since Last Event | Signal Status |
|----------------------|---------------|
| <= 48h | `healthy` |
| > 48h | `warning` |

No `critical` — webhook silence could indicate low platform activity rather than a Paddle integration failure. The billing reconciliation failure signal (source 1) catches actual integration failures.

---

## Overall Status Computation

```
admin.health.getStatus():
  // 5 parallel queries — one per signal source
  [billing, errors, deferred, flows, paddle] = await Promise.all([
    getBillingSignal(),
    getEventErrorSignal(),
    getDeferredActionSignal(),
    getOrchestratedFlowSignal(),
    getPaddleWebhookSignal(),
  ])

  signals = [billing, errors, deferred, flows, paddle]

  overall = signals.some(s => s.status === "critical") ? "unhealthy"
          : signals.some(s => s.status === "warning")  ? "degraded"
          : "healthy"

  return { overall, signals }
```

Target: <500ms p95 total. Each signal query is a single COUNT or SELECT on an indexed column. Parallel execution keeps the total well within budget.

---

## UI Surface

Page: `/admin/health` [Source: router plan §1].

The health page displays:

1. **Overall status badge** — green/yellow/red corresponding to `healthy`/`degraded`/`unhealthy`.
2. **Signal list** — one row per signal: name, status indicator, detail string, last checked timestamp.
3. **Friction tracking summary** — displayed as a sub-section below the health signals. Loaded via `admin.friction.getSummary` (§12). The friction summary is a read-only table on the same page, not a separate navigation target.

No persistent health history at V1. The dashboard shows point-in-time status. Health trend analysis (signal history over time, alert frequency patterns) is deferred to S9 (Entity Intelligence perception wiring).

---

## Acceptance Criteria

| # | Criterion |
|---|-----------|
| AC-8.1 | `admin.health.getStatus` returns 5 health signals with correct severity mapping per source |
| AC-8.2 | Overall status is `"unhealthy"` if any signal is `critical`, `"degraded"` if any signal is `warning`, `"healthy"` otherwise |
| AC-8.3 | Billing reconciliation signal reads from `billing_reconciliation_status` [D6]; defaults to `warning` if no row exists |
| AC-8.4 | Event consumer errors signal counts unresolved errors in the last 24 hours; >10 is `critical`, >0 is `warning` |
| AC-8.5 | Deferred action signal counts `exhausted` actions in the last 24 hours; >0 is `warning` |
| AC-8.6 | Orchestrated flow signal counts `failed` or `escalated` flows; >0 is `critical` |
| AC-8.7 | Paddle webhook silence signal warns if >48 hours since last reconciliation run |
| AC-8.8 | 5 signal queries execute in parallel; total response <500ms p95 |
| AC-8.9 | Health page includes friction tracking summary (§12) as a sub-section |
| AC-8.10 | No persistent health history at V1 — point-in-time status only |
