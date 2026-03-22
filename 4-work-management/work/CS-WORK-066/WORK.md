---
template: work_item
id: CS-WORK-066
title: "Commercial schema and pricing configuration"
type: feature
status: done
owner: null
created: 2026-02-25
spawned_by: null
spawned_children: []
chapter: CH-CS-010
arc: commercial-and-intelligence
epoch: CS-E1
closed: 2026-03-06
priority: critical
effort: medium
traces_to:
  - REQ-CS-CR-001
source_files:
  - D:/PROJECTS/callsheet/3-requirements/slices/slice-08-commercial/index.md
  - D:/PROJECTS/callsheet/3-requirements/slices/slice-08-commercial/00-schema.md
  - D:/PROJECTS/callsheet/3-requirements/slices/slice-08-commercial/05-support-sections.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/commercial-and-revenue.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/shared-infrastructure.md
acceptance_criteria:
  - "AC-60: PRICING export is typed as Record<SubscriptionTier, { annual: number; monthly: number }> and satisfies the constraint at compile time"
  - "AC-61: PRICING values match: free 0/0, standard 199/19, premium 399/39, partner 699/69"
  - "AC-62: Launch discount writes effectivePriceAtSubscription to commercial_state at the discounted amount (e.g., 99), not the standard rate (199). PRICING const is unaffected"
  - "AC-63: No multi-listing discount logic exists in S8. Each listing subscription is priced independently using PRICING[tier]"
blocked_by: []
blocks: [CS-WORK-067, CS-WORK-068, CS-WORK-069, CS-WORK-070, CS-WORK-071, CS-WORK-072, CS-WORK-073]
enables: []
queue_position: backlog
cycle_phase: backlog
node_history:
  - node: backlog
    entered: 2026-02-25T00:00:00
    exited: null
artifacts: []
cycle_docs: {}
memory_refs: []
extensions:
  project: CALLSHEET
  slice: S8
  spec_sections: "S8 §9 (PRICING), S8 §15 (schema), CR §4.3 (PRICING), SI §2.1 (check_quality_improvement deferred action)"
  io_profile: "db-write"
version: "2.0"
generated: 2026-02-25
last_updated: 2026-02-25T00:00:00
---

# CS-WORK-066: Commercial schema and pricing configuration

## Context

Foundation work item for S8. Creates 3 new tables (`commercial_state`, `churn_analysis_log`, `sponsored_impressions`), the `PRICING` const export, and migration. No pgEnums — S8 uses text with Zod validation for log event types (matching S7 pattern for operations log tables). No table amendments — S8 reads extensively from `listings`, `accounts`, `engagements`, and `quality_scores` but modifies none.

An existing `src/domains/commercial/subscription/pricing.ts` already exists (from S4). Consolidate — either extend that file with the `Record<SubscriptionTier, { annual: number; monthly: number }>` shape or replace it. Do not create a parallel pricing module. The const is the authoritative mapping from `SubscriptionTier` to annual/monthly GBP values. All S8 work items depend on both the schema and `PRICING` being available.

AC-62 tests that `effectivePriceAtSubscription` captures the actual price paid (including launch discounts), not the standard rate. This field is written by the `subscription_tier_changed` consumer (CS-WORK-073) — AC-62 is verified there but the schema column is created here.

**Type alignment notes:**
- `check_quality_improvement` already exists in `DeferredActionParamsMap` (`src/lib/scheduler/types.ts` line 29) with `{ listingId: UUID; baselineScore: number }`. No addition needed.
- `win_back_evaluation` already exists in `DeferredActionParamsMap` (line 17). No addition needed.
- `churn_analysis_log.accountId` has NO FK constraint — soft reference for GDPR erasure compatibility.
- `sponsored_impressions.serviceAreaId` FK references `taxonomy_service_areas.id` with no onDelete cascade.

## Deliverables

- [ ] `src/db/schema/commercial.ts` — 3 new tables: `commercialState`, `churnAnalysisLog`, `sponsoredImpressions` with indexes per `00-schema.md`
- [ ] `drizzle/` — Migration for 3 new tables + indexes
- [ ] `src/domains/commercial/pricing-config.ts` — `PRICING` const typed as `Record<SubscriptionTier, { annual: number; monthly: number }>`
- [ ] `src/domains/commercial/pricing-config.test.ts` — Unit tests for AC-60, AC-61, AC-63
- [ ] `src/db/test-utils.ts` — Add `commercial_state`, `churn_analysis_log`, `sponsored_impressions` to `TRUNCATE_ALL_TABLES_SQL` and `DELETE_ALL_TABLES_SQL`

## References

- `3-requirements/slices/slice-08-commercial/00-schema.md` — 3 new tables, schema details, cumulative snapshot
- `3-requirements/slices/slice-08-commercial/05-support-sections.md` §9 — PRICING configuration
- `3-requirements/interfaces/commercial-and-revenue.md` §4.3 — PRICING type
