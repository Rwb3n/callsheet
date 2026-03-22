---
template: work_item
id: CS-WORK-078
title: "Analytics pipeline and feature gating"
type: feature
status: done
owner: null
created: 2026-03-06
spawned_by: null
spawned_children: []
chapter: CH-CS-011
arc: commercial-and-intelligence
epoch: CS-E1
closed: 2026-03-07
priority: high
effort: large
traces_to:
  - REQ-CS-INTEL-004
source_files:
  - D:/PROJECTS/callsheet/3-requirements/slices/slice-09-entity-intelligence/03-analytics-pipeline.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/data-and-listings.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/commercial-and-revenue.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/platform-and-product.md
acceptance_criteria:
  - "AC-37: search_performed consumer writes per-listing search term frequency to perception_aggregates with aggregateType search_terms and JSONB matching SearchTermsData"
  - "AC-38: Zero-result queries written to zero_result_queries and appended to global search_terms aggregate zeroResultTerms"
  - "AC-39: Taxonomy gap identification produces UnmatchedTerm[] for zero-result terms with frequency >= 3 not matching existing taxonomy"
  - "AC-40: perception_aggregates viewer_demographics JSONB matches ViewerDemographicsData shape with pct values summing to 1.0 per bucket"
  - "AC-41: Viewer demographics aggregation consumes only deduplicated profile_viewed events"
  - "AC-42: computeCompetitorBenchmark uses TaxonomyTag[] arrays with >= 2 service area overlap threshold"
  - "AC-43: computeCompetitorBenchmark produces anonymised median comparison, returns insufficientData true when fewer than 3 competitors"
  - "AC-44: Competitor benchmark fetches engagement counters and quality scores in batch queries"
  - "AC-45: Competitor benchmark cached in perception_aggregates with 7-day TTL"
  - "AC-46: computeFeatureAccess(tier).competitorBenchmarking returns false for free and standard tiers"
  - "AC-47: computeFeatureAccess(tier).viewerDemographics returns false for free and standard tiers"
  - "AC-48: computeFeatureAccess(tier).topSearchTerms returns true for standard, premium, and partner tiers"
  - "AC-49: computeFeatureAccess(tier).enquiryResponseInsights returns false for free and standard tiers"
  - "AC-50: perception_aggregates search_terms JSONB matches SearchTermsData shape"
  - "AC-51: perception_aggregates competitor_benchmarking JSONB matches CompetitorBenchmark shape"
  - "AC-52: perception_aggregates enquiry_response JSONB matches EnquiryResponseInsights shape"
  - "AC-53: computeEnquiryResponseInsights computes responseRate and medianResponseTimeHours, returns null when no responses"
  - "AC-54: computeTaxonomySuggestions returns data-driven service area suggestions from co-occurrence, empty array when fewer than 10 listings"
blocked_by: [CS-WORK-075, CS-WORK-076]
blocks: []
enables: [CS-WORK-079]
queue_position: done
cycle_phase: done
node_history:
  - node: backlog
    entered: 2026-03-06T00:00:00
    exited: 2026-03-07T00:00:00
  - node: done
    entered: 2026-03-07T00:00:00
    exited: null
artifacts:
  - src/domains/data-and-listings/analytics/types.ts
  - src/domains/data-and-listings/analytics/search-terms.ts
  - src/domains/data-and-listings/analytics/viewer-demographics.ts
  - src/domains/data-and-listings/analytics/competitor-benchmark.ts
  - src/domains/data-and-listings/analytics/enquiry-response.ts
  - src/domains/data-and-listings/analytics/taxonomy-suggestions.ts
  - src/lib/events/types.ts
cycle_docs: {}
memory_refs: []
extensions:
  project: CALLSHEET
  slice: S9
  spec_sections: "S9 §3 (analytics pipeline), D&L §3.1 (computeTaxonomyOverlap), D&L §3.2 (getEngagementCounters), CR §4.1 (TierLimits/FeatureAccess)"
  io_profile: "db-read-write"
version: "2.0"
generated: 2026-03-06
last_updated: 2026-03-06T00:00:00
---

# CS-WORK-078: Analytics pipeline and feature gating

## Context

Implements the analytics aggregation pipeline that computes perception aggregates from event data. Four aggregate types: `search_terms` (search term frequency, zero-result detection, taxonomy gap identification), `viewer_demographics` (entity type, sector, location distribution from deduplicated `profile_viewed` events), `competitor_benchmarking` (anonymised median comparison via taxonomy overlap, 7-day cache TTL, premium-only), `enquiry_response` (response rate, median response time, conversion estimates). Feature access gating: competitor benchmarking and viewer demographics are premium-only, top search terms are standard+, enquiry response insights are premium+.

Depends on CS-WORK-076 for `profile_viewed` deduplication logic. The analytics pipeline consumes deduplicated events — dedup happens before demographics bucketing.

`computeTaxonomySuggestions` provides data-driven service area suggestions from listing taxonomy co-occurrence analysis, consumed by S2 onboarding flow.

**Type alignment notes:**
- `computeTaxonomyOverlap` exists at `src/domains/data-and-listings/taxonomy/overlap.ts`.
- `getEngagementCounters` exists at `src/domains/data-and-listings/queries/engagement-counters.ts`.
- `computeFeatureAccess` exists at `src/domains/commercial/feature-gate-friction.ts` — extend with new gates.
- `zero_result_queries` table already exists in `data-and-listings.ts` schema.

## Deliverables

- [x] `src/domains/data-and-listings/analytics/search-terms.ts` — Search term aggregation, zero-result detection, taxonomy gap identification
- [x] `src/domains/data-and-listings/analytics/viewer-demographics.ts` — Viewer demographics bucketing (entity type, sector, region)
- [x] `src/domains/data-and-listings/analytics/competitor-benchmark.ts` — `computeCompetitorBenchmark` with taxonomy overlap, batch fetching, caching
- [x] `src/domains/data-and-listings/analytics/enquiry-response.ts` — `computeEnquiryResponseInsights`
- [x] `src/domains/data-and-listings/analytics/taxonomy-suggestions.ts` — `computeTaxonomySuggestions` co-occurrence analysis
- [x] `src/domains/data-and-listings/analytics/__tests__/search-terms.test.ts` — Unit tests for AC-50
- [x] `src/domains/data-and-listings/analytics/__tests__/viewer-demographics.test.ts` — Unit test for AC-40
- [x] `src/domains/data-and-listings/analytics/__tests__/competitor-benchmark.test.ts` — Unit tests for AC-42, AC-43, AC-44
- [x] `src/domains/data-and-listings/analytics/__tests__/enquiry-response.test.ts` — Unit tests for AC-52, AC-53
- [x] `src/domains/data-and-listings/analytics/__tests__/analytics.integration.test.ts` — Integration tests for AC-37, AC-38, AC-39, AC-41, AC-45, AC-46, AC-47, AC-48, AC-49, AC-54
- [x] `src/domains/commercial/subscription/__tests__/feature-access.test.ts` — AC-46/47/48/49 verification (pre-satisfied in TIER_LIMITS, tests added)

## References

- `3-requirements/slices/slice-09-entity-intelligence/03-analytics-pipeline.md` — Full §3 spec
- `3-requirements/interfaces/data-and-listings.md` §3.1 — `computeTaxonomyOverlap`
- `3-requirements/interfaces/data-and-listings.md` §3.2 — `getEngagementCounters`
- `3-requirements/interfaces/commercial-and-revenue.md` §4.1 — `TierLimits`/`FeatureAccess`
