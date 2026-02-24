# Slice 6: Buyer Experience

**Status:** Draft v1
**Primary Owner:** Platform & Product
**Last updated:** 2026-02-14
**Dependencies:** S0 (event bus, scheduler, auth, email transport, notifications, service abstraction, tRPC, decision logging), S1 (Listing schema, Account schema, engagement counters, search index, taxonomy, shortlists, enquiry_records, search_history stub), S2 (onboarding flow, profile strength meter, anonymous enquiry handling), S4 (subscriptions, feature gating middleware, computeFeatureAccess, TIER_LIMITS)
**Inputs:** `interfaces/shared-infrastructure.md` (v5), `interfaces/platform-and-product.md` (v5), `interfaces/data-and-listings.md` (v4), `interfaces/operations.md` (v3), `interfaces/commercial-and-revenue.md` (v2), `2-concept-design/platform-and-product.md` (v5 §2, §3, §5, §6, §7), `2-concept-design/data-and-listings.md` (v6 §1, §3), `2-concept-design/commercial-and-revenue.md` (v4 §4), `slices/slice-01-data-model.md` (v2), `slices/slice-02-onboarding.md` (v2), `slices/slice-04-subscriptions.md` (v2), `slices/slice-05-provider-experience.md` (v2)
**Downstream:** S8 (Commercial — conversion triggers, sponsored placement display), S9 (Entity Intelligence — search analytics, quality scoring data from profile_viewed/search_performed events)

---

## Summary

{SUMMARY — Phase 3 assembler writes this}

## V1 Scope Boundary

{SCOPE BOUNDARY — Phase 3 assembler writes this}

---

## 1. Search Implementation

{CONTENT — Phase 2 agent writes this}

---

## 2. Listing Profile Page

{CONTENT — Phase 2 agent writes this}

---

## 3. Enquiry Submission

{CONTENT — Phase 2 agent writes this}

---

## 4. Shortlist Management

{CONTENT — Phase 2 agent writes this}

---

## 5. Saved Searches & Search History

{CONTENT — Phase 2 agent writes this}

---

## 6. Buyer Dashboard

{CONTENT — Phase 2 agent writes this}

---

## 7. Contact Attempt Feedback

{CONTENT — Phase 2 agent writes this}

---

## 8. Cross-Role Nudge

{CONTENT — Phase 2 agent writes this}

---

## 9. Feature Gating & Tier-Restricted Display

{CONTENT — Phase 2 agent writes this}

---

## 10. Event Consumers Registered in S6

| Event | Consumer Domain | Mode | Handler Description | New? |
|-------|----------------|------|---------------------|------|
| {Phase 3 populates} | | | | |

## 11. Deferred Actions Registered in S6

| Action | Params | Handler | Schedule | New? |
|--------|--------|---------|----------|------|
| {Phase 3 populates} | | | | |

## 12. Email Templates Triggered by S6

| Template ID | Trigger | Category | New? |
|-------------|---------|----------|------|
| {Phase 3 populates} | | | |

## 13. Notification Types Used in S6

| Type | Trigger | New? |
|------|---------|------|
| {Phase 3 populates} | | |

## 14. Schema Additions

{Phase 3 populates}

## 15. Upstream Flag Resolutions

| Flag | Source | Resolution |
|------|--------|-----------|
| {Phase 3 populates} | | |

## 16. Downstream Flags

| # | Flag | Target Slice | Source |
|---|------|-------------|--------|
| {Phase 3 populates} | | | |

## 17. Open Question Resolutions

| # | Question | Resolution |
|---|----------|-----------|
| {Phase 3 populates} | | |

## 18. Acceptance Criteria

| # | Criterion | Test |
|---|-----------|------|
| {Phase 3 populates} | | |

**Total: {N} acceptance criteria.**

## 19. Stress Test Resolution Log

{Empty in v1. Populated by stress test + fix-applier skill.}

---

## Cross-References

| Document | Relationship |
|----------|-------------|
| {Phase 3 populates} | |
