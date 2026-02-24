# REQUIREMENTS-TRACKER.md Update Format

## Changelog Entry

Add to the Change Log table:

```markdown
| {date} | `slice-{NN}-{name}.md` or `slice-{NN}-{name}/` (multi-file) | Stress test: 20 scenarios, {fix count} fixes. {High count} High ({one-line each}), {Medium count} Medium, {Low count} Low. Key additions: {comma-separated list of major changes}. {downstream flag count} downstream flags {added/updated}. {old AC count}→{new AC count} acceptance criteria. | v2 |
```

## Slice Status Table Update

Update the row for the slice:
- Status: change to `**DRAFT v2 (STRESS TESTED)**`
- Key Deliverables: update AC count, downstream flag count, list resolved flags

## Phase Progress Summary

Update counts:
- Slices: move from "In Progress" count (N) to (N+1) — the new slice joins the stress-tested group
- Recalculate if needed

## Next Action

Update the "Next action" line at the bottom to reflect the next slice to draft.
