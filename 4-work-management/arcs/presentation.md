---
id: presentation
epoch: CS-E1
status: Complete
depends: null
chapters: [CH-CS-014]
---

# Arc: Presentation Layer

## Mission

Make the existing 6 slices of verified backend code (S0–S6, 351 AC, 939 tests, 18 routers) reachable from a browser. This is a horizontal cut across S0–S6 output — not a new vertical slice. It resolves PP-Q1 (component library), wires the tRPC API surface to HTTP, creates the tRPC client, and retrofits the buyer journey pages with real data binding and UI.

## Why Now

The build has completed 351/693 AC with zero visible output. Dashboard pages are structural placeholders. The tRPC API route handler does not exist — no browser can reach the 18 routers. The project has no mechanism to produce a demo because "demo-able" is not a tracked property of any artifact. This arc closes that gap before the slice sequence resumes at S7.

## Scope

- tRPC API route handler (the server's HTTP door)
- tRPC React client (the browser's connection to it)
- PP-Q1 resolution (component library + design tokens)
- Application shell (header, navigation, dashboard sidebar)
- Buyer journey retrofit: search → provider profile → enquiry → dashboard
- Production services factory (DI wiring for the API route)
- Event bus singleton (unblocks `emitProfileViewed` stub from CS-WORK-051)
- Production environment manifest (`.env.production.example`)

## Not in Scope

- Retrofitting ALL 13 pages (only the buyer journey demo path)
- Admin UI (S7 scope)
- Full design system / component library documentation
- Production deployment to Vercel (requires principal action in `5-launch-readiness/`)
- Any new schema, events, or routes — this arc consumes existing backend, does not extend it

## Exit Criteria

- [ ] `GET /api/trpc/*` and `POST /api/trpc/*` return valid tRPC responses
- [ ] Browser can execute `trpc.search.query()` via React hooks and render results
- [ ] PP-Q1 resolved — component library chosen and installed
- [ ] Dashboard layout has header, navigation, and sidebar
- [ ] `/search` page renders ranked results with facets from real tRPC queries
- [ ] `/providers/[slug]` page has styled layout (already has data binding)
- [ ] `/dashboard` overview renders listing cards from `dashboard.getOverview`
- [ ] `/dashboard/enquiries-sent` renders enquiry list with status indicators from `enquiry.listSent`
- [ ] `.env.production.example` documents all required environment variables
- [ ] `emitProfileViewed` wired to production event bus singleton (no longer a no-op)
- [ ] All existing 939 tests still pass, 0 type errors
