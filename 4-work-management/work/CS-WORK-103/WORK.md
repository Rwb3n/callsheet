---
id: CS-WORK-103
title: CLI bootstrap and framework
chapter: CH-CS-017
arc: agent-cli
epoch: CS-E2
status: done
closed: 2026-03-30
effort: medium
blocked_by: []
source_files:
  - 4-work-management/arcs/agent-cli.md
extensions:
  io_profile: pure
  spec_sections: ["agent-cli arc §Scope §CH-CS-017"]
acceptance_criteria:
  - id: AC-1
    description: "Commander.js program with `callsheet` name, version from package.json, and subcommand structure (callsheet <group> <action>)"
    test_type: unit
  - id: AC-2
    description: "Config file management: read/write ~/.callsheet/config.json with apiUrl and token fields, XDG-compatible config dir"
    test_type: unit
  - id: AC-3
    description: "Output formatting: --format flag (json default, table via cli-table3) applied to all command output via shared formatter"
    test_type: unit
  - id: AC-4
    description: "tRPC vanilla client factory: createCLIClient(apiUrl, token) returns typed AppRouter caller with Bearer auth header"
    test_type: unit
  - id: AC-5
    description: "Error handling: tRPC errors mapped to exit codes (0 success, 1 error, 2 auth failure), structured JSON error output"
    test_type: unit
---

# CS-WORK-103: CLI bootstrap and framework

## Problem

CALLSHEET needs a CLI tool for headless agent operation. No CLI infrastructure exists. This work item creates the foundation: Commander.js program, config management, tRPC client factory, output formatting, and error handling.

## Deliverables

- [x] `src/cli/index.ts` — Commander.js program entry point with subcommand groups
- [x] `src/cli/config.ts` — config file read/write (~/.callsheet/config.json)
- [x] `src/cli/client.ts` — tRPC vanilla client factory with Bearer auth
- [x] `src/cli/output.ts` — JSON/table output formatter
- [x] `src/cli/errors.ts` — error mapping to exit codes
- [x] `src/cli/__tests__/config.test.ts` — config read/write tests (6 tests)
- [x] `src/cli/__tests__/output.test.ts` — formatter tests (10 tests)
- [x] `src/cli/__tests__/errors.test.ts` — error mapping tests (6 tests)
- [x] `src/cli/__tests__/client.test.ts` — client factory tests (5 tests)
- [x] `package.json` — commander, chalk, cli-table3 deps + `cli` script

## Context

### Technology decisions (from CS-E2 epoch + arc)
- Commander.js for CLI framework
- `@trpc/client` vanilla (httpBatchLink) — already a dependency
- chalk + cli-table3 for formatted output
- Distribution: `tsx src/cli/index.ts` during dev, `npx callsheet` when published
- Exit codes: 0 success, 1 error, 2 auth failure
- JSON output by default, `--format table` optional
- `--dry-run` on mutations (wired per-command, not in bootstrap)

### Auth
- Bearer token in Authorization header (already wired in route.ts extractSession)
- Token stored in ~/.callsheet/config.json
- No cookie management needed
