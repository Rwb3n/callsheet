---
id: CS-WORK-108
title: CLI billing and events commands
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
    description: "`callsheet billing status/reconcile/holds/release` commands with correct Zod input schemas"
    test_type: unit
  - id: AC-2
    description: "`callsheet events list/resolve/retry` commands with correct Zod input schemas"
    test_type: unit
  - id: AC-3
    description: "events list uses --resolved/--unresolved boolean flags (not --status string)"
    test_type: unit
  - id: AC-4
    description: "All 7 billing+events commands registered with correct Commander argument/option signatures"
    test_type: unit
---

# CS-WORK-108: CLI billing and events commands

## Deliverables

- [x] `src/cli/commands/billing.ts` — billing + events command groups (7 commands total)
- [x] `src/cli/__tests__/billing-commands.test.ts` — billing + events command tests (12 tests)
- [x] `src/cli/index.ts` — import and register billing commands
