---
name: session-init
description: Run the CALLSHEET session init ceremony. Use when user says "init", "session init", "start session", or at the beginning of any new conversation. Reads governing documents, loads handoff context, verifies test health, and produces a status briefing.
---

# Session Init

## Instructions

Execute the session init ceremony. This is a deterministic, ordered sequence. Do not skip steps, summarise files instead of reading them, or produce output before Step 4.

**Light init detection:** Before starting Step 1, check MEMORY.md `## Next Session Handoff` for the handoff date. If **all three** conditions are met, run **light init** (skip to Step 1b):
1. Handoff date matches today's date (same calendar day)
2. The handoff section includes a `Test health:` line with 0 failures
3. No governing documents have been modified since the handoff (check git status for changes to `0-strategic-frame/`)

Light init saves ~40K context tokens by skipping governing doc re-reads and health checks.

---

### Step 1: Read Governing Documents (full init only)

Read these three files **in full**, in order. They set output style and design frame for the entire session.

1. `0-strategic-frame/entity-architecture-frame.md`
2. `0-strategic-frame/output-style.md`
3. `0-strategic-frame/output-style-engineer.md`

Do not summarise, paraphrase, or acknowledge them — just read and absorb.

**Skip this step in light init mode.**

### Step 1b: Light Init Abbreviated Read

**Only in light init mode.** Instead of reading the three governing documents:

1. Read `MEMORY.md` handoff section (already auto-loaded — just confirm).
2. Read `4-work-management/IMPLEMENTATION-TRACKER.md` Progress Summary table (first 20 lines).
3. Read the active chapter file.
4. Run the open action scan (Step 3's grep-first scan — inline, ~3s).

Skip health checks (Step 3 items 1-3) — they were verified in the prior session today.

Proceed directly to Step 4 with an abbreviated briefing:

```
## Session Status — {YYYY-MM-DD} (light init)

**Active chapter:** {id} — {title}
**Test health:** Verified in prior session ({count} total, 0 failures).
**Governing docs:** Unchanged — skipped re-read.

### Handoff from previous session
{2-4 bullet points from MEMORY.md}

### Untriaged retro actions
{grep result, or "None"}

### Next work
{From chapter file}
```

Then proceed to Step 5 (triage prompt) if untriaged retros exist. Otherwise, done.

---

### Step 2: Load Handoff Context

Read these files to understand current project state:

1. **MEMORY.md** — auto-loaded, but check the `## Next Session Handoff` section explicitly. This is the primary handoff from the previous session.
2. **Implementation tracker** — `4-work-management/IMPLEMENTATION-TRACKER.md`. Read the Progress Summary table and recent completion log entries (last 20 lines of the log).
3. **Active chapter** — identified from the handoff section. Read the full chapter file (e.g., `4-work-management/chapters/CH-CS-014-presentation.md`).
4. **Do NOT read individual work item WORK.md files.** Init identifies next work items from the chapter file but defers detailed reading to `/impl`. This avoids overlap — `/impl` does all work-item-specific pre-reads (spec sources, existing code, test patterns).

---

### Step 3: Verify Health + Scan Open Actions (parallel)

Launch health checks in parallel:

1. `npx tsc --noEmit` — must produce 0 errors.
2. `npm run test` — unit tests, capture count and pass/fail.
3. `npm run test:integration` — integration tests, capture count and pass/fail.
4. **Open action scan** — grep + read inline (see below). Run in parallel with 1-3.

If any health check fails, **stop and report the failure**. Do not proceed to Step 4. The session's first task is fixing the failure.

Wait for all results before proceeding.

#### Completion Log Gap Scan

Before the open action scan, check for close-out failures from the previous session:

1. Read the last 10 entries of the Completion Log in `IMPLEMENTATION-TRACKER.md`.
2. For each work item in the active chapter, check: if a retro file exists for that work item (`4-work-management/retros/cs-work-{NNN}-retro-*.md`) but its WORK.md still shows `status: todo`, flag it as a close-out failure to reconcile before proceeding.
3. Report any gaps in the status briefing under **Blockers / open items**.

#### Open Action Scan (grep-first — inline, no Explore agent)

Run directly in main context (fast enough — ~3s total):

1. `grep "triaged: false" in 4-work-management/retros/` → list of untriaged filenames (usually 0-3)
2. Read `4-work-management/open-actions.md`
3. If untriaged files exist (typically 0-3), read them and extract §3 Action Register rows where Status = `open`

No sub-agent needed. The grep + 1-4 file reads complete in ~3s.

Produce two result sections for Step 4:
- **From open-actions.md:** table of all register rows, or "Register empty."
- **From untriaged retros:** table of open actions with columns `Source file | # | Item | Priority | Owner | Definition of Done`, or "No untriaged retros."
- **UNTRIAGED_COUNT:** number of untriaged retro files with open actions

**Performance:** ~3s (1 grep + 1-4 reads) vs ~400s (old Explore agent scanning all 70+ files).

---

### Step 4: Produce Status Briefing

Output a concise briefing to the user. Format:

```
## Session Status — {YYYY-MM-DD}

**Active chapter:** {id} — {title}
**Completed this epoch:** {list of completed work items or slices}
**Test health:** {unit count} unit + {integration count} integration + {E2E count} E2E = {total} total. {pass/fail}.
**Type errors:** {count}

### Handoff from previous session
{2-4 bullet points summarising what was done and what's next, from MEMORY.md handoff section}

### Open actions (register)
{Table from open-actions.md section of sub-agent result, or "Register empty."}

### Untriaged retro actions
{Table from untriaged retros section of sub-agent result, or "None — all retros triaged."}

### Next work
{Ordered list of work items to execute, with AC counts and dependencies}

### Blockers / open items
{Any failing tests, "now"-priority actions, or dependency gaps. "None" if clear.}
```

---

### Step 5: Triage Prompt

**Only if the sub-agent found untriaged retros with open actions** (UNTRIAGED_COUNT > 0):

Ask the user:

```
{N} untriaged retro(s) with open actions. Triage now? (y / n / pick)
- y: forward all open actions to the register, mark retros triaged
- n: skip, triage later with /triage-retros
- pick: show actions and let me choose which to forward
```

**If the user says "y" or "yes" or "forward all":**

Launch `/triage-retros` with the instruction to forward all open actions from untriaged retros without per-item confirmation. This runs inline — no separate command needed.

**If the user says "pick":**

Launch `/triage-retros` normally (it will present actions and ask per-item).

**If the user says "n" or "no" or "skip":**

Proceed. Untriaged actions will surface again next session.

**If there are no untriaged retros:** Skip this step entirely. Do not ask.

---

## What This Skill Does NOT Do

- Does not write code or make changes (except triage in Step 5, which only modifies retro frontmatter and open-actions.md).
- Does not update MEMORY.md — that happens at session end, not session start.
- Does not run E2E tests (require `npm run build && npm start` — too slow for init).
- Does not read concept design or interface spec documents unless the handoff explicitly flags a gap.
- Does not deep-read triaged retro files — grep filters to only untriaged ones (typically 0-3).

---

## When to Use

- Start of every new conversation (the CLAUDE.md `## Mandatory Session Init` section directs this).
- After `/clear` — context is wiped, re-init required.
- User says "init", "session init", "start session", "where are we".
