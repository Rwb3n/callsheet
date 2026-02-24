# Slice Document Structure Template

## Header Block (mandatory)

```markdown
# Slice {N}: {Name}

**Status:** Draft v1
**Primary Owner:** {domain}
**Last updated:** {YYYY-MM-DD}
**Dependencies:** {list slice dependencies with what they provide}
**Inputs:** {list all interface specs + concept design sections + prior slices with versions}
**Downstream:** {list slices that depend on this one}

---

## Summary

{2-3 paragraphs. Conclusion first. What this slice builds, what domain owns it, key constraints.}

## V1 Scope Boundary

**In scope:** {comma-separated list of deliverables}

**Deferred to later slices:** {list with target slice IDs}

---
```

## Content Sections

Numbered sequentially. One section per major deliverable or tightly coupled group of deliverables.

Each content section contains:
- Prose description (conclusion first)
- Route structure (if UI-facing) — file tree format
- Typed pseudocode for functions/handlers
- Mermaid diagrams for flows with >3 components
- Event emissions (cite EventPayloadMap)
- Cross-domain reads (cite query interface)
- Per-section notes on what is deferred

## Tail Sections (mandatory, after all content sections)

These follow the last content section. Numbering continues sequentially.

```
## {N+1}. Event Consumers Registered in S{X}

| Event | Consumer Domain | Mode | Handler Description | New? |
|-------|----------------|------|---------------------|------|

## {N+2}. Deferred Actions Registered in S{X}

| Action | Params | Handler | Schedule | New? |
|--------|--------|---------|----------|------|

## {N+3}. Email Templates Registered in S{X}

| Template ID | Trigger | Category | New? |
|-------------|---------|----------|------|
{Only templates this slice TRIGGERS — not all templates. Note "triggers existing" vs "new template".}

## {N+4}. Notification Types Used in S{X}

| Type | Trigger | New? |
|------|---------|------|

## {N+5}. Schema Additions

{New tables in Drizzle syntax. Amendments to existing tables. Cumulative snapshot.}

## {N+6}. Upstream Flag Resolutions

| Flag | Source | Resolution |
|------|--------|-----------|

## {N+7}. Downstream Flags

| # | Flag | Target Slice | Source |
|---|------|-------------|--------|

## {N+8}. Open Question Resolutions

| # | Question | Resolution |
|---|----------|-----------|

## {N+9}. Acceptance Criteria

{Grouped by functional area. Sequential numbering AC-1 through AC-N.}

| # | Criterion | Test |
|---|-----------|------|
| AC-1 | {testable behaviour} | Unit/Integration/E2E |

**Total: {N} acceptance criteria.**

## {N+10}. Stress Test Resolution Log

{Empty in v1. Populated by stress test + fix-applier skill.}

---

## Cross-References

| Document | Relationship |
|----------|-------------|
```

## Conventions

- **Section numbering:** Start at 1 for content sections. Tail sections continue the sequence.
- **AC test types:** Unit = isolated function logic. Integration = multi-component + DB. E2E = full user flow via Playwright.
- **Cross-references:** Every upstream document that this slice reads from or implements. Include section-level granularity.
- **Downstream flags:** Use format `S{X}-{sequential}` (e.g., S6-1, S6-2). Description must state what is deferred and where it goes.
- **Event emissions:** Always cite the authoritative payload type: `[Source: {domain-spec} §{section}]`
- **Schema:** Drizzle ORM syntax. Include indexes and constraints. Use pgEnum for closed value sets.
