---
name: slice-pre-draft-checklist
description: Generate a pre-drafting checklist for a CALLSHEET requirements slice. Use when user says "checklist for S6", "pre-draft S7", "prepare for slice drafting", or before starting a new slice. Eliminates recurring mechanical issues found in stress tests.
---

# Slice Pre-Draft Checklist

## Instructions

You are generating a pre-drafting checklist for a CALLSHEET requirements slice. This checklist eliminates mechanical issues that would otherwise be found during the stress test — specifically the three-part registry sync gap (7 consecutive occurrences S0–S5) and schema amendment debt.

### Step 1: Read Context

**Read order matters. Interface specs before concept design.**

1. Read the REQUIREMENTS-TRACKER at `3-requirements/REQUIREMENTS-TRACKER.md` to understand:
   - Which upstream flags target this slice
   - Which open questions this slice should resolve
   - Current interface spec versions
2. Read the interface specs listed as inputs for this slice — these are the contract surface
3. Read `references/cumulative-schema.md` (if it exists) for current schema state. If it doesn't exist, note that the drafter/fix-applier should produce one.
4. Read the concept design document(s) for the slice's primary domain — **only for implementation detail the interface specs don't cover** (decision trees, ceremony definitions, internal logic). Do NOT read the full concept design end-to-end if the interface spec already summarises the contract.
5. Read `references/checklist-template.md` for the output format

### Step 2: Identify Registry Items

Scan the concept design and interface specs for:
1. **Deferred actions** the slice will need — list each with params type
2. **Email templates** the slice will use — list each with trigger, category, unsubscribable flag
3. **Event emissions** the slice will make — list each with payload fields
4. **Event consumers** the slice will register — list each with domain, mode, handler
5. **Notification types** the slice will use — list any new types needed
6. **Schema amendments** to existing tables — list each table, new columns, types

### Step 3: Generate Checklist

Write the checklist to `3-requirements/stress-tests/s{N}-pre-draft-checklist.md`.

The checklist has two parts:
1. **Registry pre-population** — exact entries to add to SI/PP during drafting (not after)
2. **Upstream flag inventory** — all flags targeting this slice, with source and what needs resolving

### Step 4: Output

Write the file directly to disk. The drafter reads this file before starting the slice v1.

### Important Rules

- This is preparation, not drafting. Do not write the slice itself.
- Be specific: list exact `DeferredActionParamsMap` entries, exact template rows, exact column types.
- If uncertain whether the slice needs an item, include it with a default recommendation and a note: "Checklist default: X. Override if schema agent finds reason." Do not leave decisions unresolved — the drafter should execute, not re-evaluate.
- **Resolve template overlaps in the checklist, not downstream.** When a proposed email template might overlap with an existing template from a prior slice, read SI §5.2 for the existing template's trigger and category. Determine whether the existing template covers the new use case (possibly with a variant field) or whether a new template is genuinely needed. State the resolution in the checklist. Do not defer to the schema agent — template overlap is a mechanical issue the checklist exists to eliminate.
- Reference upstream specs by section number, not by quoting content.
- **Cumulative counts (tables, pgEnums, templates) must cite the prior slice's authoritative snapshot, not recompute from per-slice deltas.** State "N from S{X} cumulative snapshot + K new = M" where N comes from the most recent slice's `00-schema.md` cumulative section or `references/cumulative-schema.md`. S8 had a "42 tables" error because the checklist recomputed from per-slice deltas and got the S7 baseline wrong.
- Include an **EVENT_CONSUMER_MATRIX delta count** — the exact number of new matrix entries this slice adds.
- For slices that share a UI surface with another domain (e.g., S7 admin dashboard: PP routes, Ops data), include a **route ownership table** mapping admin routes to data-owning domain and route-owning domain.
- Include a **partition hint** in §11 (scope summary): suggest content agent groupings for the drafter skill, based on concept design section locality and dependency coupling.
