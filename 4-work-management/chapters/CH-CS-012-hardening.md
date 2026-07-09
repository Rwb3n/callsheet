---
id: CH-CS-012
title: Hardening
arc: hardening
epoch: CS-E1
status: Complete
depends: [CH-CS-010, CH-CS-011]
work_items: [CS-WORK-083, CS-WORK-084, CS-WORK-085, CS-WORK-086, CS-WORK-087, CS-WORK-088, CS-WORK-089, CS-WORK-090]
---

# Chapter: Hardening

Source: `3-requirements/slices/slice-10-hardening/index.md` (v2, 72 AC).

## Scope

8 work items implementing GDPR erasure flow (6 steps + processErasure data operation), account closure flow (6 steps + closure data operations), concurrent flow interaction validation, end-to-end failure injection tests, autonomy graduation criteria evaluation, and algorithm versioning with controlled rollout. 0 new tables, 0 new event consumers, +1 decision type (`graduation_evaluation`).

## Work Items

| ID | Title | AC | Blocked By | Status |
|----|-------|----|------------|--------|
| CS-WORK-083 | GDPR erasure flow wiring | 10 | — | todo |
| CS-WORK-084 | processErasure implementation | 12 | 083 | todo |
| CS-WORK-085 | Account closure flow wiring | 8 | — | todo |
| CS-WORK-086 | Closure data operations | 9 | 085 | todo |
| CS-WORK-087 | Concurrent flow interaction | 6 | 083, 084, 085, 086 | todo |
| CS-WORK-088 | End-to-end validation and failure injection | 12 | 083, 084, 085, 086, 087 | todo |
| CS-WORK-089 | Autonomy graduation | 7 | — | todo |
| CS-WORK-090 | Algorithm versioning and controlled rollout | 8 | 089 | todo |

**Total: 72 AC across 8 work items.**

## Dependency Graph

```
CS-WORK-083 (Erasure Flow, 10 AC)
  └──▶ CS-WORK-084 (processErasure, 12 AC)
         └──▶ CS-WORK-087 (Concurrent Flows, 6 AC)
                └──▶ CS-WORK-088 (E2E Validation, 12 AC)

CS-WORK-085 (Closure Flow, 8 AC)
  └──▶ CS-WORK-086 (Closure Data Ops, 9 AC)
         └──▶ CS-WORK-087 (also blocked by 086)
                └──▶ CS-WORK-088 (also blocked by 087)

CS-WORK-089 (Autonomy Graduation, 7 AC)
  └──▶ CS-WORK-090 (Algorithm Rollout, 8 AC)
```

**Independent entry points:** 083, 085, 089 (3 parallelisable).
**Longest chain:** 083 → 084 → 087 → 088 (4 items, 40 AC).

## Requirements Sections

| Section | Content File | Work Items |
|---------|-------------|------------|
| §1 Erasure Flow Wiring | `01-erasure-flow.md` | CS-WORK-083 |
| §2 processErasure | `01-erasure-flow.md` | CS-WORK-084 |
| §3 Closure Flow Wiring | `03-closure-flow.md` | CS-WORK-085 |
| §4 Closure Data Operations | `03-closure-flow.md` | CS-WORK-086 |
| §5 Concurrent Flow Interaction | `05-concurrent-flows.md` | CS-WORK-087 |
| §6 E2E Validation | `05-concurrent-flows.md` | CS-WORK-088 |
| §7 Autonomy Graduation | `07-autonomy-graduation.md` | CS-WORK-089 |
| §8 Algorithm Versioning | `07-autonomy-graduation.md` | CS-WORK-090 |
| §11 Schema | `00-schema.md` | CS-WORK-089 (graduation_evaluation decision type) |
| — Router Plan | `00-router-plan.md` | CS-WORK-089 (3 routes), CS-WORK-090 (2 routes) |
