---
name: work-item-impl
description: Prepare and plan implementation of a CALLSHEET work item. Use when user says "implement 067", "start work item", "impl 067", or wants to begin coding a work item. Pre-reads WORK.md, spec sources, existing code patterns, and produces an implementation plan with pre-satisfied AC identification.
---

# Work Item Implementation Prep

## Instructions

Execute the implementation preparation ceremony for a single work item. This is a deterministic, ordered sequence that replaces the manual "read WORK.md, read specs, grep existing code, identify pre-satisfied ACs" ceremony that runs at the start of every work item.

**Input:** A work item ID (e.g., `067`, `CS-WORK-067`). Normalise to `CS-WORK-{NNN}`.

---

### Step 1: Read Work Item + Chapter (parallel)

Launch both reads simultaneously:

1. **WORK.md** — `4-work-management/work/CS-WORK-{NNN}/WORK.md`. Extract:
   - All `acceptance_criteria` entries (AC list)
   - `blocked_by` — verify all blockers have `status: done`
   - `source_files` — the spec files to read in Step 2
   - `extensions.spec_sections` — which spec sections are relevant
   - `extensions.io_profile` — pure / db-read / db-write / event-emit
   - Deliverables checklist (files to create/modify)
   - Context section (type alignment notes, special instructions)

2. **Chapter file** — from `chapter:` frontmatter field. Look up in `4-work-management/chapters/CH-CS-{NNN}-*.md`. Extract:
   - Dependency graph (to understand what's done, what's parallel)
   - Any chapter-level notes relevant to this work item

**If `status: done`**, stop and tell the user — this work item is already complete.

**If any `blocked_by` item does not have `status: done`**, stop and report which blockers are incomplete.

**Early context budget warning:** If `effort: large` AND the AC count ≥ 12, output a warning immediately after reading WORK.md:

> This is a large work item ({N} AC). Planning alone may exhaust the context window (~150K tokens for init + impl). Consider treating this as a **plan-only session** — `/impl` writes the plan to `plans/impl-plan.md`, and a follow-up session reads the plan from disk and implements.

---

### Step 2: Read Spec Sources (parallel)

**Context budget check:** Before reading, estimate the total size of `source_files`. If the files are known to be large (>30K tokens combined — e.g., a single spec section >500 lines, or 3+ interface specs), warn the user:

> Spec sources are large (~{N} files, estimated {size}). Planning may consume >50% of context. Consider running `/impl` in a dedicated session and handing off the plan.

If the user confirms to proceed, or the files are small, continue.

**Large spec extraction (>30K tokens):** If spec sources total >30K tokens, dispatch a sub-agent to read the spec files and return a condensed extraction containing only:
- Pseudocode blocks (verbatim)
- Type definitions and payload shapes (verbatim)
- Threshold values and numeric constants
- AC-to-spec-section mapping
- Event names and router signatures

The sub-agent writes its extraction to a temp file. Main context reads the extraction (~5-10K tokens) instead of the full spec (~30-50K tokens). This preserves context for implementation.

**Standard read (≤30K tokens):** Read all files listed in `source_files:` simultaneously. These are the authoritative requirements — the WORK.md Context section is a summary.

For multi-file slices (S6+), only read the specific content files listed, not the entire slice directory.

Extract from each spec file:
- Pseudocode / implementation guidance relevant to this work item's AC
- Type definitions, payload shapes, Zod schemas
- Event names and payload contracts
- Router procedure signatures
- Decision type registrations

---

### Step 3: Pre-Check Existing Code (parallel)

For each deliverable file in the WORK.md, launch parallel checks:

1. **Existing file check** — for each file path in Deliverables, check if it already exists (Read). If it does, note what's already implemented.

2. **Type alignment check** — grep for key types mentioned in the Context section's "Type alignment notes" or in the AC text:
   - Event payload types in `src/lib/events/types.ts`
   - Decision types in `src/lib/decisions/`
   - Deferred action params in `src/lib/scheduler/types.ts`
   - Router namespaces in `src/server/root.ts`
   - Schema tables in `src/db/schema/`
   - Consumer matrix in `src/lib/events/`
   - Template IDs in `src/lib/email/`
   - Service interface in `src/lib/services/types.ts`

   **Event payload cascade mapping:** If the work item requires adding or modifying fields on any event payload type (e.g., adding `accountId` to `SubscriptionTierChangedEvent`), grep `_brand: "TypeName"` across `src/` to identify every emission site and test file that constructs that payload. List these in the Type Alignment section of the plan so they're fixed before writing handler code, not discovered reactively via `tsc` failures.

   **Deps bag blast radius:** If the work item adds dependencies to a router's dep bag (the `Deps` type parameter), grep all test files that construct that dep bag and list them as "files needing update." Same for any change to a shared type used with `Omit<SharedType, ...>` — grep for all usages and list the cascade files.

   **FK constraint audit:** For each table the work item inserts into, verify FK columns accept the planned values. Check for: sentinel UUIDs that would violate NOT NULL + FK constraints, nullable vs non-nullable FKs, and values that reference rows not yet created by the test fixture. This catches spec-schema mismatches (e.g., spec's "global sentinel row" blocked by a NOT NULL FK) before they reach agent prompts or implementation.

   **UUID-vs-text cross-table comparison audit:** Any SQL that joins or compares columns across tables must verify both sides have matching Postgres types. Known uuid-vs-text pairs: `churn_analysis_log.account_id` (uuid) vs `listings.account_id` (text), `decision_logs.account_id` (uuid) vs Better Auth user IDs (text). Drizzle's `eq()` does not catch this at compile time — it only fails at runtime with `operator does not exist: uuid = text`. Fix with `::text` cast on the uuid side, or use `additionalContext` instead of `accountId` when logging decisions with Better Auth text IDs.

3. **Pattern reference** — read ONE recent completed work item's primary source file from the same slice or same domain as a code style reference. Pick the most recently completed sibling (same `chapter:` or same `arc:`).

4. **Fixture and helper signature check** — before writing any test code, read actual function signatures for helpers this work item will use. Grep `src/db/test-fixtures.ts` and `src/db/test-utils.ts` for:
   - `createTestListing` — signature is `(db, accountId, overrides?)`, NOT a single options object
   - `seedTestUser`, `makeUUID`, `makeSession`, `makeAdminSession`, `expectTRPCError`
   - `InMemoryEmailService` — methods are `getCalls()`, `wasCalledWith()`, `clear()`
   - `InMemoryNotificationDb` — methods are `getAll()`, `clear()`
   - `invokeHandler` — from `src/lib/scheduler/handlers/__tests__/invoke-handler.ts`
   - Any other test helper referenced in the AC or deliverables

5. **Enum value pre-read** — if any deliverable or AC involves inserting/filtering on a `pgEnum` column, read the enum definition in the relevant `src/db/schema/*.ts` file. Never guess enum values from spec terminology — the pgEnum literal values are authoritative.

6. **Wrapper API check** — if deliverables involve `NotificationDb`, `SchedulerDb`, or `DecisionLogDb`, grep for existing usage patterns in sibling implementations. The public API is wrapper functions (`logDecision()`, `scheduleDeferredAction()`, `createNotification()`) — not the raw interface methods (`.insert()`). Check how the nearest sibling calls them before writing the first invocation.

7. **IO profile tagging** — if the work item has no DB access, no routes, and no event emission (`extensions.io_profile: "pure"`), note it as freely parallelisable in the plan. These have the fastest cycle time and no integration test overhead.

8. **Cursor column decision** — if any deliverable involves a paginated list route, decide the cursor column now (during planning), not after test failure. UUID cursors don't correlate with `ORDER BY createdAt`. Use `createdAt`-based cursors when ordering by time.

9. **Smoke request step** — if the work item creates a new HTTP route handler (tRPC endpoint, webhook, API route), include a "build, start, curl" verification step in the implementation order. This surfaces env var and template registration issues immediately.

---

### Step 4: AC Pre-Satisfaction Analysis

For each acceptance criterion, determine status:

| Status | Meaning |
|--------|---------|
| **needs-impl** | No existing code satisfies this AC. Must be built. |
| **pre-satisfied** | Prior work (foundation item, shared infrastructure, earlier work item) already satisfies this AC. Needs verification test only. |
| **partial** | Some code exists but doesn't fully satisfy the AC. Note what's missing. |
| **blocked** | Depends on code not yet written (from a parallel work item, not a `blocked_by`). Note the dependency. |

For each AC, grep/read to determine status. Check:
- Schema columns already created by foundation work items
- Event types already registered
- Router procedures already wired
- Templates already registered
- Consumer matrix entries already present
- Deferred actions already defined

---

### Step 5: Produce Implementation Plan

**Always write the plan to disk** at `4-work-management/work/CS-WORK-{NNN}/plans/impl-plan.md`. This makes the plan survive session boundaries — a new session can read it from disk instead of requiring copy-paste handoff.

Also output the plan to the user (so they can review it in the current session).

If context is running low (>60% consumed by this point), after writing the plan to disk, tell the user:

> Plan written to `4-work-management/work/CS-WORK-{NNN}/plans/impl-plan.md`. Context is low — recommend starting a new session. The next session can read the plan from disk: `Read 4-work-management/work/CS-WORK-{NNN}/plans/impl-plan.md` then proceed with implementation.

Plan format:

```
## Implementation Plan — CS-WORK-{NNN}: {title}

**IO profile:** {pure / db-read / db-write / event-emit}
**Blocked by:** {list with status, or "None — all clear"}
**Spec sources:** {list of files read}

### AC Summary

| AC | Description (short) | Status | Evidence / Notes |
|----|---------------------|--------|-----------------|
| AC-{N} | {one-line} | needs-impl | — |
| AC-{M} | {one-line} | pre-satisfied | {file:line where it's already done} |
| ... | ... | ... | ... |

**Pre-satisfied:** {count} / {total} — {these only need verification tests}
**Needs implementation:** {count} / {total}

### Type Alignment

{List any type misalignments found in Step 3 — stubs to populate, missing union members, wrong shapes. Or "All types aligned — no action needed."}

### Implementation Order

1. {First thing to build — usually schema/types}
2. {Core logic}
3. {Routes / consumers}
4. {Tests}

### Deliverables

{Reproduce the WORK.md deliverables checklist, annotated with what already exists}

### Key Patterns (from sibling)

{2-3 bullet points about patterns observed in the sibling code file — router factory shape, test structure, naming conventions}

### Sub-Agent Delegation Assessment (if effort ≥ large)

{Only include this section for work items with `effort: large` or ≥12 AC.}

**Parallelisable workstreams:** {List independent groups of deliverables that share no files}
**Max parallel agents:** {Number — typically 2-4. Constrained by shared file conflicts.}
**Delegation plan:** {Which workstream per agent. What stays in main context (wiring, conflict resolution, final test run).}

#### Spec Constants Block

{Extract ALL numeric constants from the spec into a typed const block. Include this block verbatim in every agent prompt. This prevents per-agent drift on cadence intervals, thresholds, timeout values, and severity mappings.}

```typescript
// Paste this block into each agent prompt:
// const SPEC_CONSTANTS = { ... }
```

**Agent prompt rules:**
- Each agent prompt MUST include the spec constants block above — agents must use these values, not infer their own
- The spec constants block MUST include output format shapes (e.g., `INSUFFICIENT_DATA_OUTPUT = { status: "insufficient_data" as const, reason: string }`) alongside numeric values — agents drift on object shape when only described in prose
- For ceremony/scheduler handlers, include explicit instruction: "On idempotency skip or early return, still call the self-perpetuation/schedule-next-run function before returning. 'Skip' means skip computation, not skip scheduling."
- Each agent prompt MUST end with: "After making changes, run `npx tsc --noEmit` to verify types compile. Then run `git branch --show-current` to verify you are on the worktree branch (not master). Then run `git add -A && git commit -m 'Agent: {description}'` to persist your changes."
- Each agent prompt MUST list the exact function signatures and type shapes from the spec that the agent's code must match — not natural language descriptions
- Agents producing code that other agents consume (e.g., core types) must run first, not in parallel with their consumers
```

---

## What This Skill Does NOT Do

- Does not write code — it produces a plan. Implementation follows.
- Does not modify WORK.md status — that happens at close-out.
- Does not read concept design documents — the spec source files are sufficient.
- Does not update trackers — that's session-close's job.
- Does not run tests — that's session-init's job.

---

## When to Use

- At the start of implementing any work item.
- User says "implement 067", "start 067", "impl CS-WORK-067", "work item 067", "begin 068".
- After session-init, when the user picks a work item to implement.

---

## Why This Exists

Every work item implementation starts with the same 5-minute ceremony: read WORK.md, read specs, grep existing code, discover what's pre-satisfied. This ceremony is identical every time but error-prone when done manually — the "forgot to check existing code" failure mode has caused rework on S7/S8 infrastructure-heavy items. The skill parallelises reads, catches type misalignments before coding starts, and produces a structured plan that prevents mid-implementation surprises.
