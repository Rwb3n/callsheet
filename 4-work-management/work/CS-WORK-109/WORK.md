---
id: CS-WORK-109
title: CLI scheduler, health, and decisions commands
chapter: CH-CS-018
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
  spec_sections: ["agent-cli arc §CH-CS-018"]
acceptance_criteria:
  - id: AC-1
    description: "`callsheet scheduler list/get/trigger/cancel` commands with correct Zod input schemas"
    test_type: unit
  - id: AC-2
    description: "`callsheet health` command calls admin.health.getStatus"
    test_type: unit
  - id: AC-3
    description: "`callsheet decisions search` with --domain, --type, --account, --listing, --from, --to filters"
    test_type: unit
  - id: AC-4
    description: "scheduler cancel requires id and reason arguments"
    test_type: unit
  - id: AC-5
    description: "All 6 scheduler+health+decisions commands registered with correct Commander argument/option signatures"
    test_type: unit
---

# CS-WORK-109: CLI scheduler, health, and decisions commands

## Deliverables

- [x] `src/cli/commands/scheduler.ts` — scheduler + health + decisions command groups (6 commands total)
- [x] `src/cli/__tests__/scheduler-commands.test.ts` — scheduler + health + decisions command tests (12 tests)
- [x] `src/cli/index.ts` — import and register scheduler commands
