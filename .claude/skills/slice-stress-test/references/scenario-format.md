# Stress Test Output Format

## File Header

```markdown
# S{N} Stress Test — {Slice Name}

**Slice:** `slices/slice-{NN}-{name}.md` (v1) — or `slices/slice-{NN}-{name}/` for multi-file slices (S6+)
**Tested against:** {list all interface specs with versions}
**Date:** {YYYY-MM-DD}
**Scenarios:** 20
**Severity distribution:** {X} High, {Y} Medium, {Z} Low, {W} Pass
**Total fixes:** {count of non-Pass findings requiring changes}
```

**Multi-file slices (S6 forward):** The slice is a directory. Read `index.md` for metadata/ACs/flags, then read content files (`01-*.md` through `0N-*.md`) for implementation detail. Schema is in `00-schema.md`, router plan in `00-router-plan.md`. The "Slice §" column should reference the file: e.g., `01-search.md §1.3` or `index.md §18 AC-7`.

## Scenario Table

```markdown
| # | Scenario | Severity | Slice §  | Spec § | Finding |
|---|----------|----------|----------|--------|---------|
| S{N}-ST-1 | {one-line description} | High/Medium/Low/Pass | §{x.y} | {spec} §{a.b} | {one-line finding or "Correct"} |
```

## Detailed Findings

For each non-Pass scenario, one section:

```markdown
### S{N}-ST-{X}: {title}

**Severity:** {High/Medium/Low}
**Slice section:** §{x.y}
**Upstream reference:** {spec name} §{a.b}

**Problem:** {2-3 sentences describing the gap, ambiguity, or risk}

**Fix — slice:**
- Section: §{x.y}
- Old: `{quoted text or description}`
- New: `{replacement text or description}`

**Fix — sibling specs** (if any):
- Document: `{filename}`
- Section: §{a.b}
- Change: `{description}`

**Acceptance criteria impact:** {AC-{N} added/modified/removed, or "None"}
```

## Summary Section

```markdown
## Summary

{2-3 sentences: key themes, most important findings, overall slice quality assessment}

### Downstream Flag Audit

| Flag | Status | Notes |
|------|--------|-------|
| S{N}-{X} | Correct / Needs amendment / New flag needed | {detail} |

### Sibling Spec Changes Required

| Document | Section | Change | Source Scenario |
|----------|---------|--------|-----------------|
| {filename} | §{x.y} | {description} | S{N}-ST-{X} |
```

## Key Rules

- Scenario IDs follow `S{N}-ST-{sequential}` pattern (e.g., S4-ST-1 through S4-ST-20)
- Every scenario must cite both a slice section AND an upstream spec section
- Pass scenarios need only the table row — no detailed finding section
- Fix instructions must be specific enough that a separate agent can apply them without reading the full interface spec
- Quote existing text when possible so the fix-applier can find-and-replace
