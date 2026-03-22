---
name: session-close
description: Run the CALLSHEET session close-out ceremony. Use when user says "close", "session close", "end session", "wrap up", or at the end of any conversation. Verifies test health, updates all tracker locations, writes handoff to MEMORY.md, and produces a close-out summary.
---

# Session Close

## Instructions

Execute the session close-out ceremony. This is a deterministic, ordered sequence. Every step is mandatory. Do not skip steps or summarise without reading.

---

### Step 1: Verify Test Health (parallel background tasks)

Run all three as **background tasks** (`run_in_background: true`):

1. `npx tsc --noEmit` — must produce 0 errors.
2. `npm run test` — unit tests, capture count.
3. `npm run test:integration` — integration tests, capture count (timeout: 600s).

**Do not block on these.** Proceed immediately to Step 2 while they run. Collect results in Step 4.

If any check fails when results arrive, **stop and report the failure**. Fix it before producing the close-out summary.

---

### Step 2: Update IMPLEMENTATION-TRACKER (sub-agent)

Launch an **Agent sub-agent** with the following instruction. This runs in parallel with Step 3.

> **Sub-agent instruction (tracker update):**
>
> You are updating `4-work-management/IMPLEMENTATION-TRACKER.md` for session close-out.
>
> **Inputs (provided by caller):**
> - Work items completed this session: `{list of CS-WORK-NNN with AC counts}`
> - Test counts (placeholder — will be verified by main context): `{unit} unit + {integration} integration + {E2E} E2E`
> - Key artifacts per work item: `{list}`
>
> **Read** `4-work-management/IMPLEMENTATION-TRACKER.md` in full.
>
> For **every work item completed this session**, verify all four locations are updated. If `/work-item-done` was already run for a work item, **verify** its updates (don't duplicate) — check that the row, graph, and log entry are present and correct. Only write what is missing.
>
> **2a. Progress Summary Table (top of file)**
>
> | Field | What to update |
> |-------|---------------|
> | Work items complete | Increment the slice's `done / total` fraction |
> | AC verified | Increment the slice's AC count |
> | Slices with code | Update `in progress (N/M)` fraction |
> | Tests passing | Replace with provided test counts. **Compare against previous value** — if delta is unexpected (e.g., count decreased or increased by more than the tests added this session), flag it to the caller for investigation. This prevents silent test count drift between sessions. |
> | Type errors | `0` |
>
> **2b. Slice Work Items Table**
>
> For each completed work item row:
> - AC column: `{done}/{total}` (e.g., `13/13`)
> - Status column: `**done**`
> - Blocked By column: strikethrough (e.g., `~~066~~`)
> - Artifacts column: list key source files created/modified
>
> **2c. Dependency Graph**
>
> Add checkmark and AC count to the completed node. Example:
> `├──▶ CS-WORK-067 (Conversion Triggers, 13 AC) ✅ ──┐`
>
> **2d. Completion Log**
>
> Verify there is a dated entry for each completed work item — **including items completed in prior sessions that may have been missed**. Scan the S{N} work items table: every row with status `**done**` must have a corresponding completion log entry. If any are missing, backfill them now following the established format (date, ID, AC count, description, test counts, notes).
>
> **2e. Chapter Completion (conditional)**
>
> If the **final work item in a chapter** was completed this session:
> - Update the chapter file YAML: `status: Complete`
> - Verify the sum of work item ACs matches the chapter's total AC count
> - Report chapter completion in output
>
> **2f. Pending Decomposition Staleness Sweep**
>
> Scan the `S1–S10: Pending Decomposition` table. For each slice where **all work items** in the slice work items table have `status: **done**`, verify the Pending Decomposition row shows `complete`. If it still shows `decomposed` or `active — next`, update it to `complete`. This prevents stale status from persisting across sessions.
>
> **Output:** A brief confirmation listing what was updated, what was already correct, and whether a chapter was completed.

---

### Step 3: Update MEMORY.md Handoff (sub-agent, parallel with Step 2)

Launch an **Agent sub-agent** with the following instruction. This runs in parallel with Step 2.

> **Sub-agent instruction (MEMORY.md handoff):**
>
> You are updating `MEMORY.md` for session close-out.
>
> **Inputs (provided by caller):**
> - Work items completed this session: `{list of CS-WORK-NNN with titles and AC counts}`
> - Current slice status: `{slice ID} {status} ({done}/{total} work items, {AC done}/{AC total} AC)`
> - Next work items: `{ordered list with titles, AC counts, dependencies}`
> - Chapter state: `{chapter ID} ({done}/{total} work items)`
> - Infrastructure changes: `{any migrations, tooling, deployment changes}`
> - Carried forward items: `{deferred items}`
> - Test counts: `{unit} unit + {integration} integration + {E2E} E2E = {total}. {type errors}. {failures}`
> - Email template count: `{registered}/{total}`
> - Retro status: `{triaged status, action count, untriaged count}`
> - Action items resolved this session: `{list or "None"}`
>
> **Read** `MEMORY.md` in full.
>
> **Replace the `## Next Session Handoff` section entirely** with:
>
> ```markdown
> ## Next Session Handoff
> - **{Slice} {STATUS} ({date}).** {What was done this session — work items completed, AC counts}.
> - **Next: {next work item(s)}** — {title} ({AC count}, {priority}). {What's unblocked}.
> - **{Chapter}:** {chapter ID} ({work item count}, {AC count}). Dependency graph: {current state with completed items struck through}.
> - **Action items resolved this session:** {list any retro actions or close-out items addressed}.
> - **Infrastructure:** {any infra changes — deployments, migrations, tooling}.
> - **Carried forward:** {items explicitly deferred to future sessions}.
> - **Test counts:** {unit} unit + {integration} integration + {E2E} E2E = {total}. {type errors}. {failures}.
> - **Email templates:** {registered}/{total} registered. {any pending}.
> - **Retros:** {triaged status}. {action count summary}. {untriaged count}.
> ```
>
> Also update any other MEMORY.md sections that are now stale (e.g., repository state test counts, work item status, migration count, email template counts). Keep MEMORY.md under 200 lines — the `## Next Session Handoff` section is always loaded into context.
>
> **Output:** A brief confirmation listing what sections were updated.

---

### Step 4: Collect Results and Verify

1. **Wait for background test tasks** from Step 1 (use `TaskOutput` with `block: true`).
2. **Wait for both sub-agents** from Steps 2 and 3.
3. **Verify test counts match** what was passed to sub-agents. If test counts changed (e.g., new tests were added after the sub-agents started), patch the tracker and MEMORY.md inline — this is rare and a quick edit.
4. If any test failed, stop and fix before proceeding.

---

### Step 5: Verify Retro Status

Check: was a `/retro` written this session for each completed work item?

- If yes and `triaged: false`: note it in the close-out summary — next session's `/init` will surface it.
- If no retro was written for a completed work item: **ask the user** if they want to write one now.

---

### Step 6: Produce Close-Out Summary

Output a concise summary to the user:

```
## Session Close — {YYYY-MM-DD}

**Work completed:**
- {work item ID}: {title} ({AC count} AC, {test count} tests)
- ...

**Test health:** {unit} unit + {integration} integration + {E2E} E2E = {total}. 0 type errors.

**Tracker updated:**
- Progress Summary: ✓
- Work item rows: ✓
- Dependency graph: ✓
- Completion log: ✓

**MEMORY.md handoff:** Updated for next session.

**Retros:** {status — written/triaged/pending}

**Next session starts with:** {ordered list of next work items}
```

---

## Architecture: Why Sub-Agents

Steps 2 and 3 are **independent file updates** that each require reading a large file (~500 lines), making targeted edits, and confirming correctness. Running them as sub-agents:

1. **Saves context** — the full tracker and MEMORY.md are read inside the sub-agent, not in main context.
2. **Runs in parallel** — both updates happen concurrently while test results are still arriving.
3. **Reduces sequential time** — previous sequential execution took ~60s of context processing; parallel sub-agents complete in the time of the slower one.

The main context orchestrates: it collects session state, dispatches sub-agents with structured inputs, waits for all results, verifies consistency, and produces the summary.

---

## What This Skill Does NOT Do

- Does not commit code or push to remote.
- Does not run E2E tests (require build + start — too slow for close-out).
- Does not write retros — use `/retro` separately before `/close` if needed.
- Does not triage retros — use `/triage-retros` if untriaged retros exist.
- Does not modify source code — only tracker documents and MEMORY.md.

---

## When to Use

- End of every conversation (before the context is lost).
- User says "close", "session close", "end session", "wrap up", "done for now".
- After completing the last planned work item in a session.

---

## Why This Exists

Session close-out has 6+ update locations across 3 files. Missing any one creates drift between WORK.md (done), the tracker table (still shows todo), and MEMORY.md (stale handoff). The `/init` ceremony reads all three — inconsistencies cause the next session to misunderstand project state. This skill makes the close-out deterministic and auditable.
