---
id: CH-CS-019
title: CLI Intelligence
arc: agent-cli
epoch: CS-E2
status: Complete
depends: [CH-CS-018]
work_items: [CS-WORK-110, CS-WORK-111, CS-WORK-112]
---

# Chapter: CLI Intelligence

## Scope

3 work items implementing CLI commands for intelligence and autonomy operations: intelligence query and inspection commands, graduation evaluation and application commands, and gate commands (smoke tests, data validation). All depend on the CLI framework (101).

## Work Items

| ID | Title | AC | Blocked By | Status |
|----|-------|----|------------|--------|
| CS-WORK-110 | CLI intelligence commands | 4 | 103 | todo |
| CS-WORK-111 | CLI graduation commands | 4 | 103 | todo |
| CS-WORK-112 | CLI gate commands (smoke + data validate) | 6 | 103 | todo |

**Total: 14 AC across 3 work items.**

## Dependency Graph

```
CS-WORK-103 (CLI Bootstrap — from CH-CS-017)
  ├──▶ CS-WORK-110 (Intelligence Commands, 4 AC)
  ├──▶ CS-WORK-111 (Graduation Commands, 4 AC)
  └──▶ CS-WORK-112 (Gate Commands, 6 AC)
```

**Independent entry points:** 110, 111, 112 (3 parallelisable, once 103 is complete).
**Longest chain:** 103 → 112 (2 items, 11 AC).
