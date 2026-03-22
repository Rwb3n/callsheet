---
id: CH-CS-009
title: Operations
arc: buyer-and-operations
epoch: CS-E1
status: Complete
depends: CH-CS-007
work_items: [CS-WORK-057, CS-WORK-058, CS-WORK-059, CS-WORK-060, CS-WORK-061, CS-WORK-062, CS-WORK-063, CS-WORK-064, CS-WORK-065]
---

# Chapter: Operations

Source: `3-requirements/slices/slice-07-operations/index.md` (v2, 101 AC).

## Work Items

| ID | Title | AC | Priority | Blocked By |
|----|-------|----|----------|------------|
| CS-WORK-057 | Operations schema and admin dashboard | 9 (AC-1.1–AC-1.9) | critical | — |
| CS-WORK-058 | Support triage and ticket management | 15 (AC-2.1–AC-2.15) | critical | 057 |
| CS-WORK-059 | Billing reconciliation | 13 (AC-4.1–AC-4.13) | critical | 057 |
| CS-WORK-060 | Compliance management | 10 (AC-5.1–AC-5.10) | critical | 057 |
| CS-WORK-061 | Orchestrated flow and failed event admin | 16 (AC-6.1–AC-6.10, AC-7.1–AC-7.6) | high | 057 |
| CS-WORK-062 | Platform health monitoring | 10 (AC-8.1–AC-8.10) | high | 057, 058, 059, 061 |
| CS-WORK-063 | Event consumers and email delivery | 11 (AC-11.1–AC-11.10, AC-11.7a) | high | 057 |
| CS-WORK-064 | Feature gate friction tracking | 8 (AC-12.1–AC-12.8) | medium | 057, 058 |
| CS-WORK-065 | Refund processing | 9 (AC-13.1–AC-13.9) | medium | 057, 058 |

**Total:** 9 work items, 101 AC.

## Dependency Graph

```
CS-WORK-057 (Schema + Admin Shell)
├──▶ CS-WORK-058 (Support Triage) ──┬──▶ CS-WORK-062 (Health)
├──▶ CS-WORK-059 (Billing) ─────────┤
├──▶ CS-WORK-060 (Compliance)       │
├──▶ CS-WORK-061 (Flow + Events) ───┘
├──▶ CS-WORK-063 (Consumers + Email)
├──▶ CS-WORK-064 (Friction) ←── 058
└──▶ CS-WORK-065 (Refunds) ←── 058
```

**Independent entry points:** 1 (CS-WORK-057 — all others depend on schema).
**Parallel after 057:** 5 (058, 059, 060, 061, 063).
**Longest chain:** 3 (057 → 058 → 062, or 057 → 059 → 062, or 057 → 061 → 062).
