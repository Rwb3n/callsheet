# CLAUDE.md

## Mandatory Session Init

Run `/session-init` at the start of every conversation. It reads governing documents, loads handoff context, verifies test health, and produces a status briefing. Do not produce substantive output before init completes.

If the skill is unavailable, execute the ceremony manually:
1. Read `0-strategic-frame/entity-architecture-frame.md`, `0-strategic-frame/output-style.md`, `0-strategic-frame/output-style-engineer.md` in full.
2. Read `MEMORY.md` handoff section + `4-work-management/IMPLEMENTATION-TRACKER.md` + active chapter file.
3. Run `npx tsc --noEmit`, `npm run test`, `npm run test:integration` in parallel.
4. Output a status briefing.

Planning output complies with `output-style.md`. Code output complies with `output-style-engineer.md`.

## What This Repository Is

Planning, documentation, and implementation repository for CALLSHEET — an autonomous commercial entity (not a human-operated product) operating as a B2B discovery and matching platform for UK broadcast/film/TV production services.

Read `entity-architecture-frame.md` before making any design decisions — it takes precedence over all other documents.

## Phase Status

```
0-strategic-frame/    ← ACTIVE. entity-architecture-frame.md v2, output-style.md, strategic-positioning.md (LOCKED).
1-investigation/      ← COMPLETE (LOCKED). 14 deliverables across 4 domains.
2-concept-design/     ← COMPLETE. 5 domains, 341 stress-test scenarios. See DESIGN-TRACKER.md.
3-requirements/       ← COMPLETE. 11 slices at v2 (693 AC). 5 interface specs. Versions in REQUIREMENTS-TRACKER.md.
4-work-management/    ← ACTIVE. See IMPLEMENTATION-TRACKER.md for current progress.
```

Authoritative trackers: `3-requirements/REQUIREMENTS-TRACKER.md`, `4-work-management/IMPLEMENTATION-TRACKER.md`.

## Entity Architecture (Summary)

Four principles: **Data**, **Intelligence**, **Autonomy**, **Composability**.

Six layers: Core Invariants → Cognitive Substrate → Domain Instance (sub-entity hierarchy) → Meatspace Interface → Legal Shell → Principal.

Four sub-entities at Layer 3, each a black box with typed contracts:
- **Data & Listings** (v6) — Listing, Account, quality, verification, taxonomy, engagement
- **Operations** (v6) — support triage, human procurement, compliance, billing reconciliation
- **Platform & Product** (v5) — search, onboarding, admin, email pipeline, account closure
- **Commercial & Revenue** (v4) — pricing, subscriptions, conversion, churn, revenue perception

Cross-domain contracts: 25 typed events, 6 query interfaces, single-emitter rules, governance inheritance. Full spec in `2-concept-design/cross-domain-dependencies.md` (v3).

## Settled Decisions

- **Unified account model** — every user is both provider and buyer. Account is root entity, Provider is opt-in facet.
- **Sub-entity composability** — domains are autonomous black boxes with typed I/O contracts. No shared mutable state. Autonomy graduated per sub-entity.
- **Tech stack** — Next.js, TypeScript, tRPC, Supabase PostgreSQL, Better Auth, Drizzle ORM, Paddle, Cloudflare R2, Resend, Vercel. ~£36/month.
- **PostgreSQL full-text search at V1** — `tsvector` + `pg_trgm`. Meilisearch at 10-20K listings. Search behind service layer.
- **Ranking** — quality score (0-100) + additive paid boost. Quality earned, visibility bought.
- **Pricing** — £199/£399/£699 annual tiers.
- **Verification** — 4-tier: Unclaimed → Claimed → Verified → Premium Verified. Companies House API automated.
- **Taxonomy** — 3-level (Sector → Service Area → Specialisation). Provider HAS capabilities, not filed IN category.
- **Modular monolith** — ship fast, extract when bottlenecks demand it.
- **Domain events** — primary cross-domain coordination. No polling, no shared state.
- **Event bus** — application-level in-process TypeScript module. 3 sync consumers (search index), ~48 async via `waitUntil()`. Migration trigger: >30% request duration.
- **Schema versioning** — TypeScript const exports, compiler enforces. No runtime protocol.
- **Transaction boundaries** — orchestrated flows (erasure, closure) + reactive flows (event bus). No distributed transactions.
- **Consumer monitoring** — try/catch + `EVENT_CONSUMER_MATRIX` startup check + integration tests. No heartbeat.

## Agent Output Style

Comply with `output-style.md`. Dense prose, conclusion first, Mermaid diagrams, typed pseudocode, no hedging, no marketing language, no reopening settled decisions.

## Requirements Phase Structure

```
3-requirements/
├── decisions/          ← Resolved trade-off evaluations (interface-questions, sq-1, sq-2)
├── interfaces/         ← Sub-entity boundary specs (5 specs). Versions in REQUIREMENTS-TRACKER.md.
├── slices/             ← Vertical build sequence S0–S10 (all at v2, stress tested)
├── stress-tests/       ← Stress test results, pre-draft checklists, drafting intermediates
│   └── s{N}-drafting/  ← Multi-agent drafting pipeline intermediates (Phase 1–2 outputs)
└── REQUIREMENTS-TRACKER.md  ← Authoritative progress tracker
```

## Work Management Structure

```
4-work-management/
├── epochs/             ← Epoch definitions (CS-E1 = Platform Build)
├── arcs/               ← Arc groupings (6 arcs: infrastructure → hardening)
├── chapters/           ← Chapter definitions (12 chapters, 1+ per slice)
├── work/               ← Work item directories (CS-WORK-NNN/WORK.md + plans/ + investigations/ + reports/)
└── README.md           ← Structure overview, ID conventions, dependency graph
```

Flat directories. Relationships in YAML frontmatter (`epoch`, `arc`, `chapter`), not filesystem hierarchy.

**Slice sequence:** S0 Infrastructure → S1 Data Model → S2 Onboarding → S3 Claim → S4 Subscriptions → S5 Provider Exp → S6 Buyer Exp → S7 Operations → S8 Commercial → S9 Entity Intel → S10 Hardening.

## Skills (Agent Pipelines)

12 skills in `.claude/skills/`. Each skill file (`skill.md`) is authoritative for its own behaviour — read it, don't rely on summaries elsewhere.

**Pipeline per slice:** `/checklist` → `/draft` → `/stress-test` → `/apply-fixes` → v2 → `/decompose`.
**Pipeline per work item:** `/impl {NNN}` → implement → `/migration-close` (if schema) → `/done {NNN}` → `/retro` → `/close`.

**Key principle:** Main context is an orchestrator. It dispatches sub-agents, gates between phases, and routes context. Sub-agents read files from disk and write results to disk.

## Working With This Repository

- `strategic-positioning.md` is **locked**. Reference only.
- `entity-architecture-frame.md` is **active** and governs all design. Sub-entities replace "the founder does X" — a sub-entity does X within its decision authority.
- Concept design documents follow the 5-layer framework: Principles → Ways of Working → Ceremonies → Activities → Assets.
- `2-concept-design/DESIGN-TRACKER.md` is the authoritative record of concept design phase completion.
- `3-requirements/REQUIREMENTS-TRACKER.md` is the authoritative record of requirements phase progress (interface specs, slices, decisions, open questions).
