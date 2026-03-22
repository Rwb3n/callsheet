---
template: work_item
id: CS-WORK-051
title: "Implement listing profile page and contact feedback"
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
priority: critical
effort: large
traces_to:
  - REQ-CS-BUYER-002
source_files:
  - D:/PROJECTS/callsheet/3-requirements/slices/slice-06-buyer-experience/index.md
  - D:/PROJECTS/callsheet/3-requirements/slices/slice-06-buyer-experience/02-listing-profile.md
  - D:/PROJECTS/callsheet/3-requirements/slices/slice-06-buyer-experience/00-router-plan.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/platform-and-product.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/data-and-listings.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/shared-infrastructure.md
acceptance_criteria:
  - "AC-11: Profile page renders via SSG+ISR with 15-minute revalidation; on-demand revalidation fires for claim_approved, listing_suspended, listing_archived, listing_reactivated, erasure_completed, verification_tier_changed"
  - "AC-12: Profile returns 404 for non-existent slugs, archived listings, suspended listings, and erased listings"
  - "AC-13: CTA renders as Send Enquiry for claimed/verified/premium_verified; Send Enquiry (forwarded) for unclaimed+email; Contact Provider with feedback buttons for unclaimed without email; Send Enquiry for disputed (no dispute exposure)"
  - "AC-14: Targeted claim CTA shown when authenticated user's email domain matches listing website domain [PP-18]"
  - "AC-15: Verification badge displays correct tier icon; no badge for unclaimed; quality score displayed only for verified and premium_verified"
  - "AC-16: Media gallery renders thumbnail grid; clicking opens lightbox with full-size image; images filtered by type = portfolio"
  - "AC-17: JSON-LD script tag present with LocalBusiness for companies and Person for freelancers; SEO meta tags include title, description, og:image, canonical URL"
  - "AC-18: profile_viewed event emitted server-side with P1-compliant payload (listingId, source, timestamp); NOT emitted during build-time static generation"
  - "AC-19: inferSource maps referer to search, shortlist, or direct correctly"
  - "AC-42: Feedback buttons visible only on unclaimed listings without contactEmail that have phone or website; not visible on claimed/disputed/unclaimed+email listings"
  - "AC-43: contact_attempt event emitted with exact ContactAttemptEvent payload (listingId, result, reporterAccountId?, timestamp); anonymous users emit with reporterAccountId: null"
  - "AC-44: Rate limit: 1 report per user (or IP) per listing per 24 hours; buttons disabled after click with confirmation message"
blocked_by: []
blocks: [CS-WORK-055]
enables: [CS-WORK-052]
queue_position: backlog
cycle_phase: backlog
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
  spec_sections: "PP §1.2 (profile_viewed), PP §1.8 (contact_attempt), PP §3 (profile page), SI §7 (ISR), D&L §3.1 (engagement counters)"
version: "2.0"
generated: 2026-02-24
last_updated: 2026-02-24T00:00:00
---

# CS-WORK-051: Implement listing profile page and contact feedback

## Context

Public-facing listing profile page rendered via SSG+ISR (15-minute revalidation). Consumes S1's `listing.getBySlug` for data. Renders verification badges, quality score, media gallery, taxonomy tags, JSON-LD structured data, and a CTA that varies by claim status (4 branches). On-demand revalidation fires for 6 lifecycle events via `revalidatePath`. `profile_viewed` event emitted server-side (not during build-time generation). Contact attempt feedback (AC-42–44) is on the same page surface — "I reached them" / "I couldn't reach them" buttons for unclaimed listings without email. `listing.reportContactAttempt` added to the existing listing router.

**Type alignment:** `EventPayloadMap` has `ProfileViewedEvent` with `viewerAccountId` field (added S9-ST-2) — S6 sets `viewerAccountId` to `ctx.session?.accountId ?? null`. `ContactAttemptEvent` stub exists — S6 populates. `inferSource` is a new pure function. `getEngagementCounters` (D&L §3.1) returns zero-initialised counters for unclaimed listings (S6-ST-11).

## Deliverables

- [x] `src/app/providers/[slug]/page.tsx` — SSG+ISR profile page (server component)
- [x] `src/app/providers/[slug]/data.ts` — Profile data loading from DB
- [x] `src/app/providers/[slug]/emit.ts` — Profile viewed emission (stub, wired at API route creation)
- [x] `src/domains/platform/buyer/infer-source.ts` — `inferSource(referer)` pure function
- [x] `src/domains/platform/buyer/__tests__/infer-source.test.ts` — Unit tests for AC-19 (10 tests)
- [x] `src/domains/platform/buyer/resolve-profile-cta.ts` — `resolveProfileCTA(listing, session)` pure function
- [x] `src/domains/platform/buyer/generate-json-ld.ts` — `generateJsonLd(listing)` for LocalBusiness/Person
- [x] `src/server/routers/listing.ts` — Add `reportContactAttempt` procedure
- [x] `src/server/routers/__tests__/listing-profile.integration.test.ts` — Integration tests (29 tests)
- [x] `src/lib/events/types.ts` — ProfileViewedEvent + ContactAttemptEvent field updates

## References

- `3-requirements/slices/slice-06-buyer-experience/02-listing-profile.md` §2 Listing Profile Page, §7 Contact Attempt Feedback
- `3-requirements/slices/slice-06-buyer-experience/00-router-plan.md` §2.5 listing router amendments, §2.6 non-route features
- `3-requirements/interfaces/platform-and-product.md` §1.2 (profile_viewed), §1.8 (contact_attempt), §3 (profile page)
- `3-requirements/interfaces/shared-infrastructure.md` §7 (ISR revalidation)
- `3-requirements/interfaces/data-and-listings.md` §3.1 (getEngagementCounters)
