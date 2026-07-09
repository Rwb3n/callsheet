---
id: CS-WORK-112
title: CLI gate commands (smoke + data validate)
chapter: CH-CS-019
arc: agent-cli
epoch: CS-E2
status: done
closed: 2026-03-30
effort: medium
blocked_by: [CS-WORK-103]
source_files:
  - 4-work-management/arcs/agent-cli.md
  - 0-strategic-frame/deployment-gates.md
extensions:
  io_profile: pure
  spec_sections: ["deployment-gates.md §Gate 2", "deployment-gates.md §Gate 3"]
acceptance_criteria:
  - id: AC-1
    description: "`callsheet smoke` runs 4 infrastructure checks (tRPC, auth, search, admin health)"
    test_type: unit
  - id: AC-2
    description: "smoke --env flag (default preview), --check flag for selective runs"
    test_type: unit
  - id: AC-3
    description: "`callsheet data validate` runs 4 data integrity checks (search, health, quality, enrichment)"
    test_type: unit
  - id: AC-4
    description: "Both commands output JSON with pass/fail per check, summary count, exit code 0/1"
    test_type: unit
  - id: AC-5
    description: "smoke and data validate registered as top-level commands"
    test_type: unit
  - id: AC-6
    description: "--check option filters to single named check"
    test_type: unit
---

# CS-WORK-112: CLI gate commands (smoke + data validate)

## Deliverables

- [x] `src/cli/commands/gates.ts` — smoke + data validate commands
- [x] `src/cli/__tests__/gates-commands.test.ts` — gate command tests (6 tests)
- [x] `src/cli/index.ts` — import and register gate commands
