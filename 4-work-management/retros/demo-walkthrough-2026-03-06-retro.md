---
triaged: true
status: active
---

# Retro: Demo Walkthrough Session — 2026-03-06

**Date:** 2026-03-06
**Scope:** First stakeholder demo dry-run. Journeys 1 (Buyer) and 2 (Provider) completed. Journey 3 (Admin) started — overview visible, sidebar sections not yet walked through. Uncovered presentation layer gaps and one logic fix.

---

## 1 — Reflection

| Prompt | Notes |
|--------|-------|
| **What surprised you?** | The number of dashboard pages that were placeholder shells rather than live-wired components. Shortlists, searches, and listing detail all had spec text instead of data. The API routes are fully tested (1,447 tests) but the UI pages were never connected. This gap wasn't visible from the tracker — all ACs passed because they test the API, not the rendered page. |
| **What went well?** | Wiring the pages was fast (minutes each) because the tRPC routes, types, and components (Card, Badge, Skeleton) already existed. The resolveProfileCTA logic fix was clean — 3 lines changed, 2 tests updated, 29/29 passing. Chrome DevTools MCP was effective for inspecting page state without switching windows. |
| **Could have gone better?** | Integration tests truncate all tables via `resetDb()`. Running tests after seeding wipes demo data. Had to re-seed twice during the session. Demo seed should be run after all test runs, or the dev workflow needs a "demo mode" that skips truncation. Also: sign-out doesn't reliably clear the session (RSC caching), and admin panel has no link from the user dashboard. |
| **Keep doing** | Using Chrome DevTools MCP to inspect and drive the browser during demos. Taking snapshot before investigating issues. |
| **Stop doing** | Running integration tests mid-demo-prep without re-seeding after. |
| **Start doing** | A pre-demo checklist: seed, verify login, verify search results, verify admin access — before starting the walkthrough. |
| **Skill amendment?** | N/A — demo prep is not a recurring skill pipeline. |

---

## 2 — Classification

| # | Item | Bucket | Detail |
|---|------|--------|--------|
| 1 | Dashboard pages were placeholder shells (shortlists, searches, listing detail) | Bug | API tested, UI not wired. Wired during session. |
| 2 | `resolveProfileCTA` — unclaimed listings with website/phone showed "Contact Provider" instead of claim CTA | Upgrade | Claim CTA should always take priority for unclaimed listings. Fixed: removed contact fallback branch. |
| 3 | Integration tests truncate demo seed data | Bug | `resetDb()` wipes all tables. Demo seed must run after tests, not before. |
| 4 | Sign-out doesn't clear RSC-cached session in header | Bug | Server component reads session at render time. After sign-out + redirect, cached RSC may still show "Dashboard" instead of "Sign In". |
| 5 | No admin link from user dashboard | Feature request | Admin users see the same dashboard as regular users. No way to discover `/admin` without direct URL. |
| 6 | Login as admin redirects to `/dashboard` not `/admin` | Feature request | Post-login redirect should be role-aware: admin users go to `/admin`, regular users go to `/dashboard`. |
| 7 | Enquiry sent → click through shows listing profile, not enquiry thread | Feature request | No conversation/thread UI exists. V1 is email-based. In-platform messaging is V2. |
| 8 | Listing detail page duplicates overview card data | Upgrade | Needs enquiry inbox, edit capability, analytics trends, quality breakdown to justify its own page. |
| 9 | Northlight Post needed contactEmail + websiteUrl removed for claim CTA to show | Bug | Demo seed had contact info on the only unclaimed listing. Fixed in seed. |
| 10 | Chrome DevTools MCP effective for page inspection | Feature | Snapshot + network request inspection worked well for debugging. |

---

## 3 — Action Register

| # | Item | Priority | Status | Owner | Definition of Done |
|---|------|----------|--------|-------|--------------------|
| 1 | Add pre-demo checklist to DEMO-SCRIPT.md (seed order, login verification, search check) | next | open | Engineer | DEMO-SCRIPT.md has a "Pre-Demo Setup" section with ordered steps. |
| 2 | Add admin link to dashboard sidebar for admin-role users | next | open | Platform | Dashboard sidebar shows "Admin Panel" link when `session.role` starts with "admin". |
| 3 | Role-aware post-login redirect (admin → /admin, user → /dashboard) | next | open | Platform | Login page checks role after auth and redirects accordingly. |
| 4 | Fix sign-out RSC cache invalidation | next | open | Platform | After sign-out, full page reload clears server component session cache. Header shows "Sign In". |
| 5 | Wire remaining admin sub-pages for demo (support, billing, compliance, flows, events, health) — verify they show live data | next | open | Engineer | All 7 admin sidebar pages render seeded data, not placeholder text. |
| 6 | Document "run integration tests before demo seed, not after" in dev workflow | later | open | Engineer | README or DEMO-SCRIPT.md notes the ordering requirement. |
| 7 | In-platform enquiry conversation thread (V2) | later | open | Platform | Buyer can see provider responses in-platform, not just email. |
