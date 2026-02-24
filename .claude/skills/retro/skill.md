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

### Step 3: Output

Write the retro to `4-work-management/retros/{scope}-retro-{YYYY-MM-DD}.md` (create the directory if needed). If scope is freeform, use a slugified label.

---

## Template

```markdown
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

| # | Item | Priority | Owner | Definition of Done |
|---|------|----------|-------|--------------------|
| 1 | | | | |

**Priority:** `now` / `next` / `later`
**Owner:** person or sub-entity responsible
**Definition of Done:** how you know it's resolved — observable outcome, not activity
```
