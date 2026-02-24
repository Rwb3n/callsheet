---
template: work_item
id: CS-WORK-047
title: "Implement subscription management panel"
type: feature
status: done
owner: null
created: 2026-02-24
spawned_by: null
spawned_children: []
chapter: CH-CS-007
arc: provider-experience
epoch: CS-E1
closed: 2026-02-24
priority: medium
effort: small
traces_to:
  - REQ-CS-PROV-005
source_files:
  - D:/PROJECTS/callsheet/3-requirements/slices/slice-05-provider-experience.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/platform-and-product.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/shared-infrastructure.md
acceptance_criteria:
  - "AC-27: Subscription panel shows current tier, billing cadence, start date, and feature access summary"
  - "AC-28: Grace period warning displays expiry date and payment recovery prompt when active"
  - "AC-29: Upgrade CTA routes to S4 checkout flow for free-tier listings, upgrade flow for paid-tier listings"
  - "AC-30: Paddle portal link opens customer billing management"
blocked_by: [CS-WORK-043]
blocks: []
enables: []
queue_position: done
cycle_phase: done
node_history:
  - node: backlog
    entered: 2026-02-24T00:00:00
    exited: null
artifacts: []
cycle_docs: {}
memory_refs: []
extensions:
  project: CALLSHEET
  slice: S5
  spec_sections: "PP §6.4, SI §10.1 (PaymentService.getCustomerPortalUrl)"
version: "2.0"
generated: 2026-02-24
last_updated: 2026-02-24T00:00:00
---

# CS-WORK-047: Implement subscription management panel

## Context

Subscription management page for the provider dashboard — displays current tier with feature summary, billing details, grace period warning, upgrade CTA, and Paddle customer portal link. Primarily a presentation layer consuming existing data: `computeFeatureAccess` for tier details, `getSubscriptionStatus` from S4, and `PaymentService.getCustomerPortalUrl` for billing portal. No new domain logic or schema changes.

**Type alignment:** `PaymentService` at `src/lib/services/types.ts` already includes `getCustomerPortalUrl({ paddleCustomerId: string }): Promise<string>`. S4's subscription router exists at `src/domains/operations/paddle/` and `src/domains/commercial/subscription/`. Grace period data comes from S4's `grace_periods` table.

## Deliverables

- [x] `src/app/dashboard/listings/[listingId]/subscription/page.tsx` — Subscription management page (placeholder, full UI deferred to E2E Phase 2)
- [x] `src/server/routers/subscription.ts` — Extended with `getPortalUrl` query (S4 router, not dashboard — keeps subscription concerns co-located)
- [x] `src/server/routers/__tests__/dashboard-subscription.integration.test.ts` — 10 integration tests for AC-27 through AC-30

## References

- `3-requirements/slices/slice-05-provider-experience.md` §7 Subscription Management
- `3-requirements/interfaces/platform-and-product.md` §6.4
- `3-requirements/interfaces/shared-infrastructure.md` §10.1 (PaymentService)
