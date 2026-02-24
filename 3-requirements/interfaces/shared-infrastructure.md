# Shared Infrastructure — Interface Specification

**Status:** Draft v11 — v10 + Communications Phase 1: §2.1 +`retry_bounced_email` (34→35 deferred actions), §2.2 +registered action row, §5.1 +correspondence logging via `LoggingEmailService` decorator + system-level suppression, §9.2 +`email_suppressed` decision type (27→28). Total: 35 deferred actions, 30 email templates, 19 notification types, 28 decision types.
**Domain:** Cross-Domain (shared infrastructure)
**Last updated:** 2026-02-22
**Inputs:** `cross-domain-dependencies.md` (v3 §2–§3, §5–§6, §9–§10), `decisions/interface-questions-trade-off-evaluation.md` (OQ-1–OQ-4, ST-1–ST-12, P1–P5, R1–R12), `decisions/sq-1.md` (sync/async classification), `decisions/sq-2.md` (orchestrated flow recovery), `entity-architecture-frame.md` (v2 §Sub-Entity Contract Specification), `platform-and-product.md` (v5 §1.4, §10), `data-and-listings.md` (v6 §4), `operations.md` (v6 §2–§3), `slices/slice-09-entity-intelligence/index.md` (v2 — 17 deferred actions, 4 templates, 2 notification types, 7 decision types), `slices/slice-10-hardening/index.md` (v2 — +1 decision type)
**Downstream:** `slices/slice-00-infrastructure.md`, all domain interface specs (import shared types + principles), all feature slices (consume infrastructure)

---

## Summary

This document specifies the shared infrastructure that all four sub-entities depend on. It defines the boundary surface — types, contracts, principles, and non-functional requirements — not the implementation. Implementation lives in S0.

Nine infrastructure concerns: event bus, deferred action scheduler, orchestrated flow engine, auth, email transport, object storage, rendering strategy, notification infrastructure, and structured decision logging. Plus five architectural principles governing event-driven coordination, one service abstraction layer contract, and non-functional requirements.

---

## 1. Event Bus

### 1.1 Transport Decision

Application-level event bus — an in-process TypeScript module (`emit()` + `on()`). Consumers register at module load as side effects. Events dispatched within the same request lifecycle or via `waitUntil()` for async consumers. [Source: interface-questions OQ-1]

No external queue, no `pg_notify`, no message broker at V1. The bus is a transport detail behind a stable contract surface. Migration trigger: async consumer execution time >30% of average request duration → evaluate Inngest. [Source: interface-questions ST-5]

### 1.2 Bus Contract

```typescript
type EventType = /* union of all 25 event type string literals */

type EventPayloadMap = {
  claim_approved: ClaimApprovedEvent
  claim_rejected: ClaimRejectedEvent
  listing_archived: ListingArchivedEvent
  listing_suspended: ListingSuspendedEvent
  listing_reactivated: ListingReactivatedEvent
  verification_tier_changed: VerificationTierChangedEvent
  decay_signal_detected: DecaySignalDetectedEvent
  quality_score_changed: QualityScoreChangedEvent
  erasure_completed: ErasureCompletedEvent
  subscription_tier_changed: SubscriptionTierChangedEvent
  subscription_ended: SubscriptionEndedEvent
  winback_delivery_result: WinbackDeliveryResultEvent
  search_performed: SearchPerformedEvent
  profile_viewed: ProfileViewedEvent
  enquiry_submitted: EnquirySubmittedEvent
  enquiry_responded: EnquiryRespondedEvent
  shortlist_added: ShortlistAddedEvent
  listing_created: ListingCreatedEvent
  profile_edited: ProfileEditedEvent
  contact_attempt: ContactAttemptEvent
  account_closed: AccountClosedEvent
  conversion_milestone: ConversionMilestoneEvent
  churn_risk_detected: ChurnRiskDetectedEvent
  winback_eligible: WinbackEligibleEvent
  pending_cancellation_created: PendingCancellationCreatedEvent
}

// Payload types are authoritative in domain interface specs.
// This map is the compilation boundary — import payload types from their owning domain.

type EventHandler<T extends EventType> = {
  domain: "data-and-listings" | "operations" | "platform" | "commercial"
  eventType: T
  mode: "sync" | "async"
  handler: (payload: EventPayloadMap[T]) => Promise<void>
}

// Core bus interface
interface EventBus {
  emit<T extends EventType>(event: EventPayloadMap[T]): Promise<void>
  on<T extends EventType>(registration: EventHandler<T>): void
  getRegisteredHandlers(): Map<EventType, EventHandler<any>[]>
}
```

**Dispatch behaviour:**

1. `emit()` collects all registered handlers for the event type.
2. Sync handlers execute sequentially, awaited. If any throws, the emitting request fails — the consumer's thrown error propagates as-is to the caller. The caller does not need to handle per-consumer errors; the request fails and the user retries. For admin debugging, the error is also logged as an `EventConsumerError` (§1.5) with the originating consumer's domain and ID. [Source: SI-2]
3. Async handlers execute via `waitUntil()` — post-response, non-blocking. Failures logged via structured error logging (§1.5).
4. Sync handlers always execute before async handlers for the same event.

### 1.3 Sync/Async Classification

Per-event per-consumer classification. Full matrix in `decisions/sq-1.md`. Summary:

| Classification | Count | Pattern |
|---|---|---|
| Sync (must complete before HTTP response) | 3 | All search index consistency: `claim_approved` → PP dashboard access grant, `listing_archived` → PP remove from search, `listing_reactivated` → PP restore to search |
| Async (post-response via `waitUntil()`) | ~48 | Everything else |
| Orchestrated (not bus-dispatched) | 1 | `erasure_completed` → Ops close DSAR case (within orchestrator's sequential execution) |
| N/A (no cross-domain consumers) | 1 | `shortlist_added` |

Each domain interface spec carries a consumer table with a `Sync/Async` column. The event bus enforces the classification at dispatch time — sync handlers are awaited, async handlers are dispatched to `waitUntil()`.

### 1.4 Architectural Principles (P1–P5)

These govern all event-driven coordination across sub-entities. Enforcement mechanisms are specified per principle.

**P1 — Payload self-containment.** Consumers use the event payload for their immediate reaction, not a DB read in the same handler. DB reads are for subsequent requests only. If Platform's feature gating consumer needs the new subscription tier, it reads `event.newTier`, not `db.listing.subscriptionTier`. [Source: ST-2]

*Enforcement:* interface specs document which payload fields each consumer uses. Code review.

**P2 — Consumer idempotency.** Emitters emit unconditionally. Consumers handle gracefully. A consumer receiving the same event twice must produce the same outcome as receiving it once. [Source: ST-1]

*Enforcement:* integration tests emit duplicate events and assert no side-effect duplication.

**P3 — Context defensiveness.** Events tell you *what happened*, not *why*. If a consumer's reaction depends on *why*, it checks entity state or branches on event payload `origin`/`reason` fields. Example: Platform's `subscription_ended` consumer checks `event.origin` — if `"closure"`, skips the re-subscribe CTA. [Source: ST-3]

*Enforcement:* event schemas include `origin` or `reason` fields where multi-context events exist. Two events carry origin fields: `SubscriptionEndedEvent.origin` (`"paddle" | "archival" | "closure"`) and `ClaimApprovedEvent.method` (`"auto" | "manual" | "disputed_resolved"`) [XI-12].

**P4 — Import, never copy.** No domain reimplements another domain's logic. Cross-domain functions live in the owning domain's export surface. `computeTaxonomyOverlap` lives in D&L. `computeFeatureAccess` lives in Commercial. `mapPaddleWebhook` lives in Commercial (executed within Operations' handler). Compiler catches signature changes. [Source: ST-7, OQ-2]

*Enforcement:* TypeScript imports. Compiler enforces at build time.

**P5 — Explicit dispatch mode.** Every consumer registration declares `mode: "sync" | "async"`. The event bus dispatches accordingly. No implicit defaults. Classification is documented in interface specs and enforced at runtime. [Source: ST-4, SQ-1]

*Enforcement:* `EventHandler.mode` field. Bus validates mode against expected classification at startup (see §1.5).

### 1.5 Consumer Health Monitoring

Three layers, no heartbeat. [Source: interface-questions OQ-4]

**Layer 1 — Runtime error capture.** Event bus wraps every consumer invocation in try/catch. On failure, logs structured error:

```typescript
type EventConsumerError = {
  eventType: EventType
  consumerDomain: string
  consumerId: string          // convention: "{domain}:{eventType}:{actionName}"
                              // e.g., "platform:claim_approved:dashboardAccessGrant" [Source: SI-3]
  payload: unknown            // the event payload that caused the failure
  error: string
  stack: string
  timestamp: ISO8601
  mode: "sync" | "async"
}
```

**Consumer ID convention:** `consumerId` follows the pattern `"{domain}:{eventType}:{actionName}"` where `actionName` matches the consumer table row name in the domain interface spec. This enables the failed event admin view (R3, S7) to group errors by consumer identity.

Sync consumer errors propagate to the caller (request fails). Async consumer errors are logged and surfaced in the failed event admin view (S7, R3).

**Layer 2 — Startup registration check.** On application boot, the event bus validates that for every entry in `EVENT_CONSUMER_MATRIX`, a handler tagged with the matching domain is registered. Missing handler → startup failure (fail fast). [Source: ST-11, R4]

```typescript
const EVENT_CONSUMER_MATRIX: Record<EventType, { domain: string; mode: "sync" | "async" }[]> = {
  "claim_approved": [
    { domain: "platform", mode: "sync" },
    { domain: "platform", mode: "async" },   // ISR revalidation + deliver queued enquiries [XI-9]
    { domain: "operations", mode: "async" },
    { domain: "commercial", mode: "async" },
  ],
  "claim_rejected": [
    { domain: "platform", mode: "async" },   // rejection notification [XI-2]
    { domain: "operations", mode: "async" },
  ],
  // ... all 25 event types, all consumers, derived from cross-domain-deps §2.2 + decisions/sq-1.md
}
```

**Multi-mode per domain [XI-9]:** A domain can appear multiple times for the same event with different modes. Example: Platform has both a sync consumer (search index) and async consumers (ISR, enquiry delivery) for `claim_approved`. The startup check validates that for every matrix entry, a handler with the matching domain *and* mode is registered.

The matrix is the authoritative runtime register of expected cross-domain subscriptions. When a slice adds a new consumer, it must update the matrix.

**Layer 3 — Integration test suite.** For each event type, emit a test event, assert expected side effects via mocked dependencies. Catches consumers that silently do nothing (logic bugs). Runs in CI on every deploy. [Source: ST-12]

### 1.6 `waitUntil()` Operational Constraints

The async consumer model depends on Vercel's `waitUntil()` API, which extends the serverless function lifecycle beyond the HTTP response. [Source: SI-20]

**Execution time limit:** Vercel Pro plan allows up to 300s function execution (including `waitUntil()`). At V1 async consumer volume (~48 consumers across all events, most <5s each), this is not a constraint. No single request triggers all 48 consumers — typical requests trigger 2–6 consumers.

**Cold-start risk:** If a serverless function cold-starts or the process terminates during `waitUntil()` execution, async consumers for that request are lost. The event bus error logging (§1.5) does not capture this because the process terminates before the try/catch fires. Mitigation: `EVENT_CONSUMER_MATRIX` integration tests (§1.5 Layer 3) catch systematic consumer failures. One-off cold-start losses are acceptable at V1 scale (~50–200 events/day). This is a known trade-off.

**Migration eliminates this risk:** Moving to Inngest (§1.7 migration trigger) persists events to a durable queue before consumer execution, eliminating cold-start data loss.

### 1.7 Scaling Monitoring Signal

Monitor: async consumer execution time as a percentage of average request duration. Measured per request that emits events. Logged as a structured metric.

Threshold: >30% sustained over 7 days → evaluate migration to Inngest or Supabase-backed queue. No automated action — surfaces in Operations Health Review ceremony. [Source: ST-5]

---

## 2. Deferred Action Scheduler

### 2.1 Contract

Shared infrastructure — not owned by a single domain. All domains register actions; the scheduler executes them. [Source: cross-domain-deps §3.2]

```typescript
type DeferredAction<T extends keyof DeferredActionParamsMap = keyof DeferredActionParamsMap> = {
  id: UUID
  action: T                           // deterministic operation name
  params: DeferredActionParamsMap[T]  // type-safe per action [Source: SI-5]
  executeAt: ISO8601                  // when to fire
  retryPolicy: "once" | "retry_3"    // retry_3 = 3 retries with exponential backoff
  onFailure: "log" | "alert_principal"
  createdBy: string                   // domain that registered the action
  status: "pending" | "executing" | "completed" | "failed" | "exhausted" | "cancelled"
  cancelledAt?: ISO8601               // [Source: SI-4]
  cancelledBy?: string                // domain or admin that cancelled
}

// Type-safe params per action. Grows as slices register new actions. [Source: SI-5]
type DeferredActionParamsMap = {
  expire_enquiry_queue: { listingId: UUID }
  compliance_schedule_check: Record<string, never>
  billing_reconciliation: {}
  compliance_hold_recheck: { accountId: UUID; flowId: UUID }
  win_back_evaluation: { listingId: UUID; accountId: UUID }
  auto_escalation_check: { flowId: UUID; flowType: "erasure" | "closure" }
  notification_cleanup: {}            // [Source: SI-17]
  grace_period_expiry: { listingId: UUID; gracePeriodId: UUID }  // [S4-ST-1]
  checkout_precondition_retry: { paddleEvent: CheckoutCompletedEvent; attemptCount: number; maxAttempts: number }  // [S4-ST-1]
  listing_update_reminder: { listingId: UUID }                                                    // [S5-ST-1]
  enquiry_response_reminder: { enquiryId: UUID; listingId: UUID }                                 // [S5-ST-1]
  search_history_cleanup: Record<string, never>                                                    // [S6-ST-3]
  sla_breach_warning: { ticketId: UUID; slaDeadline: ISO8601 }                                     // [S7-ST-1]
  task_timeout_check: { taskId: UUID }                                                             // [S7-ST-1]
  billing_hold_expiry: { listingId: UUID; holdId: UUID }                                           // [S7-ST-1]
  compliance_self_audit: Record<string, never>                                                     // [S7-ST-1]
  check_quality_improvement: { listingId: UUID; baselineScore: number }                            // [S8-ST-2]
  quality_score_recalculation: { listingId: UUID }                                                  // [S9-ST-1]
  decay_liveness_check: { listingId: UUID; checkType: EnrichmentCheckType }                         // [S9-ST-1]
  enrichment_full_cycle: { listingId: UUID }                                                        // [S9-ST-1]
  claim_abandonment_check: Record<string, never>                                                    // [S9-ST-1]
  taxonomy_review_preparation: Record<string, never>                                                // [S9-ST-1]
  data_health_review: Record<string, never>                                                         // [S9-ST-1]
  verification_calibration_review: Record<string, never>                                            // [S9-ST-1]
  provider_outreach_ranking: Record<string, never>                                                  // [S9-ST-1]
  conversion_funnel_analysis: Record<string, never>                                                 // [S9-ST-1]
  revenue_health_extended: Record<string, never>                                                    // [S9-ST-1]
  multi_listing_pricing_evaluation: Record<string, never>                                           // [S9-ST-1]
  sponsored_placement_learning: Record<string, never>                                               // [S9-ST-1]
  operational_health_review: Record<string, never>                                                  // [S9-ST-1]
  contractor_performance_review: Record<string, never>                                              // [S9-ST-1]
  principal_briefing_generation: Record<string, never>                                              // [S9-ST-1]
  proactive_churn_detection: Record<string, never>                                                  // [S9-ST-1]
  learning_hypothesis_analysis: Record<string, never>                                               // [S9-ST-1]
  retry_bounced_email: { correspondenceLogId: string; originalParams: EmailSendParams }              // [Comms-P1]
}
```

**`"cancelled"` status [Source: SI-4]:** Terminal state. Used when a deferred action is no longer needed (e.g., CR cancels a win-back schedule on `claim_approved`; PP cancels compliance hold rechecks when hold clears). The scheduler skips cancelled actions.

**Distinction from TaskSpec:** DeferredActions are deterministic entity operations (no human judgment). TaskSpecs are scoped human tasks with acceptance criteria and learning capture. They share scheduling infrastructure but have different lifecycles. [Source: cross-domain-deps §3.2]

### 2.2 Registered Actions by Domain

| Domain | Action | Trigger | Delay | Retry | On Failure |
|---|---|---|---|---|---|
| D&L | `expire_enquiry_queue` | Enquiry received on unclaimed listing | 90 days | `once` | `log` |
| Operations | `compliance_schedule_check` | Self-perpetuating, seeded on startup | 24h recurring | `retry_3` | `alert_principal` |
| Operations | `billing_reconciliation` | Daily | 24h recurring | `retry_3` | `alert_principal` |
| Platform | `compliance_hold_recheck` | Account closure with active hold | Weekly | `retry_3` | `log` |
| Commercial | `win_back_evaluation` | `subscription_ended` event | 60 days | `once` | `log` |
| Shared | `auto_escalation_check` | Orchestrated flow initiated | Per escalation rules (§3.4) | `retry_3` | `alert_principal` |
| Shared | `notification_cleanup` | Daily | 24h recurring | `retry_3` | `log` |
| Commercial | `grace_period_expiry` | Grace period created (payment failure or voluntary cancellation) | 14 days | `retry_3` | `alert_principal` |
| Operations | `checkout_precondition_retry` | `checkout_completed` webhook for unclaimed listing | 5 minutes (recurring up to 1 hour) | `once` | `log` |
| Platform | `listing_update_reminder` | 90 days after profile edit (recurring via self-scheduling) | `once` | `log` |
| Platform | `enquiry_response_reminder` | 7 days after enquiry delivery | `once` | `log` |
| Platform | `search_history_cleanup` | Self-perpetuating, seeded on startup | 24h recurring | `once` | `log` |
| Operations | `sla_breach_warning` | Ticket creation with SLA | 80% of SLA duration | `once` | `log` |
| Operations | `task_timeout_check` | TaskSpec creation | Timeout hours from creation | `once` | `log` |
| Operations | `billing_hold_expiry` | Billing hold creation | 48 hours | `once` | `log` |
| Operations | `compliance_self_audit` | Self-perpetuating, seeded on startup | 24h recurring | `once` | `log` |
| Commercial | `check_quality_improvement` | Low-quality intervention (S8 §7) | 30 days | `once` | `log` |
| D&L | `quality_score_recalculation` | Event-driven + nightly batch | Event-driven or 24h batch | `retry_3` | `log` |
| D&L | `decay_liveness_check` | Per enrichment cadence (self-perpetuating) | Per cadence tier | `retry_3` | `log` |
| D&L | `enrichment_full_cycle` | Per enrichment cadence (self-perpetuating) | Per cadence tier | `retry_3` | `alert_principal` |
| D&L | `claim_abandonment_check` | Daily batch | 24h recurring | `once` | `log` |
| D&L | `taxonomy_review_preparation` | Quarterly (self-perpetuating) | Quarterly | `once` | `log` |
| D&L | `data_health_review` | Monthly (self-perpetuating) | Monthly | `once` | `log` |
| D&L | `verification_calibration_review` | Quarterly (self-perpetuating) | Quarterly | `once` | `log` |
| D&L | `provider_outreach_ranking` | Monthly (self-perpetuating) | Monthly | `once` | `log` |
| CR | `conversion_funnel_analysis` | Monthly (self-perpetuating) | Monthly | `once` | `log` |
| CR | `revenue_health_extended` | Monthly (self-perpetuating) | Monthly | `once` | `log` |
| CR | `multi_listing_pricing_evaluation` | Quarterly, 20+ account threshold (self-perpetuating) | Quarterly | `once` | `log` |
| CR | `sponsored_placement_learning` | Monthly (self-perpetuating) | Monthly | `once` | `log` |
| Ops | `operational_health_review` | Monthly (self-perpetuating) | Monthly | `once` | `log` |
| Ops | `contractor_performance_review` | Quarterly (self-perpetuating) | Quarterly | `once` | `log` |
| Ops | `principal_briefing_generation` | Monthly (self-perpetuating) | Monthly | `once` | `log` |
| CR | `proactive_churn_detection` | Weekly (self-perpetuating) | Weekly | `retry_3` | `log` |
| Ops | `learning_hypothesis_analysis` | Monthly (self-perpetuating) | Monthly | `once` | `log` |
| Platform | `retry_bounced_email` | Soft bounce on outbound email | 24h | `once` | `log` |

**`notification_cleanup` [Source: SI-17]:** Deletes notifications older than 90 days (§8.3 retention policy). Bulk `DELETE` operation — uses the deferred action scheduler rather than a separate PostgreSQL scheduled job to keep all scheduled operations in one mechanism.

Slices register new action handlers incrementally. S0 provides the generic mechanism (register/execute/retry/status). Each feature slice adds its domain-specific action handlers.

### 2.3 Execution Model

At V1 scale (~4,700 listings, ~50–200 events/day), a single polling loop is sufficient. **Polling interval: 60 seconds** (configurable). At this granularity, auto-escalation deadline checks (§3.4) are accurate to ±60s — acceptable given 7-day/3-day/deadline-day granularity. [Source: SI-6]

The scheduler:

1. Polls `deferred_actions` table for rows where `executeAt <= now()` and `status = "pending"`.
2. Sets `status = "executing"`.
3. Resolves the action handler by `action` name from a typed handler registry (keyed by `DeferredActionParamsMap`).
4. Executes. On success: `status = "completed"`. On failure: retry per policy, or `status = "exhausted"` + fire `onFailure`.
5. Skips rows with `status = "cancelled"`.

No distributed locking needed at V1 (single process). If scaling to multiple workers, add a `pg_advisory_lock` on the action row.

---

## 3. Orchestrated Flow Engine

### 3.1 Two Flow Patterns

Cross-domain coordination uses two distinct patterns. [Source: interface-questions OQ-3]

**Pattern 1 — Orchestrated flows.** Sequential function calls within a request or background job. The orchestrator owns the transaction. Steps within a single domain use a Supabase PostgreSQL transaction. Steps across domains are sequential awaits. Failure → halt, log, surface in admin. Completion event emitted at the end.

**Pattern 2 — Reactive flows.** Event bus dispatch. Consumers are independent. Failure of one consumer doesn't block others. Failed consumers log errors; admin dashboard surfaces inconsistencies.

**Flow classification:**

| Flow | Pattern | Orchestrator | Completion Event |
|---|---|---|---|
| GDPR erasure | Orchestrated | Operations | `erasure_completed` |
| Account closure | Orchestrated | Platform | `account_closed` |
| New subscription | Reactive | — (Paddle webhook) | — |
| Subscription change | Reactive | — (`subscription_tier_changed`) | — |
| Claim approval | Reactive | — (`claim_approved`) | — |
| All other events | Reactive | — | — |

### 3.2 Orchestrated Flow Progress Record

```typescript
type OrchestratedFlowProgress = {
  flowId: UUID
  flowType: "erasure" | "closure"
  triggeredBy: UUID                    // accountId or DSAR requestId
  status: "initiated" | "in_progress" | "completed" | "failed" | "escalated"
  steps: OrchestratedFlowStep[]
  currentStep: number
  startedAt: ISO8601
  completedAt?: ISO8601
  deadline?: ISO8601                   // 30 days from request for erasure. Null for closure.
  escalatedAt?: ISO8601
  escalationReason?: string
}

type OrchestratedFlowStep = {
  name: string
  domain: string                       // owning domain for display and retry routing [Source: SI-7]
  status: "pending" | "in_progress" | "completed" | "failed" | "skipped"
  attempt: number                      // starts at 1, increments on retry
  completedAt?: ISO8601
  error?: string
  retryable: boolean                   // always true at V1 (all steps are individually retryable)
  skippable: boolean                   // from skip constraint matrix (§3.5)
  skipReason?: string                  // free text, required when skipped
  skippedBy?: string                   // admin identifier
}
```

Persisted in a single `orchestrated_flows` table with `flowType` discriminator. Not a separate table per flow type. [Source: SQ-2 R9]

### 3.3 Generic Orchestrator Function

The orchestrator accepts a step list, executes sequentially, logs progress, handles failure/retry/escalation. [Source: SQ-2 R8]

```typescript
type OrchestratorStepDef<TContext = Record<string, unknown>> = {
  name: string
  domain: string                                     // [Source: SI-7]
  execute: (context: TContext) => Promise<void>      // [Source: SI-8]
  skippable: boolean
}

async function executeOrchestratedFlow<TContext = Record<string, unknown>>(
  flowType: "erasure" | "closure",
  triggeredBy: UUID,
  steps: OrchestratorStepDef<TContext>[],
  initialContext: TContext,
  deadline?: ISO8601
): Promise<OrchestratedFlowProgress>
```

**Shared context [Source: SI-8]:** The orchestrator creates a mutable context object (`initialContext`) and passes it to each step. Steps write intermediate results into context; later steps read them. Example: account closure step 1 writes `listingsArchived: UUID[]` into context; step 6 reads it for the `account_closed` event payload. This is simpler than a pipe/accumulator and fits the sequential execution model.

Behaviour:
1. Creates `OrchestratedFlowProgress` record with status `"initiated"`.
2. Iterates steps sequentially. Sets each to `"in_progress"`, then `"completed"` or `"failed"`.
3. On step failure: sets flow status to `"failed"`, halts. Does not continue to next step.
4. On completion of all steps: sets flow status to `"completed"`.
5. Schedules auto-escalation deferred actions (§3.4).

Resume from failure: admin triggers retry via S7 UI. Orchestrator reads `currentStep` from the progress record, resumes from that step. Prior completed steps are not re-executed. The context object is persisted with the progress record and restored on resume.

**No hard retry limit [Source: SI-9]:** After auto-escalation (§3.4), the principal can trigger retry indefinitely. The attempt counter is unbounded. Auto-escalation triggers at 3 consecutive failures, then resets if the principal retries. This is intentional — root cause fixes may take multiple attempts.

### 3.4 Auto-Escalation Rules

The entity doesn't wait for a human to notice a stuck flow. Two triggers, implemented as deferred actions. [Source: SQ-2]

**Erasure deadline proximity:**

| Trigger | Action |
|---|---|
| 7 days before deadline | Alert: admin dashboard + email to principal |
| 3 days before deadline | Auto-escalate to principal (flow status → `"escalated"`) |
| Deadline passed | CRITICAL alert. Principal + compliance flag. |

**Retry exhaustion (both flow types):**

3 consecutive failures on the same step → auto-escalate to principal. Prevents infinite retry loops from a bug that won't self-resolve.

No auto-escalation for account closure beyond retry exhaustion — no statutory deadline. Failed closures surface in the admin dashboard. If unresolved after 7 days, a reminder appears in the weekly Operations Health Review ceremony. [Source: Ops §6.2]

### 3.5 Skip Constraint Matrix

Not every step can be skipped safely. The admin interface enforces these constraints. [Source: SQ-2 R11]

**GDPR Erasure:**

| Step | Action | Skippable | Rationale |
|---|---|---|---|
| 1 | Verify identity | No | Legal requirement. Without verified identity, erasure cannot proceed. |
| 2 | Extract account data for audit | Yes | Data loss for audit trail. Admin accepts accountability. Warning: "Skipping extraction means no audit record of erased data." |
| 3 | Close active support tickets | Yes | Tickets remain open. Ops cleans up manually. |
| 4 | Execute processErasure | No | The entire point of the flow. |
| 5 | Close DSAR case + create audit record | No | Compliance audit record is legally required. DSAR case must close to clear compliance hold. [XI-11] |
| 6 | Emit erasure_completed + downstream consumers | Yes | Legally compliant (data erased). Operationally inconsistent (search index, shortlists). Admin triggers manual cleanup. |

**Account Closure:**

| Step | Action | Skippable | Rationale |
|---|---|---|---|
| 1 | Archive all listings | No | Listings must be removed from search. |
| 2 | Cancel Paddle subscriptions (direct API call + pending_cancellation records) | Yes | Paddle webhook handles downstream effects. Skipping = admin confirms Paddle cancellations handled manually. [XI-7] |
| 3 | Anonymise buyer enquiry data | Yes | Privacy risk accepted. Admin handles manually. |
| 4 | Delete/defer buyer data | Yes | Data retained longer than expected. No legal violation (closure ≠ erasure). |
| 5 | Deactivate account | No | Account must be disabled. |
| 6 | Emit account_closed + downstream consumers | Yes | Same pattern as erasure step 5. |

Skip requires: free-text reason (mandatory) + admin identifier logged. Skip is a principal-level action — the admin asserts responsibility for the step being incomplete.

---

## 4. Auth

Better Auth. Account is the root entity. Every user has both buyer and provider facets (unified account model). [Source: entity-architecture-frame §Layer 3, data-and-listings.md §1]

### 4.1 Contract

```typescript
// Auth middleware exposes
type AuthSession = {
  accountId: UUID
  email: string
  emailVerified: boolean
  role: "user" | "admin"               // admin = principal access to admin dashboard
  createdAt: ISO8601
}
```

Auth is infrastructure — it doesn't belong to any sub-entity. It provides session context that all sub-entities consume. The `accountId` is the cross-domain join key.

**Role granularity [Source: SI-10]:** V1 uses binary roles (`"user"` | `"admin"`). V2+ may introduce scoped roles (e.g., `"admin:ops"`, `"admin:full"`) for graduated sub-entity autonomy. Auth middleware should treat role as a string prefix match (e.g., `role.startsWith("admin")`) rather than strict enum equality, to ease migration.

### 4.2 Non-Functional Requirements

| Requirement | Target | Rationale |
|---|---|---|
| Session creation latency | <200ms p95 | Login must feel instant |
| Email verification delivery | <30s p95 | User waiting at signup screen |
| Password reset delivery | <30s p95 | User waiting |
| Session token refresh | Handled by Better Auth defaults | No custom implementation needed at V1 |

---

## 5. Email Transport

Resend. Platform owns the delivery pipeline. Content ownership is split across three domains. [Source: cross-domain-deps §1.1, platform-and-product.md §10]

### 5.1 Contract

```typescript
interface EmailService {
  send(params: {
    to: string
    template: EmailTemplateId
    data: Record<string, unknown>     // template-specific merge fields
    category: EmailCategory
    accountId?: UUID                   // required for preference checking on subscribable categories
  }): Promise<EmailSendResult>
}

type EmailSendResult = {
  messageId: string | null             // null when suppressed [Source: SI-12]
  status: "sent" | "queued" | "suppressed" | "failed"
}
```

**Preference enforcement [Source: SI-11]:** `EmailService.send()` checks account unsubscribe preferences before sending. If the account has unsubscribed from the given category, the service returns `{ messageId: null, status: "suppressed" }`. Preference checking is the email service's responsibility — callers do not check preferences themselves. The `accountId` param is required for any category where `Can Unsubscribe = Yes` (§5.3). Transactional emails bypass preference checking.

**`"queued"` status [Source: SI-12]:** Async-latency emails (nudges, conversion marketing — <5min p95) may be queued rather than sent synchronously. The caller receives `"queued"` immediately; delivery completes asynchronously.

**Correspondence logging [Source: Comms-P1]:** `EmailSendParams` accepts optional `threadId` (text — not UUID; accommodates composite thread IDs like `accountId + "onboarding"`) and `listingId`. `EmailSendResult` includes `threadId` (provided or generated UUID). `LoggingEmailService` decorator wraps any `EmailService`, adds system-level suppression check (blocks ALL categories including transactional) and inserts a `correspondence_log` row on every call. Merge fields stored as SHA-256 hash only (no PII). Production: `new LoggingEmailService(new ResendEmailService(...), writer, checker)`.

```typescript
type EmailCategory =
  | "transactional"
  | "enquiry_notification"
  | "listing_status"
  | "profile_nudge"
  | "subscription"
  | "conversion_marketing"

type EmailTemplateId = /* union of 30 template IDs — see §5.2 */ // [S9-ST-4: 26→30]
```

### 5.2 Template Inventory (30 templates)

**Platform Transactional (14):**

| Template ID | Trigger | Unsubscribable |
|---|---|---|
| `email_verification` | Signup | No |
| `password_reset` | Self-service | No |
| `welcome` | Post-verification | No |
| `listing_live` | Listing published | No |
| `claim_approved` | Claim accepted | No |
| `claim_rejected` | Claim rejected | No |
| `claim_pending_review` | Claim queued | No |
| `new_enquiry` | Enquiry received | Yes |
| `enquiry_forwarded` | Unclaimed listing enquiry + claim CTA | Yes |
| `enquiry_reminder` | No response in 7 days | Yes |
| `profile_day1` | Progressive disclosure: listing live | Yes |
| `profile_day3` | Progressive disclosure: add portfolio | Yes |
| `profile_day7` | Progressive disclosure: complete credits | Yes |
| `listing_update_reminder` | 90 days since last update | Yes |
| `enquiry_response` | Provider responds to enquiry | No |

**Operations Compliance (4):**

| Template ID | Trigger | Unsubscribable |
|---|---|---|
| `article_14_notice` | 4rfv seed data import (batch) | No |
| `dsar_acknowledgment` | DSAR request received | No |
| `dsar_completion` | DSAR/erasure completed | No |
| `listing_decay_warning` | Decay signal detected | Yes |
| `support_acknowledgment` | Inbound support request classified | No |

**Subscription (1):** [S4-ST-13]

| Template ID | Trigger | Unsubscribable |
|---|---|---|
| `subscription_confirmed` | Checkout completed (new subscription) | No |

**Commercial Conversion (5):**

| Template ID | Trigger | Unsubscribable |
|---|---|---|
| `conversion_analytics_teaser` | Weekly, if views > 0 | Yes |
| `conversion_social_proof` | Peer upgrade in same area | Yes |
| `conversion_view_milestone` | 50/100/250 profile views | Yes |
| `conversion_engagement_summary` | Quarterly free-tier report | Yes |
| `winback` | 60-day post-cancellation (Ops delivers, CR merge fields) [OPS-ST-4] | Yes |

**Intelligence (4):** [S9-ST-4]

| Template ID | Trigger | Unsubscribable |
|---|---|---|
| `decay_final_notice` | Unresolved high/critical decay signal >90 days | No |
| `enrichment_confirmation_request` | Claimed listing with no edits for >12 months | No |
| `credit_confirmation_outreach` | Credit `verifiedAt` between 330-365 days ago | Yes |
| `principal_briefing` | Monthly principal briefing generation | No |

### 5.3 Preference Management

Per-category unsubscribe (not global). Provider can opt out of profile nudges but still receive enquiry notifications. Preferences stored on Account. Preferences page at `/dashboard/account`.

| Category | Default | Can Unsubscribe |
|---|---|---|
| Transactional | Always on | No |
| Enquiry notifications | On | Yes |
| Listing status | On | Yes |
| Profile nudges | On | Yes |
| Subscription | Always on | No |
| Conversion marketing | On | Yes |

### 5.4 Entity Perception Signal

Email open rates and click-through rates feed progressive disclosure optimisation. >10% unsubscribe rate per category triggers entity decision to reduce frequency or change messaging. [Source: platform-and-product.md §10]

### 5.5 Non-Functional Requirements

| Requirement | Target | Rationale |
|---|---|---|
| Delivery latency (transactional) | <30s p95 | User waiting at screen (verification, password reset) |
| Delivery latency (async: nudges, conversion) | <5min p95 | No user waiting. Batch acceptable. |
| Monthly volume at V1 | <3,000 | Within Resend free tier |

---

## 6. Object Storage (Cloudflare R2)

### 6.1 Contract

```typescript
interface ObjectStorageService {
  upload(params: {
    key: string                        // path within bucket
    data: Buffer | ReadableStream
    contentType: string
    maxSizeBytes: number
    access: "public" | "private"       // [Source: SI-13]
  }): Promise<{ url: string | null }>  // url returned for public; null for private (use getSignedUrl)

  getSignedUrl(key: string, expiresIn: number): Promise<string>

  delete(key: string): Promise<void>

  listByPrefix(prefix: string): Promise<string[]>           // [Source: SI-14]
  deleteByPrefix(prefix: string): Promise<{ deleted: number }>  // [Source: SI-14]
}
```

**Public vs private [Source: SI-13]:** Public uploads (listing images) return a permanent public URL. Private uploads (claim evidence, DSAR exports) return `null` — callers must use `getSignedUrl()` for time-limited access.

**Bulk operations [Source: SI-14]:** `listByPrefix` and `deleteByPrefix` support GDPR erasure (`listings/{listingId}/` prefix) and claim evidence cleanup (`claims/{claimId}/` prefix). R2 supports prefix listing natively.

### 6.2 Usage by Domain

| Domain | Usage | Key Pattern | Access |
|---|---|---|---|
| D&L | Listing images (logo, portfolio, hero) | `listings/{listingId}/images/{imageId}.{ext}` | Public |
| D&L | Claim evidence uploads | `claims/{claimId}/evidence/{filename}` | Private |
| Operations | DSAR data exports (temporary) | `exports/dsar/{dsarId}/{filename}` | Private |

### 6.3 Non-Functional Requirements

| Requirement | Target | Rationale |
|---|---|---|
| Upload size limit | 10MB per image | Prevents abuse. Sufficient for web-quality images. |
| Image formats | JPEG, PNG, WebP | Standard web formats. No SVG (XSS risk). |
| DSAR export retention | 30 days then auto-delete | Data minimisation. Deferred action handles cleanup. |

---

## 7. Rendering Strategy (SSG/ISR/SSR)

Next.js on Vercel. Page rendering strategy determines SEO visibility, performance, and cache invalidation patterns. [Source: platform-and-product.md §1.4]

### 7.1 Page Classification

| Page Type | Strategy | Revalidation | Rationale |
|---|---|---|---|
| Homepage | SSG + ISR | 1 hour | Featured/recently claimed listings update periodically |
| Sector/location landings | SSG + ISR | 1 hour | Listing counts change slowly |
| Listing profiles | SSG + ISR | 15 minutes | SEO-critical; profile data changes infrequently |
| Search results | SSR | Real-time | Dynamic queries, filter combinations |
| Dashboard / editor / admin | CSR | N/A | Authenticated, no SEO value, interactive |
| Pricing page | SSG | Static | Content changes rarely |
| Legal pages | SSG | Static | Content changes rarely |

### 7.2 ISR Revalidation Triggers

Events that trigger on-demand ISR revalidation (via Next.js `revalidatePath` / `revalidateTag`):

| Event | Pages Revalidated | Consumer Mode |
|---|---|---|
| `claim_approved` | Listing profile | Async |
| `listing_archived` | Listing profile, sector/location landing | Async |
| `listing_reactivated` | Listing profile, sector/location landing | Async |
| `listing_suspended` | Listing profile | Async |
| `verification_tier_changed` | Listing profile | Async |
| `profile_edited` | Listing profile | N/A — see note below |
| `erasure_completed` | Listing profile, sector/location landing | Async |

**`profile_edited` ISR [Source: SI-19]:** Platform triggers ISR revalidation directly during the profile save handler (internal, not via event bus). The `profile_edited` event exists for D&L quality score recalculation, not for PP ISR dispatch. Implementers should not wire a `profile_edited` → PP ISR consumer — this would duplicate revalidation.

### 7.3 Structured Data (JSON-LD)

Listing profiles carry JSON-LD `LocalBusiness` (companies) or `Person` (freelancers). No `aggregateRating` at V1 (no reviews). Sitemap auto-generated at `/sitemap.xml`, includes all active listing profiles + sector/location landings. Submitted to Google Search Console. [Source: platform-and-product.md §1.4]

---

## 8. Notification Infrastructure

### 8.1 Architecture

Notification queue infrastructure lives in S0. Notification display UI lives in S5 (Provider Experience). Individual notification triggers are added per slice.

```typescript
type Notification = {
  id: UUID
  accountId: UUID
  type: NotificationType
  title: string
  body: string
  link?: string                        // internal route for click-through
  readAt?: ISO8601              // null = unread [S5-ST-5]
  dismissed: boolean            // true = soft-deleted from list, default false [S5-ST-5]
  dismissedAt?: ISO8601         // [S5-ST-5]
  createdAt: ISO8601
}

type NotificationType =
  | "enquiry_received"
  | "claim_approved"
  | "claim_rejected"
  | "claim_pending_review"              // [Source: SI-15]
  | "subscription_confirmed"
  | "subscription_ending"
  | "quality_score_changed"
  | "conversion_milestone"
  | "churn_risk_suggestion"
  | "decay_warning"
  | "listing_archived_shortlist"        // buyer notification when shortlisted listing erased [Source: SI-15]
  | "account_closure_initiated"         // confirmation to closing user [Source: SI-15]
  | "system"                            // admin broadcasts, maintenance notices
  | "task_overdue"                      // S7: task approaching/past timeout, escalation
  | "billing_anomaly"                   // S7: billing reconciliation anomaly or critical threshold
  | "compliance_deadline"               // S7: compliance obligation approaching deadline, flow escalation
  | "enrichment_confirmation_due"       // S9: claimed listing with no edits for >12 months [S9-ST-15]
  | "ceremony_action_required"          // S9: ceremony outcome requires principal review [S9-ST-15]

// Extensible: slices add notification types incrementally. [Source: SI-15]
```

### 8.2 Delivery

In-app only at V1. Notifications are persisted in the database and displayed in the provider dashboard. No push notifications, no SMS. Email notifications are a separate concern (§5) — some events trigger both an in-app notification and an email.

### 8.3 Non-Functional Requirements

| Requirement | Target | Rationale |
|---|---|---|
| Notification creation latency | <100ms | Must not block the triggering request (always async) |
| Unread count query | <50ms p95 | Dashboard header badge |
| Notification list query | <100ms p95 | Dashboard notification panel |
| Retention | 90 days | Older notifications auto-deleted via deferred action |

---

## 9. Structured Decision Logging

Every autonomous decision the entity makes is logged in a structured format for entity learning (Layer 2 perception). At V1, analysis is manual. Automated feedback loops are V2+. [Source: entity-architecture-frame §Design Principle 8]

### 9.1 Contract

```typescript
type DecisionLog = {
  id: UUID
  domain: "data-and-listings" | "operations" | "platform" | "commercial"
  decisionType: string                 // e.g., "claim_evaluation", "quality_score", "churn_intervention"
  inputs: Record<string, unknown>      // structured inputs to the decision
  output: Record<string, unknown>      // the decision made
  confidence?: number                  // 0–1, where applicable
  timestamp: ISO8601
  entityContext: {
    listingId?: UUID
    accountId?: UUID
    additionalContext?: Record<string, string>  // e.g., ticketId, paddleSubscriptionId [Source: SI-16]
  }
}
```

### 9.2 Decision Types by Domain

| Domain | Decision Types |
|---|---|
| D&L | `claim_evaluation`, `quality_score_computation`, `decay_detection`, `decay_response`, `enrichment_scheduling`, `quality_score_band_evaluation`, `decay_response_evaluation`, `enrichment_cadence_adjustment`, `taxonomy_promotion_evaluation` |
| Operations | `support_triage`, `task_routing`, `billing_reconciliation`, `compliance_scheduling` |
| Platform | `search_ranking`, `onboarding_sequencing`, `account_closure_initiation`, `email_suppressed` |
| Commercial | `conversion_trigger_evaluation`, `churn_intervention`, `winback_evaluation`, `sponsored_placement_selection`, `refund_evaluation`, `feature_gate_friction_evaluation`, `proactive_churn_detection`, `conversion_threshold_adjustment` |
| Cross-domain | `ceremony_outcome_evaluation` (domain varies per ceremony type — uses `ceremonyDomainMap`), `graduation_evaluation` |

Slices add new decision types incrementally. S0 provides the logging infrastructure. S9 (Entity Intelligence) wires perception signals to decision feedback loops.

**Telemetry types (non-autonomous):** `algorithm_comparison` — logged during quality score algorithm rollout (S10 §8). Operational telemetry for A/B comparison, not an autonomous decision. Queried by `admin.graduation.algorithmComparison`.

---

## 10. Service Abstraction Layer

External dependencies are accessed through service interfaces. Production implementations call real APIs. Test implementations are in-memory mocks with assertion capabilities. [Source: ST-12, R5]

### 10.1 Service Interfaces

```typescript
// Email (Resend in production) — includes preference enforcement (§5.1)
interface EmailService { /* §5.1 — send() checks unsubscribe preferences, returns EmailSendResult */ }

// Payments (Paddle in production)
interface PaymentService {
  createCheckoutSession(params: {
    accountId: UUID; listingId: UUID; tier: SubscriptionTier; successUrl: string; cancelUrl: string
    billingCadence?: "annual" | "monthly"      // [S4-ST-4]
    couponCode?: string                         // [S4-ST-4]
    paddleCustomerId?: string                   // [S4-ST-4]
    existingSubscriptionId?: string             // for upgrades [S4-ST-4]
  }): Promise<{ checkoutUrl: string }>

  cancelSubscription(params: {
    paddleSubscriptionId: string; reason: string; effectiveFrom: "immediately" | "end_of_period"
  }): Promise<{ status: "cancelled" | "scheduled" }>

  listSubscriptions(params: {
    paddleCustomerId: string
  }): Promise<PaddleSubscription[]>

  getCustomerPortalUrl(params: {
    paddleCustomerId: string
  }): Promise<string>                                                                             // [S5-ST-4]
}

// Companies House (CH API in production)
interface CompaniesHouseService {
  lookup(companyNumber: string): Promise<{
    found: boolean
    status?: "active" | "dissolved" | "liquidation" | "receivership" | "administration" | "voluntary-arrangement" | "converted-closed" | "insolvency-proceedings"
    name?: string
    registeredAddress?: string
  }>
}

// Object Storage (R2 in production) — includes public/private access + bulk ops (§6.1)
interface ObjectStorageService { /* §6.1 — upload with access param, listByPrefix, deleteByPrefix */ }
```

### 10.2 Test Implementations

Each service interface has an in-memory mock that:
- Records all calls (method, params, timestamp)
- Returns configurable responses (success, failure, specific data)
- Supports assertion queries ("was `cancelSubscription` called with these params?")

No mock framework dependency. Plain TypeScript classes implementing the service interfaces.

---

## 11. Schema Versioning Protocol

TypeScript const exports from the owning domain, imported by consumers. The compiler enforces versioning — schema changes break consumers at compile time. [Source: interface-questions OQ-2]

```typescript
// D&L exports typed field accessors
export const ListingFields = {
  name: "listing.identity.name",
  companiesHouseNumber: "listing.identity.companiesHouseNumber",
  // ...
} as const satisfies Record<string, string>

// Operations TaskSpec templates import them
import { ListingFields } from "@/domains/data-and-listings/schema"
```

D&L changes a field → export changes → consumers fail at compile time → developer fixes all consumers in the same PR.

**Generalised principle (P4):** no domain reimplements another domain's logic. `computeTaxonomyOverlap` lives in D&L's export surface. `computeFeatureAccess` lives in Commercial's export surface. Any signature change breaks importers at compile time.

---

## 12. Non-Functional Requirements (Cross-Cutting)

### 12.1 Latency Budgets

| Operation | Target | Rationale |
|---|---|---|
| Page load (SSG/ISR) | <200ms TTFB p95 | Vercel edge, pre-rendered |
| Page load (SSR — search) | <500ms TTFB p95 | PostgreSQL full-text search + ranking |
| tRPC mutation (simple) | <300ms p95 | Single DB write + sync event consumers |
| tRPC mutation (with sync consumers) | <500ms p95 | DB write + sync consumers (search index update) |
| Async consumer execution | <5s p95 | Post-response via `waitUntil()` |
| Deferred action execution | <30s p95 | Background processing, no user waiting |

### 12.2 Throughput

V1 scale: ~4,700 listings, ~200 active accounts (optimistic first year). ~50–200 domain events/day. ~10–50 concurrent users during peak hours. All infrastructure is sized for this scale. Migration triggers documented per component.

### 12.3 Availability

Vercel + Supabase. No SLA commitment beyond provider SLAs at V1. Target: <1h unplanned downtime/month. Monitoring via Vercel analytics + structured error logging. No custom alerting infrastructure at V1 — admin dashboard surfaces errors on next login.

### 12.4 Data Integrity

- All domain state changes within a single sub-entity use Supabase PostgreSQL transactions.
- Cross-domain state changes use orchestrated flows (§3) or reactive events (§1) — no distributed transactions.
- Event bus errors are logged and surfaced, not silently dropped.
- Deferred action failures follow their retry policy, then surface via `onFailure` action.

---

## 13. Ordering Constraints for Multi-Step Flows

Three cross-domain lifecycle flows require strict step ordering. Step definitions here; full sequence diagrams in cross-domain-deps §5–§6.

### 13.1 GDPR Erasure

```
Ops: verify identity → Ops: extract data → Ops: close tickets → D&L: processErasure → Ops: close DSAR case + audit record → D&L: emit erasure_completed
```

Steps 1–3 (Operations) must complete before step 4 (D&L) begins. Step 4 is a single PostgreSQL transaction — completes or rolls back. Step 5 (Operations) closes the DSAR case and creates the compliance audit record — called directly by the orchestrator, not via the event bus [XI-11]. Step 6 (event emission) triggers reactive consumers (PP, CR) via the event bus.

### 13.2 Account Closure

```
PP: archive listings (per listing) → PP: cancel Paddle (direct API call) → PP: anonymise enquiry data → PP: delete/defer buyer data → PP: deactivate account → PP: emit account_closed
```

Step 1 iterates over listings — each archival is independent and retryable. Step 2 creates `pending_cancellation` records (with `reason: "account_closed"`) for Paddle webhook attribution, then calls `PaymentService.cancelSubscription` directly per subscription. Paddle confirmation arrives via webhook to Ops, which emits `subscription_ended` with closure attribution. [XI-7] Steps 3–5 are sequential. Step 6 triggers reactive consumers (Ops, D&L, CR).

### 13.3 New Subscription

```
Paddle webhook → Ops: verify + idempotency → CR: mapPaddleWebhook → Ops: emit subscription_tier_changed → reactive consumers
```

No orchestrator — reactive flow triggered by external webhook. All consumers are async (no user HTTP request to block). Client-side optimistic UI (CR-X-13) covers the UX gap between Paddle checkout and webhook processing.

---

## 14. Stress Test Resolution Log (v2)

20 scenarios targeting boundary surface. 3 High, 10 Medium, 5 Low, 1 Pass. 19 fixes applied.

| # | Scenario | Severity | Resolution |
|---|---|---|---|
| SI-1 | `EventPayloadMap` type not defined — bus contract references undefined generic | **High** | Added aggregated `EventPayloadMap` type in §1.2. Maps all 25 event type strings to their payload types. |
| SI-2 | `emit()` error type undifferentiated for sync consumer failures | Medium | Documented sync error propagation behaviour in §1.2 dispatch rules. Consumer errors propagate as-is; also logged as `EventConsumerError`. |
| SI-3 | `consumerId` format unspecified — admin view can't group errors | Low | Convention specified: `"{domain}:{eventType}:{actionName}"`. Added to §1.5 `EventConsumerError` type. |
| SI-4 | `DeferredAction.status` missing `"cancelled"` state | Medium | Added `"cancelled"` + `cancelledAt` + `cancelledBy` fields to §2.1 type. |
| SI-5 | `DeferredAction.params` untyped `Record<string, any>` | Medium | Added `DeferredActionParamsMap` discriminated union in §2.1. Type-safe per action. |
| SI-6 | Scheduler polling interval not specified | Low | Specified 60s configurable in §2.3. |
| SI-7 | `OrchestratedFlowStep` missing domain field | Medium | Added `domain: string` to §3.2 step type and §3.3 step def. |
| SI-8 | Orchestrator steps can't pass context forward | Medium | Added shared mutable `TContext` object to §3.3 orchestrator. Context persisted with progress record. |
| SI-9 | No hard retry limit after escalation | Low | Documented in §3.3: intentional, no limit post-escalation. Counter unbounded. |
| SI-10 | Auth role binary, no future granularity path | Low | Note added to §4.1: V2 may scope roles. Middleware should use prefix match. |
| SI-11 | Email send doesn't enforce unsubscribe preferences | **High** | `send()` now checks preferences (§5.1). Added `accountId` param. Returns `"suppressed"` for unsubscribed. Service owns enforcement. |
| SI-12 | Email return type missing states | Medium | Expanded to `EmailSendResult` with `"sent" | "queued" | "suppressed" | "failed"`. |
| SI-13 | Object storage no public/private distinction | Medium | Added `access: "public" | "private"` to upload params (§6.1). Usage table (§6.2) updated. |
| SI-14 | No bulk delete for object storage (GDPR erasure) | Medium | Added `listByPrefix` + `deleteByPrefix` to §6.1 contract. |
| SI-15 | Notification types incomplete | Medium | Added `claim_pending_review`, `listing_archived_shortlist`, `account_closure_initiated` to §8.1. Documented as extensible union. |
| SI-16 | Decision log entity context too narrow | Low | Added `additionalContext?: Record<string, string>` to §9.1 `entityContext`. |
| SI-17 | Missing notification cleanup deferred action | Low | Added `notification_cleanup` to §2.2 registry + `DeferredActionParamsMap`. |
| SI-18 | Sync/async consistency check (3 sync consumers vs SQ-1) | Pass | All 3 sync consumers match SQ-1 exactly. |
| SI-19 | `profile_edited` ISR handling ambiguous in event trigger table | Medium | Marked as N/A in table. Explicit note added below §7.2: PP handles ISR directly on profile save, not via event bus. |
| SI-20 | `waitUntil()` operational constraints undocumented | Medium | New §1.6 added: 300s limit, cold-start risk, known trade-off, migration eliminates. |

---

## Cross-References

| Document | Relationship |
|---|---|
| `cross-domain-dependencies.md` (v3) | Event catalogue (§2), consumer matrix (§2.2), payload schemas (§2.3), lifecycle flows (§5–§6), deferred action type (§3.2), implementation constraints (§9), resolved interface questions (§10) |
| `decisions/interface-questions-trade-off-evaluation.md` | Full rationale for OQ-1–OQ-4, stress test log (ST-1–ST-12), principles (P1–P5), requirements (R1–R7) |
| `decisions/sq-1.md` | Sync/async classification of all 25 events × all consumers |
| `decisions/sq-2.md` | Orchestrated flow recovery model, R8–R12, skip constraints, auto-escalation |
| `entity-architecture-frame.md` (v2) | Sub-entity contract specification (§Sub-Entity Contract Specification), design principles (§Design Principles), Layer 2 cognitive substrate |
| `data-and-listings.md` (v6) | DeferredAction origin (§4), quality score explanation (§4b) |
| `operations.md` (v6) | TaskSpec standard (§2), escalation chain (§3), compliance scheduling, billing reconciliation |
| `platform-and-product.md` (v5) | Email templates (§10), rendering strategy (§1.4), notification preferences |
| `commercial-and-revenue.md` (v4) | `TIER_LIMITS`, `computeFeatureAccess`, `mapPaddleWebhook`, conversion email templates |
| `slices/slice-00-infrastructure.md` | Implementation of everything specified here |
