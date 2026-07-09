---
id: CS-WORK-122
title: Middleware and ownership enforcement
chapter: CH-CS-025
arc: presentation-e2
epoch: CS-E2
status: done
closed: 2026-03-30
effort: small
blocked_by: []
acceptance_criteria:
  - id: AC-1
    description: "Next.js middleware protects /dashboard/* routes — redirects to /login with ?redirect param"
    test_type: manual
  - id: AC-2
    description: "Next.js middleware protects /admin/* routes — requires admin role, redirects non-admin to /dashboard"
    test_type: manual
  - id: AC-3
    description: "Public paths (/, /search, /pricing, /providers/*, /api/*) pass through without auth check"
    test_type: manual
  - id: AC-4
    description: "Middleware uses Better Auth session check via getAuthInstance()"
    test_type: manual
  - id: AC-5
    description: "Route matcher excludes static files and Next.js internals"
    test_type: manual
  - id: AC-6
    description: "Redirect URL preserves original path for post-login navigation"
    test_type: manual
---

# CS-WORK-122: Middleware and ownership enforcement

## Deliverables

- [x] `src/middleware.ts` — route protection middleware with auth + admin checks
