# E2E Verification Workflow — Investigation Brief

**Domain:** Cross-Domain (Platform & Product, Operations, Shared Infrastructure)
**Status:** COMPLETE
**Last updated:** 2026-02-23
**Inputs:** `IMPLEMENTATION-TRACKER.md` (E2E Debt section), `shared-infrastructure.md` (v11 §4 auth, §5 email), `entity-architecture-frame.md` (v2 §Layer 2 perception), existing test harness (`vitest.config.integration.ts`, `src/db/test-utils.ts`)
**Downstream:** Post-investigation work item (Playwright API-only harness), S5 work item (Playwright browser mode), `IMPLEMENTATION-TRACKER.md` (E2E Debt reclassification)

---

## 1. Problem Statement

CALLSHEET has 7 acceptance criteria deferred to E2E verification. No E2E infrastructure exists. The count will grow — S4 adds Paddle webhooks, S6 adds buyer journey flows, S10 adds orchestrated erasure and closure. Every deferred AC is a verification gap the entity cannot close.

The deferred ACs are not homogeneous. They fall into distinct verification categories requiring different tooling: HTTP-level auth flows, build output inspection, environment smoke tests, CI meta-verification, and (future) webhook pipelines. Treating them as a single "E2E test" problem produces either over-engineering (full browser stack for auth cookie checks) or under-engineering (no coverage for categories that don't fit the chosen tool).

CALLSHEET is backend-first with no UI. The highest-value verification paths are HTTP endpoints and server-side processes, not browser interactions. Browser testing becomes relevant at S5 (Provider Experience) — the first slice with authenticated UI pages. Investing in browser infrastructure before S5 is premature.

---

## 2. Requirements Inventory

### 2.1 Current Deferred ACs

| AC | Description | Verification Category | What Exists | What's Missing |
|---|---|---|---|---|
| AC-21 | Signup + verification email sent | Auth flow | Auth config, email service tested | Better Auth signup flow against running DB |
| AC-22 | Login after verification | Auth flow | tRPC `protectedProcedure` tested | Better Auth login flow against running DB |
| AC-25 | Session persists across navigation | Auth flow | tRPC context injection tested | Browser session persistence across page navigations |
| S2-AC-02 | Email verification callback + browsable before verification | Auth flow | Better Auth `sendVerificationEmail` config, `email_verification` template registered | Verify-email callback page renders + token verification against DB |
| AC-35 | Homepage renders via SSG | Build output | ISR revalidation utility tested | `next build` + SSG output file verification |
| AC-42 | Production services init without error | Smoke test | `createTestServices()` tested | `createProductionServices()` with real env vars |
| AC-52 | GitHub Actions runs full pipeline | CI meta | CI config written | Actual GitHub Actions run on push |

### 2.2 Future ACs (Forecast)

| Slice | Verification Category | Expected ACs | Example |
|---|---|---|---|
| S4 (Subscriptions) | Webhook pipeline | 2–4 | Paddle checkout webhook → subscription created → feature gates applied |
| S5 (Provider Exp) | Auth flow + browser | 3–5 | Provider dashboard auth guard, listing edit saves, enquiry response |
| S6 (Buyer Exp) | Auth flow + browser | 2–4 | Search page renders, enquiry submission, shortlist persistence |
| S7 (Operations) | Orchestrated flow | 1–2 | Support triage pipeline end-to-end |
| S10 (Hardening) | Orchestrated flow | 2–3 | Account closure, GDPR erasure multi-step flow |

Forecast: 10–18 additional E2E ACs across S4–S10. Total E2E surface by project completion: ~25 ACs.

---

## 3. Verification Categories

Six categories, each with different tooling requirements. Not all require the same framework.

### 3.1 Auth Flow (AC-21, AC-22, AC-25, S2-AC-02)

HTTP endpoints + cookies + redirects. Better Auth exposes REST endpoints at `/api/auth/[...auth]`. Verification requires: POST to signup endpoint → check email service called → POST to login endpoint → receive session cookie → use cookie in subsequent requests → verify tRPC protected routes accept the session.

AC-25 (session persistence across navigation) is the only AC that strictly requires a browser. The rest are HTTP-level.

**Prerequisite:** Better Auth API route (`/api/auth/[...auth]`) does not exist yet. Route creation is a prerequisite work item, not part of the E2E harness.

### 3.2 Build Output (AC-35)

`next build` succeeds and produces SSG output for the homepage. Verification: run build → inspect `.next/server/app/index.html` (or equivalent output path). No browser needed — file existence check.

AC-35 is writable as a build output check but vacuous until the homepage component exists (S5/S6). The test can be scaffolded now; it becomes meaningful when the page is implemented.

### 3.3 Smoke Test (AC-42)

`createProductionServices()` initialises without throwing when real environment variables are present. Verification: load `.env.local` → call factory → assert no error.

This is a Vitest test with `dotenv` loading, not a Playwright test. Reclassified from "E2E" to "smoke test". Can be written immediately as a Vitest test file that loads `.env.local` and calls the production factory.

### 3.4 CI Meta (AC-52)

GitHub Actions configuration runs lint + type-check + unit + integration. Verification: first successful CI run on push. Manual checkbox — not testable programmatically. Marked as "verified on first successful CI run".

### 3.5 Webhook Pipeline (Future — S4+)

HTTP POST to webhook endpoint with HMAC signature → handler processes event → state change verified. For Resend: `POST /api/webhooks/email/events` with test HMAC. For Paddle (S4): `POST /api/webhooks/paddle` with test signature.

Requires: test signing secret in `.env.test`, Playwright `APIRequestContext` for HTTP calls, assertion against DB state after handler completes.

### 3.6 Orchestrated Flow (Future — S10)

Multi-step flows (erasure, account closure) with cross-domain coordination. These are process-level — no browser needed. Vitest integration tests with direct function calls are sufficient. The existing integration test harness already supports this pattern (see CS-WORK-004 flow engine tests).

Reclassified: orchestrated flows stay as Vitest integration tests, not Playwright.

---

## 4. Options Evaluation

### 4.1 Evaluation Criteria

| Criterion | Weight | Rationale |
|---|---|---|
| HTTP-level API testing | Critical | 5 of 7 current ACs are HTTP-level, no browser needed |
| Auth cookie handling | Critical | Auth flow ACs require cookie jar across requests |
| No-browser mode | High | Phase 1 has no UI. Browser binaries add 150MB+ to CI |
| Browser mode available | Medium | Phase 2 (S5) will need browser. Same tool preferred |
| Next.js App Router compatibility | High | Server must be running for route testing |
| CI integration | High | Must work in GitHub Actions with Postgres service container |
| Ecosystem maturity | Medium | Stable API, maintained, documented |

### 4.2 Playwright APIRequestContext

Playwright's `APIRequestContext` provides HTTP-level testing without browser binaries. Cookie jar persists across requests within a context. Full Playwright test runner, assertions, and fixtures available.

| Criterion | Assessment |
|---|---|
| HTTP-level API testing | Native. `request.post()`, `request.get()` with full control |
| Auth cookie handling | Built-in cookie jar per `APIRequestContext` |
| No-browser mode | Yes. `@playwright/test` without `npx playwright install` |
| Browser mode available | Yes. Add `npx playwright install chromium` when needed |
| Next.js App Router compatibility | Uses `baseURL` against running server. Full App Router support |
| CI integration | Mature. `start-server-and-test` for server lifecycle |
| Ecosystem maturity | Microsoft-maintained. Largest E2E ecosystem. Extensive docs |

**Verdict:** Phase 1 pick. HTTP-level, no browser download, auth-capable, upgrades to browser mode at Phase 2.

### 4.3 Playwright Browser Mode

Full browser automation. Same framework as 4.2 — adds `npx playwright install chromium` for browser binary.

| Criterion | Assessment |
|---|---|
| Browser testing | Full Chromium automation. DOM interaction, navigation, screenshots |
| Session persistence | Real browser cookies. Tests AC-25 (navigation persistence) |
| Cost | +150MB CI cache for Chromium binary |

**Verdict:** Phase 2 pick. Deferred until S5 introduces authenticated UI pages.

### 4.4 Vitest Integration Tests (Existing)

Direct function calls with injected test DB. Already covers 288 integration tests across S0–S3.

| Criterion | Assessment |
|---|---|
| HTTP-level API testing | No. Tests tRPC callers directly, not HTTP endpoints |
| Auth cookie handling | No. Mocks session context, doesn't test real auth |
| Server-side logic | Excellent. Direct DB access, transaction control |
| Orchestrated flows | Sufficient. S10 flows testable at function level |

**Verdict:** Keep for domain logic. Insufficient for auth flows and webhook endpoints. Sufficient for orchestrated flows (S10) and smoke tests (AC-42).

### 4.5 Supertest

HTTP assertion library. Historically used with Express. Declining ecosystem relevance.

| Criterion | Assessment |
|---|---|
| HTTP-level API testing | Yes, but limited to request/response assertions |
| Auth cookie handling | Manual. No built-in cookie jar |
| Next.js App Router compatibility | Poor. No native support. Requires custom server setup |
| Browser mode available | No |
| Ecosystem maturity | Declining. Last major release 2023. Community moving to Playwright |

**Verdict:** Declined. App Router incompatibility and declining ecosystem make this a poor fit.

---

## 5. Dismissed Alternatives

Three tools surfaced during landscape research. All dismissed — none are testing frameworks.

| Tool | What It Is | Why Dismissed |
|---|---|---|
| **Stagehand** | AI-powered browser automation for web agents (natural language selectors) | Designed for building web agents, not testing. Non-deterministic AI selectors are inappropriate for AC verification. No assertion library |
| **Firecrawl** | Web scraping API for LLM data extraction | Data collection tool, not a testing framework. No request/response assertion capability |
| **Crawlee** | Web crawling and scraping library (Apify) | Crawling framework for data pipelines. No test runner, no assertions, no auth flow support |

---

## 6. Recommendation

**Three-phase approach: Playwright API-only (now) → Playwright browser (S5) → webhook tunnelling (staging).**

Phase 1 addresses 5 of 7 current ACs immediately. AC-25 (browser session persistence) defers to Phase 2. AC-52 (CI meta) is manual verification. AC-42 is reclassified as a Vitest smoke test.

The single-framework strategy (Playwright for both API and browser) avoids tool fragmentation. Phase 1 installs zero browser binaries. Phase 2 adds one (Chromium). The test runner, assertion library, fixtures, and CI integration are shared across phases.

### Reclassification Summary

| AC | Previous Category | New Category | Tool |
|---|---|---|---|
| AC-21, AC-22, S2-AC-02 | E2E | Auth flow (HTTP) | Playwright API |
| AC-25 | E2E | Auth flow (browser) | Playwright browser (Phase 2) |
| AC-35 | E2E | Build output | CI step (`next build` + file check) |
| AC-42 | E2E | Smoke test | Vitest + dotenv |
| AC-52 | E2E | CI meta | Manual (first green CI run) |

---

## 7. Phased Build Plan

### Phase 1 — API-Level Verification (Post-Investigation Work Item)

**Trigger:** Immediately after this investigation is approved.

**Prerequisites:**
- Better Auth API route (`src/app/api/auth/[...auth]/route.ts`) — currently does not exist. Must be created as a prerequisite. Auth flow ACs are blocked until this route exists.
- Test DB reset endpoint (`/api/test/reset`) — dev-only, guarded by `NODE_ENV !== 'production'`. Truncates test data between Playwright test runs. Alternative: run Playwright sequentially after integration tests with known DB state. The reset endpoint is preferred — it decouples Playwright from integration test ordering.

**Installation:**
```bash
npm install -D @playwright/test start-server-and-test
```

No `npx playwright install` — API-only mode requires no browser binaries. CI must NOT run browser installation.

**Configuration (`playwright.config.ts`):**
```typescript
import { defineConfig } from "@playwright/test"

export default defineConfig({
  testDir: "e2e",
  use: {
    baseURL: "http://localhost:3000",
  },
  webServer: {
    command: "npm run build && npm run start",
    port: 3000,
    reuseExistingServer: !process.env.CI,
  },
})
```

CI uses `next build && next start` (deterministic production server). Local dev uses `next dev` with `reuseExistingServer: true`.

**CI integration (`.github/workflows/ci.yml` addition):**
```yaml
- name: E2E tests
  run: npx playwright test
  env:
    DATABASE_URL: postgresql://postgres:postgres@localhost:5432/test
    RESEND_WEBHOOK_SECRET: ${{ secrets.RESEND_WEBHOOK_SECRET_TEST }}
```

The `webServer` config in `playwright.config.ts` handles server lifecycle. No `start-server-and-test` needed in CI when using Playwright's built-in `webServer`.

**Tests to write:**

| Test | ACs Verified | Method |
|---|---|---|
| Signup → email service called → verify token → login → session cookie → protected tRPC call | AC-21, AC-22, S2-AC-02 | Playwright `request.post()` chain with cookie jar |
| POST `/api/webhooks/email/events` with test HMAC → verify DB status update | — (future S4+ readiness) | Playwright `request.post()` with computed HMAC |
| `next build` succeeds | AC-35 (partial — vacuous until homepage exists) | Playwright `webServer` build step |

**Vitest tests (not Playwright):**

| Test | ACs Verified | Method |
|---|---|---|
| `createProductionServices()` with `.env.local` vars | AC-42 | Vitest test file, `dotenv.config()` |

**Manual verification:**

| AC | Method |
|---|---|
| AC-52 | First successful GitHub Actions run. Checkbox in tracker |

**DB isolation:** `/api/test/reset` endpoint (Next.js route handler, `NODE_ENV` guard). Calls `resetDb()` from existing `src/db/test-utils.ts`. Playwright `beforeEach` hits this endpoint.

### Phase 2 — Browser Verification (Trigger: S5 First Authenticated UI Page)

**Trigger:** S5 (Provider Experience) decomposition. First work item with an authenticated UI page. The S5 decomposition includes a "Playwright browser setup" work item.

**Installation:**
```bash
npx playwright install chromium
```

Single browser. Chromium only — no Firefox or WebKit at V1. Reduces CI cache from ~450MB to ~150MB.

**Tests to write:**

| Test | ACs Verified | Method |
|---|---|---|
| Login page → enter credentials → redirect to dashboard | AC-25 (session persistence) | Playwright `page.goto()` + `page.fill()` + navigation assertion |
| Protected page → redirect to login if unauthenticated | — (S5 AC) | Playwright navigation + URL assertion |
| Provider dashboard renders listing data | — (S5 AC) | Playwright DOM assertion |

**Shared infrastructure:** Test fixtures, DB reset endpoint, and server lifecycle from Phase 1 carry forward. Phase 2 adds browser-specific fixtures (authenticated page context, test user factory).

### Phase 3 — Staging Webhook Validation (Trigger: Staging Environment Exists)

**Trigger:** Staging environment deployed (Vercel preview or dedicated staging). Required before production launch.

**Tool:** Hookdeck CLI (free tier, replay capability, HMAC forwarding). Alternatives: ngrok (functional but no replay), localtunnel (unreliable).

**Tests:**
- Real Resend webhook → staging handler → verify correspondence log update
- Real Paddle webhook (S4) → staging handler → verify subscription state change

**Why not Phase 1:** Webhook tunnelling requires a publicly accessible endpoint. Local development uses test HMAC signing (no real provider). Staging validates the real provider → real handler path.

---

## 8. Cross-References

| Document | Relationship |
|---|---|
| `IMPLEMENTATION-TRACKER.md` | E2E Debt section — 7 ACs reclassified with verification category. Link to this brief |
| `shared-infrastructure.md` (v11 §4) | Auth middleware chain — `protectedProcedure`, `verifiedProcedure`, `adminProcedure`. Auth flow ACs verify these work end-to-end |
| `shared-infrastructure.md` (v11 §5) | Email transport — webhook endpoints, HMAC verification. Webhook pipeline tests verify the handler path |
| `entity-architecture-frame.md` (v2 §Layer 2) | Perception verification — the entity must verify its own perception mechanisms work. E2E tests are the entity's self-verification |
| `1-investigation/communications-infrastructure.md` | Format precedent for this investigation brief |
| `src/db/test-utils.ts` | Existing `resetDb()` function — reused by the `/api/test/reset` endpoint |
| `vitest.config.integration.ts` | Existing integration test config — Playwright tests are complementary, not replacement |
| `.github/workflows/ci.yml` | CI pipeline — Playwright E2E step added after integration tests |
