---
id: deployment-e2
epoch: CS-E2
status: Planned
depends: [api-completion, presentation-e2]
chapters: [CH-CS-026, CH-CS-027]
---

# Arc: Deployment (CS-E2)

## Mission

Deploy CALLSHEET to production. Provision infrastructure, run data import, verify all 4 deployment quality gates, and promote to the production URL. Absorbs the scope from CS-E1's superseded deployment arc, with expanded gate-based verification.

## Prerequisites

- api-completion arc complete (all operational routes available for smoke testing)
- presentation-e2 blockers resolved (CH-CS-020: error boundaries + homepage)
- Principal-gated external prerequisites: Vercel project created, Supabase production project, DNS configured, Paddle live account, ICO registration, Companies House API key

## Scope

### CH-CS-026: Gate Infrastructure (~3 work items, ~15 AC)

Build the testing infrastructure defined in `deployment-gates.md`.

| Work Item | Gate | Deliverables |
|-----------|------|-------------|
| Browser E2E tests | Gate 1 | 5-10 Playwright browser-mode tests for critical paths (sign up, search, dashboard, admin, enquiry) |
| User journey tests | Gate 4 | 7 Playwright journey tests (anonymous browse, sign up + create listing, claim, subscribe, enquiry, admin dashboard, account closure) |
| CI pipeline enhancement | Gates 1-4 | Enhanced `.github/workflows/deploy.yml` with gate-sequenced jobs, manual approval for production promotion |

Note: `callsheet smoke` (Gate 2) and `callsheet data validate` (Gate 3) are built in the agent-cli arc (CH-CS-019).

### CH-CS-027: Production Deployment (~3 work items, ~12 AC)

| Work Item | Deliverables |
|-----------|-------------|
| Infrastructure provisioning | Supabase production project, `drizzle-kit migrate`, `db:custom-sql`, env var configuration, Vercel project + secrets |
| 4rfv data import | Import pipeline execution, Gate 3 validation, quality score bulk recalculation |
| Go-live verification | Gate 2 smoke against production, Gate 4 journeys against production, Paddle live webhook verification, Article 14 notice batch (if ICO registration complete) |

## Exit Criteria

- [ ] All 4 deployment quality gates pass against production
- [ ] Platform accessible at production URL (callsheet.co.uk)
- [ ] ~4,700 listings searchable with computed quality scores
- [ ] Paddle checkout completes in live mode
- [ ] CI deploys to production on main push (gated by all 4 gates)
- [ ] Agent can run `callsheet smoke --env production` and all checks pass
