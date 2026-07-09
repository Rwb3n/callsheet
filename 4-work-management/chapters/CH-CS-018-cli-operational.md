---
id: CH-CS-018
title: CLI Operational
arc: agent-cli
epoch: CS-E2
status: Complete
depends: [CH-CS-015, CH-CS-017]
work_items: [CS-WORK-106, CS-WORK-107, CS-WORK-108, CS-WORK-109]
---

# Chapter: CLI Operational

## Scope

4 work items implementing CLI commands for day-to-day operational management: flow management (initiate, retry, status), compliance and support triage, billing and event inspection, and scheduler/health/decision commands. All depend on the CLI framework (101) and the operational routes from CH-CS-015.

## Work Items

| ID | Title | AC | Blocked By | Status |
|----|-------|----|------------|--------|
| CS-WORK-106 | CLI flow management commands | 5 | 103 | todo |
| CS-WORK-107 | CLI compliance and support commands | 5 | 103 | todo |
| CS-WORK-108 | CLI billing and events commands | 4 | 103 | todo |
| CS-WORK-109 | CLI scheduler, health, and decisions commands | 5 | 103 | todo |

**Total: 19 AC across 4 work items.**

## Dependency Graph

```
CS-WORK-103 (CLI Bootstrap — from CH-CS-017)
  ├──▶ CS-WORK-106 (Flow Mgmt Commands, 5 AC)
  ├──▶ CS-WORK-107 (Compliance/Support Commands, 5 AC)
  ├──▶ CS-WORK-108 (Billing/Events Commands, 4 AC)
  └──▶ CS-WORK-109 (Scheduler/Health/Decisions Commands, 5 AC)
```

**Independent entry points:** 106, 107, 108, 109 (4 parallelisable, once 103 is complete).
**Longest chain:** 103 → 106 (2 items, 10 AC).
