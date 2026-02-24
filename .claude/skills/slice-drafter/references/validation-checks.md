# Validation Checks (Phase 4)

The validation agent runs these checks against the assembled slice and reports Pass/Fail per check.

## Mandatory Checks (all slices)

### 1. P1 Payload Compliance

For every `emit()` call in the slice:
- Does the payload match `EventPayloadMap` in SI §1.2?
- Are all P1-required fields present (per the domain interface spec's consumer P1 table)?
- Are no extra fields included that aren't in the payload type?
- Is PII excluded where data minimisation applies (e.g., `enquiry_submitted` per PP-ST-12)?

**How to check:** List every `emit()` call with its event type and payload fields. Cross-reference against the emitter's interface spec payload type definition.

### 2. Three-Part Sync — Deferred Actions

If the slice registers ANY deferred actions:
- Is there a `DeferredActionParamsMap` entry in SI §2.1 (or does the slice note the need for one)?
- Is there a row in SI §2.2 registered actions table?
- Is there a handler implementation in the slice?

All three must be present or explicitly flagged as a sibling spec update. If SI §2.1/§2.2 entries are missing AND the slice does not document them as required sibling spec amendments, this is a **Structural** failure (not Mechanical) — the entries must be prepared as part of the slice output so the fix-applier can apply them. This gap has occurred 8 consecutive times (S0–S7).

### 3. Three-Part Sync — Email Templates

If the slice triggers ANY email templates:
- Is the template ID listed in SI §5.2?
- Is the template listed in PP §4?
- Does the slice's template table note "triggers existing" (not "new")?
- Is the running count correct?

### 4. Schema Consistency

For every new table or column:
- Does the Drizzle schema definition match the types used in handler pseudocode?
- Are nullable columns marked correctly (column definition vs usage)?
- Are FK references pointing to the correct parent table?
- Do indexes match the query patterns in the tRPC routes?

### 5. Upstream Flag Resolution

For every flag listed in the checklist §6:
- Is the flag mentioned in the slice's "Upstream Flag Resolutions" section?
- Does the resolution actually address the flag (not just acknowledge it)?
- If the flag was "already resolved by S{X}", does the slice confirm this without re-implementing?

### 6. Acceptance Criteria Coverage

For every functional behaviour described in the slice:
- Is there at least one AC that tests it?
- Is the test type appropriate (Unit for pure functions, Integration for DB + events, E2E for user flows)?
- Are ACs numbered sequentially without gaps?
- Is the total count stated and accurate?

**Minimum AC targets by slice type:**
- UI-heavy: 40-55 ACs
- Domain-logic: 45-60 ACs
- Integration: 35-50 ACs

### 7. Cross-Reference Versions

Every document cited in the Cross-References section:
- Is the version current (matches the checklist header)?
- Does the section citation exist in the referenced document?

### 8. Prose-Code Consistency

For every section that has both prose description AND pseudocode:
- Does the prose describe the same behaviour as the code?
- If the prose says "X checks Y before Z", does the code show X checking Y before Z?
- Are conditional branches in prose reflected in code branches?

**Known failure pattern from S4/S5:** Prose describes a join query; pseudocode uses N+1 `Promise.all`. Or prose says "checks A then B"; code checks B then A.

### 9. N+1 Query Patterns

For every handler that processes a collection:
- Does it query per-item inside a loop?
- Could the per-item queries be batched (e.g., `WHERE id IN (...)`)?
- Are join queries used where multiple related tables are read?

**Known failure pattern from S3/S5:** `deliverPendingEnquiries` called `getListing()` per batch item. Fixed by fetching once before loop.

### 10. Import Compliance (P4)

For every type, function, or constant from another domain:
- Is it imported (referenced), not redefined?
- If the slice includes a type definition, is it flagged as `// Authoritative in {source} — summary only`?
- Does the slice use `computeFeatureAccess(tier)` (CR's simplified signature per CR-ST-9), not the old wrapper signature?

## Output Format

```markdown
# S{N} Pre-Stress-Test Validation

**Slice:** `slices/slice-{NN}-{name}.md` (v1) — or `slices/slice-{NN}-{name}/` for multi-file slices (S6+)
**Validated against:** {list specs with versions}
**Date:** {YYYY-MM-DD}

## Results

| # | Check | Status | Detail |
|---|-------|--------|--------|
| 1 | P1 payload compliance | Pass/Fail | {detail — list each emission if Fail} |
| 2 | Three-part sync — deferred actions | Pass/Fail/N/A | {detail} |
| 3 | Three-part sync — email templates | Pass/Fail/N/A | {detail} |
| 4 | Schema consistency | Pass/Fail | {detail} |
| 5 | Upstream flag resolution | Pass/Fail | {detail} |
| 6 | AC coverage | Pass/Fail | {count, any gaps} |
| 7 | Cross-reference versions | Pass/Fail | {detail} |
| 8 | Prose-code consistency | Pass/Fail | {detail} |
| 9 | N+1 query patterns | Pass/Fail | {detail} |
| 10 | Import compliance (P4) | Pass/Fail | {detail} |

## Failures Requiring Fixes

{For each Fail, specify:}

### Check {N}: {name}

**Problem:** {description}
**Fix:** {exact change needed — section, old text, new text}
**Classification:** Mechanical / Structural
```

Mechanical fixes: orchestrator applies directly (wrong version number, missing AC, typo).
Structural fixes: dispatch a targeted agent to re-draft the affected section.
