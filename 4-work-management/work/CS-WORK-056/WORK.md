---
template: work_item
id: CS-WORK-056
title: "Implement cross-role nudge and feature gating display"
type: feature
status: done
owner: null
created: 2026-02-24
spawned_by: null
spawned_children: []
chapter: CH-CS-008
arc: buyer-and-operations
epoch: CS-E1
closed: 2026-02-25
priority: medium
effort: small
traces_to:
  - REQ-CS-BUYER-007
source_files:
  - D:/PROJECTS/callsheet/3-requirements/slices/slice-06-buyer-experience/index.md
  - D:/PROJECTS/callsheet/3-requirements/slices/slice-06-buyer-experience/05-crossrole-gating.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/commercial-and-revenue.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/platform-and-product.md
acceptance_criteria:
  - "AC-45: evaluateCrossRoleNudge returns category_concentration nudge when account has 5+ searches in same service area within 30 days and 0 listings"
  - "AC-46: evaluateCrossRoleNudge returns engagement_threshold nudge when account has 20+ searches, 0 listings, and account older than 14 days; category concentration takes priority over engagement threshold"
  - "AC-47: evaluateCrossRoleNudge returns null when account has any listing (including archived)"
  - "AC-48: Nudge banner does not render when localStorage dismissal is within 90 days; dismiss writes timestamp and removes banner; CTA links to /dashboard/listings/create"
  - "AC-49: Claimed listing profile page shows phone, email, website, social links regardless of subscription tier (free through partner) [PP-5]"
  - "AC-50: Engagement stats (profile views, enquiries received) hidden on buyer-facing profile page for free-tier listings; visible for standard/premium/partner"
  - "AC-51: Search result cards display identical fields regardless of listing tier; isSponsored is the only tier-derived display attribute; computeFeatureAccess and mapFeatureAccessToUI imported, not redefined (P4)"
  - "AC-52: Upgrade CTA on free-tier listing profile visible only to the listing's own account, not to other buyers; Claim this listing CTA appears on unclaimed profiles; media/credit display respects tier limits"
blocked_by: [CS-WORK-050]
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
  slice: S6
  spec_sections: "PP §7.3 (cross-role nudge), CR §4.1 (TierLimits/FeatureAccess), CR §4.2 (computeFeatureAccess)"
version: "2.0"
generated: 2026-02-24
last_updated: 2026-02-25T00:00:00
---

# CS-WORK-056: Implement cross-role nudge and feature gating display

## Context

Two distinct features grouped by their shared dependency on search history and feature access infrastructure. `evaluateCrossRoleNudge` is a pure client-side function that detects buyer-only accounts with concentrated search patterns (5+ searches in same service area within 30 days → `category_concentration`, or 20+ total searches + account >14 days → `engagement_threshold`). Returns `null` if account has any listing. Dismissal is localStorage-only (90-day expiry). Feature gating display (AC-49–52) applies `computeFeatureAccess` and `mapFeatureAccessToUI` (both imported from CR/S5, not redefined — P4 compliance) to buyer-facing surfaces: contact details always visible on claimed listings (PP-5), engagement stats gated by `buyerVisibleEngagementStats` (S6-ST-2), upgrade CTA visible only to listing owner, search cards show identical fields regardless of tier.

**Type alignment:** `computeFeatureAccess` at `src/domains/commercial/subscription/feature-access.ts`. `mapFeatureAccessToUI` at `src/domains/platform/dashboard/map-feature-access-to-ui.ts` (CS-WORK-049). `buyerVisibleEngagementStats` field exists in `TierLimits` (added by S6-ST-2 fix to CR §4.1). `evaluateCrossRoleNudge` is a new pure function — no tRPC route, no server state.

## Deliverables

- [x] `src/domains/platform/buyer/cross-role-nudge.ts` — `evaluateCrossRoleNudge(searchHistory, listingCount, accountAge)` pure function (AC-45/46/47)
- [x] `src/domains/platform/buyer/__tests__/evaluate-cross-role-nudge.test.ts` — 13 unit tests for AC-45, AC-46, AC-47
- [x] `src/domains/platform/buyer/nudge-storage.ts` — localStorage helpers for nudge dismissal (AC-48)
- [x] `src/domains/platform/buyer/nudge-banner.tsx` — Client component with localStorage dismissal (AC-48)
- [x] `src/domains/platform/buyer/profile-display.ts` — `resolveContactDisplay`, `shouldShowEngagementStats`, `resolveUpgradeCTA`, `getProfileMediaLimits` (AC-49/50/52)
- [x] `src/domains/platform/buyer/__tests__/feature-gating-display.test.ts` — 24 tests for AC-49, AC-50, AC-51, AC-52

## References

- `3-requirements/slices/slice-06-buyer-experience/05-crossrole-gating.md` §8 Cross-Role Nudge, §9 Feature Gating
- `3-requirements/interfaces/commercial-and-revenue.md` §4.1 (TierLimits, buyerVisibleEngagementStats), §4.2 (computeFeatureAccess)
- `3-requirements/interfaces/platform-and-product.md` §7.3 (cross-role nudge)
