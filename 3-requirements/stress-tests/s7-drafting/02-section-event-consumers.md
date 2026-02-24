# §9 Event Consumer Implementations

S7 registers and implements handlers for all 13 events consumed by Operations (Ops §2). All 13 are async via `waitUntil()` except `erasure_completed`, which executes within the erasure orchestrated flow (SI §3.1 Pattern 1 — direct call, not bus-dispatched). S4 already registers Paddle webhook handler consumers (e.g., the `checkout_completed` → `mapPaddleWebhook` path). S7 does not duplicate those — S7 adds the 13 distinct Operations consumer entries documented below.

Every handler is wrapped in try/catch per SI §1.5. Failures write to `event_consumer_errors` with `consumerId` following the `"{domain}:{eventType}:{actionName}"` convention. All async handlers dispatch via `waitUntil()` per P5.

---

## 9.1 EVENT_CONSUMER_MATRIX Entries

S7 adds 13 entries to `EVENT_CONSUMER_MATRIX` (SI §1.5). All have `domain: "operations"`. 12 have `mode: "async"`. `erasure_completed` is orchestrated (not in the matrix — see §9.8).

```typescript
// S7 additions to EVENT_CONSUMER_MATRIX
"claim_approved":              [{ domain: "operations", mode: "async" }]   // joins existing PP sync + PP async + CR async
"claim_rejected":              [{ domain: "operations", mode: "async" }]   // joins existing PP async
"listing_archived":            [{ domain: "operations", mode: "async" }]   // joins existing PP sync + PP async ×2 + CR async
"listing_suspended":           [{ domain: "operations", mode: "async" }]   // joins existing PP async ×3
"listing_reactivated":         [{ domain: "operations", mode: "async" }]   // joins existing PP sync + PP async ×2
"decay_signal_detected":       [{ domain: "operations", mode: "async" }]   // joins existing PP async
"account_closed":              [{ domain: "operations", mode: "async" }]   // joins existing D&L async + CR async
"listing_created":             [{ domain: "operations", mode: "async" }]   // joins existing D&L async
"contact_attempt":             [{ domain: "operations", mode: "async" }]   // joins existing D&L async
"churn_risk_detected":         [{ domain: "operations", mode: "async" }]   // joins existing PP async
"winback_eligible":            [{ domain: "operations", mode: "async" }]   // sole consumer
"pending_cancellation_created":[{ domain: "operations", mode: "async" }]   // sole consumer
```

`erasure_completed` is NOT registered in the matrix. Per D&L §1.9 [DL-ST-6], the Ops "close DSAR case + audit record" action is called directly by the erasure orchestrator, not dispatched via the event bus. The bus dispatches `erasure_completed` only to PP and CR consumers.

---

## 9.2 claim_approved (D&L)

**Consumer ID:** `operations:claim_approved:claimVolumeTracking`
**Mode:** Async
**Source:** D&L §1.1

Logs claim approval for volume tracking and learning hypothesis L2/L3. No support ticket action, no state mutation beyond the decision log.

**P1 payload fields used:** `listingId`, `method`, `timestamp` — all present in `ClaimApprovedEvent` (D&L §1.1). Verified against Ops §2 P1 table.

```
handleClaimApproved(event: ClaimApprovedEvent):
  // P1: uses event.listingId, event.method, event.timestamp only
  logDecision({
    domain: "operations",
    decisionType: "claim_volume_tracking",
    inputs: { method: event.method },
    output: { action: "logged", direction: "approved" },
    entityContext: { listingId: event.listingId },
  })
  // L2/L3 learning: track auto vs manual vs disputed approval ratios
  // No DB write beyond decision_logs — volume metrics derived from decision log queries
```

**Side effects:** 1 decision log entry. No emails, no notifications, no events emitted.

---

## 9.3 claim_rejected (D&L)

**Consumer ID:** `operations:claim_rejected:claimVolumeTracking`
**Mode:** Async
**Source:** D&L §1.2

Logs claim rejection for volume tracking. Minimal handler — Ops does not take action on rejections beyond recording.

**P1 payload fields used:** `listingId`, `timestamp` — all present in `ClaimRejectedEvent` (D&L §1.2). Verified against Ops §2 P1 table.

```
handleClaimRejected(event: ClaimRejectedEvent):
  logDecision({
    domain: "operations",
    decisionType: "claim_volume_tracking",
    inputs: {},
    output: { action: "logged", direction: "rejected" },
    entityContext: { listingId: event.listingId },
  })
```

**Side effects:** 1 decision log entry.

---

## 9.4 listing_archived (D&L)

**Consumer ID:** `operations:listing_archived:closeTickets`
**Mode:** Async
**Source:** D&L §1.3

Closes all active support tickets for the archived listing. Cancels any pending `sla_breach_warning` deferred actions for affected tickets.

**P1 payload fields used:** `listingId` — present in `ListingArchivedEvent` (D&L §1.3). Verified against Ops §2 P1 table.

```
handleListingArchived(event: ListingArchivedEvent):
  // Find all open/assigned tickets for this listing
  activeTickets = SELECT id, sla_deadline
    FROM support_tickets
    WHERE listing_id = event.listingId
      AND status IN ('open', 'assigned')

  for ticket in activeTickets:
    UPDATE support_tickets
      SET status = 'closed', closed_at = now()
      WHERE id = ticket.id AND status IN ('open', 'assigned')  // idempotent: skip if already closed

    // Cancel SLA breach warning if scheduled [D1]
    if ticket.sla_deadline IS NOT NULL:
      cancelAction("sla_breach_warning", { ticketId: ticket.id })

  logDecision({
    domain: "operations",
    decisionType: "support_triage",
    inputs: { trigger: "listing_archived", listingId: event.listingId },
    output: { action: "tickets_closed", count: activeTickets.length },
  })
```

**Side effects:** 0–N ticket status updates (`closed`). 0–N deferred action cancellations. 1 decision log entry.

---

## 9.5 listing_suspended (D&L)

**Consumer ID:** `operations:listing_suspended:updateTickets`
**Mode:** Async
**Source:** D&L §1.4

Closes or updates relevant tickets. Suspension may be temporary — tickets are closed (not deleted) so they persist as audit records.

**P1 payload fields used:** `listingId` — present in `ListingSuspendedEvent` (D&L §1.4). Verified against Ops §2 P1 table.

```
handleListingSuspended(event: ListingSuspendedEvent):
  activeTickets = SELECT id, sla_deadline
    FROM support_tickets
    WHERE listing_id = event.listingId
      AND status IN ('open', 'assigned')

  for ticket in activeTickets:
    UPDATE support_tickets
      SET status = 'closed', closed_at = now()
      WHERE id = ticket.id AND status IN ('open', 'assigned')

    if ticket.sla_deadline IS NOT NULL:
      cancelAction("sla_breach_warning", { ticketId: ticket.id })

  logDecision({
    domain: "operations",
    decisionType: "support_triage",
    inputs: { trigger: "listing_suspended", listingId: event.listingId },
    output: { action: "tickets_closed", count: activeTickets.length },
  })
```

**Side effects:** 0–N ticket status updates. 0–N deferred action cancellations. 1 decision log entry.

**Note:** Identical pattern to `listing_archived`. Both close active tickets for the listing. If a future version distinguishes suspension handling (e.g., mark tickets as "paused" instead of "closed"), this handler diverges.

---

## 9.6 listing_reactivated (D&L)

**Consumer ID:** `operations:listing_reactivated:resumeOutreach`
**Mode:** Async
**Source:** D&L §1.5

Resumes outreach for the listing if applicable. Re-enables enrichment cadence tracking. At V1, "resume outreach" means logging the reactivation for the outreach domain within the operations TaskSpec queue — if a `data_maintenance` or `outreach` TaskSpec was previously created for this listing and marked `timed_out` during suspension, the reactivation signals that a new task can be created.

**P1 payload fields used:** `listingId` — present in `ListingReactivatedEvent` (D&L §1.5). Verified against Ops §2 P1 table.

```
handleListingReactivated(event: ListingReactivatedEvent):
  // Log reactivation for outreach scheduling
  logDecision({
    domain: "operations",
    decisionType: "support_triage",
    inputs: { trigger: "listing_reactivated", listingId: event.listingId },
    output: { action: "outreach_resumed" },
    entityContext: { listingId: event.listingId },
  })
  // No immediate side effects beyond logging — enrichment cadence
  // is recalculated by D&L's own subscription_tier_changed consumer.
  // Ops tracks the signal for outreach TaskSpec creation in §3.
```

**Side effects:** 1 decision log entry. No ticket mutations, no emails.

---

## 9.7 decay_signal_detected (D&L)

**Consumer ID:** `operations:decay_signal_detected:decayOutreach`
**Mode:** Async
**Source:** D&L §1.7

Cross-references active tickets for the listing. If an active ticket exists (indicated by `event.activeSupportTicket` being present), suppresses duplicate outreach. Otherwise, sends a `listing_decay_warning` email. The active ticket check is P1-compliant — D&L annotates the event payload with the ticket UUID before emission via `hasActiveTicket` query [Source: D&L §1.7, X-6].

**P1 payload fields used:** `listingId`, `signal.severity`, `activeSupportTicket` — all present in `DecaySignalDetectedEvent` (D&L §1.7). Verified against Ops §2 P1 table.

```
handleDecaySignalDetected(event: DecaySignalDetectedEvent):
  // Suppress duplicate outreach if active ticket exists [X-6]
  if event.activeSupportTicket:
    logDecision({
      domain: "operations",
      decisionType: "decay_response",
      inputs: {
        listingId: event.listingId,
        severity: event.signal.severity,
        activeTicketId: event.activeSupportTicket,
      },
      output: { action: "outreach_suppressed", reason: "active_ticket_exists" },
    })
    return

  // No active ticket — resolve account email for the listing owner
  // Account email resolved via auth infrastructure (not cross-domain read)
  listing = SELECT account_id FROM listings WHERE id = event.listingId
  if listing.account_id IS NULL:
    // Unclaimed listing — no email target. Log and exit.
    logDecision({
      domain: "operations",
      decisionType: "decay_response",
      inputs: { listingId: event.listingId, severity: event.signal.severity },
      output: { action: "skipped", reason: "unclaimed_listing" },
    })
    return

  account = getAccount(listing.account_id)
  EmailService.send({
    to: account.email,
    template: "listing_decay_warning",
    data: { listingId: event.listingId, severity: event.signal.severity },
    category: "listing_status",
    accountId: listing.account_id,
  })

  logDecision({
    domain: "operations",
    decisionType: "decay_response",
    inputs: { listingId: event.listingId, severity: event.signal.severity },
    output: { action: "decay_warning_sent" },
    entityContext: { listingId: event.listingId },
  })
```

**Side effects:** 0 or 1 email (`listing_decay_warning`). 1 decision log entry. No events emitted.

**P1 nuance:** The handler reads `listings.account_id` and `accounts.email` to resolve the email recipient. This is an infrastructure read (resolving who to email), not a cross-domain business logic read. The decision of *whether* to send is made entirely from payload fields (`activeSupportTicket` presence check + `severity`). Consistent with Ops §7 win-back delivery pattern, which also resolves `accountEmail` from `cancelledAccountId`.

---

## 9.8 erasure_completed (D&L) — Orchestrated

**Consumer ID:** N/A — not bus-dispatched.
**Mode:** Orchestrated (direct call from erasure flow orchestrator)
**Source:** D&L §1.9, SI §3.5 step 5

This handler runs as step 5 of the GDPR erasure orchestrated flow. It is called directly by the orchestrator after `processErasure` (step 4) completes. It is NOT registered in `EVENT_CONSUMER_MATRIX` and is NOT dispatched via the event bus. [Source: DL-ST-6]

**P1 payload fields used:** `accountHash`, `listingIdsAnonymised`, `listingIdsDeleted`, `freelancerListingsDeleted`, `timestamp` — all present in `ErasureCompletedEvent` (D&L §1.9). Verified against Ops §2 P1 table.

```
handleErasureCompleted(context: ErasureFlowContext):
  // context carries the erasure results from step 4 (processErasure)
  // Close DSAR case — find the open DSAR entry for this account
  UPDATE compliance_register
    SET status = 'completed', completed_at = now()
    WHERE account_id = context.accountId
      AND type = 'dsar'
      AND status IN ('open', 'in_progress')

  // Create compliance audit record
  INSERT INTO compliance_register (
    type, account_id, status, completed_at, details, created_at
  ) VALUES (
    'erasure',
    NULL,  // account_id set to NULL — the account data is erased
    'completed',
    now(),
    {
      accountHash: context.accountHash,
      listingsAnonymised: context.listingIdsAnonymised.length,
      listingsDeleted: context.listingIdsDeleted.length,
      freelancerListingsDeleted: context.freelancerListingsDeleted,
      completedAt: context.timestamp,
    },
    now()
  )

  // Send DSAR completion email if account email was preserved in flow context
  if context.dataSubjectEmail:
    EmailService.send({
      to: context.dataSubjectEmail,
      template: "dsar_completion",
      data: { dsarId: context.dsarId },
      category: "transactional",
    })
```

**Side effects:** 1 compliance register status update (DSAR case → `completed`). 1 compliance register insert (erasure audit record). 0 or 1 email (`dsar_completion`). This handler MUST NOT be skipped — SI §3.5 marks step 5 as non-skippable (compliance audit record is legally required, DSAR case must close to clear compliance hold [XI-11]).

---

## 9.9 account_closed (PP)

**Consumer ID:** `operations:account_closed:closeTicketsAndCompliance`
**Mode:** Async
**Source:** PP §1.9

Closes all active tickets for the account. Updates compliance register entries. If `complianceHoldActive` is true, creates a compliance hold monitor note so the admin is aware the hold persists beyond closure.

**P1 payload fields used:** `accountId`, `listingsArchived`, `complianceHoldActive` — all present in `AccountClosedEvent` (PP §1.9). Verified against Ops §2 P1 table.

```
handleAccountClosed(event: AccountClosedEvent):
  // Close all active tickets for the account
  activeTickets = SELECT id, sla_deadline
    FROM support_tickets
    WHERE account_id = event.accountId
      AND status IN ('open', 'assigned')

  for ticket in activeTickets:
    UPDATE support_tickets
      SET status = 'closed', closed_at = now()
      WHERE id = ticket.id AND status IN ('open', 'assigned')

    if ticket.sla_deadline IS NOT NULL:
      cancelAction("sla_breach_warning", { ticketId: ticket.id })

  // Update compliance register: mark any open entries for this account
  UPDATE compliance_register
    SET status = 'completed', completed_at = now()
    WHERE account_id = event.accountId
      AND type NOT IN ('dsar', 'investigation')  // DSARs and investigations persist beyond closure
      AND status IN ('open', 'in_progress')

  // If compliance hold active, log monitor note for admin awareness
  if event.complianceHoldActive:
    INSERT INTO compliance_register (
      type, account_id, status, details, created_at
    ) VALUES (
      'obligation',
      event.accountId,
      'open',
      { note: "Compliance hold active at account closure. Monitor until resolved.",
        closedAccountId: event.accountId },
      now()
    )

    // Create admin notification [D4]
    INSERT INTO notifications (
      account_id, type, title, body, link, created_at
    ) VALUES (
      adminAccountId(),
      'compliance_deadline',
      'Compliance hold persists after account closure',
      'Account ' || event.accountId || ' closed with active compliance hold.',
      '/admin/compliance',
      now()
    )

  logDecision({
    domain: "operations",
    decisionType: "support_triage",
    inputs: {
      trigger: "account_closed",
      accountId: event.accountId,
      complianceHoldActive: event.complianceHoldActive,
    },
    output: {
      ticketsClosed: activeTickets.length,
      complianceEntriesUpdated: true,
      holdMonitorCreated: event.complianceHoldActive,
    },
  })
```

**Side effects:** 0–N ticket closures. 0–N deferred action cancellations. 0–N compliance register updates. 0–1 compliance register insert (hold monitor). 0–1 admin notification. 1 decision log entry.

---

## 9.10 listing_created (PP)

**Consumer ID:** `operations:listing_created:onboardingTracking`
**Mode:** Async
**Source:** PP §1.6

Onboarding volume tracking. Minimal handler — logs for entity perception.

**P1 payload fields used:** `listingId`, `entityType`, `timestamp` — all present in `ListingCreatedEvent` (PP §1.6). Verified against Ops §2 P1 table.

```
handleListingCreated(event: ListingCreatedEvent):
  logDecision({
    domain: "operations",
    decisionType: "onboarding_tracking",
    inputs: { entityType: event.entityType },
    output: { action: "logged" },
    entityContext: { listingId: event.listingId },
  })
```

**Side effects:** 1 decision log entry. No emails, no notifications, no state mutations.

---

## 9.11 contact_attempt (PP)

**Consumer ID:** `operations:contact_attempt:outreachPrioritisation`
**Mode:** Async
**Source:** PP §1.8

Outreach prioritisation for unreachable listings. If the contact attempt has `result: "unreachable"`, logs the signal for outreach prioritisation. At V1, outreach is handled via external platforms (D5a) — this handler creates a decision log entry that feeds the outreach TaskSpec creation logic in §3.

**P1 payload fields used:** `listingId`, `result` — all present in `ContactAttemptEvent` (PP §1.8). Verified against Ops §2 P1 table.

```
handleContactAttempt(event: ContactAttemptEvent):
  if event.result !== "unreachable":
    return  // Only act on unreachable reports

  logDecision({
    domain: "operations",
    decisionType: "support_triage",
    inputs: { listingId: event.listingId, contactResult: event.result },
    output: { action: "outreach_signal_logged" },
    entityContext: { listingId: event.listingId },
  })
  // Future: auto-create outreach TaskSpec after N unreachable reports
  // V1: admin reviews decision logs for outreach patterns
```

**Side effects:** 0–1 decision log entry (only for `"unreachable"` results).

---

## 9.12 churn_risk_detected (CR)

**Consumer ID:** `operations:churn_risk_detected:churnRiskUpsert`
**Mode:** Async
**Source:** CR §1.2

Upserts `churn_risk_registry` with payload fields. If an existing entry exists for the listing, updates `riskLevel`, `detectedAt`, and `expiresAt` (upsert on unique `listing_id` constraint). Elevates priority of any open tickets for the associated account.

**P1 payload fields used:** `listingId`, `accountId`, `riskFactors` — all present in `ChurnRiskDetectedEvent` (CR §1.2). Verified against Ops §2 P1 table.

```
handleChurnRiskDetected(event: ChurnRiskDetectedEvent):
  // Determine risk level from risk factors
  riskLevel = event.riskFactors.includes("payment_at_risk") ? "high_risk" : "at_risk"

  // Upsert churn risk registry [schema §2.3]
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

  // Elevate priority of open tickets for the account [CR-X-20]
  UPDATE support_tickets
    SET priority = 'high'
    WHERE account_id = event.accountId
      AND status IN ('open', 'assigned')
      AND priority NOT IN ('critical', 'high')  // don't downgrade existing critical/high

  logDecision({
    domain: "operations",
    decisionType: "support_triage",
    inputs: {
      listingId: event.listingId,
      riskFactors: event.riskFactors,
    },
    output: {
      riskLevel: riskLevel,
      action: "churn_risk_upserted",
    },
    entityContext: { listingId: event.listingId, accountId: event.accountId },
  })
```

**Side effects:** 1 churn_risk_registry upsert. 0–N ticket priority elevations. 1 decision log entry.

**Idempotency (P2):** The `ON CONFLICT` upsert ensures that receiving the same event twice produces the same state — the registry entry is overwritten with identical values.

---

## 9.13 winback_eligible (CR)

**Consumer ID:** `operations:winback_eligible:winbackDelivery`
**Mode:** Async
**Source:** CR §1.3, Ops §7

Sends win-back email via Resend using the `winback` template. CR provides merge field values via `event.mergeFields`. Ops resolves `accountEmail` from `event.cancelledAccountId` via auth infrastructure (not a cross-domain read). Emits `winback_delivery_result` with delivery status. [Source: Ops §7]

**P1 payload fields used:** `listingId`, `cancelledAccountId`, `mergeFields` — all present in `WinbackEligibleEvent` (CR §1.3). Verified against Ops §2 P1 table.

```
handleWinbackEligible(event: WinbackEligibleEvent):
  // Resolve account email from cancelledAccountId [Ops §7]
  account = getAccount(event.cancelledAccountId)
  if !account || !account.email:
    emit({ type: "winback_delivery_result", listingId: event.listingId,
           accountId: event.cancelledAccountId, status: "failed", timestamp: now() })
    return

  // Send win-back email [SI §5.1 — EmailService checks unsubscribe prefs]
  result = EmailService.send({
    to: account.email,
    template: "winback",
    data: event.mergeFields,
    category: "conversion_marketing",
    accountId: event.cancelledAccountId,
  })

  // Map email result to delivery status
  deliveryStatus = result.status === "sent" || result.status === "queued"
    ? "delivered"
    : result.status === "suppressed" ? "failed"  // unsubscribed
    : "failed"

  // Emit winback_delivery_result [Ops §1.3]
  emit({
    type: "winback_delivery_result",
    listingId: event.listingId,
    accountId: event.cancelledAccountId,
    status: deliveryStatus,
    timestamp: now(),
  })

  logDecision({
    domain: "operations",
    decisionType: "winback_delivery",
    inputs: { listingId: event.listingId, cancelledAccountId: event.cancelledAccountId },
    output: { emailStatus: result.status, deliveryStatus: deliveryStatus },
    entityContext: { listingId: event.listingId, accountId: event.cancelledAccountId },
  })
```

**Side effects:** 0–1 email (`winback` template). 1 event emitted (`winback_delivery_result`). 1 decision log entry.

**`"suppressed"` handling:** If the account has unsubscribed from `conversion_marketing`, `EmailService.send()` returns `{ status: "suppressed" }` (SI §5.1). Ops maps this to `winback_delivery_result.status: "failed"` — CR logs the failure for win-back effectiveness tracking (CR §1.3 consumer). No retry — unsubscribe preference is authoritative.

---

## 9.14 pending_cancellation_created (CR)

**Consumer ID:** `operations:pending_cancellation_created:storePendingCancellation`
**Mode:** Async
**Source:** CR §1.4, Ops §5

Stores a pending cancellation record in the `pending_cancellations` table for Paddle webhook attribution. When Paddle confirms the cancellation via webhook, Ops' `inferCancellationReason` looks up this record by `paddleSubscriptionId` to attribute the `subscription_ended` event's `reason` field.

**P1 payload fields used:** `paddleSubscriptionId`, `listingId`, `reason` — all present in `PendingCancellationCreatedEvent` (CR §1.4). Verified against Ops §2 P1 table.

```
handlePendingCancellationCreated(event: PendingCancellationCreatedEvent):
  // Store pending cancellation record [schema §2.4]
  INSERT INTO pending_cancellations (
    paddle_subscription_id, listing_id, reason, created_at
  ) VALUES (
    event.paddleSubscriptionId,
    event.listingId,
    event.reason,
    now()
  )
  // No unique constraint on paddle_subscription_id (01-schema.md §2.4 rationale)
  // Duplicate events create duplicate records — webhook handler uses most recent
```

**Side effects:** 1 pending_cancellations insert. No emails, no events, no notifications.

**Idempotency (P2):** Duplicate events create duplicate rows. The Paddle webhook handler queries `ORDER BY created_at DESC LIMIT 1` to use the most recent record. Stale duplicates are cleaned up 24h after creation (§10.1 inline cleanup). No functional impact from duplicates.

**Multi-emitter note (D&L §1.10 [XI-1]):** `pending_cancellation_created` has three emitters: CR (churn intervention, low-quality intervention), D&L (archival of paid listing), PP (account closure — writes directly, bypassing this consumer). This handler processes events from CR and D&L. PP's closure path writes to `pending_cancellations` directly (synchronous requirement — the record must exist before `PaymentService.cancelSubscription` is called, because Paddle may webhook immediately). [Source: schema §2.4 ownership exception]

---

## 9.15 P1 Compliance Summary

All 13 consumers verified against `EventPayloadMap` (SI §1.2) and Ops §2 P1 table.

| Consumer | Payload Fields Used | Source Verified |
|----------|-------------------|----------------|
| `claim_approved` | `listingId`, `method`, `timestamp` | D&L §1.1, Ops §2 |
| `claim_rejected` | `listingId`, `timestamp` | D&L §1.2, Ops §2 |
| `listing_archived` | `listingId` | D&L §1.3, Ops §2 |
| `listing_suspended` | `listingId` | D&L §1.4, Ops §2 |
| `listing_reactivated` | `listingId` | D&L §1.5, Ops §2 |
| `decay_signal_detected` | `listingId`, `signal.severity`, `activeSupportTicket` | D&L §1.7, Ops §2 |
| `erasure_completed` | `accountHash`, `listingIdsAnonymised`, `listingIdsDeleted`, `freelancerListingsDeleted`, `timestamp` | D&L §1.9, Ops §2 |
| `account_closed` | `accountId`, `listingsArchived`, `complianceHoldActive` | PP §1.9, Ops §2 |
| `listing_created` | `listingId`, `entityType`, `timestamp` | PP §1.6, Ops §2 |
| `contact_attempt` | `listingId`, `result` | PP §1.8, Ops §2 |
| `churn_risk_detected` | `listingId`, `accountId`, `riskFactors` | CR §1.2, Ops §2 |
| `winback_eligible` | `listingId`, `cancelledAccountId`, `mergeFields` | CR §1.3, Ops §2 |
| `pending_cancellation_created` | `paddleSubscriptionId`, `listingId`, `reason` | CR §1.4, Ops §2 |

No handler reads fields absent from the payload type. No handler performs a cross-domain DB read for business logic decisions. Infrastructure reads (account email resolution for decay warning and win-back delivery) are consistent with the established pattern in Ops §7.

---

## Cross-References

| Document | Relationship |
|----------|-------------|
| `shared-infrastructure.md` (v6) | §1.2 `EventPayloadMap` (P1 verification), §1.3 sync/async classification, §1.4 P1–P5 principles, §1.5 consumer health monitoring + `EVENT_CONSUMER_MATRIX`, §2.1 `DeferredActionParamsMap` (cancel action calls), §3 orchestrated flow engine (erasure handler), §5 email transport (decay warning, win-back, DSAR completion), §9 decision logging |
| `operations.md` (v3) | §2 consumed events (authoritative consumer action table + P1 field mapping) |
| `data-and-listings.md` (v5) | §1.1–§1.9 event payload types (D&L-emitted events consumed by Ops) |
| `platform-and-product.md` (v5) | §1.6, §1.8, §1.9 event payload types (PP-emitted events consumed by Ops) |
| `commercial-and-revenue.md` (v3) | §1.2–§1.4 event payload types (CR-emitted events consumed by Ops) |
| `s7-drafting/01-schema.md` | §2.3 `churn_risk_registry`, §2.4 `pending_cancellations`, §2.6 `compliance_register` (tables written by consumers) |
| `s7-drafting/01-decisions.md` | D1 (`sla_breach_warning` deferred action), D3 (`paddle_reconciliation` reason), D4 (admin notifications via existing table) |
