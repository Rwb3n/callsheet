---
id: CH-CS-005
title: Claim & Verify
arc: onboarding-and-claims
epoch: CS-E1
status: Complete
depends: CH-CS-001
work_items: [CS-WORK-030, CS-WORK-031, CS-WORK-032, CS-WORK-033]
---

# Chapter: Claim & Verify

Source: `3-requirements/slices/slice-03-claim-verify.md` (v2, 48 AC).

## Requirements

48 AC across 4 work items:

| Work Item | Title | AC | Effort |
|---|---|---|---|
| CS-WORK-030 | Implement evaluateClaim decision engine | 14 | Large |
| CS-WORK-031 | Implement claim approval and rejection pipelines | 16 | Large |
| CS-WORK-032 | Implement manual review and competing claims | 13 | Large |
| CS-WORK-033 | Implement verification upgrade path | 5 | Small |

## Dependency Graph

CS-WORK-030 (eval engine) → blocks CS-WORK-031 and CS-WORK-032. CS-WORK-033 is independent. Two parallel entry points: CS-WORK-030 and CS-WORK-033.
