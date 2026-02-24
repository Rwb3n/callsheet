# Work Item Template

## File: `4-work-management/work/CS-WORK-{NNN}/WORK.md`

```markdown
---
template: work_item
id: CS-WORK-{NNN}
title: "{short title — imperative, 3-6 words}"
type: feature
status: active
owner: null
created: {YYYY-MM-DD}
spawned_by: null
spawned_children: []
chapter: CH-CS-{NNN}
arc: {arc-id}
epoch: CS-E1
closed: null
priority: {critical|high|medium|low}
effort: {small|medium|large|xlarge}
traces_to:
  - REQ-CS-{DOMAIN}-{NNN}
source_files:
  - D:/PROJECTS/callsheet/3-requirements/slices/{slice-path}
  - D:/PROJECTS/callsheet/3-requirements/interfaces/{interface-spec}.md
acceptance_criteria:
  - "AC-{NN}: {one-line criterion text from slice}"
  - "AC-{NN}: {one-line criterion text from slice}"
blocked_by: [{CS-WORK-NNN IDs or empty}]
blocks: [{CS-WORK-NNN IDs or empty}]
enables: [{CS-WORK-NNN IDs or empty}]
queue_position: backlog
cycle_phase: backlog
node_history:
  - node: backlog
    entered: {YYYY-MM-DD}T00:00:00
    exited: null
artifacts: []
cycle_docs: {}
memory_refs: []
extensions:
  project: CALLSHEET
  slice: S{N}
  spec_sections: "{interface spec §X.Y references}"
version: "2.0"
generated: {YYYY-MM-DD}
last_updated: {YYYY-MM-DD}T00:00:00
---

# CS-WORK-{NNN}: {title}

## Context

{2-4 sentences. What this module does. Where it fits in the system. Key constraints or design decisions from the slice. Reference specs by section number — do not restate their content.}

## Deliverables

- [ ] `src/{path}/{file}.ts` — {what this file does}
- [ ] `src/{path}/{file}.ts` — {what this file does}
- [ ] `src/{path}/__tests__/{file}.test.ts` — {test scope: "All {N} AC" or "Unit tests for {module}"}

## References

- `3-requirements/slices/{slice-path}` §{N} {Section Name}
- `3-requirements/interfaces/{interface-spec}.md` §{N}
```

## Field Guidelines

### priority

- **critical** — on the critical path. Blocks multiple downstream work items or entire arcs.
- **high** — important for arc completion but doesn't block the critical path.
- **medium** — necessary for slice completion but can be parallelised.
- **low** — quality-of-life, edge cases, or deferred concerns.

### effort

- **small** — 1-3 AC, single module, <200 lines of production code.
- **medium** — 4-8 AC, 1-2 modules, 200-500 lines.
- **large** — 9-16 AC, multiple modules or complex integration, 500-1000 lines.
- **xlarge** — >16 AC (should be rare — consider splitting).

### Deliverables path conventions

Follow Next.js + tRPC project structure:
- `src/db/schema/{domain}.ts` — Drizzle schema
- `src/server/routers/{domain}.ts` — tRPC router
- `src/lib/{module}/` — Domain logic modules
- `src/lib/{module}/__tests__/` — Tests
- `src/app/{route}/page.tsx` — Next.js pages
- `src/components/{feature}/` — React components
- `.github/workflows/` — CI/CD

**Existing code takes precedence over slice pseudocode.** The slice's module layout section (e.g., `src/domains/platform/enquiry-delivery.ts`) is the spec's suggestion. If a prior work item already created a stub or related module at a different path (e.g., `src/lib/onboarding/deliver-pending-enquiries.ts`), use the existing path. Check `4-work-management/IMPLEMENTATION-TRACKER.md` artifact columns and grep the codebase for function/file names referenced in the slice before writing deliverable paths.
