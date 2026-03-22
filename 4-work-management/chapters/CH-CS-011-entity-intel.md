---
id: CH-CS-011
title: Entity Intelligence
arc: commercial-and-intelligence
epoch: CS-E1
status: Complete
depends: CH-CS-010
work_items: [CS-WORK-075, CS-WORK-076, CS-WORK-077, CS-WORK-078, CS-WORK-079, CS-WORK-080, CS-WORK-081, CS-WORK-082]
---

# Chapter: Entity Intelligence

Source: `3-requirements/slices/slice-09-entity-intelligence/index.md` (v2, 101 AC).

## Scope

8 work items implementing the entity's perception, intelligence, and learning systems. Calibrated quality scoring (5 dimensions, 0-100), decay detection and tiered enrichment scheduling, analytics pipeline (search terms, viewer demographics, competitor benchmarking, enquiry response insights), 12 recurring ceremony handlers, entity learning (L1-L7 hypothesis analysis), proactive churn detection, commercial intelligence (revenue health extended, sponsored placement learning, conversion funnel analysis), and 15 new event consumers.

## Work Items

| ID | Title | AC | Blocked By | Status |
|----|-------|----|------------|--------|
| CS-WORK-075 | Intelligence schema, migration, and seed data | 0 | — | **done** |
| CS-WORK-076 | Quality scoring engine | 21 | ~~075~~ | **done** |
| CS-WORK-077 | Decay detection and enrichment scheduling | 15 | ~~075~~ | **done** |
| CS-WORK-078 | Analytics pipeline and feature gating | 18 | ~~075, 076~~ | **done** |
| CS-WORK-079 | Ceremony automation | 15 | ~~075, 076, 077~~ | **done** |
| CS-WORK-080 | Entity learning and commercial intelligence | 15 | ~~075, 079~~ | **done** |
| CS-WORK-081 | Event consumers — D&L perception | 9 | ~~075, 076, 077~~ | **done** |
| CS-WORK-082 | Event consumers — CR/Ops and matrix wiring | 8 | ~~075, 080, 081~~ | **done** |

**Total: 101 AC across 8 work items.**

## Dependency Graph

```
CS-WORK-075 (Schema + Seed, 0 AC)
  ├──▶ CS-WORK-076 (Quality Scoring, 21 AC)
  │      ├──▶ CS-WORK-078 (Analytics Pipeline, 18 AC) ✅
  │      └──▶ CS-WORK-079 (Ceremony Automation, 15 AC)
  │             └──▶ CS-WORK-080 (Entity Learning, 15 AC)
  │                    └──▶ CS-WORK-082 (CR/Ops Consumers + Wiring, 8 AC)
  ├──▶ CS-WORK-077 (Decay Detection, 15 AC)
  │      └──▶ CS-WORK-079 (also blocked by 077)
  └──▶ CS-WORK-081 (D&L Consumers, 9 AC)
         └──▶ CS-WORK-082 (also blocked by 081)
```

**Independent entry points after 075:** 076, 077 (parallelisable).
**Longest chain:** 075 → 076 → 079 → 080 → 082 (5 items).

## Requirements Sections

| Section | Content File | Work Items |
|---------|-------------|------------|
| §1 Quality Scoring | `01-quality-scoring.md` | CS-WORK-076 |
| §2 Decay Detection | `02-decay-enrichment.md` | CS-WORK-077 |
| §3 Analytics Pipeline | `03-analytics-pipeline.md` | CS-WORK-078 |
| §4 Ceremony Automation | `04-ceremony-automation.md` | CS-WORK-079 |
| §5 Entity Learning | `05-entity-learning.md` | CS-WORK-080 |
| §6 Event Consumers | `06-event-consumers.md` | CS-WORK-081, CS-WORK-082 |
| §11 Schema | `00-schema.md` | CS-WORK-075 |
| — Router Plan | `00-router-plan.md` | CS-WORK-076, CS-WORK-077, CS-WORK-079, CS-WORK-080 (admin routes distributed) |
