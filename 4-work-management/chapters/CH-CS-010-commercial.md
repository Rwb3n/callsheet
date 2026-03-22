---
id: CH-CS-010
title: Commercial & Revenue
arc: commercial-and-intelligence
epoch: CS-E1
status: Complete
depends: CH-CS-007
work_items: [CS-WORK-066, CS-WORK-067, CS-WORK-068, CS-WORK-069, CS-WORK-070, CS-WORK-071, CS-WORK-072, CS-WORK-073, CS-WORK-074]
---

# Chapter: Commercial & Revenue

Source: `3-requirements/slices/slice-08-commercial/index.md` (v2, 81 AC).

## Work Items

| ID | Title | AC | Priority | Blocked By |
|----|-------|----|----------|------------|
| CS-WORK-066 | Commercial schema and pricing configuration | 4 (AC-60–AC-63) | critical | — |
| CS-WORK-067 | Conversion trigger engine and routes | 13 (AC-1–AC-13) | critical | 066 |
| CS-WORK-068 | Churn detection and intervention | 8 (AC-14–AC-21) | critical | 066 |
| CS-WORK-069 | Win-back evaluation and delivery | 7 (AC-22–AC-28) | high | 066, 068 |
| CS-WORK-070 | Sponsored placement selection | 10 (AC-29–AC-38) | high | 066 |
| CS-WORK-071 | Revenue perception and metrics | 8 (AC-39–AC-46) | high | 066 |
| CS-WORK-072 | Feature gate friction, low-quality intervention, and refund evaluation | 13 (AC-47–AC-59) | high | 066 |
| CS-WORK-073 | Event consumer implementations | 18 (AC-64–AC-81) | critical | 066, 067, 068, 069, 072 |
| CS-WORK-074 | Demo preparation — S8 close-out | 12 | high | 073 |

**Total:** 9 work items, 93 AC.

## Dependency Graph

```
CS-WORK-066 (Schema + Pricing)
├──▶ CS-WORK-067 (Conversion Triggers) ──┐
├──▶ CS-WORK-068 (Churn Detection) ──────┤
│    └──▶ CS-WORK-069 (Win-Back) ────────┤
├──▶ CS-WORK-070 (Sponsored Placement)   │
├──▶ CS-WORK-071 (Revenue Perception)    │
├──▶ CS-WORK-072 (Support Sections) ─────┤
└────────────────────────────────────────▶ CS-WORK-073 (Event Consumers)
                                            └──▶ CS-WORK-074 (Demo Prep)
```

**Independent entry points:** 1 (CS-WORK-066 — all others depend on schema).
**Parallel after 066:** 5 (067, 068, 070, 071, 072). 069 depends on 068.
**Longest chain:** 4 (066 → 068 → 069 → 073 → 074).
**Final convergence:** CS-WORK-073 depends on all domain logic work items (067, 068, 069, 072) because it imports their exported functions. CS-WORK-074 runs last — needs all tables and routes available to seed demo data.
