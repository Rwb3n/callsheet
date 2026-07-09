---
id: CH-CS-015
title: Operational Routes
arc: api-completion
epoch: CS-E2
status: Complete
depends: []
work_items: [CS-WORK-091, CS-WORK-092, CS-WORK-093, CS-WORK-094, CS-WORK-095, CS-WORK-096, CS-WORK-097, CS-WORK-098]
---

# Chapter: Operational Routes

## Scope

8 work items exposing operational backend functionality through admin/API routes: erasure and closure flow initiation, flow retry execution, scheduler visibility, decision log search, notification management, user/account management, listing admin, and task management. All items are independent with no intra-chapter dependencies.

## Work Items

| ID | Title | AC | Blocked By | Status |
|----|-------|----|------------|--------|
| CS-WORK-091 | Erasure and closure flow initiation routes | 7 | — | **done** |
| CS-WORK-092 | Flow retry execution fix | 4 | — | **done** |
| CS-WORK-093 | Scheduler visibility routes | 6 | — | **done** |
| CS-WORK-094 | Decision log search route | 4 | — | **done** |
| CS-WORK-095 | Notification management routes | 3 | — | **done** |
| CS-WORK-096 | User and account management routes | 5 | — | **done** |
| CS-WORK-097 | Listing admin routes | 3 | — | **done** |
| CS-WORK-098 | Task management routes | 5 | — | **done** |

**Total: 37 AC across 8 work items.**

## Dependency Graph

```
CS-WORK-091 (Erasure/Closure Initiation, 5 AC)
CS-WORK-092 (Flow Retry Fix, 4 AC)
CS-WORK-093 (Scheduler Visibility, 6 AC)
CS-WORK-094 (Decision Log Search, 4 AC)
CS-WORK-095 (Notification Mgmt, 3 AC)
CS-WORK-096 (User/Account Mgmt, 5 AC)
CS-WORK-097 (Listing Admin, 3 AC)
CS-WORK-098 (Task Mgmt, 5 AC)

All 8 items are independent — fully parallelisable.
```

**Independent entry points:** 091, 092, 093, 094, 095, 096, 097, 098 (8 parallelisable).
**Longest chain:** 1 item (no dependencies).
