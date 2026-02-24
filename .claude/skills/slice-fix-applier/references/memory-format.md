# MEMORY.md Update Conventions

## Location

Key findings go in `C:\Users\ruben\.claude\projects\D--PROJECTS-callsheet\memory\MEMORY.md`

## Structured Memory Write (4-Question Template)

Every memory update must answer these four questions. Skip a question only if the answer is "nothing."

### Q1: Version Bumps

Which documents changed version? Update the **Document Versioning** section.

```markdown
- {Spec Name}: v{X} → v{Y} ({what changed})
```

### Q2: Stress Test Pattern

Did this stress test surface a new *recurring* finding — something likely to appear in future slices? If yes, add to the stress test findings section or `memory/stress-test-findings.md`.

**Include:** Patterns that apply to 2+ future slices (e.g., "account closure + GDPR erasure concurrent interaction", "three-part sync gap").
**Skip:** Findings that are slice-specific and won't recur.

```markdown
## S{N} Stress Test Key Findings ({date})
- {finding 1 — actionable pattern, not scenario description}
- {finding 2}
- {N} new downstream flags: {list with target slices}
```

### Q3: Workflow Lesson

Did the pipeline itself behave unexpectedly? (e.g., merge required delegation, assembly hit token limit, read strategy was inefficient, sub-agent prompt was too broad.) If yes, add to the relevant workflow section in MEMORY.md.

```markdown
- Key lesson (S{N}): {what happened and what to do differently}
```

### Q4: Skill Amendment Signal

Does any finding suggest a skill instruction should change? If yes, add a note to MEMORY.md. The orchestrator (main context) decides whether to apply.

```markdown
**Skill amendment needed:** {skill name} — {what should change and why}
```

## What NOT to Record

- Individual scenario descriptions (those live in the stress test file)
- Findings that are slice-specific and won't recur
- Version numbers of specs WITHOUT context (those are tracked in Document Versioning — include WHAT changed, not just the number)

## Other Sections to Update

- **Repository State**: update "Requirements progress" line with new slice status
- **Document Versioning**: update spec versions with change summaries
- **Stress Test Workflow**: only update if the workflow itself changed (e.g., new phase, new validation step)
