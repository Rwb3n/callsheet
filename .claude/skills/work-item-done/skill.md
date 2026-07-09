---
name: work-item-done
description: Close out a single CALLSHEET work item. Use when user says "done 069", "close 069", "mark done", or after finishing implementation of a work item. Updates WORK.md status, all 3 tracker locations, and verifies completion log entry. Lighter than session-close — handles one work item, not the whole session.
---

# Work Item Done

## Instructions

Close out a single completed work item. This is a deterministic, ordered sequence that updates all required locations for one work item. Run this after implementation + tests pass, before `/retro`.

**Input:** A work item ID (e.g., `069`, `CS-WORK-069`). Normalise to `CS-WORK-{NNN}`.

---

### Step 1: Read Work Item

Read `4-work-management/work/CS-WORK-{NNN}/WORK.md`.

**If `status: done`**, stop and tell the user — already closed.

Extract:
- `chapter:` — to find the chapter file
- `acceptance_criteria:` — count for AC total
- `blocked_by:` — for tracker row update
- `enables:` / `blocks:` — to report what's unblocked

---

### Step 2: Gather Artifacts

Ask the user (or infer from conversation history) for:
- **AC verified count** — how many AC passed (usually all)
- **Test counts** — unit + integration tests added/modified
- **Key artifacts** — source files created or modified (for tracker Artifacts column)

If the conversation history contains this information (e.g., from the implementation summary), extract it directly — don't ask.

---

### Step 3: Update WORK.md

Edit the WORK.md frontmatter:
- `status: todo` → `status: done`
- `closed: null` → `closed: {YYYY-MM-DD}` (today's date)
- `queue_position: backlog` → `queue_position: done`
- `cycle_phase: backlog` → `cycle_phase: done`
- Update `node_history:` — set `exited` on current node, add done node with today's `entered`
- Update `artifacts:` — list key source files

**Verify each deliverable individually** — for every file path in the Deliverables checklist, confirm it exists on disk (Read or Glob). If a deliverable file was not created (e.g., a UI page deferred to a later pass), leave its checkbox unchecked and note why. Do not bulk-check all deliverables without verifying each one.

Mark verified deliverable checkboxes as done (`- [x]`).

---

### Step 4: Update IMPLEMENTATION-TRACKER (3 locations)

Read `4-work-management/IMPLEMENTATION-TRACKER.md`. Update these three locations:

#### 4a. Progress Summary Table (top of file)

- Increment the slice's work item done count (e.g., `3 / 8` → `4 / 8`)
- Increment the slice's AC verified count
- Update the slice's status if progress changed (e.g., `in progress (3/8)` → `in progress (4/8)`)

Do NOT update "Tests passing" row — that's session-close's job (needs a full test run).

#### 4b. Slice Work Items Table Row

For the completed work item's row:
- AC column: `{done}/{total}` (e.g., `7/7`)
- Status column: `**done**`
- Blocked By column: strikethrough all entries (e.g., `~~066, 068~~`)
- Artifacts column: key source files

#### 4c. Dependency Graph

Add `✅` and AC count to the completed node:
```
├──▶ CS-WORK-069 (Win-Back, 7 AC) ✅
```

---

### Step 5: Verify Completion Log

Check if a completion log entry exists for this work item (grep for the ID in the Completion Log section).

- **If missing:** Add a new entry following the established format:
  ```
  | {YYYY-MM-DD} | CS-WORK-{NNN} | {AC count} | {One-line description. Key artifacts. Test counts. Type error count.} |
  ```
- **If exists:** Verify it's accurate. Update if needed.

**Prior gap check:** Scan the completion log for the 3 work items preceding this one (by ID). If any are missing entries but have `status: done` in their WORK.md, add their entries now. This prevents the accumulating gaps discovered in CS-WORK-068/069.

---

### Step 5.5: Post-Close Audits

Run these checks after updating the tracker:

1. **Tracker summary row refresh** — re-read the Progress Summary table row for this slice. Verify work item done count, AC verified count, and status string are all consistent with the slice work items table. Fix any mismatch.

2. **WORK.md status field confirmation** — re-read the WORK.md file and confirm `status: done` was actually written (not just planned). This catches edit failures silently.

3. **Stub/no-op audit** — if this work item replaced a no-op or stub implementation, grep for the old import path across `src/`. List any files still importing the old module. If found, fix them or note as tech debt.

4. **Template registration audit** — if this work item added an `EmailTemplateId`, grep the `EmailTemplateId` union type and compare against all `registerTemplate()` / `hasTemplate()` calls. Any ID without a registration is a latent runtime crash.

5. **Adapter stub audit** — if this work item added consumers that call adapter methods, grep `adapters.ts` for `return 0`, empty arrays, or empty method bodies on the methods this work item calls. Hollow stubs that pass tests but don't do real work should be noted as tech debt.

6. **Chapter close-out** — if this is the final work item in its chapter (all siblings have `status: done`), verify: (a) chapter YAML `status:` is updated to `complete`, (b) tracker summary row totals match, (c) arc file exit criteria are met.

7. **Arc close-out** — if this chapter close-out means all chapters in the arc are now complete (check the arc file's `chapters:` list, verify each has `status: Complete`), update the arc YAML `status: Complete`. This prevents stale arc statuses from accumulating — the CS-E1 closure found 4 arcs still marked Active despite all their chapters being done.

---

### Step 6: Report

Output a concise confirmation:

```
## CS-WORK-{NNN} closed

**AC:** {done}/{total}
**Tests:** {unit} unit + {integration} integration
**Artifacts:** {key files}

**Updated:**
- WORK.md: status → done, closed → {date}
- Tracker summary: S{N} {done}/{total} work items, {ac}/{total} AC
- Tracker row: ✓
- Dependency graph: ✓
- Completion log: ✓

**Unblocked:** {list of work items in `enables:` whose blocked_by is now fully satisfied, or "None"}
```

---

## Relationship to Other Skills

| Skill | Relationship |
|-------|-------------|
| `work-item-impl` | Runs before this — produces the implementation plan |
| `migration-close` | Runs between impl and this — if schema changes were made |
| `retro` | Runs after this — reflects on the work item |
| `session-close` | Runs at end of session — updates MEMORY.md handoff + test counts. Does NOT re-update work items already closed by this skill. Session-close Step 2 should verify (not duplicate) what this skill already did. |

---

## What This Skill Does NOT Do

- Does not run tests — assumes tests already passed before invocation.
- Does not write retros — use `/retro` after this.
- Does not update MEMORY.md — that's session-close's job.
- Does not update "Tests passing" row in tracker — that needs a full suite run (session-close).
- Does not update chapter status — session-close Step 2e handles chapter completion detection.
- Does not commit code or push.

---

## When to Use

- After implementing a work item and confirming all tests pass.
- User says "done 069", "close 069", "mark 069 done", "069 done".
- Before writing a `/retro` for the work item.
- Multiple times per session if multiple work items are completed — once per work item.

---

## Why This Exists

Session-close updates all completed work items at once, at the end of a session. This creates two failure modes: (1) if a session is interrupted before close-out, tracker updates are lost; (2) closing 3+ work items at session end is a heavy ceremony that's error-prone. Per-work-item close-out is lighter, more immediate, and prevents the "forgot to update the completion log" gap that caused backfill work in CS-WORK-068/069.
