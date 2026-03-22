---
template: work_item
id: CS-WORK-044
title: "Implement analytics display and quality score panel"
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
priority: high
effort: large
traces_to:
  - REQ-CS-PROV-002
source_files:
  - D:/PROJECTS/callsheet/3-requirements/slices/slice-05-provider-experience.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/platform-and-product.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/data-and-listings.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/commercial-and-revenue.md
acceptance_criteria:
  - "AC-6: Free-tier listing shows all-time totals only — no trend chart, no search terms"
  - "AC-7: Standard-tier listing shows 30-day trend chart and top search terms (renders placeholder until S9 data available)"
  - "AC-8: Premium-tier listing shows 90-day trends, viewer demographics, competitor benchmarking, enquiry response insights (renders placeholder until S9 data available)"
  - "AC-9: Analytics period selector on standard tier clamps to 30d maximum (requesting 90d returns 30d data)"
  - "AC-10: getListingAnalytics query returns data within <200ms p95"
  - "AC-11: Locked analytics sections show upgrade CTA linking to pricing page"
  - "AC-12: Quality score panel displays composite score and 5-dimension breakdown from QualityScoreExplanation"
  - "AC-13: Top 3 improvements link to corresponding profile editor sections"
  - "AC-14: Decay warning banner displays for listings with decay_signal_detected (high/critical severity) and clears when freshness improves"
  - "AC-15: /quality-methodology page renders as static SSG"
blocked_by: [CS-WORK-043]
blocks: []
enables: []
queue_position: done
cycle_phase: done
node_history:
  - node: backlog
    entered: 2026-02-24T00:00:00
    exited: 2026-02-24T00:00:00
  - node: done
    entered: 2026-02-24T00:00:00
    exited: null
artifacts:
  - src/domains/platform/dashboard/map-analytics.ts
  - src/domains/platform/dashboard/__tests__/map-analytics.test.ts
  - src/server/routers/dashboard.ts
  - src/server/routers/__tests__/dashboard-analytics.integration.test.ts
  - src/app/dashboard/listings/[listingId]/page.tsx
  - src/app/dashboard/listings/[listingId]/analytics/page.tsx
  - src/app/quality-methodology/page.tsx
cycle_docs: {}
memory_refs: []
extensions:
  project: CALLSHEET
  slice: S5
  spec_sections: "PP §2 (getListingAnalytics), D&L §4 (QualityScoreExplanation), CR §4.1 (TIER_LIMITS)"
version: "2.0"
generated: 2026-02-24
last_updated: 2026-02-24T00:00:00
---

# CS-WORK-044: Implement analytics display and quality score panel

## Context

Tier-gated analytics display and quality score transparency — the primary paid-tier differentiator. `mapAnalyticsToUI` renders different data depth per tier: free gets all-time totals only, standard adds 30d trends + search terms, premium adds 90d + demographics + benchmarking + enquiry insights. S9 data fields (search terms, viewer demographics, competitor benchmarking) render `null` placeholders until S9 populates them. Quality score panel reads `QualityScoreExplanation` from D&L (zero-initialised by S1, calibrated by S9). Decay warning banner consumes existing `decay_signal_detected` notification. `/quality-methodology` is a static SSG page.

**Type alignment:** `FeatureAccess` at `src/domains/commercial/subscription/feature-access.ts` includes `trendAnalytics`, `topSearchTerms`, `viewerDemographics`, `competitorBenchmarking`, `enquiryResponseInsights` fields from `TierLimits`. `quality_score_explanations` table exists in `src/db/schema/data-and-listings.ts`. `comparePeriods` is new — pure utility function.

## Deliverables

- [x] `src/app/dashboard/listings/[listingId]/page.tsx` — Listing detail: analytics + quality + enquiry summary
- [x] `src/app/dashboard/listings/[listingId]/analytics/page.tsx` — Full analytics view (tier-gated)
- [x] `src/app/quality-methodology/page.tsx` — Static SSG methodology page
- [x] `src/domains/platform/dashboard/map-analytics.ts` — `mapAnalyticsToUI` pure function + `comparePeriods`
- [x] `src/server/routers/dashboard.ts` — Extend with `getListingDashboard` and `getQualityExplanation` queries
- [x] `src/domains/platform/dashboard/__tests__/map-analytics.test.ts` — Unit tests for tier gating logic (19 tests)
- [x] `src/server/routers/__tests__/dashboard-analytics.integration.test.ts` — Integration tests for AC-6 through AC-14 (19 tests)

## References

- `3-requirements/slices/slice-05-provider-experience.md` §3 Analytics Display, §4 Quality Score Transparency
- `3-requirements/interfaces/platform-and-product.md` §2 (getListingAnalytics)
- `3-requirements/interfaces/data-and-listings.md` §4 (QualityScoreExplanation)
- `3-requirements/interfaces/commercial-and-revenue.md` §4.1 (TIER_LIMITS)
