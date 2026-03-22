# Work Management — Phase 4

**Status:** Active — implementation in progress
**Prior phase:** Requirements complete — 11 slices, 693 AC, all at v2.

## Structure

Flat directories per artifact type. Relationships tracked in YAML frontmatter (`epoch`, `arc`, `chapter`), not filesystem hierarchy.

```
4-work-management/
├── IMPLEMENTATION-TRACKER.md  ← Progress tracker (work items, AC, dependencies)
├── epochs/         ← Epoch definitions (CS-E1, CS-E2, ...)
├── arcs/           ← Arc groupings (6 arcs in CS-E1)
├── chapters/       ← Chapter definitions (12 chapters, 1 per slice + seed pipeline)
└── work/           ← Work items (CS-WORK-NNN/ directories)
    └── CS-WORK-NNN/
        ├── WORK.md
        ├── plans/
        ├── investigations/
        └── reports/
```

## Current State

- **CS-E1** (Platform Build): 7 arcs, 14 chapters, 56 work items complete (351 AC, 939 tests)
- **S0–S6 code complete.** Vertical slice sequence paused after S6.
- **CH-CS-014 (Presentation Layer) active** — horizontal chapter cross-cutting S0–S6. 9 work items, 35 AC. Resolves PP-Q1, wires tRPC API + client, retrofits buyer journey pages.
- S7–S10 resume after CH-CS-014.
- See `IMPLEMENTATION-TRACKER.md` for detailed progress

## ID Conventions

| Artifact | Pattern | Example |
|----------|---------|---------|
| Epoch | CS-E{N} | CS-E1 |
| Arc | lowercase-hyphen | infrastructure |
| Chapter | CH-CS-{NNN} | CH-CS-001 |
| Work Item | CS-WORK-{NNN} | CS-WORK-001 |
| Requirement | REQ-CS-{DOMAIN}-{NNN} | REQ-CS-INFRA-001 |

## Dependencies (S0 work items)

```
CS-WORK-001 (Event Bus) ──blocks──▶ CS-WORK-002 (Scheduler)
                         ──blocks──▶ CS-WORK-003 (Decision Logging)
CS-WORK-002 (Scheduler) ──blocks──▶ CS-WORK-004 (Flow Engine)
CS-WORK-005 (Email + Auth) ──────── independent
CS-WORK-006 (Storage/Render/CI) ── independent
```

## References

- `IMPLEMENTATION-TRACKER.md` — Authoritative implementation progress record
- `3-requirements/REQUIREMENTS-TRACKER.md` — Authoritative requirements record
- `3-requirements/references/cumulative-schema.md` — Complete schema snapshot
- `0-strategic-frame/entity-architecture-frame.md` — Governing design frame
