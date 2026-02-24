---
template: work_item
id: CS-WORK-029
title: "E2E verification workflow investigation"
type: investigation
status: done
owner: null
created: 2026-02-22
spawned_by: null
spawned_children: [CS-WORK-034]
chapter: CH-CS-004
arc: onboarding-and-claims
epoch: CS-E1
closed: 2026-02-23
priority: high
effort: medium
traces_to: []
source_files: []
acceptance_criteria:
  - "AC-01: Investigation brief delivered with problem statement, requirements inventory, options evaluation, and recommendation ✅"
  - "AC-02: All 7 deferred E2E ACs catalogued with verification category (auth flow, build output, webhook pipeline, orchestrated flow, smoke test) ✅"
  - "AC-03: At least 3 tooling options evaluated against CALLSHEET constraints (no UI yet, Vercel deployment, Supabase local, autonomous entity backend-heavy flows) ✅ (4 evaluated + 3 dismissed = 7 total)"
  - "AC-04: Recommendation includes phased build plan with clear trigger for each phase ✅ (3 phases: now / S5 / staging)"
  - "AC-05: Principal review and sign-off on recommended approach — PENDING REVIEW"
blocked_by: []
blocks: []
enables: []
queue_position: null
cycle_phase: done
node_history:
  - node: backlog
    entered: 2026-02-22T00:00:00
    exited: 2026-02-22T00:00:00
  - node: active
    entered: 2026-02-22T00:00:00
    exited: 2026-02-23T00:00:00
  - node: done
    entered: 2026-02-23T00:00:00
    exited: null
artifacts:
  - "1-investigation/e2e-verification-workflow.md"
  - "4-work-management/IMPLEMENTATION-TRACKER.md (E2E Debt section updated)"
cycle_docs: {}
memory_refs: []
extensions:
  project: CALLSHEET
  slice: cross-cutting
  spec_sections: "SI §4 (auth), SI §5 (email), SI §2 (scheduler), SI §3 (flows)"
version: "1.0"
generated: 2026-02-22
last_updated: 2026-02-23T00:00:00
---

# CS-WORK-029: E2E verification workflow investigation

## Context

CALLSHEET has 7 ACs deferred to E2E verification and the number will grow as S3+ introduces claim evaluation, Paddle webhooks, and multi-step orchestrated flows. No E2E verification workflow exists. The tooling landscape is shifting rapidly and the right approach may not be browser automation at all — CALLSHEET is backend-first with no UI yet, and the highest-value verification paths are auth integration, webhook pipelines, deferred action execution, and cross-domain orchestrated flows.

## Deliverables

- [x] `1-investigation/e2e-verification-workflow.md` — Investigation brief (problem statement, requirements inventory, options evaluation, recommendation, phased build plan)
- [x] Updated `IMPLEMENTATION-TRACKER.md` — E2E Debt section reclassified with verification categories, phase assignments, and tool recommendations
- [ ] Decision on approach — AC-05 principal sign-off pending review

## Summary of Findings

**6 verification categories identified:** auth flow (HTTP), auth flow (browser), build output, smoke test, CI meta, webhook pipeline. Orchestrated flows (S10) remain as Vitest integration tests.

**Recommendation:** 3-phase Playwright approach.
- **Phase 1 (now):** Playwright APIRequestContext — HTTP-level auth flows, webhook testing. No browser binaries. Covers AC-21, AC-22, S2-AC-02, AC-35 (partial).
- **Phase 2 (S5):** Playwright browser mode — first authenticated UI pages. Covers AC-25.
- **Phase 3 (staging):** Hookdeck webhook tunnelling — real provider webhooks against staging.

**Reclassified:** AC-42 → Vitest smoke test (not Playwright). AC-52 → manual verification (first CI green run).

**4 tools evaluated:** Playwright API (Phase 1 pick), Playwright browser (Phase 2 pick), Vitest integration (keep for domain logic), Supertest (declined — App Router incompatible, declining ecosystem).

**3 dismissed alternatives:** Stagehand (AI browser automation, not testing), Firecrawl (web scraping, not testing), Crawlee (web crawling, not testing).

## References

- `1-investigation/e2e-verification-workflow.md` — full investigation brief
- `4-work-management/IMPLEMENTATION-TRACKER.md` — E2E Debt section
- `3-requirements/interfaces/shared-infrastructure.md` — SI §4 (auth), §5 (email)
- `0-strategic-frame/entity-architecture-frame.md` — Layer 2 (perception verification)
