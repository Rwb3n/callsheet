# CALLSHEET

> An autonomous commercial entity operating as a B2B discovery and matching platform for UK broadcast/film/TV production services.

## Project Structure

```
CALLSHEET/
│
├── 0-strategic-frame/
│   ├── strategic-positioning.md                    ← LOCKED
│   ├── entity-architecture-frame.md               ← ACTIVE v2 — entity-as-operator design frame + sub-entity hierarchy
│   └── output-style.md                            ← ACTIVE — agent output style guide
│
├── 1-investigation/                                ← COMPLETE (LOCKED). 14 deliverables across 4 domains.
│   ├── data-and-listings/                          ← taxonomy, data model, data quality, trust/verification, on-screen talent scope
│   ├── platform-and-product/                       ← architecture decisions, onboarding flow
│   ├── commercial-and-revenue/                     ← competitor pricing, analogous pricing, freemium conversion, provider/buyer duality
│   └── operations/                                 ← solo ops blueprint, verification throughput, compliance
│
├── 2-concept-design/                               ← COMPLETE. 5 domains, 341 stress-test scenarios. Tracker: DESIGN-TRACKER.md
│   ├── data-and-listings.md                        ← v6 (0.97) — 95 scenarios
│   ├── operations.md                               ← v6 (0.96) — 95 scenarios
│   ├── platform-and-product.md                     ← v5 (0.95) — 75 scenarios
│   ├── commercial-and-revenue.md                   ← v4 (0.95) — 55 scenarios
│   └── cross-domain-dependencies.md                ← v2 (0.96) — 21 scenarios, 25 typed events, 6 query interfaces
│
├── 3-requirements/                                 ← ACTIVE. Interface specs complete. Slices S0–S2 drafted.
├── 4-work-management/                              ← PENDING. Blocked by requirements.
└── 5-launch-readiness/                             ← ACTIVE. Legal, compliance, financial prerequisites for operation.
```

## Current Status

**Phase:** Requirements (planning). Concept design complete.
**Last activity:** 2026-02-12. Entity-architecture-frame revised to v2 (sub-entity hierarchy). Requirements structure stress tested (40 scenarios, 2 rounds).

### Documentation Pipeline

```
Strategic Frame → Investigation → Concept Design → Requirements → Work Management
   (locked)        (locked)        (COMPLETE)       (PLANNING)      (pending)
```

### Phase Summary

| Phase | Status | Key Outputs |
|---|---|---|
| 0. Strategic Frame | ACTIVE | entity-architecture-frame.md v2, output-style.md, strategic-positioning.md (locked) |
| 1. Investigation | COMPLETE (LOCKED) | 14 deliverables. Taxonomy, data model, pricing, onboarding, verification, ops model. |
| 2. Concept Design | COMPLETE | 5 domain specs (341 scenarios, 194 fixes). 25 typed domain events. Sub-entity contracts. |
| 3. Requirements | PLANNING | Structure: interfaces + vertical slices (11 slices, S0–S10). Sketch stress tested. |
| 4. Work Management | PENDING | Blocked by requirements. Derived from slice acceptance criteria. |
| 5. Launch Readiness | ACTIVE | 8 workstreams: Companies House, banking, ICO, compliance advisor, insurance, 4rfv data, accountant, investors. |

### Entity Architecture

CALLSHEET is designed around four principles — **Data** (perception), **Intelligence** (decision-making), **Autonomy** (self-governance), **Composability** (sub-entity hierarchy) — composed across six layers:

1. **Core Invariants** — governance rules set by the principal; propagate to all sub-entities
2. **Cognitive Substrate** — domain-agnostic orchestration; fractal (present at root and sub-entity level)
3. **Domain Instance** — sub-entity hierarchy: D&L, Operations, Platform & Product, Commercial & Revenue
4. **Meatspace Interface** — human/machine resource procurement, market-facing communication
5. **Legal Shell** — Companies House registration, banking, contracts, HMRC, ICO
6. **Principal** — human owner; sets purpose and governance, does not operate

Each sub-entity is a black box with typed I/O contracts, scoped decision authority, and inherited governance. See `entity-architecture-frame.md` (v2).

### Key Architectural Decisions

- **Unified account model** — every user is both provider and buyer. Account is root entity, Provider is opt-in facet.
- **Sub-entity composability** — 4 domains as autonomous black boxes with typed contracts. No shared mutable state. Autonomy graduated per sub-entity.
- **Tech stack** — Next.js, TypeScript, tRPC, Supabase PostgreSQL, Better Auth, Drizzle ORM, Paddle, Cloudflare R2, Resend, Vercel. ~£36/month.
- **PostgreSQL full-text search at V1** — `tsvector` + `pg_trgm`. Meilisearch at 10-20K listings.
- **Ranking** — quality score (0-100) + additive paid boost. Quality earned, visibility bought.
- **Pricing** — £199/£399/£699 annual tiers.
- **Verification** — 4-tier: Unclaimed → Claimed → Verified → Premium Verified.
- **Taxonomy** — 3-level (Sector → Service Area → Specialisation). Provider HAS capabilities, not filed IN category.
- **Domain events** — 25 typed events, primary cross-domain coordination mechanism.
- **Modular monolith** — ship fast, extract when bottlenecks demand it.
