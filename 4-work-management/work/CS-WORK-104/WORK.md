---
id: CS-WORK-104
title: CLI auth commands
chapter: CH-CS-017
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
  spec_sections: ["agent-cli arc §CH-CS-017"]
acceptance_criteria:
  - id: AC-1
    description: "`callsheet auth login` prompts for API URL and token, saves to config"
    test_type: unit
  - id: AC-2
    description: "`callsheet auth logout` clears token from config"
    test_type: unit
  - id: AC-3
    description: "`callsheet auth whoami` calls admin.health.getStatus (or similar) to verify token, outputs account info"
    test_type: unit
  - id: AC-4
    description: "`callsheet auth token` outputs the current token (masked) for verification"
    test_type: unit
---

# CS-WORK-104: CLI auth commands

## Problem

The CLI framework exists but has no commands. Auth commands are the first commands — they manage the API key credential that all subsequent commands need.

## Deliverables

- [x] `src/cli/commands/auth.ts` — auth command group (login, logout, whoami, token)
- [x] `src/cli/__tests__/auth-commands.test.ts` — auth command tests (8 tests)
- [x] `src/cli/index.ts` — import and register auth commands
