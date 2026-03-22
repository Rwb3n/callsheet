---
name: triage-retros
description: Triage retro action items — move open actions to the running register and mark retros as triaged. Use when user says "triage retros", "triage actions", "forward retro items", or after reviewing open actions from session-init.
---

# Triage Retros

## Instructions

This skill manages the lifecycle of retro action items. It moves open actions from untriaged retro files into `4-work-management/open-actions.md` (the running register), marks completed actions as done, and marks fully-resolved retros as complete.

**This skill writes files.** It modifies retro frontmatter and `open-actions.md`.

---

### Step 1: Scan (grep — no sub-agent)

Use **Grep** to find untriaged retros. This replaces the old Explore sub-agent approach (~400s → ~3s).

```
grep "triaged: false" in 4-work-management/retros/ → list of filenames
```

If no files match, skip to Step 1b (register maintenance). Otherwise, **Read** only the matched files to extract their Action Register rows.

**Step 1b:** Read `4-work-management/open-actions.md` to get the current register state.

**Total reads:** 1 grep + N untriaged files (usually 0-3) + 1 open-actions.md. No sub-agent.

---

### Step 2: Present to user

Show the results. Ask the user to confirm:
- Which untriaged actions to **forward** to `open-actions.md`
- Which actions already in `open-actions.md` to **close** (mark done)
- Whether any retros should be skipped (no actions worth forwarding)

If the user says "triage all" or "forward all", forward every open action from untriaged retros without asking per-item.

---

### Step 3: Update files

For each action being **forwarded**:
1. Append a row to `4-work-management/open-actions.md` with: Source (retro filename), #, Item, Priority, Owner, Definition of Done.

For each action being **closed**:
1. Strikethrough the row in `open-actions.md` and append `**DONE.**` with brief evidence.
2. In the source retro file, change the action's Status from `open` to `done`.

For each **triaged retro** (all its open actions have been forwarded):
1. Set frontmatter `triaged: true`.

For each retro where **all actions are now `done`**:
1. Set frontmatter `status: complete`.

---

### Step 4: Summary

Output a summary:
- Actions forwarded: {count}
- Actions closed: {count}
- Retros triaged: {count}
- Retros completed: {count}
- Open actions remaining in register: {count}

---

## Action Register Format (mandatory)

Every retro's §3 Action Register MUST use this exact 6-column format:

```markdown
| # | Item | Priority | Status | Owner | Definition of Done |
|---|------|----------|--------|-------|--------------------|
| 1 | description | now/next/later | open | owner | observable outcome |
```

**The `Status` column is required.** It enables grep-based scanning. Without it, the triage skill cannot parse action state mechanically.

- `open` — action is outstanding
- `done` — action is resolved

The `/retro` skill enforces this format on write. If a retro is found without a Status column during triage, flag it to the user — do not attempt to parse a non-standard table.

---

## open-actions.md Format

```markdown
# Open Actions

Running register of outstanding retro actions. Managed by `/triage-retros`. Do not edit manually.

**Last triaged:** {YYYY-MM-DD}

| Source | # | Item | Priority | Owner | Definition of Done |
|--------|---|------|----------|-------|--------------------|
```

The Source column links back to the retro file for full context. The # column preserves the original action number from that retro.

Closed actions are struck through in-place (not removed) with `**DONE.**` annotation for audit trail.

---

## When to Use

- After `/init` surfaces open retro actions and the user has reviewed them.
- User says "triage retros", "triage actions", "forward retro items", "close action X".
- Periodically to clean up the register.

---

## Performance Notes

This skill was rewritten from an Explore-agent scan (~400s, ~50 file reads) to a grep-first approach (~3s, reads only untriaged files). The key insight: `triaged: false` in YAML frontmatter is the only signal needed to identify work. All triaged retros are skipped entirely — their actions are already in `open-actions.md`.

### Structured scan output (optional optimisation)

When invoked from `/session-init` with many untriaged retros (>5), write scan results to `temp/triage-scan.json` before presenting to the user:

```json
{
  "scannedAt": "ISO8601",
  "untriaged": [
    {
      "file": "retro-filename.md",
      "actions": [
        { "num": 1, "item": "...", "priority": "next", "owner": "...", "dod": "..." }
      ]
    }
  ]
}
```

Main context reads the JSON instead of re-reading retro files. For ≤5 untriaged retros, inline reads are fast enough — skip the temp file.
