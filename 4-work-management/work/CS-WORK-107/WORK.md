---
id: CS-WORK-107
title: CLI compliance and support commands
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
    description: "`callsheet compliance list/get/create/update` commands with correct Zod input schemas"
    test_type: unit
  - id: AC-2
    description: "`callsheet support list/get/create/update/priority` commands with correct Zod input schemas"
    test_type: unit
  - id: AC-3
    description: "Enum string arguments cast to correct union literal types for tRPC input validation"
    test_type: unit
  - id: AC-4
    description: "All 9 compliance+support commands registered with correct Commander argument/option signatures"
    test_type: unit
  - id: AC-5
    description: "`callsheet support priority` requires ticketId, priority, and reason arguments"
    test_type: unit
---

# CS-WORK-107: CLI compliance and support commands

## Deliverables

- [x] `src/cli/commands/compliance.ts` — compliance + support command groups (9 commands total)
- [x] `src/cli/__tests__/compliance-commands.test.ts` — compliance + support command tests (15 tests)
- [x] `src/cli/index.ts` — import and register compliance commands
