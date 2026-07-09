---
id: CS-WORK-110
title: CLI intelligence commands
chapter: CH-CS-019
arc: agent-cli
epoch: CS-E2
status: done
closed: 2026-03-30
effort: small
blocked_by: [CS-WORK-103]
source_files:
  - 4-work-management/arcs/agent-cli.md
extensions:
  io_profile: pure
  spec_sections: ["agent-cli arc §CH-CS-019"]
acceptance_criteria:
  - id: AC-1
    description: "`callsheet intelligence quality/decay/enrichment/ceremonies/hypotheses/revenue` — 6 query commands"
    test_type: unit
  - id: AC-2
    description: "decay command has --status (default active), --severity, --cursor, --limit filters"
    test_type: unit
  - id: AC-3
    description: "enrichment command has --tier filter (paid, claimed, unclaimed)"
    test_type: unit
  - id: AC-4
    description: "All 6 commands registered with correct Commander argument/option signatures matching Zod schemas"
    test_type: unit
---

# CS-WORK-110: CLI intelligence commands

## Deliverables

- [x] `src/cli/commands/intelligence.ts` — intelligence command group (6 commands)
- [x] `src/cli/__tests__/intelligence-commands.test.ts` — intelligence command tests (10 tests)
- [x] `src/cli/index.ts` — import and register intelligence commands
