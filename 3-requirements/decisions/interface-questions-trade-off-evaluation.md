# Interface Questions — Trade-Off Evaluation & Stress Test

**Status:** Draft v1 — initial evaluation + 12-scenario stress test. Not yet integrated into target documents.
**Domain:** Cross-Domain (shared infrastructure)
**Last updated:** 2026-02-12
**Inputs:** `cross-domain-dependencies.md` (v2 §10), `entity-architecture-frame.md` (v2), requirements structure sketch (README v3)
**Downstream:** `3-requirements/interfaces/shared-infrastructure.md`, `3-requirements/slices/slice-00-infrastructure.md`, schema amendments to `cross-domain-dependencies.md` (v3), requirements sketch updates

---

## Summary

This document resolves the four open interface questions from `cross-domain-dependencies.md` §10, which were deferred from concept design to requirements phase. All four are internal engineering trade-off evaluations — no external research required. The constraints are fixed: Supabase PostgreSQL, modular monolith (Next.js on Vercel), tRPC, ~4,700 listings at launch, solo developer.

Four positions were evaluated and then stress-tested against all 25 typed domain events and 3 cross-domain lifecycle flows (12 scenarios). All four positions held. The stress test surfaced 2 event schema amendments, 5 new architectural principles, 7 new requirements, and 3 scoped sub-questions.

**Decisions:**

| # | Question | Decision | Confidence | Migration Trigger |
|---|---|---|---|---|
| OQ-1 | Event transport mechanism | Application-level event bus (in-process TypeScript module) | 0.90 | Async consumer execution time >30% of avg request duration → evaluate queue (Inngest) |
| OQ-2 | Schema versioning protocol | TypeScript const exports from D&L, imported by consumers. Compiler enforces versioning. | 0.95 | Team scaling with separate domain ownership → add CI validation step |
| OQ-3 | Cross-domain transaction boundaries | Two patterns: orchestrated flows (sequential function calls) + reactive flows (event bus dispatch) | 0.92 | >5 orchestrated flows or saga-level compensation needed → evaluate formal orchestration framework |
| OQ-4 | Consumer health monitoring | Try/catch structured logging + startup registration check + integration test suite | 0.88 | Migration to external queue (OQ-1 trigger) → queue-native monitoring replaces startup check |

---

## 1. Decisions — Full Rationale

### OQ-1: Event Transport — Application-Level Event Bus

**Options evaluated:**

| Option | Mechanism | Fit | Why / Why Not |
|---|---|---|---|
| A: `pg_notify` | PostgreSQL LISTEN/NOTIFY | Poor | Requires persistent listener process. Vercel serverless is stateless — no long-lived connection to hold open. Would need a separate always-on worker, breaking the single-deployment-target simplicity. 8KB payload limit is tight for some events. |
| **B: Application-level bus** | **TypeScript module: `emit()` + `on()`** | **Good** | **Natural fit for modular monolith on Vercel. Consumers register at module load. Events dispatched within same request lifecycle. No infrastructure dependency. No payload limits. Standard unit testable.** |
| C: Message queue | Redis Pub/Sub, Inngest, etc. | Premature | Correct at scale. Adds infrastructure cost, operational complexity, and a new failure mode for ~50-200 events/day at V1. |

**Key implementation detail:** Next.js on Vercel initializes the module graph on cold start. Consumer registration is a module-level side effect (`import "@/events/consumers"` at app entry point). The event bus lives for the request duration (or warm invocation window). Events emitted during a request are dispatched to consumers in the same process.

**Migration path:** the event bus sits behind a service layer (`eventBus.emit()`). When scale demands durability, swap the implementation to Inngest or a Supabase-backed queue. No emitter or consumer code changes — the contract surface (event types, payloads) is already specified. The bus is a transport detail.

**Critical distinction surfaced during stress test:** not all 25 events use the bus. Orchestrated flows (erasure, closure) call domain services sequentially and emit a completion event at the end. The bus handles ~20 reactive events. The remaining ~5 are steps in orchestrated flows. See OQ-3.

### OQ-2: Schema Versioning — Compiler as Protocol

D&L exports typed field accessors as const objects. Operations (and any other consumer) imports them. Schema changes break consumers at compile time.

```typescript
// D&L exports typed field accessors
export const ListingFields = {
  name: "listing.identity.name",
  companiesHouseNumber: "listing.identity.companiesHouseNumber",
  // ...
} as const satisfies Record<string, string>

// Operations TaskSpec templates import them
import { ListingFields } from "@/domains/data-and-listings/schema"

const manualReviewTemplate: TaskSpec = {
  fields: [ListingFields.name, ListingFields.companiesHouseNumber],
  // ...
}
```

D&L changes a field → export changes → Operations template fails at compile time → developer fixes both in same PR. No runtime validation protocol needed. No versioning infrastructure. The compiler is the protocol.

**Generalised principle:** no domain reimplements another domain's logic. Import or call, never copy. `computeTaxonomyOverlap` lives in D&L's export surface. Commercial calls it. Any signature change breaks Commercial at compile time. Same pattern as TaskSpec field paths.

### OQ-3: Transaction Boundaries — Two Patterns

The concept design's "eventual consistency with strict ordering" decomposes into two distinct patterns when mapped to concrete flows:

**Pattern 1 — Orchestrated flows:** sequential function calls within a single request. The orchestrator owns the transaction. Steps within a single Supabase transaction where possible (e.g., D&L's `processErasure` is a single DB transaction). Steps across domains are sequential awaits. Failure → halt + escalate. No event bus in the critical path. Completion event emitted at the end.

**Pattern 2 — Reactive flows:** event bus dispatch. Consumers are independent. Failure of one consumer doesn't block others. Failed consumers log errors; admin dashboard surfaces inconsistencies.

**Flow classification:**

| Flow | Pattern | Orchestrator | Completion Event |
|---|---|---|---|
| GDPR erasure | Orchestrated | Operations | `erasure_completed` (emitted by D&L at Ops direction) |
| Account closure | Orchestrated | Platform | `account_closed` |
| New subscription | Reactive | — (Paddle webhook triggers event chain) | — |
| Subscription change | Reactive | — (`subscription_tier_changed` dispatched to independent consumers) | — |
| Claim approval | Reactive | — (`claim_approved` dispatched to independent consumers) | — |
| All other events | Reactive | — | — |

**Supabase PostgreSQL transaction boundary** covers single-domain atomicity. Cross-domain atomicity is achieved by sequential orchestration, not distributed locks. No distributed transaction infrastructure at V1.

### OQ-4: Consumer Monitoring — Three Layers, No Heartbeat

| Layer | Mechanism | Detects | When |
|---|---|---|---|
| 1. Try/catch + structured error logging | Event bus wraps every consumer invocation in try/catch. Logs event type, payload, consumer ID, stack trace. | Consumer throws | Runtime — immediately |
| 2. Startup registration check | On boot, assert every event type in `EVENT_CONSUMER_MATRIX` has at least one registered handler per expected domain. Fail fast if missing. | Consumer never registered (deployment bug) | Startup — immediately |
| 3. Integration test suite | For each event type, emit test event, assert expected side effects via mocked dependencies. | Consumer silently does nothing (logic bug) | CI — on every deploy |

Heartbeat-based monitoring is overengineered for an in-process bus. Consumers execute in the same process as the emitter — failures are immediate and observable. Heartbeats become relevant when migrating to an external queue (OQ-1 migration trigger), at which point queue-native monitoring (dead letter queues, consumer lag metrics) replaces the startup check.

---

## 2. Stress Test Log

12 scenarios tested against the four positions. All positions held. Findings below.

### ST-1: `listing_archived` — duplicate events during account closure

**Scenario:** During account closure, Platform archives each listing (triggering `listing_archived` per listing) then emits `account_closed`. Operations receives both — ticket-closing work duplicated.

**Resolution:** Accept the duplication. Operations' `listing_archived` handler is idempotent (close ticket if open, no-op if already closed). `account_closed` handler does its own work (compliance register update) without re-closing tickets.

**Principle extracted:** Emitters emit unconditionally. Consumers handle gracefully. Idempotent consumers are a better architectural pattern than conditional emission.

### ST-2: `subscription_tier_changed` — consumer ordering / stale DB read

**Scenario:** Three consumers fire independently. Platform's feature gating reads D&L's stored tier from DB. If Platform's consumer fires before D&L's consumer updates the stored value, feature gate uses stale data.

**Resolution:** Event consumers that need the new value use the event payload for their immediate reaction, not a DB read in the same handler. All subsequent requests read from DB (which D&L has updated by then). Aligns with existing CR-X-13 optimistic UI pattern.

**Principle extracted:** Consumers must be self-contained on the event payload for their immediate reaction. DB reads are for subsequent requests only.

### ST-3: `subscription_ended` — multi-emitter self-loop during account closure

**Scenario:** Platform emits `subscription_ended` during `closeAccount`. Platform is also a consumer of `subscription_ended` (downgrade features, show re-subscribe CTA). Self-loop: Platform's consumer fires on its own event. Re-subscribe CTA is nonsensical for a closing account.

**Resolution:** Platform's consumer checks account status. If closing/closed, skip re-subscribe CTA. Consumer remains registered for the Paddle-originated path.

**Principle extracted:** Consumers must be defensive against context they don't control. The event tells you *what happened*, not *why*. If reaction depends on *why*, check entity state — or use the event payload.

**Schema amendment required:** `SubscriptionEndedEvent` lacks `origin` field. Current schema:

```typescript
type SubscriptionEndedEvent = {
  type: "subscription_ended"; listingId: UUID;
  accountId: UUID; timestamp: ISO8601
}
```

Amend to:

```typescript
type SubscriptionEndedEvent = {
  type: "subscription_ended"; listingId: UUID;
  accountId: UUID; origin: "paddle" | "archival" | "closure";
  timestamp: ISO8601
}
```

Consumers can branch on `origin` without querying entity state.

### ST-4: Vercel serverless cold starts and event bus registration

**Scenario:** Vercel serverless functions cold-start per invocation. Does the event bus survive between invocations?

**Resolution:** No, and it doesn't need to. Next.js server-side runtime initializes the module graph on cold start. All consumers register as module-level side effects. The event bus lives for the request duration.

**Risk identified:** long-running event handlers delay the HTTP response. A tRPC mutation that emits an event with a heavy consumer (e.g., search index rebuild) blocks the user's response.

**Resolution:** classify consumers as sync (must complete before response) and async (can run after response). Async consumers use Vercel's `waitUntil()` API for post-response execution.

**Requirement surfaced:** consumer sync/async classification must be specified per event per consumer in the interface specs.

### ST-5: Event bus scaling trigger

**Scenario:** at what point does the in-process bus become insufficient?

**Resolution:** at V1 (~4,700 listings, ~50-200 events/day) — trivially sufficient. At 20K listings (~500-2,000 events/day) — still sufficient. Migration trigger: async consumer execution time exceeds 30% of average request duration. Document in S0 as a monitoring signal.

### ST-6: TaskSpec field paths — stored instances vs templates

**Scenario:** TaskSpec instances stored in DB reference D&L field paths. D&L renames a field. Templates (code-level) caught by compiler. Instances (DB-level) use stale paths.

**Resolution:** TaskSpec instances must snapshot field values at creation time, not store field path references. Templates contain paths (compiler-checked). Instances contain resolved data ("Companies House Number: 12345678"). Schema rename doesn't invalidate existing instances.

**Requirement surfaced:** TaskSpec instances snapshot field values at creation time. Add to S7 acceptance criteria.

### ST-7: `computeTaxonomyOverlap` — cross-domain function import

**Scenario:** Commercial could reimplement Jaccard similarity locally using raw tag strings, bypassing D&L's export. D&L changes tag structure; Commercial doesn't break at compile time.

**Resolution:** confirmed by the "import or call, never copy" principle. `computeTaxonomyOverlap` lives in D&L's export surface. Commercial imports it. Compiler catches any signature change. No new requirement — principle enforcement is sufficient.

### ST-8: GDPR erasure — partial failure after ticket closure

**Scenario:** Erasure steps 1-3 complete (verify, extract, close tickets). Step 4 (D&L `processErasure`) fails. System in intermediate state. 30-day clock running.

**Resolution:** orchestrator maintains step-level progress log. Admin sees "step 4 failed at [timestamp] with error [E]." Retries step 4 after root cause fixed. Steps 1-3 idempotent — no re-execution needed. Manual recovery via admin dashboard is realistic at V1 scale (~1-2 erasure requests/month).

**Requirement surfaced:** `OrchestratedFlowProgress` type in S0.

```typescript
type OrchestratedFlowProgress = {
  flowId: UUID
  flowType: "erasure" | "closure"
  steps: {
    name: string
    status: "pending" | "completed" | "failed"
    completedAt?: ISO8601
    error?: string
  }[]
  startedAt: ISO8601
  currentStep: number
}
```

### ST-9: Account closure — Paddle API call fails mid-flow

**Scenario:** Multi-listing account closure. Platform calls Paddle cancel API per subscription. Second of three calls fails (Paddle 503). 1 subscription cancelled, 2 remaining. User has closed account but is still being billed.

**Resolution:** decouple closure UX from Paddle availability. Queue all Paddle cancellations as deferred actions. Mark subscriptions as `pending_cancellation` locally. Deferred action scheduler retries until Paddle confirms. User sees immediate closure; billing stops when Paddle catches up.

**Schema amendment required:** `AccountClosedEvent` needs `paddleCancellationsPending: boolean`.

```typescript
type AccountClosedEvent = {
  type: "account_closed"; accountId: UUID; listingsArchived: UUID[];
  buyerDataDeleted: boolean; complianceHoldActive: boolean;
  paddleCancellationsPending: boolean; timestamp: ISO8601
}
```

Operations' consumer uses this flag to monitor billing reconciliation for stragglers.

### ST-10: Reactive flow — silent consumer failure in production

**Scenario:** `quality_score_changed` fires. Platform consumer (ranking recalculation) throws on edge-case payload (listing with zero taxonomy tags). Search results show stale ranking. No user-visible error. Fails on every quality score change for that listing type.

**Resolution:** the failed event admin view (OQ-4 layer 1) is the detection mechanism. The requirement is that the view aggregates by event type + consumer + error pattern, so repeated failures on the same consumer are immediately visible — not buried in a flat log.

**Requirement surfaced:** failed event admin view must support aggregation/filtering by event type, consumer, error message pattern, and time range. Assigned to S7.

### ST-11: Startup registration check — consumer matrix source of truth

**Scenario:** runtime check needs an expected consumer matrix. Where does it come from?

**Resolution:** typed const in S0 infrastructure, derived from cross-domain-deps §2.2.

```typescript
const EVENT_CONSUMER_MATRIX: Record<EventType, ConsumerDomain[]> = {
  "claim_approved": ["operations", "platform", "commercial"],
  "claim_rejected": ["operations"],
  // ... all 25 event types
}
```

At startup, event bus validates that for each entry, a handler tagged with the matching domain is registered. When a slice adds a new consumer, it must update the matrix. The matrix is the authoritative runtime register of expected cross-domain subscriptions.

**Requirement surfaced:** `EVENT_CONSUMER_MATRIX` typed const in S0.

### ST-12: Integration tests — external service dependencies

**Scenario:** testing `winback_eligible` → Operations consumer → Resend email send. Integration test can't call real Resend.

**Resolution:** test against the side effect boundary, not the external system. S0 includes a service abstraction layer for external dependencies (Resend, Paddle, Companies House API). Production implementations call real APIs. Test implementations are in-memory mocks with assertion capabilities.

**Requirement surfaced:** service abstraction layer for external deps in S0.

---

## 3. Consolidated Changelist

### 3.1 Event Schema Amendments (target: `cross-domain-dependencies.md` v3)

| Event | Amendment | Reason | Source |
|---|---|---|---|
| `subscription_ended` | Add `origin: "paddle" \| "archival" \| "closure"` | Multi-emitter event — consumers need to branch on origin without querying entity state | ST-3 |
| `account_closed` | Add `paddleCancellationsPending: boolean` | Operations billing reconciliation must monitor for Paddle cancellation stragglers when closure decoupled from Paddle availability | ST-9 |

### 3.2 New Architectural Principles (target: `entity-architecture-frame.md` or `shared-infrastructure` interface spec)

| # | Principle | Source | Enforcement |
|---|---|---|---|
| P1 | **Consumers use event payload for immediate reaction, not DB reads.** DB reads are for subsequent requests only. | ST-2 | Code review. Interface spec documents which payload fields each consumer uses. |
| P2 | **Consumers must be idempotent.** Emitters emit unconditionally. Consumers handle gracefully. | ST-1 | Integration tests emit duplicate events, assert no side effect duplication. |
| P3 | **Consumers must be defensive against context.** The event tells you *what happened*, not *why*. If reaction depends on *why*, check entity state or use event payload origin/reason fields. | ST-3 | Event schema includes `origin` or `reason` fields where multi-emitter or multi-context events exist. |
| P4 | **No domain reimplements another domain's logic.** Import or call, never copy. Cross-domain functions live in the owning domain's export surface. | ST-7, OQ-2 | TypeScript imports. Compiler enforces. |
| P5 | **Consumer sync/async classification.** Each consumer is classified as sync (must complete before HTTP response) or async (runs post-response via `waitUntil()`). Classification is per-event per-consumer, documented in interface specs. | ST-4 | Interface spec column. Runtime enforcement by event bus dispatch mode. |

### 3.3 New Requirements (target: requirements sketch updates, slice assignments)

| # | Requirement | Target Slice | Source |
|---|---|---|---|
| R1 | `OrchestratedFlowProgress` type — step-level progress logging for erasure and closure orchestrators | S0 (infrastructure) | ST-8 |
| R2 | Paddle cancellation during account closure uses deferred actions, not synchronous API calls. Subscriptions marked `pending_cancellation` locally. Scheduler retries. | S4 (subscriptions) + S10 (hardening) | ST-9 |
| R3 | Failed event admin view with aggregation by event type, consumer, error pattern, time range | S7 (operations) | ST-10 |
| R4 | `EVENT_CONSUMER_MATRIX` typed const — runtime validation of consumer registration at startup | S0 (infrastructure) | ST-11 |
| R5 | Service abstraction layer for external dependencies (Resend, Paddle, Companies House API). Production = real. Test = in-memory mocks with assertion capabilities. | S0 (infrastructure) | ST-12 |
| R6 | TaskSpec instances snapshot field values at creation time, not store field path references. Instances are immutable post-creation. | S7 (operations) | ST-6 |
| R7 | Consumer sync/async classification column in all interface specs. Event bus dispatches sync consumers before response, async consumers via `waitUntil()`. | All interface specs | ST-4 |

### 3.4 Requirements Sketch Amendments (target: README requirements structure)

S0 (Infrastructure) scope expands to include:

- `OrchestratedFlowProgress` type and persistence (R1)
- `EVENT_CONSUMER_MATRIX` typed const with startup validation (R4)
- Service abstraction layer for external deps (R5)
- Consumer sync/async dispatch infrastructure — `waitUntil()` integration (R7)
- Event bus scaling monitoring signal: async consumer execution time as % of request duration (ST-5)

S4 (Subscriptions) scope expands to include:

- Paddle cancellation via deferred actions during closure path (R2)

S7 (Operations) scope expands to include:

- Failed event admin view with aggregation (R3)
- TaskSpec instance immutability — snapshot at creation (R6)

All interface specs add:

- Consumer sync/async classification column (R7)

### 3.5 Open Sub-Questions (scoped, do not block S0)

| # | Question | Resolution Phase | Resolve Before |
|---|---|---|---|
| SQ-1 | Formal sync/async classification of all 25 events × all consumers. Which consumers must complete before the HTTP response? | Interface spec drafting | Interface specs finalised |
| SQ-2 | Partial-failure recovery UX for orchestrated flows — what does the admin see, what actions are available, how is "resume from step N" invoked? | S7 (Operations) requirements | S7 implementation |
| SQ-3 | Deferred action retry policy for Paddle cancellations — how many retries, what interval, when does it escalate to principal? | S4 (Subscriptions) requirements | S4 implementation |

---

## 4. Cross-References

| Document | Relationship |
|---|---|
| `cross-domain-dependencies.md` (v2) | Source of the 4 open questions (§10). Event catalogue (§2), consumer matrix (§2.2), payload schemas (§2.3), lifecycle flows (§6), implementation constraints (§9). Two schema amendments feed back into v3. |
| `entity-architecture-frame.md` (v2) | Governing frame. 5 new principles (§3.2) are candidates for inclusion in design principles or a shared infrastructure principles section. |
| Requirements structure sketch (README v3) | S0, S4, S7 scope expansions. New requirements R1-R7 assigned to slices. |
| `operations.md` (v6) | TaskSpec snapshot requirement (R6). Failed event admin view (R3). |
| `platform-and-product.md` (v5) | Account closure Paddle decoupling (R2, ST-9). Consumer self-loop handling (ST-3). |
| `commercial-and-revenue.md` (v4) | `subscription_ended` origin field enables consumer branching without entity state queries. |

---

## Epistemic Status

These are initial positions derived from constraint analysis, not empirical validation. The stress test covered 12 scenarios across all 25 events and 3 lifecycle flows — providing moderate confidence that the positions hold. The true test is implementation. The two highest-uncertainty items are the `waitUntil()` behaviour under Vercel's serverless model (P5/R7 — needs empirical validation during S0) and the deferred-action-based Paddle cancellation (R2 — needs validation against Paddle's retry/billing windows during S4).
