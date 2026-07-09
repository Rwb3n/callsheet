---
id: CS-WORK-105
title: CLI config commands
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
    description: "`callsheet config show` outputs current config (apiUrl, token masked)"
    test_type: unit
  - id: AC-2
    description: "`callsheet config set-url <url>` updates apiUrl in config"
    test_type: unit
  - id: AC-3
    description: "`callsheet config set-token <token>` updates token in config"
    test_type: unit
---

# CS-WORK-105: CLI config commands

## Problem

Users need to configure the CLI's API URL and token without manually editing JSON. Config commands provide a CLI interface to the config file.

## Deliverables

- [x] `src/cli/commands/config.ts` — config command group (show, set-url, set-token)
- [x] `src/cli/__tests__/config-commands.test.ts` — config command tests (7 tests)
- [x] `src/cli/index.ts` — import and register config commands
