---
id: CH-CS-006
title: Subscriptions
arc: onboarding-and-claims
epoch: CS-E1
status: Complete
depends: CH-CS-001
work_items: [CS-WORK-035, CS-WORK-036, CS-WORK-037, CS-WORK-038, CS-WORK-039, CS-WORK-040, CS-WORK-041, CS-WORK-042]
---

# Chapter: Subscriptions

Source: `3-requirements/slices/slice-04-subscriptions.md` (v2, 50 AC).

## Requirements

8 work items covering the full subscription lifecycle:

| ID | Title | AC | Priority | Effort |
|----|-------|----|----------|--------|
| CS-WORK-035 | Schema, types, and Paddle mapping | 11 | critical | large |
| CS-WORK-036 | Feature gating and pricing config | 5 | high | small |
| CS-WORK-037 | Downgrade and re-upgrade data handling | 6 | high | medium |
| CS-WORK-038 | Grace period management | 5 | high | medium |
| CS-WORK-039 | Paddle webhook handler functions | 9 | critical | large |
| CS-WORK-040 | Checkout initiation and subscription router | 5 | high | medium |
| CS-WORK-041 | Archival path and event consumers | 6 | high | medium |
| CS-WORK-042 | Pricing page | 3 | medium | small |

**Total: 50 AC.** Domain ownership: Ops (webhook handler), CR (business rules, feature gating, pricing), PP (pricing page, checkout initiation, feature gate UI).

## Dependency Graph

```
CS-WORK-035 (Schema + Types, 11 AC) ← foundation
  ├──▶ CS-WORK-037 (Downgrade, 6 AC)
  │      └──▶ CS-WORK-039 (Webhook Handlers, 9 AC) ← also depends on 038
  │      └──▶ CS-WORK-041 (Archival + Consumers, 6 AC)
  ├──▶ CS-WORK-038 (Grace Period, 5 AC)
  │      └──▶ CS-WORK-039 (also depends on 037)
  ├──▶ CS-WORK-040 (Checkout Router, 5 AC) ← also depends on 036
  └──▶ CS-WORK-041 (also depends on 037)

CS-WORK-036 (Feature Gating, 5 AC) ← independent entry point
  ├──▶ CS-WORK-040 (also depends on 035)
  └──▶ CS-WORK-042 (Pricing Page, 3 AC)
```

**Independent entry points:** 2 (CS-WORK-035, CS-WORK-036).
**Longest chain:** 035 → 037/038 → 039 (depth 3).
**Parallelisable after 035:** 037, 038, 040 (with 036), 041 (with 037).
