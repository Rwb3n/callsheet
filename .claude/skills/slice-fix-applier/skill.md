---
name: slice-fix-applier
description: Apply stress test fixes to a CALLSHEET requirements slice and update tracking documents. Use when user says "apply fixes", "apply stress test", "update slice from stress test", or "produce v2 from stress test".
---

# Slice Fix Applier

## Instructions

You are applying fixes from a stress test file to a CALLSHEET requirements slice and updating all tracking documentation. This is mechanical work — the stress test file contains exact fix instructions. Your job is to apply them accurately without reinterpreting or expanding scope.

### Step 1: Read Inputs

1. Read the stress test file (e.g., `stress-tests/s{N}-stress-test.md`)
2. Read the slice to be fixed:
   - **Single-file slices (S0–S5):** `slices/slice-{NN}-{name}.md`
   - **Multi-file slices (S6+):** `slices/slice-{NN}-{name}/index.md` + all content files (`00-*.md`, `01-*.md` through `0N-*.md`)
3. Read `references/fix-format.md` for the fix application protocol
4. Read `references/tracker-format.md` for tracker update format
5. Read `references/memory-format.md` for memory update conventions

### Step 2: Apply Slice Fixes

For each non-Pass scenario in the stress test:
1. Navigate to the section specified in "Fix — slice"
2. Find the "Old" text
3. Replace with the "New" text
4. If "Acceptance criteria impact" specifies AC changes, update §15 (or §16 for S4+)

After all fixes:
- Update the slice header: `Status: Draft v2 (STRESS TESTED)`, update `Last updated` date
- Update the AC total count
- Populate the Stress Test Resolution Log section (§15 or §16) with a summary table referencing the stress test file

### Step 3: Apply Sibling Spec Fixes

For each scenario with "Fix — sibling specs":
1. Read the target document
2. Apply the specified change
3. Bump the version header of every edited spec (e.g., `Draft v6` → `Draft v7`). If you edit a spec, you bump it — no exceptions.

### Step 4: Update REQUIREMENTS-TRACKER.md

Add a changelog entry following the format in `references/tracker-format.md`:
- Date, spec name, description of changes, new version
- Update the Slice Status table (status, AC count, downstream flags)
- Update Phase Progress Summary counts

### Step 5: Update MEMORY.md

Add key findings following `references/memory-format.md`, structured by these four questions:

1. **Version bumps:** Which documents changed version? Update the Document Versioning section.
2. **Stress test pattern:** Did this stress test surface a new *recurring* finding (something likely to appear in future slices)? If yes, add to the stress test findings section or `memory/stress-test-findings.md`. If the finding is slice-specific and won't recur, skip.
3. **Workflow lesson:** Did the pipeline itself behave unexpectedly? (e.g., merge required delegation, assembly hit token limit, read strategy was inefficient.) If yes, add to the relevant workflow section in MEMORY.md.
4. **Skill amendment signal:** Does any finding suggest a skill instruction should change? If yes, add a note: `**Skill amendment needed:** {skill name} — {what should change and why}.` The orchestrator (main context) decides whether to apply.

### Step 5b: Produce Cumulative Schema Snapshot

After memory updates, produce or update `3-requirements/references/cumulative-schema.md`. This file is the single source of truth for "what does the schema look like after this slice?"

**Agent reads:**
- The existing `references/cumulative-schema.md` (read this FIRST — it contains all prior tables)
- The current slice's schema section (`00-schema.md` for multi-file, or §Schema Additions for single-file)
- Schema amendment sections from the slice being fixed

**Incremental update strategy:** If `cumulative-schema.md` already exists, do NOT regenerate from scratch. Instead:
1. Read the existing file (this is the baseline — all prior slices are already in it)
2. Append the current slice's new tables at the end, in a new `### S{N}: {Name}` section
3. Apply any amendments the current slice makes to prior tables (update the affected table definition + its `amended by` annotation)
4. Update the Summary table at the bottom

If the file does not exist (first run), generate the full schema from all prior slices.

**Agent writes:** `3-requirements/references/cumulative-schema.md`

**Content:**
- Every table in the system, with all columns, types, defaults, indexes, and constraints
- Each table annotated with authoritative source: `// Authoritative in S{N} §{X}, amended by S{M}, S{P}`
- pgEnum declarations with their owning slice
- No prose — just the Drizzle-style schema definitions

**Why this exists:** Every slice from S2 onward reconstructs schema state from prior slices. The S7 pre-draft checklist had a `pending_cancellations` redundancy bug because there was no single source to check. This file eliminates that failure class. The checklist skill consumes it; the fix-applier produces it.

### Important Rules

- **ALL changes are written directly to files on disk using the Edit/Write tools.** Never return modified content as text. The files on disk are the deliverables.
- Apply fixes EXACTLY as specified. Do not expand scope.
- Do not fix things the stress test didn't find.
- Do not add new acceptance criteria unless the stress test specifies them.
- Do not change existing acceptance criteria numbers — only add new ones at the end.
- Preserve all existing content in the slice that isn't targeted by a fix.
- When populating §15/§16 resolution log, use the summary table format (not full detail — reference the stress test file).
- **Agents read the stress test file directly.** The orchestrator should NOT restate fix instructions in the agent prompt. The stress test file is the single source of truth for what to change.

### Step 6: Post-Fix Validation

After both agents complete, the orchestrator dispatches a lightweight validation agent (use haiku for speed) to verify fixes were applied correctly.

**Agent reads:**
- The stress test file (fix list)
- The amended slice (`index.md` + content files for multi-file, or the single file)

**Checks (5 items):**
1. **Fix count:** Every non-Pass scenario's slice fix was applied (spot-check 3-4 fixes by searching for "New" text)
2. **AC count:** Total AC count in `index.md` §18 matches the header's stated total
3. **Version header:** Slice header says `Draft v2 (STRESS TESTED)` with current date
4. **Resolution log:** §19 (or equivalent) is populated and references the stress test file
5. **No orphan old text:** Search for 2-3 distinctive "Old" text fragments from High/Medium fixes — they should NOT appear in the slice

**Output:** Return results as text to the orchestrator (not a file). Format: `PASS (5/5)` or `FAIL: {list of failed checks}`. If any check fails, the orchestrator fixes it directly (mechanical corrections only) before declaring v2 complete.

**Why this exists:** Fix-applier agents modify 7+ files across a directory structure. A missed edit or stale text is easy to overlook. This 30-second check catches it before the user sees the result.

---

### Parallelization

This skill is designed for two parallel agents that read the stress test file directly, plus a sequential validation step:

- **Agent A (Slice fixes):** Steps 1–2. Reads stress test file + slice. Applies all slice edits, AC updates, and resolution log.
- **Agent B (Sibling + tracking + schema snapshot):** Steps 3–5b. Reads stress test file + all sibling targets. Applies spec edits, tracker updates, memory updates (structured by the 4-question template), and produces/updates `references/cumulative-schema.md`.
- **Validation (sequential, after A+B):** Step 6. Lightweight check that fixes landed correctly. Haiku agent, ~30 seconds.

Both fix agents write to disk. No orchestrator merge needed. Validation runs after both complete.

**AC count reconciliation:** Agent A determines the final AC count. Agent B writes the tracker status row before Agent A may have finished. After both agents complete, the orchestrator reads the final AC total from `index.md` and corrects the tracker's Slice Status table row if it differs. This is a single Edit call — not a new agent.

**Pipeline timing:** The orchestrator records wall-clock timing in the completion summary: `Agent A: Xm, Agent B: Ym, Validation: Zs`. This tracks whether the pipeline is slowing as slices grow.

**Minimal prompt pattern for invoking agents:**

**Single-file slices (S0–S5):**

Agent A: "Apply slice fixes from `stress-tests/s{N}-stress-test.md` to `slices/slice-{NN}-{name}.md`. Follow skill instructions at `.claude/skills/slice-fix-applier/skill.md` and reference files in `.claude/skills/slice-fix-applier/references/`."

**Multi-file slices (S6+):**

Agent A: "Apply slice fixes from `stress-tests/s{N}-stress-test.md` to the slice directory `slices/slice-{NN}-{name}/`. Read `index.md` for ACs and tail sections. Read content files (`01-*.md` through `0N-*.md`) for section fixes. Schema fixes go in `00-schema.md`. The stress test's 'Slice §' column indicates which file contains the target section (e.g., `01-search.md §1.3`). Follow skill instructions at `.claude/skills/slice-fix-applier/skill.md`."

Agent B (unchanged for both formats): "Apply sibling spec fixes, tracker updates, memory updates (use the 4-question template in Step 5), and produce/update `references/cumulative-schema.md` (Step 5b) from `stress-tests/s{N}-stress-test.md`. Follow skill instructions at `.claude/skills/slice-fix-applier/skill.md` and reference files in `.claude/skills/slice-fix-applier/references/`."

The main context should NOT restate fix instructions from the stress test file. The agents read the file themselves. The stress test file contains exact fix instructions per scenario — that is the single source of truth.
