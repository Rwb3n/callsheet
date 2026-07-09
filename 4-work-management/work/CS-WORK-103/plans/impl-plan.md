## Implementation Plan — CS-WORK-103: CLI bootstrap and framework

**IO profile:** pure (no DB, no events, no routes — pure TypeScript modules)
**Blocked by:** None — all clear
**Spec sources:** `4-work-management/arcs/agent-cli.md`, `4-work-management/epochs/CS-E2.md`

### AC Summary

| AC | Description (short) | Status | Evidence / Notes |
|----|---------------------|--------|-----------------|
| AC-1 | Commander.js program with subcommand structure | needs-impl | No `src/cli/` directory exists |
| AC-2 | Config file management (~/.callsheet/config.json) | needs-impl | — |
| AC-3 | Output formatting (--format json/table) | needs-impl | — |
| AC-4 | tRPC vanilla client factory with Bearer auth | needs-impl | `@trpc/client` already in deps, `AppRouter` type available |
| AC-5 | Error handling with exit codes | needs-impl | — |

**Pre-satisfied:** 0 / 5
**Needs implementation:** 5 / 5

### Type Alignment

- `AppRouter` type exported from `src/server/root.ts` — CLI client will import this for type inference
- `@trpc/client` already in `package.json` dependencies — no new install needed for the core client
- Need to install: `commander`, `chalk`, `cli-table3`, `@types/cli-table3` (devDep)
- tsconfig uses `@/*` → `./src/*` paths — CLI files at `src/cli/` can use `@/server/root` etc.
- Note: `tsx` runs TypeScript directly — CLI dev mode is `tsx src/cli/index.ts`
- The `"dom"` lib in tsconfig is fine — CLI files won't use DOM types, and Commander.js doesn't require them

### Implementation Order

1. **Install dependencies** — `npm install commander chalk cli-table3` + `npm install -D @types/cli-table3`
2. **Config module** (`src/cli/config.ts`) — read/write `~/.callsheet/config.json`, config dir creation. Pure FS operations, no deps on other CLI modules.
3. **Output module** (`src/cli/output.ts`) — `formatOutput(data, format)` where format is `"json" | "table"`. JSON = `JSON.stringify(data, null, 2)`. Table = cli-table3 with auto-detected columns from object keys.
4. **Error module** (`src/cli/errors.ts`) — `handleError(err)` maps TRPCClientError to exit codes: `UNAUTHORIZED` → 2, everything else → 1. Outputs structured JSON error.
5. **Client factory** (`src/cli/client.ts`) — `createCLIClient(apiUrl, token)` returns `createTRPCClient<AppRouter>` with httpBatchLink and Bearer header.
6. **Entry point** (`src/cli/index.ts`) — Commander.js `program`, global `--format` option, loads config, creates client. Registers subcommand groups as stubs (auth, config — actual commands in CS-WORK-104/105).
7. **Package.json** — add `"cli": "tsx src/cli/index.ts"` script
8. **Tests** — one test file per module (config, output, errors, client)

### Deliverables

| File | Exists? | Action |
|------|---------|--------|
| `src/cli/index.ts` | No | Create — Commander.js entry point |
| `src/cli/config.ts` | No | Create — config file CRUD |
| `src/cli/client.ts` | No | Create — tRPC client factory |
| `src/cli/output.ts` | No | Create — JSON/table formatter |
| `src/cli/errors.ts` | No | Create — error → exit code mapping |
| `src/cli/__tests__/config.test.ts` | No | Create |
| `src/cli/__tests__/output.test.ts` | No | Create |
| `src/cli/__tests__/errors.test.ts` | No | Create |
| `src/cli/__tests__/client.test.ts` | No | Create |
| `package.json` | Yes | Add deps + cli script |

### Key Patterns

- **No React dependency.** The CLI uses `@trpc/client` vanilla (not `@trpc/react-query`). Import `createTRPCClient` from `@trpc/client`.
- **AppRouter type inference.** `createTRPCClient<AppRouter>({ links: [...] })` gives fully typed proxy. Same pattern as the web client but without React.
- **Config dir convention.** Use `os.homedir()` + `.callsheet/config.json`. Create dir if missing via `fs.mkdirSync(dir, { recursive: true })`.
- **Commander.js pattern.** `program.name("callsheet").version(version).option("--format <type>", "output format", "json")`. Each command group is `.command("auth")` with subcommands via `.command("login")` etc.

### Design Decisions

1. **Config location:** `~/.callsheet/config.json` (not XDG). Simpler. Single platform (the agent running this is on one machine).
2. **Table formatting:** Use object keys as column headers. For arrays, each element is a row. For single objects, key-value pairs. This covers all tRPC response shapes without per-command table config.
3. **Client factory is pure:** No side effects — returns a typed client object. The entry point manages the lifecycle (read config → create client → pass to commands).
4. **Stub subcommands:** `index.ts` registers `auth` and `config` command groups but they have no subcommands yet (CS-WORK-104/105 will add them). The program is runnable with `--help` and `--version` only at bootstrap.
