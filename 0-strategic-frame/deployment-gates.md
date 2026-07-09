# Deployment Quality Gates

**Status:** Active
**Last updated:** 2026-03-29
**Applies to:** CS-E2 (Operational Readiness) and all subsequent epochs
**Consumed by:** Deployment arc work items, CI/CD pipeline, agent CLI smoke commands

---

## Purpose

Four sequential gates that must pass before any deployment reaches production. Each gate catches a class of defect that prior gates cannot detect. Gates are cumulative — passing gate 1 is a prerequisite for gate 2, and so on.

The gate model exists because CALLSHEET's risk chain flows from code to infrastructure to data to users, and each layer can mask the one below it. 1,863 passing tests don't prove Paddle webhooks work in production. Paddle webhooks working doesn't prove users can complete checkout.

---

## Gate 1: Code Verification

**What it tests:** Does the code do what the spec says?

**When it runs:** Every PR, every push to main. Blocks merge.

**Components:**

| Check | Tool | Current State | CS-E2 Target |
|-------|------|--------------|--------------|
| Type safety | `tsc --noEmit` | 0 errors | 0 errors |
| Lint | ESLint | Passing | Passing |
| Unit tests | Vitest | 727 passing | ~750+ |
| Integration tests | Vitest (real Postgres) | 1,129 passing | ~1,200+ |
| E2E API | Playwright `request` | 7 passing | ~15+ |
| E2E Browser | Playwright browser | **0** (not yet built) | 5-10 critical path flows |

**E2E Browser tests to build (CS-E2):**

| # | Flow | What It Proves |
|---|------|---------------|
| 1 | Homepage loads, search returns results | Public pages render, tRPC connected |
| 2 | Sign up with email/password | Auth flow works browser-to-server |
| 3 | Sign in, view dashboard | Protected route guard works |
| 4 | Search with filters, view provider profile | Search + ISR profile page |
| 5 | Submit enquiry from profile page | Public mutation, email send |
| 6 | Create freelancer listing, appears in search | Full provider onboarding path |
| 7 | Admin sign in, dashboard loads all panels | Admin auth + all admin queries |
| 8 | (stretch) Claim unclaimed listing | Claim evaluation + Companies House |
| 9 | (stretch) Paddle checkout sandbox | Payment integration |
| 10 | (stretch) Account closure flow initiates | Settings → flow appears in admin |

**Gate criterion:** All checks pass. 0 type errors. 0 test failures. CI green.

---

## Gate 2: Infrastructure Smoke

**What it tests:** Does the code run correctly in the production environment?

**When it runs:** After Vercel preview deploy, before production promotion. Automated via agent CLI.

**Components:**

| # | Check | What It Proves | Method |
|---|-------|---------------|--------|
| 1 | Schema migration | `drizzle-kit migrate` applies cleanly | CLI: `callsheet smoke --check schema` |
| 2 | Custom SQL | tsvector triggers, search config installed | CLI: `callsheet smoke --check custom-sql` |
| 3 | Auth initialisation | Better Auth creates session, cookie set | HTTP: POST sign-in, verify cookie |
| 4 | tRPC public query | `search.query` returns response | HTTP: GET `/api/trpc/search.query` |
| 5 | tRPC protected query | `dashboard.getOverview` with session | HTTP: GET with auth cookie |
| 6 | Paddle webhook | Test-mode webhook accepted | HTTP: POST `/api/paddle/webhook` with test signature |
| 7 | Resend email | Transactional email delivered | API: send to test address, verify via Resend dashboard |
| 8 | R2 storage | Upload + download cycle | API: upload test image, download, compare |
| 9 | Companies House | API lookup responds | API: lookup known company number |
| 10 | Scheduler poll | `deferred_actions` table reachable | SQL: SELECT from deferred_actions |

**Implementation:** `callsheet smoke --env preview --checks all` — outputs JSON pass/fail per check. Each check is independent (failure of one doesn't skip others).

**Gate criterion:** All 10 checks pass. Any failure blocks production promotion. Failures are diagnosed via the JSON output.

---

## Gate 3: Data Validation

**What it tests:** Does the platform handle real data correctly?

**When it runs:** After 4rfv import into production database. Agent-operated.

**Components:**

| # | Check | Threshold | Method |
|---|-------|-----------|--------|
| 1 | Row count | ~4,700 listings (within 5% of source) | SQL count |
| 2 | Required fields | 0 nulls in name, slug, entityType | SQL WHERE IS NULL |
| 3 | Companion rows | Every listing has verifications, quality_scores, engagements rows | SQL LEFT JOIN WHERE companion IS NULL = 0 |
| 4 | Taxonomy resolution | All listing_taxonomy_tags reference valid sectors/service_areas | SQL FK join check |
| 5 | Search functionality | 10 known queries return >0 results | tRPC: `search.query` per query |
| 6 | Quality computation | 0 listings with `calculatedBy = "zero_init"` after bulk recalc | SQL count WHERE calculatedBy = 'zero_init' |
| 7 | Slug uniqueness | 0 duplicate slugs | SQL GROUP BY HAVING count > 1 |
| 8 | Entity type distribution | Company > 80%, freelancer < 20% (matches 4rfv source) | SQL GROUP BY entityType |
| 9 | Region coverage | ≥10 distinct baseRegion values | SQL COUNT DISTINCT |
| 10 | No FK violations | 0 orphaned FKs across all tables | SQL integrity check |

**Implementation:** `callsheet data validate --checks all --format json`

**Gate criterion:** All validations pass. Anomalies (e.g., unexpected entity type distribution) logged as warnings but don't block unless they indicate data corruption (FK violations, missing companions, null required fields).

---

## Gate 4: User Journey Validation

**What it tests:** Can a real human (or browser-capable agent) complete the critical workflows?

**When it runs:** Against the preview deployment with seeded data. Before production promotion. Requires explicit approval to promote after results are reviewed.

**Journeys:**

| # | Journey | Steps | External Services | Proves |
|---|---------|-------|-------------------|--------|
| 1 | Anonymous browse | Homepage → search → filter → view profile | None | Public pages work, search returns ranked results |
| 2 | Sign up + create listing | Sign up → verify email → create freelancer → appears in search | Resend | Full provider onboarding |
| 3 | Claim listing | Sign in → search unclaimed → claim → CH check → approved | Companies House | Claim evaluation pipeline |
| 4 | Subscribe | Sign in → listing dashboard → upgrade → Paddle checkout → active | Paddle (sandbox) | Payment integration |
| 5 | Send enquiry | Sign in as buyer → search → view profile → submit → provider gets email | Resend | Buyer-provider connection |
| 6 | Admin dashboard | Sign in as admin → overview → support → flows → health → all render | None | Admin operational readiness |
| 7 | Account closure | Sign in → settings → initiate → flow appears in admin → steps visible | None | GDPR flow integration |

**Implementation:** Playwright browser tests in `e2e/journeys/`. Seeded preview environment with demo data + 4rfv import subset.

**Gate criterion:** All 7 journeys complete. Paddle checkout reaches confirmation (sandbox). Email delivery confirmed. Admin panels render with data. Manual review of screenshots/video before production promotion.

---

## Gate Sequencing

```
PR / push to main
  └─▶ Gate 1: Code Verification (CI, ~3 min)
        └─▶ Gate 2: Infrastructure Smoke (preview deploy, ~30 sec)
              └─▶ Gate 3: Data Validation (post-import, ~10 sec)
              └─▶ Gate 4: User Journey (browser E2E, ~2 min)
                    └─▶ Manual approval
                          └─▶ Production promotion
```

Gates 3 and 4 are parallel after gate 2. Gate 3 requires imported data; gate 4 requires seeded preview. Both must pass.

---

## CI/CD Pipeline Integration

```yaml
jobs:
  gate-1-code:        # lint + typecheck + unit + integration + e2e-api + e2e-browser
  gate-2-smoke:       # vercel deploy preview → callsheet smoke --env preview
    needs: gate-1-code
  gate-3-data:        # callsheet data validate (only when import has run)
    needs: gate-2-smoke
    if: github.ref == 'refs/heads/main'
  gate-4-journeys:    # playwright browser against preview URL
    needs: gate-2-smoke
  promote-production:
    needs: [gate-3-data, gate-4-journeys]
    environment: production  # requires manual approval in GitHub
```

---

## Relationship to CS-E2 Arcs

| Gate | CS-E2 Arc | Deliverables |
|------|-----------|-------------|
| 1 | presentation | 5-10 Playwright browser E2E tests |
| 2 | agent-cli | `callsheet smoke` command |
| 3 | agent-cli | `callsheet data validate` command |
| 4 | presentation + deployment | 7 journey tests, seeded preview environment |
| All | deployment | Enhanced CI/CD workflow with gate sequencing |

The gates are *requirements* for the deployment arc — they define what "deployment-ready" means. Work items in the deployment arc must satisfy these gates as acceptance criteria.

---

## Maintenance

This document is a governing constraint, like `entity-architecture-frame.md`. It is not locked — gates can be added or thresholds adjusted — but changes require explicit rationale. Removing a gate or lowering a threshold must be documented with the trade-off being accepted.

Gate definitions flow into CS-E2 requirements slices as AC. The slices reference this document; this document does not reference slices.
