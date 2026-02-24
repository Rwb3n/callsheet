---
template: work_item
id: CS-WORK-042
title: "Pricing page"
type: feature
status: done
owner: null
created: 2026-02-23
spawned_by: null
spawned_children: []
chapter: CH-CS-006
arc: onboarding-and-claims
epoch: CS-E1
closed: 2026-02-23
priority: medium
effort: small
traces_to:
  - REQ-CS-SUBS-008
source_files:
  - D:/PROJECTS/callsheet/3-requirements/slices/slice-04-subscriptions.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/shared-infrastructure.md
acceptance_criteria:
  - "AC-34: Pricing page renders all 4 tiers with correct annual prices from PRICING const"
  - "AC-35: Monthly toggle shows monthly prices"
  - "AC-36: Launch discount badge displayed on Standard annual card"
blocked_by: [CS-WORK-036]
blocks: []
enables: []
queue_position: done
cycle_phase: done
node_history:
  - node: backlog
    entered: 2026-02-23T00:00:00
    exited: null
artifacts:
  - src/app/pricing/page.tsx
  - src/components/pricing/billing-toggle.tsx
  - src/components/pricing/tier-card.tsx
cycle_docs: {}
memory_refs: []
extensions:
  project: CALLSHEET
  slice: S4
  spec_sections: "SI §7.1, CR §4.3"
version: "2.0"
generated: 2026-02-23
last_updated: 2026-02-23T00:00:00
---

# CS-WORK-042: Pricing page

## Context

Static SSG pricing page at `/pricing`. Renders `PRICING` and `TIER_LIMITS` from CR exports (P4 — import from owner). Tier comparison table with feature matrix, annual/monthly toggle, VAT footnote. Launch discount badge on Standard annual card. Checkout CTA behaviour varies by auth state: unauthenticated → signup redirect, authenticated without claimed listing → create listing redirect, authenticated with claimed listing(s) → Paddle checkout overlay (or listing selector if multiple). All 3 AC are E2E tests — deferred until Playwright browser harness exists (Phase 2, per CS-WORK-029). Work item creates the page component and server-side rendering; E2E verification follows.

## Deliverables

- [ ] `src/app/pricing/page.tsx` — SSG pricing page with tier comparison table
- [ ] `src/components/pricing/tier-card.tsx` — Tier card component (feature list, CTA, badge)
- [ ] `src/components/pricing/billing-toggle.tsx` — Annual/monthly toggle
- [ ] E2E tests deferred to CS-WORK-034 Phase 2 — AC-34, AC-35, AC-36

## References

- `3-requirements/slices/slice-04-subscriptions.md` §6 Pricing Page
- `3-requirements/interfaces/shared-infrastructure.md` §7.1 SSG
