---
id: CS-WORK-106
title: CLI flow management commands
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
    description: "`callsheet flows list` with --status, --type, --cursor, --limit filters"
    test_type: unit
  - id: AC-2
    description: "`callsheet flows get <flowId>` shows flow detail"
    test_type: unit
  - id: AC-3
    description: "`callsheet flows retry/skip/escalate` mutation commands with correct arguments"
    test_type: unit
  - id: AC-4
    description: "`callsheet flows initiate-erasure/initiate-closure` mutation commands"
    test_type: unit
  - id: AC-5
    description: "All 7 flow commands registered with correct Commander argument/option signatures"
    test_type: unit
---

# CS-WORK-106: CLI flow management commands

## Deliverables

- [x] `src/cli/commands/flows.ts` — flows command group (list, get, retry, skip, escalate, initiate-erasure, initiate-closure)
- [x] `src/cli/__tests__/flows-commands.test.ts` — flow command tests (11 tests)
- [x] `src/cli/index.ts` — import and register flow commands
