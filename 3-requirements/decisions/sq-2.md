**SQ-2: Partial-Failure Recovery Model for Orchestrated Flows**

Two orchestrated flows exist: GDPR erasure (Operations orchestrates) and account closure (Platform orchestrates). Both are multi-step, cross-domain, sequential. Both can fail mid-flow.

---

## Failure State Analysis

First, enumerate every possible failure point and its consequences.

### GDPR Erasure (5 steps)

```
Step  Action                        Domain  Failure consequence
─────────────────────────────────────────────────────────────────────
1     Verify identity (72h ack)     Ops     No data touched. Clean state.
                                            User notified of failure.
                                            30-day clock starts on request
                                            receipt regardless.

2     Extract account data for      Ops     No data touched. Extraction is
      compliance audit record               read-only. Retryable without
                                            side effects.

3     Close active support tickets  Ops     Tickets partially closed. Some
                                            open. Idempotent — re-running
                                            closes remaining, already-closed
                                            tickets unaffected.

4     Execute processErasure        D&L     Most dangerous failure point.
                                            D&L's processErasure is a single
                                            DB transaction — it either
                                            completes or rolls back. If it
                                            rolls back: no data deleted,
                                            retryable. If it commits
                                            partially (should not happen
                                            within a single PG transaction,
                                            but): some listings anonymised,
                                            others not. Requires manual
                                            inspection.

5     Emit erasure_completed +      D&L     Erasure done but downstream
      downstream consumers react    +PP+CR  consumers not notified. Search
                                            index still has deleted data.
                                            Shortlists still reference
                                            erased listings. Win-back
                                            schedules not cancelled.
                                            Legally compliant (data is
                                            erased) but operationally
                                            inconsistent.
```

### Account Closure (6 steps)

```
Step  Action                        Domain  Failure consequence
─────────────────────────────────────────────────────────────────────
1     Archive all listings          PP/D&L  Partial archival. Some listings
                                            still active in search. Provider
                                            sees "account closing" but
                                            their listings are still live.
                                            Each archival is independent —
                                            retryable per listing.

2     Cancel Paddle subscriptions   PP      Already resolved in ST-9:
                                            deferred actions, not sync.
                                            Failure = subscriptions queued
                                            for retry. No blocking.

3     Anonymise buyer enquiry data  PP      Sent enquiries still contain
      in provider inboxes                   personal data in other
                                            providers' records. Privacy
                                            risk but low — names/emails
                                            in enquiry records. Retryable.

4     Delete/defer buyer data       PP      Search history, shortlists,
                                            sent enquiries not deleted.
                                            If compliance hold: deferred
                                            action not scheduled. Retryable.

5     Deactivate account            PP      Account still active. User can
                                            still log in. Auth not disabled.
                                            Retryable — single field update.

6     Emit account_closed event     PP      Account closed but downstream
                                            consumers not notified. Same
                                            pattern as erasure step 5.
                                            Operationally inconsistent.
```

---

## Recovery Properties

Patterns emerge from the failure analysis:

**Property 1: Every step is individually retryable.** No step produces a state that prevents re-execution. Ticket closing is idempotent. DB transactions roll back on failure. Listing archival is per-listing. Account deactivation is a single field. This is the critical architectural property — if it didn't hold, we'd need compensation/rollback logic (sagas). It holds because the concept design specified idempotent operations throughout.

**Property 2: Steps 1–N-1 are domain-internal. Step N (event emission + downstream consumers) is cross-domain.** The orchestrator controls everything until the final event. Downstream consumer failures are a different recovery problem (covered by OQ-4 — error logging, admin view, integration tests).

**Property 3: The legal/compliance clock runs independently of the flow.** GDPR erasure has a 30-day statutory deadline. A stuck flow isn't just an operational nuisance — it's a compliance risk. Account closure has no statutory deadline but the user expects it to complete.

**Property 4: At V1 scale, these flows are rare.** Erasure: maybe 1-2 requests/month. Closure: maybe 5-10/month. Manual recovery is viable. Automated recovery is overengineered.

---

## Recovery Model

### Flow States

Each orchestrated flow instance transitions through:

```
                    ┌──────────────┐
                    │   INITIATED  │
                    │  (step 0)    │
                    └──────┬───────┘
                           │
                           ▼
                    ┌──────────────┐
                    │  IN_PROGRESS │◄──── retry
                    │  (step N)    │
                    └──────┬───────┘
                           │
                  ┌────────┴────────┐
                  │                 │
                  ▼                 ▼
         ┌──────────────┐  ┌──────────────┐
         │  COMPLETED   │  │   FAILED     │
         │              │  │  (step N)    │
         └──────────────┘  └──────┬───────┘
                                  │
                         ┌────────┴────────┐
                         │                 │
                         ▼                 ▼
                  ┌──────────────┐  ┌──────────────┐
                  │   RETRYING   │  │  ESCALATED   │
                  │  (step N)    │  │  (principal)  │
                  └──────────────┘  └──────────────┘
```

### The Progress Record

Already specified in the handover (ST-8). Expanding with recovery-specific fields:

```typescript
type OrchestratedFlowProgress = {
  flowId: UUID
  flowType: "erasure" | "closure"
  triggeredBy: UUID                    // accountId or DSAR requestId
  status: "initiated" | "in_progress" | "completed" | "failed" | "escalated"
  steps: {
    name: string
    status: "pending" | "in_progress" | "completed" | "failed" | "skipped"
    attempt: number                    // starts at 1, increments on retry
    completedAt?: ISO8601
    error?: string
    retryable: boolean                 // always true at V1 (see Property 1)
  }[]
  currentStep: number
  startedAt: ISO8601
  completedAt?: ISO8601
  deadline?: ISO8601                   // 30 days from request for erasure. Null for closure.
  escalatedAt?: ISO8601
  escalationReason?: string
}
```

### Admin Interface

The admin dashboard (S7) surfaces orchestrated flows through a dedicated view. Not a log dump — a structured interface.

```
ORCHESTRATED FLOWS                                    [Filter: failed only ▼]
──────────────────────────────────────────────────────────────────────────────

⚠ FAILED  Erasure #e-0042    Account: a]7f3...    Deadline: 2026-03-08 (16 days)
          Step 4/5: processErasure — FAILED
          Error: "FK constraint violation: listing l-9a2 has unresolved dispute"
          Attempts: 1     Last attempt: 2026-02-12 14:32
          ┌──────────┐  ┌──────────────┐  ┌───────────────────┐
          │  Retry ▶  │  │  Skip step ▶ │  │  Escalate to Ruben │
          └──────────┘  └──────────────┘  └───────────────────┘

          Step log:
          ✓ 1. Verify identity          completed  2026-02-10 09:15
          ✓ 2. Extract account data      completed  2026-02-10 09:15
          ✓ 3. Close support tickets     completed  2026-02-10 09:16
          ✗ 4. Process erasure           FAILED     2026-02-12 14:32
          · 5. Emit + downstream         pending

──────────────────────────────────────────────────────────────────────────────

✓ DONE   Closure #c-0187   Account: a-2b1...    Completed: 2026-02-11 16:40
          6/6 steps completed. Duration: 4 seconds.
          Paddle cancellations: 1 pending (retrying, attempt 2)
```

### Three Admin Actions

**Retry:** re-execute the failed step. The orchestrator resumes from `currentStep`. Prior steps are not re-executed (idempotent, but no point — already completed). If the root cause hasn't been fixed, it fails again. Attempt counter increments.

**Skip:** mark the step as `skipped` and advance to the next step. Available only when the admin has assessed the situation and determined the step is either unnecessary (e.g., no tickets to close) or has been handled manually outside the system. Skip is a principal-level action — the admin is asserting "I take responsibility for this step being incomplete." The system logs who skipped and why (free text reason required).

**Escalate:** mark the flow as `escalated`. Sends notification to principal via escalation chain (Ops §3 — email → SMS → phone). The flow pauses. Principal can trigger retry or skip via the same interface after investigating.

### Auto-Escalation Rules

The entity doesn't wait for a human to notice a stuck flow. Two triggers:

```
Auto-escalation triggers:
─────────────────────────────────────────────────────────────────────
1. Deadline proximity (erasure only):
   - 7 days before deadline → alert (admin dashboard + email)
   - 3 days before deadline → escalate to principal automatically
   - Deadline passed → CRITICAL alert. Principal + compliance flag.

2. Retry exhaustion:
   - 3 consecutive failures on the same step → escalate to principal
   - Prevents infinite retry loops from a bug that won't self-resolve
```

No auto-escalation for account closure — no statutory deadline. Failed closures surface in the admin dashboard's failed flow view. If unresolved after 7 days, a reminder appears in the weekly Operations Health Review ceremony (Ops §6.2).

### Skip Constraints

Not every step can be skipped safely. The admin interface enforces:

```
Step skip safety:
─────────────────────────────────────────────────────────────────────

ERASURE:
  1. Verify identity       CANNOT SKIP  Legal requirement. Without
                                        verified identity, erasure
                                        cannot proceed.
  2. Extract data          CAN SKIP     Data loss for audit trail.
                                        Admin accepts accountability.
                                        ⚠ Warning shown: "Skipping
                                        extraction means no audit
                                        record of erased data."
  3. Close tickets         CAN SKIP     Tickets remain open. Ops
                                        cleans up manually.
  4. Process erasure       CANNOT SKIP  The entire point of the flow.
  5. Emit + consumers      CAN SKIP     Legally compliant (data
                                        erased). Operationally
                                        inconsistent (search index,
                                        shortlists). Admin triggers
                                        manual cleanup.

CLOSURE:
  1. Archive listings      CANNOT SKIP  Listings must be removed from
                                        search.
  2. Cancel subscriptions  CAN SKIP     Deferred actions handle this.
                                        Skipping = admin confirms
                                        Paddle cancellations will be
                                        handled manually.
  3. Anonymise enquiry data CAN SKIP    Privacy risk accepted. Admin
                                        handles manually.
  4. Delete buyer data     CAN SKIP     Data retained longer than
                                        expected. No legal violation
                                        (closure ≠ erasure).
  5. Deactivate account    CANNOT SKIP  Account must be disabled.
  6. Emit + consumers      CAN SKIP     Same as erasure step 5.
```

---

## Implementation Scope

### What Goes in S0 (Infrastructure)

- `OrchestratedFlowProgress` type (expanded version above)
- Generic orchestrator function: accepts a step list, executes sequentially, logs progress, handles failure/retry/escalation
- Persistence: progress records stored in Supabase. Not a separate table per flow type — one `orchestrated_flows` table, `flowType` discriminator
- Auto-escalation scheduler: deferred actions that check deadline proximity and retry exhaustion

### What Goes in S7 (Operations)

- Admin UI for orchestrated flow monitoring (the view sketched above)
- Retry/skip/escalate actions wired to the orchestrator
- Skip constraint enforcement (which steps can/cannot be skipped)
- Weekly health review ceremony includes stuck flow check

### What Goes in S10 (Hardening)

- Wiring the erasure and closure flows into the generic orchestrator
- End-to-end tests: inject failure at each step, verify progress logging, verify retry, verify escalation
- Skip constraint validation tests

---

## Summary

```
RESOLVED
─────────────────────────────────────────────────────────────────────
- Admin sees: structured flow view, not a log dump
- Admin does: retry, skip (with constraints), or escalate
- Entity auto-escalates on deadline proximity (erasure) and
  retry exhaustion (both flows)
- Every step is retryable (architectural property, not just hope)
- Skip requires human accountability (reason logged, who skipped)

NEW REQUIREMENTS
─────────────────────────────────────────────────────────────────────
R8   Generic orchestrator function in S0 — step list, sequential
     execution, progress logging, failure handling
R9   orchestrated_flows table in S0 — single table, flowType
     discriminator
R10  Auto-escalation deferred actions — deadline proximity check
     (erasure), retry exhaustion check (both)
R11  Skip constraint matrix — per step per flow type, enforced in
     admin UI (S7)
R12  End-to-end failure injection tests in S10

AMENDS HANDOVER R1
─────────────────────────────────────────────────────────────────────
OrchestratedFlowProgress type expanded: added status, attempt
counter, deadline, escalation fields, retryable flag.
Supersedes the simpler version in the handover ST-8.
```

Want me to produce a consolidated handover that merges this + SQ-1 into the original document?