# CLAUDE.md

## Mandatory Session Init

**Before producing any output**, read these files in full:
1. `0-strategic-frame/entity-architecture-frame.md` — governing design frame (v2: sub-entity hierarchy)
2. `0-strategic-frame/output-style.md` — architect output style (planning docs, specs, proposals)
3. `0-strategic-frame/output-style-engineer.md` — engineer output style (TypeScript source, tests, commits)

Do not summarise, paraphrase, or skip them. Planning output complies with #2. Code output complies with #3.

## What This Repository Is

Planning and documentation repository for CALLSHEET — an autonomous commercial entity (not a human-operated product) operating as a B2B discovery and matching platform for UK broadcast/film/TV production services. No application code yet.

Read `entity-architecture-frame.md` before making any design decisions — it takes precedence over all other documents.

## Phase Status

```
0-strategic-frame/    ← ACTIVE. entity-architecture-frame.md v2, output-style.md, strategic-positioning.md (LOCKED).
1-investigation/      ← COMPLETE (LOCKED). 14 deliverables across 4 domains.
2-concept-design/     ← COMPLETE. 5 domains, 341 stress-test scenarios. See DESIGN-TRACKER.md.
3-requirements/       ← COMPLETE. 11 slices at v2 (693 AC). 5 interface specs (SI v10, D&L v6, Ops v5, PP v8, CR v3).
4-work-management/    ← ACTIVE. CS-E1 scaffolding created. S0 decomposed (6 work items). S1–S10 skeleton chapters.
```

Requirements tracked in `3-requirements/REQUIREMENTS-TRACKER.md`. Work management in `4-work-management/`.

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
├── interfaces/         ← Sub-entity boundary specs (5 specs: SI v10, D&L v6, Ops v5, PP v8, CR v3)
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

Six skills in `.claude/skills/` compose into the requirements-to-implementation workflow:

| Skill | Trigger | What It Does |
|-------|---------|-------------|
| `slice-pre-draft-checklist` | "checklist for S6" | Scans interface specs + concept design. Produces registry pre-population list + upstream flag inventory. Eliminates three-part sync gap. |
| `slice-drafter` | "draft S6" | **Multi-agent pipeline (4 phases, 11-13 agents).** Skeleton → Foundations (schema, router, decisions — 3 parallel) → Content sections (5-7 parallel) → Assembly → Validation. Each agent gets ~15K tokens, not 80K. |
| `slice-stress-test` | "stress test S6" | **Parallel stress test (2 agents).** 20 scenarios targeting interface boundaries. Merge + validate via sub-agents. Writes to `stress-tests/`. |
| `slice-fix-applier` | "apply fixes" | **Parallel fix application (2 agents).** Agent A: slice edits + AC. Agent B: sibling specs + tracker + memory. |
| `work-item-decomposer` | "decompose S1" | **Slice → work items.** Groups AC into implementable units. Creates WORK.md with frontmatter, deliverables, dependencies. Updates chapters. |
| `retro` | "retro", "retro for S1" | **3-layer retrospective.** Reflection (6 prompts) → Classification (bug/feature/feature-request/refactor/upgrade) → Action Register (priority/owner/definition of done). Writes to `4-work-management/retros/`. |

**Pipeline per slice:** checklist → draft → stress test → apply fixes → v2 → **decompose into work items**.

**Key principle:** Main context is an orchestrator. It dispatches sub-agents, gates between phases, and routes context. It does NOT read full concept design documents or write slice content directly. Sub-agents read files from disk and write results to disk.

## Working With This Repository

- `strategic-positioning.md` is **locked**. Reference only.
- `entity-architecture-frame.md` is **active** and governs all design. Sub-entities replace "the founder does X" — a sub-entity does X within its decision authority.
- Concept design documents follow the 5-layer framework: Principles → Ways of Working → Ceremonies → Activities → Assets.
- `2-concept-design/DESIGN-TRACKER.md` is the authoritative record of concept design phase completion.
- `3-requirements/REQUIREMENTS-TRACKER.md` is the authoritative record of requirements phase progress (interface specs, slices, decisions, open questions).
