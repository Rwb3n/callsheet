---
template: work_item
id: CS-WORK-036
title: "Feature gating and pricing config"
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
priority: high
effort: small
traces_to:
  - REQ-CS-SUBS-002
source_files:
  - D:/PROJECTS/callsheet/3-requirements/slices/slice-04-subscriptions.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/commercial-and-revenue.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/shared-infrastructure.md
acceptance_criteria:
  - "AC-16: computeFeatureAccess('free') returns correct limits (maxMedia: 5, rankingBoost: 0, etc.)"
  - "AC-17: computeFeatureAccess('partner') returns prioritySupport: true"
  - "AC-18: enforceFeatureGate throws FORBIDDEN for gated feature on free tier"
  - "AC-19: checkFeatureAccess returns true for paid tier features"
  - "AC-40: isPremiumVerificationEligible returns false for free tier, true for any paid tier"
blocked_by: []
blocks: [CS-WORK-040, CS-WORK-042]
enables: []
queue_position: backlog
cycle_phase: backlog
node_history:
  - node: backlog
    entered: 2026-02-23T00:00:00
    exited: null
artifacts: []
cycle_docs: {}
memory_refs: []
extensions:
  project: CALLSHEET
  slice: S4
  spec_sections: "CR §4.1, CR §4.2, CR §4.3"
version: "2.0"
generated: 2026-02-23
last_updated: 2026-02-23T00:00:00
---

# CS-WORK-036: Feature gating and pricing config

## Context

Pure functions and constants for subscription feature gating. `computeFeatureAccess` wraps `TIER_LIMITS` (already at `src/domains/commercial/tier-limits.ts`) with base boolean fields. `enforceFeatureGate` and `checkFeatureAccess` provide tRPC middleware and template-level access checks respectively — S5/S6 apply these to dashboard routes. `PRICING` const defines the 3-tier annual/monthly prices. `isPremiumVerificationEligible` resolves S3 downstream flag S3-1. `LAUNCH_DISCOUNT` config for pricing page. All unit-testable — no DB dependencies.

## Deliverables

- [x] `src/domains/commercial/subscription/feature-access.ts` — `computeFeatureAccess()`, `FeatureAccess` type
- [x] `src/domains/commercial/subscription/pricing.ts` — `PRICING` const, `LAUNCH_DISCOUNT` const
- [x] `src/lib/feature-gate.ts` — `enforceFeatureGate()`, `checkFeatureAccess()`
- [x] `src/domains/data-and-listings/verification/premium-gate.ts` — `isPremiumVerificationEligible()`
- [x] `src/domains/commercial/subscription/__tests__/feature-access.test.ts` — Unit tests for all 5 AC (26 tests)

## References

- `3-requirements/slices/slice-04-subscriptions.md` §4 Feature Gating, §6.3 Launch Discount, §9 Premium Verified Gate
- `3-requirements/interfaces/commercial-and-revenue.md` §4.1 TIER_LIMITS, §4.2 computeFeatureAccess, §4.3 PRICING
