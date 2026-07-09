---
id: CS-E2
name: Operational Readiness
status: Active
prior: CS-E1
next: CS-E3
started: 2026-03-29
---

# Epoch CS-E2: Operational Readiness

## Re-scope (2026-07-10)

Deployment is now governed by `0-strategic-frame/phase-gate-model.md` (signal-gated venture model). The deployment arc below is superseded by `venture-p1` (CH-CS-028–031): P1 ships an inert, read-only, CH-verified directory; claim loop, enquiries, Paddle, and S9 activate only behind recorded gates. Exit criteria referencing full-platform deployment, 4rfv import, and Paddle live are void — replaced by the venture-p1 arc's P1 definition of done. The three interface layers (R1/R2/R3) remain built and regression-tested; they enable per-phase, not at once.

## Definition

Make CALLSHEET deployable, operable, and usable by three principals: human users (browser), human admins (browser), and machine agents (CLI). CS-E1 built the complete backend (54 tables, 118 tRPC procedures, 25 events, 48 consumers, 37 deferred actions, 12 flow steps, 1,863 tests). CS-E2 wraps that backend in production-ready interfaces and deploys it.

**The Mission:** Three interface layers over one API surface. A human can browse and subscribe. An admin can monitor and intervene. An agent can operate headlessly via CLI tool calls.

## Prerequisites

- CS-E1 complete (all 90 work items, 718 AC verified, 0 type errors)
- Principal-gated external prerequisites tracked in `5-launch-readiness/` (Companies House, ICO, Paddle live, banking)

## Scope

### Three Interface Requirements

**R1 — Human SaaS UI.** Users interact via browser in standard SaaS patterns. Browse, search, claim, subscribe, manage listings, send enquiries, view dashboards. Production-quality pages with error handling, SEO, image optimization, and responsive design.

**R2 — Admin Observability UI.** The principal (or assistant principal) can see everything and take over anything. Full operational dashboards: flows, compliance, health, scheduler queue, decision audit trail, user management. If an agent malfunctions, a human can diagnose and intervene through the admin UI.

**R3 — Agent CLI.** A machine agent (e.g., Claude Code) operates CALLSHEET via a TypeScript CLI tool. Structured JSON output, flag-based input, composable with pipes. Every operational procedure is a CLI command. API key authentication for stateless sessions.

### Arc Decomposition

4 arcs, 13 chapters, 38 work items, 168 AC.

| Arc | Scope | Depends On |
|-----|-------|------------|
| api-completion | Fill 10 operational API gaps, auth for machines, flow retry fix | — |
| agent-cli | TypeScript CLI tool (~60 commands), API key auth | api-completion |
| presentation | Production UI: homepage, error boundaries, stub pages, SEO, images, auth hardening | — |
| deployment | Supabase production, Vercel, DNS, 4rfv import, Paddle live, smoke test | api-completion + presentation |

### Build Sequence

```
Phase 1 (parallel):
  api-completion  (unblocks agent-cli + deployment)
  presentation    (deployment blockers: homepage, error boundaries)

Phase 2 (parallel):
  agent-cli       (requires api-completion)
  presentation    (dashboard + admin completion, polish)

Phase 3:
  deployment      (requires api-completion + presentation blockers resolved)
  presentation    (SEO, images, auth hardening — can continue post-deploy)
```

## What CS-E2 Is Not

- **Not new domain logic.** No new events, no new sub-entity behavior, no new business rules. CS-E2 builds interfaces over existing behavior.
- **Not Runtime Intelligence.** The cognitive substrate (closed-loop enrichment, closed-loop quality, operational autonomy) requires production data. That scope is CS-E3.
- **Not a rewrite.** The 118 tRPC procedures, 48 event consumers, and 37 deferred actions from CS-E1 are consumed as-is. CS-E2 adds ~15 new tRPC routes (operational gaps) and wraps everything in a CLI.

## Technology Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| CLI framework | Commander.js | Mature, TypeScript-native, subcommand support |
| CLI tRPC client | `@trpc/client` vanilla (httpBatchLink) | Same types as web client, no React dependency |
| CLI output | JSON default + chalk/cli-table3 for `--format table` | Machine-first, human-readable optional |
| CLI distribution | `npx callsheet` (npm package) | No build step for dev |
| Auth for agents | API key in `Authorization: Bearer <key>` header | Stateless, no cookie management |
| Image optimization | `next/image` + R2 `remotePatterns` | Standard Next.js, free WebP/AVIF conversion |
| Route protection | `middleware.ts` (replaces layout-level auth) | Standard Next.js pattern |

## Deployment Quality Gates

All deployments must pass the 4-gate framework defined in `0-strategic-frame/deployment-gates.md`:

1. **Gate 1 — Code Verification:** All unit, integration, E2E API, and E2E browser tests pass. 0 type errors.
2. **Gate 2 — Infrastructure Smoke:** Production environment checks via `callsheet smoke`. Auth, tRPC, Paddle, Resend, R2, Companies House, scheduler all reachable.
3. **Gate 3 — Data Validation:** Imported data integrity via `callsheet data validate`. Row counts, FK integrity, search functionality, quality computation.
4. **Gate 4 — User Journey:** 7 browser-level Playwright journeys complete against preview deployment.

The deployment arc's work items must build the infrastructure for these gates (smoke CLI command, validate CLI command, browser E2E tests, journey tests, CI pipeline integration). The gates document defines the acceptance criteria.

## Exit Criteria

- [ ] Human users can: sign up, search, view profiles, claim listings, subscribe, manage dashboard, send enquiries — all via browser with production-quality UI
- [ ] Admin can: monitor health, manage flows (initiate/retry/skip/escalate), view scheduler queue, search decision logs, manage users, manage compliance — all via browser
- [ ] Agent can: authenticate via API key, perform all admin operations via CLI, receive structured JSON output, compose commands with standard Unix tools
- [ ] Homepage has real content (hero, value proposition, CTAs)
- [ ] Error boundaries exist at all levels (root, dashboard, admin)
- [ ] SEO: sitemap, robots.txt, per-page metadata, JSON-LD on profiles
- [ ] All 4 deployment quality gates pass (see `deployment-gates.md`)
- [ ] CI/CD deploys to production on main push with gate-sequenced pipeline
- [ ] Platform accessible at production URL with real data (4rfv import)
- [ ] Paddle checkout completes in live mode
- [ ] All CS-E1 tests continue to pass (regression-free)

## Carried Forward from CS-E1

- Production deployment on Vercel (CS-E1 exit criterion, principal-gated)
- 4rfv import pipeline execution (CS-E1 deployment arc scope)
- Paddle live mode cutover (CS-E1 deployment arc scope)
- Article 14 notice batch (requires ICO registration)

## References

- `0-strategic-frame/entity-architecture-frame.md` — Layer 4 (Meatspace Interface)
- `0-strategic-frame/deployment-gates.md` — 4-gate deployment quality framework
- `0-strategic-frame/implementation-phase-evidence.md` — CS-E1 methodology learnings
- `4-work-management/epochs/CS-E1.md` — Prior epoch (complete)
- `4-work-management/epochs/CS-E3.md` — Next epoch (Runtime Intelligence, requires production data)
