---
id: CH-CS-014
title: Presentation Layer
arc: presentation
epoch: CS-E1
status: Complete
depends: null
work_items: []
---

# Chapter: Presentation Layer

## Problem

CALLSHEET has 18 tRPC routers, 351 verified acceptance criteria, and 939 passing tests. None of this is reachable from a browser. The tRPC API route handler does not exist. There is no tRPC client. 10 of 13 pages are structural placeholders. PP-Q1 (component library) has been deferred since S1. The system is correct but invisible.

This chapter makes the existing S0–S6 backend reachable and demo-able by wiring the API surface to HTTP, creating the client transport, resolving the component library decision, and retrofitting the buyer journey pages with real data binding and styled UI.

## Requirements

No requirements slice — this is a cross-cutting infrastructure chapter that consumes existing verified routes. AC are defined per work item below based on the gaps identified in the 2026-02-25 presentation layer audit.

### Layer 1: API Surface (must be first — everything else depends on it)

**W1: Production services factory and event bus singleton**

Wire the dependency injection bridge between Next.js request handling and the `AppServices` type that `createAppRouter` requires.

| AC | Description | Test Type |
|----|-------------|-----------|
| AC-01 | `createProductionAppServices()` returns a valid `AppServices` object with all 11 required fields | Integration |
| AC-02 | Event bus singleton (`getEventBus()`) returns the same `InProcessEventBus` instance on repeated calls | Integration |
| AC-03 | `emitProfileViewed` in `src/app/providers/[slug]/emit.ts` calls `getEventBus().emit()` with `ProfileViewedEvent` payload (no longer a no-op) | Integration |
| AC-04 | `onTRPCError` from `src/server/trpc.ts` is wired as the `onError` callback in the API route handler | Integration |

Key files: `src/lib/services/index.ts` (extend), `src/lib/events/singleton.ts` (create), `src/app/providers/[slug]/emit.ts` (update).

**W2: tRPC API route handler**

Create the HTTP endpoint that serves all 18 routers.

| AC | Description | Test Type |
|----|-------------|-----------|
| AC-05 | `POST /api/trpc/listing.search` returns valid tRPC response with listing results | E2E |
| AC-06 | `POST /api/trpc/enquiry.listSent` with valid auth session returns enquiry list | E2E |
| AC-07 | `POST /api/trpc/*` without auth session returns UNAUTHORIZED for protected procedures | E2E |
| AC-08 | `GET /api/trpc/taxonomy.getSectors` returns taxonomy data (public procedure, no auth) | E2E |
| AC-09 | tRPC batch requests (multiple procedures in one HTTP request) resolve correctly | E2E |

Key files: `src/app/api/trpc/[trpc]/route.ts` (create). Pattern reference: `src/app/api/auth/[...all]/route.ts`.

### Layer 2: Client Transport

**W3: tRPC React client and provider**

Create the client-side transport and wire it into the application root.

| AC | Description | Test Type |
|----|-------------|-----------|
| AC-10 | `trpc` React hooks export from `src/lib/trpc/client.ts` with `httpBatchLink` to `/api/trpc` | Unit |
| AC-11 | `TRPCProvider` wraps application in `src/app/layout.tsx` (QueryClientProvider + tRPC provider) | Manual |
| AC-12 | Client-side `trpc.taxonomy.getSectors.useQuery()` call returns sector data in a test page | E2E |

Key files: `src/lib/trpc/client.ts` (create), `src/app/providers.tsx` (create), `src/app/layout.tsx` (update).

### Layer 3: Design Foundation

**W4: PP-Q1 resolution — component library and design tokens**

Resolve the open question that has been deferred since S1. Install the component library, configure Tailwind theme, create base primitives.

| AC | Description | Test Type |
|----|-------------|-----------|
| AC-13 | Component library installed and configured (shadcn/ui or equivalent) | Manual |
| AC-14 | Tailwind theme extended with CALLSHEET colour palette, typography, spacing, border-radius tokens in `src/app/globals.css` (Tailwind v4 CSS-first config) | Manual |
| AC-15 | Base primitives available: Button, Card, Badge, Input, Select, Table, Skeleton (loading state) | Manual |

Key files: `src/app/globals.css` (update), `src/components/ui/*` (create).

**W5: Application shell — header, navigation, dashboard sidebar**

Create the layout chrome that frames all pages.

| AC | Description | Test Type |
|----|-------------|-----------|
| AC-16 | Root layout renders header with CALLSHEET branding, navigation links (Search, Pricing, Sign In/Dashboard), and auth-conditional display | Manual |
| AC-17 | Dashboard layout renders sidebar with navigation sections: Overview, Listings, Enquiries Sent, Shortlists, Searches, Notifications, Settings | Manual |
| AC-18 | Dashboard sidebar highlights current route | Manual |
| AC-19 | Mobile-responsive: header collapses to hamburger menu, sidebar collapses to drawer on screens < 768px | Manual |

Key files: `src/components/layout/header.tsx` (create), `src/components/layout/dashboard-sidebar.tsx` (create), `src/app/layout.tsx` (update), `src/app/dashboard/layout.tsx` (update).

### Layer 4: Buyer Journey Retrofit

Retrofit the minimum pages that demonstrate the end-to-end buyer journey: discover → evaluate → contact → track.

**W6: Search page**

| AC | Description | Test Type |
|----|-------------|-----------|
| AC-20 | `/search` page renders search input, submits query via `trpc.search.query`, displays ranked results as listing cards | E2E |
| AC-21 | Facet sidebar displays sector, service area, location, and verification tier counts from search response | Manual |
| AC-22 | Result cards show listing name, headline, entity type, base region, verification badge, quality score, and taxonomy tags | Manual |
| AC-23 | Sponsored results section renders above organic results (max 3) when present in response | Manual |
| AC-24 | Zero-result state displays suggestions from `zeroResultSuggestions` field | Manual |
| AC-25 | Search input supports autocomplete via `trpc.search.suggest` (debounced, min 2 chars) | Manual |

Key files: `src/app/search/page.tsx` (create). No new routes — consumes `search.query`, `search.suggest`.

**W7: Provider profile page styling**

The provider profile page (`/providers/[slug]`) already has full data binding (SSG+ISR, JSON-LD, metadata, verification badges, credits, gallery, CTA). It needs styling only.

| AC | Description | Test Type |
|----|-------------|-----------|
| AC-26 | Provider profile page renders with styled layout: identity section (name, headline, verification badge), bio, taxonomy tags, location, quality score, CTA, credits, media gallery | Manual |
| AC-27 | Verification badge renders tier-specific visual (claimed: checkmark, verified: shield, premium verified: star) | Manual |
| AC-28 | Media gallery renders images in responsive grid with lazy loading | Manual |
| AC-29 | Enquiry CTA button routes to enquiry form (or displays contact info for claimed listings) | Manual |

Key files: `src/app/providers/[slug]/page.tsx` (update — styling only, no data binding changes).

**W8: Dashboard overview and enquiries-sent pages**

Wire the two key dashboard pages that demonstrate the provider/buyer dual nature.

| AC | Description | Test Type |
|----|-------------|-----------|
| AC-30 | `/dashboard` renders listing overview cards from `trpc.dashboard.getOverview` with name, tier badge, verification badge, engagement totals, profile strength meter, and quality score | E2E |
| AC-31 | `/dashboard/enquiries-sent` renders enquiry list from `trpc.enquiry.listSent` with status indicators (grey=unread, green=responded, amber=stale), listing name, message preview, and timestamps | E2E |
| AC-32 | Dashboard overview shows empty state with CTA to create first listing when no listings exist | Manual |
| AC-33 | Both pages show loading skeletons during data fetch | Manual |

Key files: `src/app/dashboard/page.tsx` (update), `src/app/dashboard/enquiries-sent/page.tsx` (update).

### Layer 5: Production Configuration

**W9: Environment manifest and deployment config**

| AC | Description | Test Type |
|----|-------------|-----------|
| AC-34 | `.env.production.example` documents all required environment variables with descriptions, sources, and required/optional status | Manual |
| AC-35 | CI workflow includes Vercel deployment step on main branch (requires `VERCEL_TOKEN` secret) | Manual |

Key files: `.env.production.example` (create), `.github/workflows/ci.yml` (update).

## Work Items (Summary)

| ID | Title | AC | Priority | Effort | Blocked By |
|----|-------|----|----------|--------|------------|
| W1 | Production services factory + event bus singleton | 4 (AC-01–04) | critical | medium | — |
| W2 | tRPC API route handler | 5 (AC-05–09) | critical | small | W1 |
| W3 | tRPC React client and provider | 3 (AC-10–12) | critical | small | W2 |
| W4 | PP-Q1 resolution — component library + design tokens | 3 (AC-13–15) | high | medium | — |
| W5 | Application shell — header, nav, dashboard sidebar | 4 (AC-16–19) | high | medium | W3, W4 |
| W6 | Search page | 6 (AC-20–25) | high | large | W3, W4, W5 |
| W7 | Provider profile page styling | 4 (AC-26–29) | high | medium | W4 |
| W8 | Dashboard overview + enquiries-sent | 4 (AC-30–33) | high | medium | W3, W4, W5 |
| W9 | Environment manifest + deployment config | 2 (AC-34–35) | medium | small | — |

**Total: 9 work items, 35 AC.**

## Dependency Graph

```
W1 (Services + Bus, 4 AC)
  └──▶ W2 (API Route, 5 AC)
         └──▶ W3 (tRPC Client, 3 AC)
                └──▶ W5 (Shell, 4 AC) ← also depends on W4
                       ├──▶ W6 (Search Page, 6 AC)
                       └──▶ W8 (Dashboard Pages, 4 AC)

W4 (PP-Q1 + Design Tokens, 3 AC) ← independent entry point
  ├──▶ W5 (Shell, 4 AC) ← also depends on W3
  ├──▶ W7 (Profile Styling, 4 AC)
  └──▶ W6 (Search Page, 6 AC) ← also depends on W5

W9 (Env Manifest, 2 AC) ← fully independent
```

**Independent entry points:** 3 (W1, W4, W9).
**Longest chain:** W1 → W2 → W3 → W5 → W6 (depth 5).
**Parallelisation:** W4 and W9 can run in parallel with W1→W2. W7 can run in parallel with W5→W6 once W4 is done.

## Constraints

- **No new schema, events, or routes.** This chapter consumes existing backend. If a page needs data the backend doesn't provide, that's a gap to flag — not a reason to extend scope here.
- **Existing tests must keep passing.** The 939-test suite is the safety net. No existing integration test may break.
- **Tailwind v4 CSS-first config.** No `tailwind.config.ts` — Tailwind v4 uses `@theme` directive in CSS. Design tokens go in `src/app/globals.css`.
- **Server components by default.** Dashboard pages that need client interactivity (search input, form submission) use `"use client"` at the component level, not the page level. Data fetching stays in server components where possible.

## References

- `3-requirements/REQUIREMENTS-TRACKER.md` — PP-Q1 open question
- `src/server/root.ts` — `AppServices` type, `createAppRouter()`, 18 router wiring
- `src/server/trpc.ts` — `TRPCContext`, `onTRPCError`, procedure chain
- `src/lib/services/index.ts` — `createProductionServices()` (to be extended)
- `src/app/providers/[slug]/emit.ts` — no-op stub to be wired
- `src/lib/auth-instance.ts` — singleton pattern reference for event bus
- Presentation layer audit (2026-02-25) — gap inventory with line numbers
