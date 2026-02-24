---
template: work_item
id: CS-WORK-034
title: "E2E verification harness — Phase 1 (API-level)"
type: feature
status: done
owner: null
created: 2026-02-23
spawned_by: CS-WORK-029
spawned_children: []
chapter: CH-CS-001
arc: infrastructure
epoch: CS-E1
closed: 2026-02-24
priority: high
effort: medium
traces_to: []
source_files:
  - D:/PROJECTS/callsheet/1-investigation/e2e-verification-workflow.md
  - D:/PROJECTS/callsheet/3-requirements/slices/slice-00-infrastructure.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/shared-infrastructure.md
acceptance_criteria:
  - "AC-01: Playwright installed as devDependency (API-only — no browser binaries). playwright.config.ts configured with baseURL, webServer (next build && next start), e2e/ test directory"
  - "AC-02: Better Auth catch-all route handler exists at src/app/api/auth/[...all]/route.ts, delegating to auth.handler. GET and POST exported"
  - "AC-03: Test DB reset endpoint at /api/test/reset (POST). Guarded by NODE_ENV !== 'production'. Calls resetDb(). Returns 200"
  - "AC-04: Auth flow E2E — signup via POST to Better Auth endpoint → email service called with email_verification template → verify token → login → session cookie returned → cookie used in subsequent request to protected tRPC endpoint → 200. Verifies S0 AC-21, AC-22"
  - "AC-05: Email verification callback E2E — verify-email token accepted by Better Auth → emailVerified set to true on user record. Verifies S2 AC-02"
  - "AC-06: AC-42 smoke test — Vitest test file loads .env.local via dotenv, calls createProductionServices(), asserts no throw. Not a Playwright test"
  - "AC-07: CI integration — .github/workflows/ci.yml updated with E2E test step after integration tests. Playwright webServer handles server lifecycle. No browser install step"
blocked_by: []
blocks: []
enables: []
queue_position: backlog
cycle_phase: backlog
node_history:
  - node: backlog
    entered: 2026-02-23T00:00:00
    exited: null
artifacts: []
cycle_docs: {}
memory_refs: []
extensions:
  project: CALLSHEET
  slice: S0
  spec_sections: "SI §4 (auth), SI §5 (email), S0 §5 (Better Auth config)"
version: "1.0"
generated: 2026-02-23
last_updated: 2026-02-23T00:00:00
---

# CS-WORK-034: E2E verification harness — Phase 1 (API-level)

## Context

CS-WORK-029 investigation identified 7 deferred ACs across 6 verification categories. This work item implements Phase 1: Playwright API-only harness + prerequisites. It closes the verification gap for S0 AC-21, AC-22, S2 AC-02, and AC-42 without requiring browser binaries.

The Better Auth API route handler (`src/app/api/auth/[...all]/route.ts`) is created here because it is the missing bridge between the auth config (CS-WORK-005) and HTTP-level verification. Without it, Better Auth's signup/login/verify endpoints don't exist as HTTP routes.

AC-25 (session persistence across navigation) and AC-35 (SSG homepage) are deferred to Phase 2 (S5 — first authenticated UI pages). AC-52 (CI meta) is manual verification on first green CI run.

## Deliverables

- [x] `playwright.config.ts` — API-only config (baseURL, webServer, no browser)
- [x] `e2e/` — Test directory with auth flow and smoke tests
- [x] `src/app/api/auth/[...all]/route.ts` — Better Auth catch-all route handler
- [x] `src/app/api/test/reset/route.ts` — Dev-only DB reset endpoint
- [x] `e2e/auth-flow.spec.ts` — Signup → verify → login → protected route
- [x] `src/lib/services/__tests__/production-services.test.ts` — AC-42 smoke test (Vitest, not Playwright)
- [x] `.github/workflows/ci.yml` — E2E step added

## Dependencies

**Upstream:** CS-WORK-005 (auth config exists), CS-WORK-013 (onboarding router exists for post-auth verification).

**Downstream:** Phase 2 work item (S5 decomposition — Playwright browser mode, AC-25).

## Design Decisions

**Playwright APIRequestContext, not browser.** Investigation evaluated 4 tools + 3 dismissed alternatives. Playwright API-only mode provides HTTP-level testing with cookie jar, no browser binaries, and upgrade path to browser mode at Phase 2. [Source: `1-investigation/e2e-verification-workflow.md` §4]

**Reset endpoint, not test ordering.** `/api/test/reset` decouples Playwright from integration test execution order. `NODE_ENV` guard prevents production exposure. [Source: investigation §7, stress test finding #3]

**AC-42 stays Vitest.** Production services init is an environment smoke test — dotenv loading + factory call. No HTTP endpoint involved. Reclassified from E2E to smoke test. [Source: investigation §3.3, stress test finding #5]

## Verification of Upstream ACs

This work item closes deferred ACs from prior work items:

| Upstream AC | Original Work Item | Verified By |
|---|---|---|
| S0 AC-21 (signup + verification email) | CS-WORK-005 | AC-04 auth flow E2E |
| S0 AC-22 (login after verification) | CS-WORK-005 | AC-04 auth flow E2E |
| S2 AC-02 (email verification callback) | CS-WORK-013 | AC-05 verification callback E2E |
| S0 AC-42 (production services init) | CS-WORK-006 | AC-06 Vitest smoke test |

## References

- `1-investigation/e2e-verification-workflow.md` — Investigation brief (full analysis)
- `3-requirements/slices/slice-00-infrastructure.md` §5 — Better Auth config spec
- `3-requirements/interfaces/shared-infrastructure.md` §4 — Auth contract
- `src/lib/auth.ts` — Existing `createAuth()` factory
- `src/db/test-utils.ts` — Existing `resetDb()` function
