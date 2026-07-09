---
id: CS-WORK-111
title: CLI graduation commands
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
    description: "`callsheet graduation status/history/override/rollout/comparison` — 5 commands (3 queries, 2 mutations)"
    test_type: unit
  - id: AC-2
    description: "override accepts subEntity, capability, graduated (boolean from string), and reason arguments"
    test_type: unit
  - id: AC-3
    description: "rollout accepts percentage argument (parsed to integer)"
    test_type: unit
  - id: AC-4
    description: "All 5 commands registered with correct Commander argument/option signatures matching Zod schemas"
    test_type: unit
---

# CS-WORK-111: CLI graduation commands

## Deliverables

- [x] `src/cli/commands/graduation.ts` — graduation command group (5 commands)
- [x] `src/cli/__tests__/graduation-commands.test.ts` — graduation command tests (10 tests)
- [x] `src/cli/index.ts` — import and register graduation commands
