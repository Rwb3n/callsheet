# §10 Pending Cancellation & Churn Risk Registries

Two operational registries serve as queryable indexes for cross-domain coordination. Neither has a dedicated admin UI — both surface as contextual data within existing admin views (router plan §3 "Backend-Only Sections"). The `pending_cancellations` table enables Paddle webhook attribution for subscription ending reason. The `churn_risk_registry` table enables support triage priority elevation for at-risk subscribers.

---

## 10.1 Pending Cancellation Registry

**Owner:** Operations.
**Schema:** `pending_cancellations` — see `01-schema.md` §2.4.
**Primary writer:** Ops' `pending_cancellation_created` consumer (§9.14). PP writes directly for the account closure path (ownership exception [S4-ST-16]).

### CRUD Operations

**Create:** Two write paths.

```
// Path 1: Async consumer (CR and D&L emitters)
// Triggered by pending_cancellation_created event — see §9.14
handlePendingCancellationCreated(event):
  INSERT INTO pending_cancellations (paddle_subscription_id, listing_id, reason, created_at)
  VALUES (event.paddleSubscriptionId, event.listingId, event.reason, now())

// Path 2: Direct write (PP account closure orchestrated flow)
// PP writes synchronously before calling PaymentService.cancelSubscription
// because Paddle may webhook immediately after cancellation API call.
// Scoped to closure only — PP does not write for other cancellation paths.
createPendingCancellation(paddleSubscriptionId, listingId, reason):
  INSERT INTO pending_cancellations (paddle_subscription_id, listing_id, reason, created_at)
  VALUES (paddleSubscriptionId, listingId, reason, now())
```

**Read:** Paddle webhook handler looks up the registry during `inferCancellationReason` (Ops §5). Single lookup by `paddle_subscription_id`.

```
inferCancellationReason(paddleSubscriptionId: string): CancellationReason | null
  record = SELECT reason, created_at
    FROM pending_cancellations
    WHERE paddle_subscription_id = paddleSubscriptionId
    ORDER BY created_at DESC
    LIMIT 1

  if !record:
    return null  // No pending cancellation — infer from Paddle event data

  return record.reason
  // Caller (mapPaddleWebhook) maps to SubscriptionEndedEvent.reason:
  //   "voluntary"              → reason: "cancellation", origin: "paddle"
  //   "payment_failure"        → reason: "grace_period_expired", origin: "paddle"
  //   "paddle_reconciliation"  → reason: "paddle_reconciliation", origin: "paddle" [D3]
  //   "account_closed"         → reason: "account_closure", origin: "paddle"
  //   "listing_archived"       → reason: "cancellation", origin: "archival"
```

**Reason-to-event mapping:** The 5-value `reason` union in the `pending_cancellations` table (`"voluntary" | "payment_failure" | "paddle_reconciliation" | "account_closed" | "listing_archived"`) maps to the 4-value `SubscriptionEndedEvent.reason` union (`"cancellation" | "grace_period_expired" | "account_closure" | "paddle_reconciliation"`). Two registry reasons map to `"cancellation"` (voluntary and listing_archived — the distinction is captured in `origin`). The `"paddle_reconciliation"` reason is new per D3.

**Cleanup:** Inline check in the Paddle webhook handler. After successful webhook processing and `subscription_ended` emission, the handler deletes records older than 24 hours for the processed `paddleSubscriptionId`.

```
cleanupPendingCancellation(paddleSubscriptionId: string):
  DELETE FROM pending_cancellations
    WHERE paddle_subscription_id = paddleSubscriptionId
      AND created_at < now() - interval '24 hours'
```

24-hour retention window ensures that even if the Paddle webhook is delayed (Paddle retries for up to 24 hours on non-2xx), the record is available for attribution. Records younger than 24h are retained in case a second webhook arrives (Paddle's retry semantics). The cleanup runs inline — no deferred action needed — because the Paddle webhook handler is the only consumer and cleanup cost is negligible (single indexed delete).

**No unique constraint on `paddle_subscription_id`:** Confirmed in `01-schema.md` §2.4. A subscription can accumulate multiple pending records if cleanup misses a prior record (edge case: webhook delayed > 24h, then re-cancellation). The `ORDER BY created_at DESC LIMIT 1` query ensures the most recent record governs attribution.

### Usage by Billing Reconciliation (§4)

Billing reconciliation reads the registry to detect unmatched subscriptions. If Paddle reports a cancelled subscription with no corresponding `pending_cancellation` record, reconciliation creates a hold and logs the anomaly. The reconciliation handler does not write to `pending_cancellations` — it creates its own `pending_cancellation_created` event with `reason: "paddle_reconciliation"` [D3], which the consumer (§9.14) stores.

### UI Surface

No dedicated admin page. Pending cancellation data surfaces in two contexts:
1. `/admin/billing` — billing reconciliation status shows unmatched subscription count (derived from reconciliation run results, not direct registry query).
2. Paddle webhook processing logs — admin can trace attribution via the failed event admin view (§7) if a webhook handler fails during lookup.

---

## 10.2 Churn Risk Registry

**Owner:** Operations.
**Schema:** `churn_risk_registry` — see `01-schema.md` §2.3.
**Writer:** Ops' `churn_risk_detected` consumer (§9.12). Sole write path.

### CRUD Operations

**Create/Update:** Upsert from `churn_risk_detected` event. One active record per listing (unique constraint on `listing_id`).

```
upsertChurnRisk(event: ChurnRiskDetectedEvent):
  riskLevel = event.riskFactors.includes("payment_at_risk") ? "high_risk" : "at_risk"

  INSERT INTO churn_risk_registry (
    listing_id, account_id, risk_level, detected_at, expires_at
  ) VALUES (
    event.listingId,
    event.accountId,
    riskLevel,
    now(),
    now() + interval '90 days'
  )
  ON CONFLICT (listing_id) DO UPDATE SET
    risk_level = riskLevel,
    detected_at = now(),
    expires_at = now() + interval '90 days'
```

**Risk level derivation:** `"high_risk"` if `riskFactors` includes `"payment_at_risk"` (payment failure signals imminent churn). All other factor combinations map to `"at_risk"`. This is a V1 heuristic — S9 (Entity Intelligence) may refine the mapping with multi-factor scoring.

**Read — Support triage priority elevation (§2):** When displaying a ticket in the admin support detail view, the query joins `churn_risk_registry` to show a churn risk badge and risk level.

```
getChurnRiskForAccount(accountId: UUID): ChurnRiskEntry | null
  SELECT risk_level, detected_at, expires_at
    FROM churn_risk_registry
    WHERE account_id = accountId
      AND expires_at > now()
    ORDER BY detected_at DESC
    LIMIT 1
```

This query is used in two places:
1. `admin.support.list` — the `hasChurnRisk: boolean` field in `SupportTicketRow` is derived from a LEFT JOIN on `churn_risk_registry` (router plan §3.2).
2. `admin.support.getDetail` — the `churnRiskLevel: "at_risk" | "high_risk" | null` field in `SupportTicketDetail` comes from the same join.

Both queries filter on `expires_at > now()` to exclude stale entries. No explicit DELETE needed — expired entries are functionally invisible. The `WHERE expires_at > now()` filter on the indexed `expires_at` column ensures <50ms query time.

**Expiry model:** Entries auto-expire 90 days after detection. No deferred action or background cleanup job. The `expires_at > now()` predicate in all read queries provides lazy expiry. If storage cleanup becomes necessary at scale (unlikely at V1 — ~20 active entries), a periodic `DELETE WHERE expires_at < now() - interval '7 days'` can be added as a deferred action.

### Priority Elevation Logic

When the `churn_risk_detected` consumer upserts the registry, it also elevates the priority of open tickets for the associated account (§9.12). The elevation is a one-time side effect of the event — it does not poll or recalculate. If a new ticket is created after the churn risk detection, the triage handler (§2) reads `churn_risk_registry` at ticket creation time and applies elevated priority if an active (non-expired) entry exists.

```
// During ticket creation (admin.support.create, §2):
elevateForChurnRisk(accountId: UUID, basePriority: TicketPriority): TicketPriority
  churnRisk = getChurnRiskForAccount(accountId)
  if !churnRisk:
    return basePriority

  // Elevate: normal → high, low → normal. Never downgrade critical/high.
  if basePriority === "low": return "normal"
  if basePriority === "normal": return "high"
  return basePriority  // critical and high remain unchanged
```

### UI Surface

No dedicated admin page. Churn risk data surfaces in the support views:
- `/admin/support` — ticket list shows a churn risk badge (`hasChurnRisk: boolean`) per ticket row.
- `/admin/support/[ticketId]` — ticket detail shows `churnRiskLevel` and `detectedAt` when an active entry exists for the ticket's account.

---

## Cross-References

| Document | Relationship |
|----------|-------------|
| `s7-drafting/01-schema.md` | §2.3 `churn_risk_registry` (table definition, FK semantics, indexes), §2.4 `pending_cancellations` (table definition, ownership exception, no unique constraint rationale) |
| `operations.md` (v3) | §5 Paddle webhook integration (pending cancellation lookup), §3.1 `hasActiveTicket` (related support triage pattern) |
| `commercial-and-revenue.md` (v3) | §1.2 `churn_risk_detected` (event payload), §1.4 `pending_cancellation_created` (event payload, multi-emitter pattern) |
| `data-and-listings.md` (v5) | §1.10 `pending_cancellation_created` emission for archival path (D&L emitter) |
| `platform-and-product.md` (v5) | §1.9 `account_closed` (PP direct write to pending_cancellations during closure) |
| `s7-drafting/01-decisions.md` | D3 (`paddle_reconciliation` reason extension), D7 (billing holds separate from compliance holds) |
| `s7-drafting/01-router-plan.md` | §3.2 `SupportTicketRow.hasChurnRisk`, `SupportTicketDetail.churnRiskLevel` (registry read paths) |
