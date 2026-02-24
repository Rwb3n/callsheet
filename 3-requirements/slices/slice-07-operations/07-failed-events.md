<!-- Part of slice-07-operations v2 -->

# §7 Failed Event Admin View

The failed event admin view surfaces `event_consumer_errors` for admin investigation and resolution, resolving R3 (failed event admin view with aggregation by consumer/error/time range) and consuming the `resolved`/`resolvedAt` columns added to `event_consumer_errors` by S7 [S0-11].

---

## Data Source

`event_consumer_errors` table (defined in S0 §4). S7 amends the table with two columns [S0-11]:

```typescript
resolved: boolean("resolved").notNull().default(false),
resolvedAt: timestamp("resolved_at", { withTimezone: true }),
```

Partial index: `(created_at DESC) WHERE resolved = false` — the default admin view queries unresolved errors only.

Each error row contains: `eventType`, `consumerDomain`, `consumerId`, `payload` (the event payload that caused the failure), `error`, `stack`, `timestamp`, `mode`. [Source: shared-infrastructure.md — §1.5]

---

## Grouping

Errors are grouped by `consumerId` using the SI §1.5 convention: `"{domain}:{eventType}:{actionName}"`. Each group exposes:

- `errorCount` — number of errors matching that `consumerId` within the filter range
- `latestError` — the most recent error detail (id, eventType, payload, error message, timestamp, mode)
- `oldestUnresolved` — timestamp of the earliest unresolved error in the group

Grouping by `consumerId` rather than by `eventType` ensures the admin sees which specific consumer is failing, not just which event type is problematic. A single event type may have multiple consumers across domains; grouping by consumer identity isolates the fault.

---

## List View

Route: `admin.events.list` [Source: router plan §3.7].

```typescript
const eventErrorListInput = z.object({
  fromDate: z.string().datetime().optional(),
  toDate: z.string().datetime().optional(),
  consumerId: z.string().optional(),
  resolved: z.boolean().default(false),       // default: unresolved only
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(50).default(20),
})

type EventErrorGroup = {
  consumerId: string                           // "{domain}:{eventType}:{actionName}"
  errorCount: number
  latestError: {
    id: UUID
    eventType: EventType
    payload: unknown
    error: string
    timestamp: ISO8601
    mode: "sync" | "async"
  }
  oldestUnresolved: ISO8601
}
```

Default sort: error count DESC (highest-frequency failures first). The query returns `totalUnresolved` alongside the grouped list for the health monitoring signal (§8).

**Query implementation:**

```
admin.events.list(input):
  baseFilter = event_consumer_errors
    WHERE resolved = input.resolved
    AND (input.fromDate IS NULL OR timestamp >= input.fromDate)
    AND (input.toDate IS NULL OR timestamp <= input.toDate)
    AND (input.consumerId IS NULL OR consumer_id = input.consumerId)

  groups = SELECT consumer_id, COUNT(*) as errorCount,
                  MAX(timestamp) as latestTimestamp,
                  MIN(timestamp) FILTER (WHERE resolved = false) as oldestUnresolved
           FROM baseFilter
           GROUP BY consumer_id
           ORDER BY errorCount DESC

  // For each group, fetch the latest error detail (single row per group)
  // Use a lateral join or window function to avoid N+1
  return { errors: groups, totalUnresolved: SUM(errorCount) }
```

---

## Resolution Actions

### Resolve

Route: `admin.events.resolve` [Source: router plan §3.7].

Marks an error as resolved. The error is hidden from the default (unresolved-only) view.

```
admin.events.resolve({ errorId }):
  update event_consumer_errors
    SET resolved = true, resolved_at = now()
    WHERE id = errorId
```

No side effects beyond the status change. Resolution is an acknowledgment that the admin has investigated the error and determined it is either transient or addressed.

### Retry

Route: `admin.events.retry` [Source: router plan §3.7].

Re-emits the stored event payload through the event bus. This is a full re-emission, not a directed retry — all consumers of that event type will fire, not just the consumer that failed. The re-emission relies on P2 (consumer idempotency): consumers that already processed the event successfully produce the same outcome on duplicate receipt without side-effect duplication. [Source: shared-infrastructure.md — §1.4 P2]

```
admin.events.retry({ errorId }):
  errorRecord = SELECT * FROM event_consumer_errors WHERE id = errorId

  // Re-emit the stored payload through the event bus
  emit(errorRecord.eventType, errorRecord.payload)

  // Mark the original error as resolved
  // If the consumer fails again, a new error row is created by the bus's try/catch wrapper (SI §1.5)
  update event_consumer_errors
    SET resolved = true, resolved_at = now()
    WHERE id = errorId
```

**Why not directed retry:** The event bus dispatches to all registered consumers for an event type. Directing a retry to a single consumer would require the bus to expose per-consumer invocation, which breaks the bus abstraction. The cost of re-executing successful consumers is zero (P2 idempotency) at V1 scale. If directed retry becomes necessary (high-volume events with expensive consumers), it is added to the bus contract in S10 (Hardening).

---

## Upstream Flag Resolutions

| Flag | Resolution |
|------|-----------|
| S0-11 | `event_consumer_errors` amended with `resolved: boolean` and `resolvedAt: timestamp`. Partial index on `(created_at DESC) WHERE resolved = false`. |
| R3 | Failed event admin view implemented: grouped by `consumerId`, filterable by date range and resolved status, with resolve and retry actions. |

---

## Acceptance Criteria

| # | Criterion |
|---|-----------|
| AC-7.1 | Admin can view event consumer errors grouped by `consumerId`, showing error count and latest error detail per group |
| AC-7.2 | List view filters by date range, `consumerId`, and resolved status; default shows unresolved only |
| AC-7.3 | Admin can mark an error as resolved; resolved errors are hidden from the default view |
| AC-7.4 | Admin can retry a failed event; the stored payload is re-emitted through the event bus and the original error is marked resolved |
| AC-7.5 | Re-emission triggers all consumers of the event type (not directed); P2 idempotency prevents side-effect duplication |
| AC-7.6 | `totalUnresolved` count is returned alongside grouped results for health monitoring consumption |
