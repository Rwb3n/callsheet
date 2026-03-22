---
id: CH-CS-008
title: Buyer Experience
arc: buyer-and-operations
epoch: CS-E1
status: Active
depends: CH-CS-007
work_items: [CS-WORK-050, CS-WORK-051, CS-WORK-052, CS-WORK-053, CS-WORK-054, CS-WORK-055, CS-WORK-056]
---

# Chapter: Buyer Experience

Source: `3-requirements/slices/slice-06-buyer-experience/index.md` (v2, 52 AC).

## Work Items

| ID | Title | AC | Priority | Blocked By |
|----|-------|----|----------|------------|
| CS-WORK-050 | Search router and ranking | 10 (AC-1–AC-10) | critical | — |
| CS-WORK-051 | Listing profile page and contact feedback | 12 (AC-11–AC-19, AC-42–AC-44) | critical | — |
| CS-WORK-052 | Enquiry submission | 8 (AC-20–AC-27) | critical | — |
| CS-WORK-053 | Shortlist management | 5 (AC-28–AC-32) | high | — |
| CS-WORK-054 | Saved searches, search history, cleanup | 5 (AC-33–AC-37) | high | 050 |
| CS-WORK-055 | Buyer dashboard | 4 (AC-38–AC-41) | high | 050, 051, 052, 053, 054 |
| CS-WORK-056 | Cross-role nudge and feature gating | 8 (AC-45–AC-52) | medium | 050 |

**Total:** 7 work items, 52 AC.

## Dependency Graph

```
CS-WORK-050 (Search) ──┬──▶ CS-WORK-054 (History/Cleanup) ──▶ CS-WORK-055 (Dashboard)
                       ├──▶ CS-WORK-056 (Nudge/Gating)
                       └──▶ CS-WORK-055 (Dashboard)

CS-WORK-051 (Profile) ─────▶ CS-WORK-055 (Dashboard)
CS-WORK-052 (Enquiry) ─────▶ CS-WORK-055 (Dashboard)
CS-WORK-053 (Shortlist) ───▶ CS-WORK-055 (Dashboard)
```

**Independent entry points:** 4 (CS-WORK-050, CS-WORK-051, CS-WORK-052, CS-WORK-053).
**Longest chain:** 3 (050 → 054 → 055).
