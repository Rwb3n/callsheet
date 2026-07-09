---
id: CH-CS-017
title: CLI Scaffold
arc: agent-cli
epoch: CS-E2
status: Complete
depends: [CH-CS-016]
work_items: [CS-WORK-103, CS-WORK-104, CS-WORK-105]
---

# Chapter: CLI Scaffold

## Scope

3 work items establishing the CLI tool foundation: project bootstrap with command framework, authentication commands (login/logout/whoami via API keys), and configuration commands (environment management, defaults). Auth and config commands both depend on the bootstrap being complete.

## Work Items

| ID | Title | AC | Blocked By | Status |
|----|-------|----|------------|--------|
| CS-WORK-103 | CLI bootstrap and framework | 5 | — | todo |
| CS-WORK-104 | CLI auth commands | 4 | 103 | todo |
| CS-WORK-105 | CLI config commands | 3 | 103 | todo |

**Total: 12 AC across 3 work items.**

## Dependency Graph

```
CS-WORK-103 (CLI Bootstrap, 5 AC)
  ├──▶ CS-WORK-104 (CLI Auth Commands, 4 AC)
  └──▶ CS-WORK-105 (CLI Config Commands, 3 AC)
```

**Independent entry points:** 103 (1 parallelisable).
**Longest chain:** 103 → 104 (2 items, 9 AC).
