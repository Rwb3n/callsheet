# Fix Application Protocol

## Slice Header Update

**Single-file slices (S0–S5):** Change header in the slice file.
**Multi-file slices (S6+):** Change header in `index.md`.

Change:
```
**Status:** Draft v1
```
To:
```
**Status:** Draft v2 (STRESS TESTED)
```

Update `**Last updated:**` to current date.

**Multi-file slices — sub-file version headers:** When bumping a multi-file slice to v2, also update the HTML comment header in every sub-file (`00-*.md`, `01-*.md` through `0N-*.md`). Each sub-file carries a one-line version marker:

```html
<!-- Part of slice-{NN}-{name} v2 -->
```

If a sub-file has no such comment, insert it at line 1 followed by a blank line. If it already has a `v1` marker, change it to `v2`. Sub-files inherit the parent slice's version — no independent versioning.

**Input header spec versions:** When the slice goes to v2, update the `**Inputs:**` line in `index.md` (or the slice file for single-file slices) to reference the current versions of all interface specs. Append `[spec versions current as of S{N} v2]` to the end of the Inputs line.

## Resolution Log Format

The resolution log section (§15 for S0-S3, §16 for S4+) uses this format:

```markdown
## {N}. Stress Test Resolution Log (v2)

20 scenarios targeting S{N}'s implementation delta against upstream interface specs ({list specs with versions}), prior slices ({list}), and concept design ({list}). {X} High, {Y} Medium, {Z} Low, {W} Pass. {count} fixes applied.

Full analysis: `stress-tests/s{N}-stress-test.md`

| # | Scenario | Severity | Resolution |
|---|----------|----------|------------|
| S{N}-ST-1 | {one-line description} | **{severity}** | {one-line resolution summary} |
```

Key points:
- Reference the stress test file — do NOT copy full finding details into the resolution log
- One-line resolution summary per scenario (what was changed, not why)
- Pass scenarios: resolution column says "Correct. No fix needed."
- Include ALL 20 scenarios in the table

## AC Update Rules

- New ACs are added at the END of the relevant subsection, with the next sequential number
- Modified ACs retain their original number, with `[S{N}-ST-{X}]` annotation
- The total count in the "Total: {N} acceptance criteria" line must be updated
- Each AC annotation links to the stress test scenario that motivated the change

## Sibling Spec Version Headers

When a sibling spec is edited (interface spec or prior slice), bump its version header. For example, `**Version:** Draft v6` → `**Version:** Draft v7`. The changelog entry in REQUIREMENTS-TRACKER.md must record the new version number.

This eliminates ambiguity — if you edit a spec, you bump it. No deliberation needed.

## Fix Application Order

1. Schema changes (§1 — or `00-schema.md` for multi-file slices)
2. Handler/logic changes (§2-§12 — or content files `01-*.md` through `0N-*.md`)
3. Acceptance criteria (in `index.md` §18 for multi-file slices, §15/§16 for single-file)
4. Resolution log (in `index.md` §19 for multi-file slices, §15/§16 for single-file)
5. Cross-references (check version numbers — in `index.md` for multi-file)
6. Sibling specs (separate documents — bump version headers)
7. REQUIREMENTS-TRACKER.md
8. MEMORY.md

**Multi-file slices:** The stress test's fix instructions should specify which file to edit (e.g., "Fix — slice: `01-search.md` §1.3"). The fix-applier agent edits the specified file directly. AC and resolution log changes always go in `index.md`.
