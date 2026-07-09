# Implementation Phase — Evidence Record

**Status:** COMPLETE (CS-E1)
**Last updated:** 2026-03-29
**Scope:** What the implementation phase proved about human-agent collaboration, methodology, and the economics of agent-driven software construction.

---

## What Was Built

CS-E1 (Platform Build) ran from 2026-02-19 to 2026-03-29 (38 days, ~60 sessions). A single human principal collaborated with an AI agent (Claude) to implement the complete CALLSHEET V1 backend from a validated specification corpus.

| Artifact | Count | Notes |
|----------|-------|-------|
| Work items completed | 90 | CS-WORK-001 through CS-WORK-090 |
| Acceptance criteria verified | 718 | Originally 693 specced; scope grew during implementation |
| Tests (unit) | 727 | Vitest, 60 test files |
| Tests (integration) | 1,129 | Vitest, 102 test files, real PostgreSQL |
| Tests (E2E) | 7 | Playwright, API-level |
| Database tables | 54 | 8 schema files, 497 columns, 36 enums, 84 indexes |
| tRPC procedures | 118 | 67 queries, 51 mutations, 30 routers |
| Domain events | 25 | 48 consumers (1 sync, 47 async) |
| Deferred actions | 37 | 30 with handlers, 18 self-perpetuating |
| Decision types | 35 | Free-text column, no migration needed per type |
| Email templates | 31 | 6 categories, 2-level suppression |
| Notification types | 19 | 12 actively wired |
| Orchestrated flow steps | 12 | 6 erasure + 6 closure, 5 non-skippable |
| Graduation capabilities | 3 | Enrichment, ceremony, algorithm rollout |
| Next.js pages | 20 | 7 public, 9 dashboard, 8 admin (some stubs) |
| Retrospectives written | 50+ | YAML frontmatter, triaged via action lifecycle |
| Type errors at completion | 0 | Continuous enforcement |

---

## 1. Decision Principles

Principles that governed how decisions were made during implementation. These are not code patterns — they are the meta-rules that determined *when to decide*, *what information to require*, and *how to validate the decision*.

### 1.1 Spec Is Authoritative, Code Is Derived

Every implementation decision traces to a specification line. When spec and intuition conflicted, spec won. When spec was ambiguous, the ambiguity was resolved by reading the spec's upstream documents (concept design → entity architecture frame), not by guessing. When the spec was wrong (discovered during implementation), the spec was updated and the fix was tracked in the stress-test resolution log.

**Why this matters:** An agent cannot intuit design intent. It can follow explicit specifications. The more precise the spec, the less rework. The requirements phase's rigour (693 AC, 209 stress-test scenarios, ~130 fixes) paid for itself during implementation — the agent rarely had to ask "what should this do?"

### 1.2 Pre-Satisfaction Before Construction

Before writing any code for a work item, check what already exists. The `/impl` skill's Step 4 (AC Pre-Satisfaction Analysis) classifies every AC as `needs-impl`, `pre-satisfied`, `partial`, or `blocked`. This eliminated ~20% of estimated work across the epoch — infrastructure built for earlier slices already satisfied later ACs.

**Evidence:** CS-WORK-088 (12 AC, `effort: large`) had 7/12 ACs pre-satisfied by earlier work items. Implementation took one session instead of the two estimated. The pre-satisfaction analysis correctly identified this, converting a large work item into a focused verification exercise.

### 1.3 Type System As Decision Enforcer

TypeScript strict mode + Drizzle's typed schema + tRPC's end-to-end inference meant that many "decisions" were made by the compiler. Adding a field to an event payload immediately broke every test constructing that payload — the blast radius was visible and finite. pgEnum values were authoritative at the type level — you couldn't insert an invalid value even in tests.

**Corollary:** When the type system can't enforce a decision (e.g., free-text `decisionType` column), discipline must replace types. The `algorithm_comparison` decision type worked without a migration because the column is text — but this also means a typo in the string is a silent bug.

### 1.4 Conclusion-First Reasoning

When evaluating trade-offs (e.g., which work item to implement first, whether to parallelise via sub-agents, whether to split a session), the thinking-router framework forced conclusion-first reasoning: state the decision, then the evidence. This prevented analysis paralysis. The Heuristic mode was used most frequently — "what rule of thumb applies?" resolved 80% of sequencing decisions in seconds.

### 1.5 Settled Decisions Are Not Reopened

Decisions made during concept design (e.g., "in-process event bus, not external queue", "PostgreSQL full-text search at V1", "unified account model") were treated as load-bearing constraints during implementation. The agent never proposed alternatives to settled decisions. This eliminated a class of unproductive exploration.

---

## 2. Ways of Working

How the human principal and AI agent collaborated. These are the interaction patterns that emerged and stabilised.

### 2.1 Session Ceremonies

Every session followed a deterministic ceremony:

```
/session-init  →  identify next work item  →  /impl {NNN}  →  implement  →
  /migration-close (if schema)  →  /done {NNN}  →  /retro  →  /session-close
```

The ceremonies are encoded in `.claude/skills/` — each skill file is authoritative for its own behaviour. The main context is an orchestrator: it dispatches skill invocations, gates between phases, and routes context.

**Why ceremonies matter:** Without them, each session starts with "where are we?" and ends with "what did we do?" Ceremonies make both questions deterministic. The `/init` reads handoff from disk. The `/close` writes handoff to disk. No information lives only in a conversation — it's always persisted to a file.

### 2.2 File-Based Handoff

Context does not survive between sessions. Every session starts from zero. The solution: all state lives in files. MEMORY.md carries the handoff. IMPLEMENTATION-TRACKER.md carries progress. WORK.md carries per-item state. Plans are written to `plans/impl-plan.md` so a new session can read them from disk.

**Key learning:** `/clear` + explicit reads is deterministic; `/compact` is a black box. When context was tight, we cleared and re-read rather than compacting. This produced more predictable behaviour.

### 2.3 Sub-Agent Delegation

For `effort: large` work items with ≥3 independent deliverable groups, work was delegated to sub-agents running in git worktrees. Validated in CS-WORK-077 and refined through CS-WORK-080.

**Rules that emerged:**
- Max 3 parallel agents (more risks merge conflicts in shared files)
- Extract ALL numeric constants into a typed spec constants block — include verbatim in every agent prompt. Agents drift on values described in natural language.
- Include exact function signatures and type shapes, not prose descriptions
- Agents producing types/exports consumed by other agents must complete first
- Every agent prompt ends with: `npx tsc --noEmit && git add -A && git commit`
- Main context role: orchestrator — dispatches agents, resolves type mismatches, wires shared files, runs full test suite

### 2.4 Plan-vs-Build Splitting

For work items with ≥12 AC, planning and building are separate sessions. The `/impl` skill writes a plan to `plans/impl-plan.md`. The next session reads the plan from disk and implements. At 1,700+ tests, `/init` + `/impl` planning alone consumes ~150K tokens.

**Threshold:** If `/impl` Step 1 detects `effort: large` AND AC ≥ 12, it warns that planning may exhaust context and recommends a dedicated plan session.

### 2.5 Thinking Before Acting

The `/thinking-router` skill provides structured cognitive modes (causal, abstract, heuristic, dialectical, etc.) applied before non-trivial decisions. This isn't decoration — the dialectical review of CS-WORK-088's plan caught a fundamental flaw (AC-51 required dep-level injection, not the wrapper pattern) before implementation. Without the review, it would have been discovered as a test failure.

**When to use:** Work item sequencing, plan review, architecture decisions, epoch transitions. Not needed for routine implementation.

---

## 3. Quality Gates

What prevented defects from reaching committed code.

### 3.1 Type-Check-First

`npx tsc --noEmit` runs before any test execution. If types don't compile, tests aren't run. This catches ~40% of errors before any test infrastructure is involved. The 0 type errors invariant was maintained across all 90 work items.

### 3.2 AC-Level Verification

Every acceptance criterion maps to a specific test (unit, integration, or E2E). Test names include the AC ID: `it("AC-46: per-step failure injection...")`. The tracker records AC counts per work item. The completion log records test counts.

**What this prevents:** "The feature works but we're not sure which requirements it satisfies." Every test is traceable to a spec line.

### 3.3 Pre-Satisfaction Check

Before writing code, grep existing codebase for each AC's target. Prior work items may have already implemented the behaviour. This eliminates duplicate tests and redundant code. The `/impl` skill's Step 4 formalises this check.

### 3.4 Retro Action Lifecycle

Every work item gets a retrospective. Retros surface action items. Actions are classified (bug/feature/refactor/upgrade) and prioritised (now/next/later). The `/init` scanner detects untriaged retros. The `/triage-retros` skill forwards open actions to `open-actions.md`. Actions have explicit definitions of done.

**What this prevents:** Lessons from one work item being forgotten by the next. The action register is a persistent queue of improvements.

### 3.5 Post-Close Audits

After marking a work item done, 6 audits run:
1. Tracker summary consistency (done count, AC count, status string)
2. WORK.md status field confirmation (was the edit actually written?)
3. Stub/no-op audit (if this replaced a stub, grep for old imports)
4. Template registration audit (if a template ID was added, verify registration)
5. Adapter stub audit (are called adapters hollow?)
6. Chapter close-out (if final item, verify chapter status)

**What this prevents:** Tracker drift. Before these audits existed, the tracker accumulated errors that required manual reconciliation.

### 3.6 Regression Prevention

The full test suite runs at session open (via `/init`) and session close (via `/close`). Any regression is caught before new work starts and after new work completes. The test count is recorded in the tracker and MEMORY.md — delta mismatches are flagged.

---

## 4. Quantity Gates

What controlled scope and prevented work from expanding beyond its specification.

### 4.1 Effort Tagging

Every work item has `effort: small | medium | large` in WORK.md frontmatter. This determines:
- Whether planning and building are separate sessions (large ≥ 12 AC)
- Whether sub-agent delegation is considered (large, ≥3 independent groups)
- Whether a context budget warning is issued

### 4.2 Context Budget Awareness

At ~1M token context, a session can hold: init (~50K) + impl planning (~50K) + implementation (~200-400K) + tests (~100-200K) + close (~50K). For large work items, the budget is tight. The `/impl` skill warns when spec sources exceed 30K tokens or when AC count ≥ 12.

**Practical rule:** If `/impl` planning consumes >60% of context, stop. Write the plan to disk. Start a new session for implementation.

### 4.3 One Work Item At A Time

Each work item is a discrete unit: read → plan → build → test → close → retro. The per-item close-out (`/done`) updates all tracker locations immediately. This prevents "batch close-out at session end" drift, which caused backfill work in CS-WORK-068/069.

**Exception:** When two adjacent work items in the same session are both small-medium and independent (e.g., CS-WORK-088 test-only + CS-WORK-090 medium), they can be done sequentially in one session. But each gets its own `/done` and `/retro`.

### 4.4 No Scope Creep During Implementation

The work item's WORK.md defines its deliverables. If implementation reveals missing functionality, it becomes a retro action item or a new work item — not an expansion of the current one. The current work item ships its specified AC, nothing more.

### 4.5 Spec Constants, Not Natural Language

When delegating to sub-agents or implementing from spec, extract all numeric thresholds into a typed constants block. Natural language descriptions of thresholds drift: "about a week" becomes 5 days in one agent and 8 days in another. `const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000` does not drift.

---

## 5. Workflows & Activities

The repeatable pipelines at each scale.

### 5.1 Per-Epoch Pipeline

```
Investigate → Concept Design → Requirements (slices + AC) → Stress Test → Decompose → Implement → Deploy
```

CS-E1 ran the full pipeline. CS-E2 may compress investigation/design for "interface over existing behavior" work. The pipeline exists to prevent building the wrong thing — not to slow down building the right thing.

### 5.2 Per-Slice Pipeline

```
/checklist → /draft → /stress-test → /apply-fixes → v2 → /decompose
```

Produces a v2 slice with AC, resolved stress-test findings, and decomposed work items. Each step is a skill invocation that reads from disk and writes to disk. The pipeline ran 11 times (S0-S10) with consistent output quality.

### 5.3 Per-Work-Item Pipeline

```
/impl {NNN} → implement → /migration-close (if schema) → /done {NNN} → /retro
```

`/impl` reads WORK.md + spec sources + existing code, produces a plan. Implementation follows the plan. `/done` updates 4 tracker locations + WORK.md. `/retro` captures learnings. The pipeline ran 90 times.

### 5.4 Per-Session Pipeline

```
/session-init → [work] → /session-close
```

Init reads governing documents, loads handoff, verifies test health. Close verifies test health, updates tracker + MEMORY.md, writes handoff. Light init skips governing doc re-reads when the prior session was the same day with 0 test failures.

### 5.5 Retro Action Pipeline

```
/retro writes actions → /init scans untriaged → /triage-retros forwards to register → action done → close in register
```

Actions accumulate in retro files (triaged: false). Init detects untriaged retros. Triage forwards open actions to `open-actions.md`. Actions are closed when their definition of done is met. The register is the single source of truth for open improvements.

### 5.6 Sub-Agent Pipeline

```
Assess parallelisability → extract spec constants → write agent prompts → dispatch to worktrees → collect results → resolve conflicts → wire shared files → run full test suite
```

Used for `effort: large` work items with independent deliverable groups. Max 3 agents. Main context is orchestrator, not implementer.

---

## 6. What Was Proved About Human-Agent Collaboration

### The principal sets frame; the agent fills volume

The human's highest-leverage activities were: writing the entity architecture frame, reviewing stress-test findings, and making trade-off decisions (e.g., "deterministic hash for algorithm bucketing, not random"). The agent's highest-leverage activities were: reading specifications, writing code, writing tests, and maintaining consistency across 90 work items.

**Ratio:** The human made ~200 substantive decisions across the epoch. The agent made ~50,000 implementation decisions (line-of-code-level). The human's decisions were ~250x more leveraged.

### File-based state eliminates session fragility

With all state in files (WORK.md, IMPLEMENTATION-TRACKER.md, MEMORY.md, plans/impl-plan.md, retro files), any session can be interrupted and resumed without loss. The agent reads state from disk, not from conversation history. This makes the collaboration resilient to context limits, session crashes, and `/clear` operations.

### Ceremonies prevent drift

Without `/init` and `/close`, tracker locations drift. Without `/retro`, lessons are forgotten. Without `/impl`, the same pre-reads are done manually (and incompletely) every time. The overhead of ceremonies (~5 minutes per session) prevented ~2 hours of reconciliation work per week (extrapolated from the CS-WORK-068/069 backfill incident).

### The spec-to-test pipeline has near-zero waste

718 AC specified → 718 AC verified. 209 stress-test scenarios → ~130 spec fixes → 0 rework during implementation caused by spec ambiguity. The pipeline `spec → AC → test → code` produced minimal waste because each stage validates the prior. The requirements phase cost ~4 days; it saved ~10+ days of implementation rework (estimated from the defect density of the first few work items vs the last).

### Sub-entity architecture survived 90 work items

No work item required violating a sub-entity boundary. No shared mutable state was introduced. The event bus contract surface (25 events, 48 consumers) grew during implementation but never broke. The architecture's composability claim — "every sub-entity's implementation could change without affecting siblings" — was tested 90 times and held.

---

## 7. Economics

### Throughput

| Metric | Value |
|--------|-------|
| Work items per day (avg) | 2.4 |
| AC per day (avg) | 18.9 |
| Tests per day (avg) | 49.0 |
| Sessions per work item (avg) | ~1.2 |
| Rework rate (AC re-implemented) | <2% |

### Cost Structure

- **Human time:** ~2 hours/day supervision, decision-making, review
- **Agent compute:** ~60 sessions, ~50-150K tokens per session
- **Infrastructure:** ~£36/month (Supabase + Vercel + R2 + Resend)
- **No team coordination overhead:** Single principal, single agent, file-based state

### What Would Change at 2x Scale

At 180 work items (2x), the bottleneck shifts from implementation to:
1. **Tracker management** — IMPLEMENTATION-TRACKER.md exceeds 30K tokens. Needs partitioning by epoch.
2. **Retro action accumulation** — `open-actions.md` grows linearly. Needs priority-based pruning.
3. **Test suite duration** — 1,863 tests at ~130s integration is manageable. At 4,000+ tests, integration tests need parallelisation or selective execution.
4. **Context budget** — `/init` reads governing docs (~50K) + handoff + tracker. At 2x docs, init alone could consume 30% of context. Light init mitigates this but doesn't eliminate it.

---

## 8. Recurring Patterns Discovered

Patterns that surfaced repeatedly across the specification and implementation phases. These are predictive — they will recur in CS-E2 and CS-E3.

### 8.1 Three-Part Sync Gap (11/11 slices)

Every slice that added deferred actions, email templates, decision types, or notification types failed to register them in all three locations: the TypeScript params map, the shared-infrastructure registry table, and the scheduling/invocation call site. This occurred in every single slice (100% recurrence rate, 11/11).

**Root cause:** Three independent artifacts must be kept in sync manually. The compiler enforces the TypeScript map but cannot enforce that a row exists in a Markdown table or that a handler is registered at startup.

**Mitigation implemented:** The `/impl` skill Step 3 checks all three locations for any new action/template/type. The `/decompose` skill flags the three-part sync pattern as a mandatory check item. Despite mitigation, the pattern continued to surface in stress tests — the fix is structural (code-generated registries), not procedural.

### 8.2 Content Agent Divergence (Pattern #14, 8 instances S6-S10)

When multi-agent pipelines draft specification content (the `/draft` skill uses 12 sub-agents), different agents produce inconsistent representations of the same concept. Example: one agent writes `intervention.riskFactors` while another writes `result.factors`. The spec compiles in prose but fails at the type level.

**Root cause:** Sub-agents read the same upstream documents but have no shared type system. Prose-level consistency checks don't catch type-level inconsistencies.

**Mitigation:** The `/stress-test` skill explicitly tests cross-section type consistency. Post-fix, the `/apply-fixes` skill propagates type corrections to all sections. This reduced but did not eliminate the pattern — it moved from "in the spec" to "caught during stress test."

### 8.3 Runtime Silent Failure (Pattern #15, S7)

A runtime condition that silently produces wrong results without errors. Example: `refund_request` category never assigned by `classifyTicket`, so `admin.refunds.list` always returned zero results. No error, no test failure — just an empty list that looks like "no refunds."

**Root cause:** The happy path works; the integration path between two correct components has a gap. Neither component is wrong in isolation.

**Mitigation:** Stress tests now explicitly check "does this query ever return results given the data paths that populate it?" Integration tests verify end-to-end flows, not just individual component correctness.

### 8.4 Event Payload Field Availability (S9 onwards)

When a consumer depends on a payload field added in a later slice, the consumer's code compiles (the field is on the TypeScript type) but the emission site in the earlier slice doesn't populate it. This first appeared in S9, which was the first slice to depend on fields not yet on event contracts.

**Mitigation:** The `/impl` skill Step 3 includes "Event payload cascade mapping" — grep all emission sites for the event type and verify the field is populated at every emitter.

---

## 9. Action Register Statistics

The retro action lifecycle produced a measurable improvement queue:

| Metric | Value |
|--------|-------|
| Total retro actions created | 91 |
| Actions resolved (DONE/CLOSED) | 55 (60%) |
| Actions open at `later` priority | ~32 |
| Actions open at `now`/`next` priority | 0 |
| Retros written | 50+ |
| Retros with zero actions | ~15 (clean work items) |
| Average actions per retro | 1.8 |

The `later` priority actions are trigger-gated: each has a defined trigger condition (e.g., "3rd consumer appears", "when admin UI renders domain breakdown chart"). They are not forgotten — they surface when their trigger fires. Zero `now`/`next` priority actions remain, meaning all urgent improvements were addressed during the epoch.

**Most impactful resolved actions:**
- Extract `createTestBus()` helper (11 files updated, eliminated 30+ lines of boilerplate per test file)
- Extract `getEngagementCounters()` to shared export (3 consumers updated, eliminated N+1 queries)
- Extract `expectTRPCError()` helper (22 call sites, standardised error assertion)
- Align `CADENCE_MAP` values against spec (18 cadence entries corrected)
- Add `createMockDecisionLogDb()` to shared fixtures (3 test files updated)

**Most common action categories:**
1. Extract shared test helper (8 actions)
2. Align spec prose with implementation (6 actions)
3. Document pattern in implementation-patterns.md (5 actions)
4. Add check to `/impl` skill (4 actions)
5. Update sibling spec section (3 actions)

---

## 10. Epoch Transition Learnings (CS-E1 → CS-E2)

Learnings from the epoch closure and CS-E2 decomposition session (2026-03-29).

### 10.1 Compressed Pipeline for Interface Epochs

CS-E1 followed the full pipeline: investigation → concept design → requirements → stress test → decompose → implement. CS-E2 skipped investigation and concept design entirely, going straight from audit to decomposition.

**Why this was valid:** CS-E2 builds interfaces over existing behavior (CLI wrapper, presentation polish, new admin routes). The domain logic exists. The API exists. There are no new sub-entity interactions to design, no new event contracts to negotiate, no new tables to model. The comprehensive system audit (6 parallel sub-agents reading full files) replaced the investigation phase. The existing specifications and audit findings replaced concept design.

**When this applies:** An epoch can skip investigation/design when ALL of these hold:
1. No new domain logic (no new events, consumers, tables, or business rules)
2. The existing API surface is the primary input (wrapping, not extending)
3. A comprehensive audit has enumerated the gaps
4. The work is primarily interface construction (UI pages, CLI commands, admin routes)

**When this does NOT apply:** CS-E3 (Runtime Intelligence) will require full investigation and design because it introduces new feedback loops, new autonomous behaviors, and new graduation criteria that don't exist in the current spec.

**Mid-arc audit checkpoint:** After each chapter completion in compressed-pipeline epochs, run a lightweight security + integration audit before proceeding to the next chapter. This catches "function exists but isn't wired" gaps and schema import omissions. Validated in CS-E2 api-completion arc: the post-CH-CS-016 audit found 13 findings including a critical Bearer auth gap that would have made the entire agent-cli arc non-functional. Cost: ~30 minutes. Value: prevented cascading rework across 10 downstream work items.

### 10.2 Sub-Agent Audit Parallelism

A 6-agent parallel audit produced a comprehensive system picture (54 tables, 118 procedures, 48 consumers, 37 actions, 20 pages, 6 API routes — fully enumerated with per-item detail) in ~3 minutes of wall time. Each agent read 10-50 files and returned structured text. The main context stayed lean (~50K tokens) while sub-agents consumed ~600K tokens total.

**Pattern:** For any "what is the state of X?" question spanning many files, dispatch parallel sub-agents scoped to non-overlapping file sets. Collect structured results. Synthesize in main context. This is dramatically more efficient than sequential reads in main context, both in wall time and context budget.

### 10.3 Arc and Chapter Status Drift

At CS-E1 closure, 4 arc files and 5 chapter files had stale `Active` or `Planned` status despite all their work items being complete. Root cause: the `/done` skill updates WORK.md and the tracker, but only checks chapter completion for the *current* work item's chapter. It doesn't propagate to arc status. Earlier chapter completions went unrecorded.

**Fix:** The `/done` skill's Step 5.5 (post-close audits) should extend chapter close-out to also check arc completion. When all chapters in an arc are complete, the arc file should be updated to `status: Complete`. This prevents stale statuses from accumulating and requiring a manual reconciliation at epoch close.

### 10.4 Strategic Frame as Living Documentation

Three strategic-frame documents were written or updated during this session:
- `implementation-phase-evidence.md` — methodology record for CS-E1
- `deployment-gates.md` — governing constraint for CS-E2+ deployments
- `CS-E2.md` epoch definition — references both

These documents serve different purposes:
- **Evidence records** are backward-looking (what we proved, what patterns recurred)
- **Gate frameworks** are forward-looking (what must pass before deployment)
- **Epoch definitions** are declarative (what we're building, what the exit criteria are)

All three are consumed by future sessions. Evidence records inform methodology choices. Gate frameworks become acceptance criteria. Epoch definitions scope the work.

---

## References

- `requirements-phase-evidence.md` — Companion document for the specification phase
- `entity-architecture-frame.md` — Governing design frame
- `deployment-gates.md` — Deployment quality gate framework
- `4-work-management/IMPLEMENTATION-TRACKER.md` — Authoritative progress record
- `.claude/skills/` — Skill files encoding the ceremonies described here
- `memory/implementation-patterns.md` — Tactical code patterns (distinct from this strategic document)
