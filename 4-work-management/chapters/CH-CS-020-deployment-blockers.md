---
id: CH-CS-020
title: Deployment Blockers
arc: presentation-e2
epoch: CS-E2
status: Complete
depends: []
work_items: [CS-WORK-113, CS-WORK-114]
---

# Chapter: Deployment Blockers

## Scope

2 work items addressing minimum-viable presentation requirements that block deployment: error boundaries and loading states across all routes, and the homepage (landing page with search entry point). Both are independent.

## Work Items

| ID | Title | AC | Blocked By | Status |
|----|-------|----|------------|--------|
| CS-WORK-113 | Error boundaries and loading states | 4 | — | todo |
| CS-WORK-114 | Homepage | 4 | — | todo |

**Total: 8 AC across 2 work items.**

## Dependency Graph

```
CS-WORK-113 (Error Boundaries/Loading States, 4 AC)
CS-WORK-114 (Homepage, 4 AC)

Both items are independent — fully parallelisable.
```

**Independent entry points:** 113, 114 (2 parallelisable).
**Longest chain:** 1 item (no dependencies).
