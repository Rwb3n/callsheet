---
id: agent-cli
epoch: CS-E2
status: Complete
depends: api-completion
chapters: [CH-CS-017, CH-CS-018, CH-CS-019]
---

# Arc: Agent CLI

## Mission

Build a TypeScript CLI tool (`callsheet`) that exposes every operational tRPC procedure as a composable terminal command. An agent (Claude Code or similar) operates CALLSHEET headlessly via tool calls and flag-based input. JSON output by default, human-readable tables optional.

## Technology

- Commander.js for CLI framework
- `@trpc/client` vanilla (httpBatchLink) for type-safe API calls
- chalk + cli-table3 for formatted output
- Distribution: `npx callsheet` or `tsx src/cli/index.ts` during dev

## Scope

### CH-CS-017: CLI Scaffold + Auth (~3 work items, ~12 AC)

| Work Item | Commands | Purpose |
|-----------|----------|---------|
| CLI bootstrap | Project structure, Commander.js setup, config file (`~/.callsheet/config.json`), output formatting (JSON/table) | Foundation |
| Auth commands | `callsheet auth login`, `callsheet auth token`, `callsheet auth whoami` | Session/API key management |
| Config commands | `callsheet config set-url`, `callsheet config set-token`, `callsheet config show` | Environment configuration |

### CH-CS-018: Operational Commands (~4 work items, ~20 AC)

| Work Item | Commands | tRPC Routes |
|-----------|----------|-------------|
| Flow management | `flows list`, `flows get`, `flows retry`, `flows skip`, `flows escalate`, `flows initiate-erasure`, `flows initiate-closure` | `admin.flows.*` |
| Compliance + support | `compliance list/create/update`, `support list/create/update/priority` | `admin.compliance.*`, `admin.support.*` |
| Billing + events | `billing status/reconcile/holds/release`, `events list/resolve` | `admin.billing.*`, `admin.events.*` |
| Scheduler + health | `scheduler list/trigger/cancel`, `health`, `decisions search` | `admin.scheduler.*`, `admin.health.*`, `admin.decisions.*` |

### CH-CS-019: Intelligence, Graduation + Gate Commands (~3 work items, ~15 AC)

| Work Item | Commands | tRPC Routes |
|-----------|----------|-------------|
| Intelligence | `intelligence quality/decay/enrichment/ceremonies/hypotheses/revenue` | `admin.intelligence.*` |
| Graduation | `graduation status/history/override/rollout/comparison` | `admin.graduation.*` |
| Gate commands | `smoke --env preview`, `data validate` | Direct checks (not tRPC — HTTP + SQL) |

## Design Principles

- Every command maps 1:1 to a tRPC procedure (except gate commands)
- Output is JSON by default (`--format json` implicit)
- `--format table` renders human-readable via chalk/cli-table3
- Exit codes: 0 success, 1 error, 2 auth failure
- `--dry-run` on mutations
- `callsheet help <command>` auto-generated from Zod input schemas
- Composable: `callsheet flows list --status failed --json | jq '.flows[].flowId'`

## Exit Criteria

- [ ] `callsheet` executable runs via `npx` or `tsx`
- [ ] API key auth works for all commands
- [ ] All ~60 commands implemented with JSON output
- [ ] `--format table` produces readable output for all list/get commands
- [ ] `callsheet smoke` passes against preview deployment
- [ ] `callsheet data validate` passes against seeded database
- [ ] Integration tests for CLI commands (invoke programmatically, assert output shape)
