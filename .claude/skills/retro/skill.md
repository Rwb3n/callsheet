---
name: retro
description: Generate a structured retrospective. Use when user says "retro", "retrospective", "retro for S1", "session retro", or wants to reflect on a work item, slice, arc, or session.
---

# Retrospective

## Instructions

Generate a structured retrospective document. The user may specify a scope (a work item, slice, chapter, arc, or general session). If no scope is given, ask.

### Step 1: Determine Scope

Identify what the retro covers. Examples:
- A work item: `CS-WORK-007`
- A slice: `S1`
- A chapter: `CH-CS-002`
- An arc or epoch
- A freeform session or milestone

If the user provides a scope, read the relevant tracker/work files to ground the retro in actual outcomes. If no scope is given, proceed with what the user tells you.

### Step 2: Populate the Template

Write the retro using the three-layer structure below. Fill every cell. Use the user's input, conversation history, and any files read in Step 1. If you lack information for a cell, write `[TBD — needs input]` rather than guessing.

**Pre-satisfaction check for §3 actions:** Before writing each action to the Action Register, grep or read the target file/location to check if the Definition of Done is already satisfied. If the DoD is already met (e.g., the pattern is already documented, the code change already exists), write the action with `Status: done` and append "Pre-satisfied." to the Definition of Done. This prevents false-open items from accumulating in the register.

### Step 3: Output

Write the retro to `4-work-management/retros/{scope}-retro-{YYYY-MM-DD}.md` (create the directory if needed). If scope is freeform, use a slugified label.

**Critical:** The output file MUST start with YAML frontmatter exactly as shown in the template below. Every retro starts `triaged: false`, `status: active`. The action register MUST include a `Status` column with every row set to `open`. These fields are read by the `/init` scanner and `/triage-retros` skill. Omitting them breaks the action lifecycle.

---

## Template

```markdown
---
triaged: false
status: active
---

# Retro: {scope}

**Date:** {YYYY-MM-DD}
**Scope:** {what this retro covers}

---

## 1 — Reflection

| Prompt | Notes |
|--------|-------|
| **What surprised you?** | |
| **What went well?** | |
| **Could have gone better?** | |
| **Keep doing** | |
| **Stop doing** | |
| **Start doing** | |
| **Skill amendment?** | If a "start doing" or "stop doing" describes a repeatable ceremony failure (not a judgement call), name the skill that should change and what step to add/remove. "N/A" if it's a judgement pattern. |

---

## 2 — Classification

Classify every item surfaced in §1 into exactly one bucket.

| # | Item | Bucket | Detail |
|---|------|--------|--------|
| 1 | | | |

**Bucket definitions:**

- **Bug** — broken, fix it
- **Feature** — working, protect it
- **Feature request** — missing, build it
- **Refactor** — functional but poorly structured, redesign it
- **Upgrade** — functional but capped, enhance it

---

## 3 — Action Register

One row per actionable item from §2 (skip "Feature — protect it" unless it needs explicit protection work).

| # | Item | Priority | Status | Owner | Definition of Done |
|---|------|----------|--------|-------|--------------------|
| 1 | | | open | | |

**Priority:** `now` / `next` / `later`
**Status:** `open` / `done`
**Owner:** person or sub-entity responsible
**Definition of Done:** how you know it's resolved — observable outcome, not activity
```

---

## Frontmatter Lifecycle

Retro frontmatter tracks triage state. The retro skill sets the initial values (`triaged: false`, `status: active`). After creation, only `/triage-retros` modifies these fields — do not change them by hand or in other skills.

| Field | Values | Meaning |
|-------|--------|---------|
| `triaged` | `false` / `true` | `false` = untriaged, scanner will deep-read. `true` = actions forwarded to `open-actions.md`. |
| `status` | `active` / `complete` | `active` = has open actions or untriaged. `complete` = all actions done, archival. |

New retros always start with `triaged: false`, `status: active`.

---

## Format Validation

Before writing the retro file, verify:
1. YAML frontmatter has exactly `triaged: false` and `status: active`
2. §3 Action Register uses the **6-column** format: `| # | Item | Priority | Status | Owner | Definition of Done |`
3. Every action row has `Status` set to `open`
4. No action rows use the legacy 5-column format (missing Status column)

The `/triage-retros` skill relies on the `Status` column for mechanical parsing. A retro without it cannot be triaged automatically.
