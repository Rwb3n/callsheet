---
id: CS-WORK-117
title: Subscription and analytics pages
chapter: CH-CS-021
arc: presentation-e2
epoch: CS-E2
status: done
closed: 2026-03-30
effort: small
blocked_by: []
acceptance_criteria:
  - id: AC-1
    description: "Subscription page shows tier, renewal date, grace period warning, upgrade CTA"
    test_type: manual
  - id: AC-2
    description: "Subscription page wired to subscription.getSubscriptionStatus"
    test_type: manual
  - id: AC-3
    description: "Analytics page shows stat cards (views, appearances, enquiries, quality)"
    test_type: manual
  - id: AC-4
    description: "Analytics page wired to dashboard.getListingDashboard"
    test_type: manual
  - id: AC-5
    description: "Tier-locked upgrade CTA for free tier"
    test_type: manual
---
# CS-WORK-117: Subscription and analytics pages
## Deliverables
- [x] `src/app/dashboard/listings/[listingId]/subscription/page.tsx` — tier, billing, grace period, upgrade CTA
- [x] `src/app/dashboard/listings/[listingId]/analytics/page.tsx` — stat cards, quality score, decay warning, tier gate
