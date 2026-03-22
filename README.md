<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://img.shields.io/badge/CALLSHEET-B2B%20Discovery%20Platform-f9e79f?style=for-the-badge&labelColor=1a1a2e&logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IiNmOWU3OWYiIHN0cm9rZS13aWR0aD0iMiI+PHBhdGggZD0iTTIwIDdINGExIDEgMCAwIDAtMSAxdjEwYTEgMSAwIDAgMCAxIDFoMTZhMSAxIDAgMCAwIDEtMVY4YTEgMSAwIDAgMC0xLTF6Ii8+PHBhdGggZD0iTTE2IDdWNWEyIDIgMCAwIDAtMi0yaC00YTIgMiAwIDAgMC0yIDJ2MiIvPjxsaW5lIHgxPSIzIiB5MT0iMTIiIHgyPSIyMSIgeTI9IjEyIi8+PC9zdmc+" />
    <img src="https://img.shields.io/badge/CALLSHEET-B2B%20Discovery%20Platform-2c3e50?style=for-the-badge&labelColor=ecf0f1&logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IiMyYzNlNTAiIHN0cm9rZS13aWR0aD0iMiI+PHBhdGggZD0iTTIwIDdINGExIDEgMCAwIDAtMSAxdjEwYTEgMSAwIDAgMCAxIDFoMTZhMSAxIDAgMCAwIDEtMVY4YTEgMSAwIDAgMC0xLTF6Ii8+PHBhdGggZD0iTTE2IDdWNWEyIDIgMCAwIDAtMi0yaC00YTIgMiAwIDAgMC0yIDJ2MiIvPjxsaW5lIHgxPSIzIiB5MT0iMTIiIHgyPSIyMSIgeTI9IjEyIi8+PC9zdmc+" alt="CALLSHEET" />
  </picture>
</p>

<p align="center">
  <b>An autonomous commercial entity operating as a B2B discovery platform for UK broadcast, film, and TV production services.</b>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Next.js_16-black?style=flat-square&logo=nextdotjs" />
  <img src="https://img.shields.io/badge/TypeScript_5.9-3178c6?style=flat-square&logo=typescript&logoColor=white" />
  <img src="https://img.shields.io/badge/tRPC_11-2596be?style=flat-square&logo=trpc&logoColor=white" />
  <img src="https://img.shields.io/badge/Drizzle_ORM-c5f74f?style=flat-square&logo=drizzle&logoColor=black" />
  <img src="https://img.shields.io/badge/PostgreSQL-4169e1?style=flat-square&logo=postgresql&logoColor=white" />
  <img src="https://img.shields.io/badge/Supabase-3ecf8e?style=flat-square&logo=supabase&logoColor=black" />
  <img src="https://img.shields.io/badge/Tailwind_v4-06b6d4?style=flat-square&logo=tailwindcss&logoColor=white" />
  <img src="https://img.shields.io/badge/Vitest-6e9f18?style=flat-square&logo=vitest&logoColor=white" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/tests-1%2C723%20passing-brightgreen?style=flat-square" />
  <img src="https://img.shields.io/badge/type_errors-0-brightgreen?style=flat-square" />
  <img src="https://img.shields.io/badge/slices-10%20complete-blue?style=flat-square" />
  <img src="https://img.shields.io/badge/AC_verified-646%2F806-blue?style=flat-square" />
</p>

---

## What Is This?

CALLSHEET is not a product in the traditional sense. It is an **autonomous commercial entity** — a cognitive system instantiated within a legal shell, designed to perceive its environment, make decisions, and procure human or machine resources when it cannot act alone.

The platform (directory, search, matching, subscriptions) is what the entity *does*. The entity itself is the system that operates the platform.

> **Domain:** UK broadcast/film/TV production services. 7 sectors, 64 service areas, 269 specialisations.
>
> **Model:** Unified accounts (every user is both buyer and provider). Quality earned, visibility bought. £199/£399/£699 annual tiers.

---

## Architecture

Four autonomous sub-entities coordinate through typed events and query interfaces. No shared mutable state. Each sub-entity is a black box with defined contracts.

```mermaid
graph TB
    classDef domain fill:#d4e6f1,stroke:#2471a3,color:#1a1a1a
    classDef bus fill:#f9e79f,stroke:#b7950b,color:#333
    classDef infra fill:#d5f5e3,stroke:#1e8449,color:#1a1a1a
    classDef external fill:#e8d5b7,stroke:#8b6914,color:#333

    PADDLE["Paddle<br/><i>Billing & Taxes</i>"]:::external
    RESEND["Resend<br/><i>Transactional Email</i>"]:::external
    R2["Cloudflare R2<br/><i>Media Storage</i>"]:::external
    CH["Companies House<br/><i>Verification API</i>"]:::external

    subgraph DL ["Data & Listings"]
        direction TB
        DL1["Listing CRUD & Integrity"]
        DL2["Quality Scoring (5-dim, 0-100)"]
        DL3["Decay Detection & Enrichment"]
        DL4["Verification (4-tier)"]
    end
    class DL domain

    subgraph OPS ["Operations"]
        direction TB
        OPS1["Paddle Webhook Processing"]
        OPS2["Support Triage & Tickets"]
        OPS3["Compliance & GDPR"]
        OPS4["Billing Reconciliation"]
    end
    class OPS domain

    subgraph PP ["Platform & Product"]
        direction TB
        PP1["Search (FTS + Trigram)"]
        PP2["Onboarding & Claim Flows"]
        PP3["Dashboard & Admin Panel"]
        PP4["Email Pipeline"]
    end
    class PP domain

    subgraph CR ["Commercial & Revenue"]
        direction TB
        CR1["Feature Gating & Pricing"]
        CR2["Conversion Triggers (6 types)"]
        CR3["Churn Intervention & Win-back"]
        CR4["Revenue Perception"]
    end
    class CR domain

    EB(["Event Bus — 25 Typed Events / ~50 Consumers"]):::bus
    INFRA["Shared Infrastructure<br/><i>Event Bus · Scheduler (35 actions) · Flow Engine<br/>Decision Logger · Email Transport · Storage</i>"]:::infra

    DL <-..-> EB
    OPS <-..-> EB
    PP <-..-> EB
    CR <-..-> EB

    PADDLE --> OPS
    PP --> RESEND
    PP --> R2
    DL --> CH
    DL & OPS & PP & CR --> INFRA
```

<details>
<summary><b>Sub-entity contract summary</b></summary>

| Sub-Entity | Events Emitted | Events Consumed | Queries Exposed | Autonomous Decisions |
|---|---|---|---|---|
| **Data & Listings** | 9 | 4 | 2 | Quality scoring, claim evaluation, decay response, enrichment cadence |
| **Operations** | 3 | 10 | 5 | Support triage, task routing, billing reconciliation, compliance scheduling |
| **Platform & Product** | 9 | 12 | 1 | Search ranking, onboarding flow, account closure orchestration |
| **Commercial & Revenue** | 4 | 8 | 0 | Conversion triggers, churn intervention, win-back eligibility |

</details>

---

## Data Model

```mermaid
erDiagram
    ACCOUNT ||--o{ LISTING : "0..N manages"
    ACCOUNT ||--o| BUYER_FACET : "always active"
    ACCOUNT ||--o| SUPPRESSION : "comms control"

    LISTING ||--o| VERIFICATION : "4-tier trust"
    LISTING ||--o| QUALITY_SCORE : "5-dim 0-100"
    LISTING ||--o| ENGAGEMENT : "views, searches, enquiries"
    LISTING ||--o{ TAXONOMY_TAG : "sector > area > spec"
    LISTING ||--o{ MEDIA_ITEM : "images, tier-gated"
    LISTING ||--o{ CREDIT : "client endorsements"

    BUYER_FACET ||--o{ SHORTLIST : "max 10"
    BUYER_FACET ||--o{ ENQUIRY : "sent to listings"
    BUYER_FACET ||--o{ SEARCH_HISTORY : "recent + saved"

    ACCOUNT {
        text id "Better Auth (text)"
        string email "verified"
        text_array departments
    }
    LISTING {
        uuid id
        enum entityType "freelancer | company | ..."
        enum claimStatus "unclaimed | claimed | disputed"
        enum subscriptionTier "free | standard | premium | partner"
        enum lifecycleStatus "active | suspended | archived"
    }
    VERIFICATION {
        enum tier "unclaimed > claimed > verified > premium_verified"
        timestamp claimedAt
        int verificationScore
    }
    QUALITY_SCORE {
        int composite "0-100"
        int completeness "0-25"
        int freshness "0-25"
        int accuracy "0-20"
        int richness "0-15"
        int verification "0-15"
    }
```

<details>
<summary><b>Full schema: 8 schema files, 17 migrations, ~50 tables</b></summary>

```
src/db/schema/
├── auth.ts              # Better Auth (user, session, verification)
├── accounts.ts          # Account profiles, departments
├── data-and-listings.ts # 25 tables — listings, taxonomy, engagement, credits
├── commercial.ts        # commercial_state, churn_analysis_log, sponsored_impressions
├── operations.ts        # support_tickets, task_specs, compliance, billing
├── intelligence.ts      # enrichment_schedules, decay_signals, perception_aggregates
├── correspondence.ts    # correspondence_log, suppressed_emails
└── shared.ts            # domain_events, deferred_actions, orchestrated_flows, decisions
```

</details>

---

## Search & Ranking

PostgreSQL full-text search with synonym expansion, trigram fallback, and a multiplicative ranking formula.

```mermaid
flowchart LR
    classDef input fill:#e8daef,stroke:#6c3483,color:#1a1a1a
    classDef process fill:#d4efdf,stroke:#1e8449,color:#1a1a1a
    classDef formula fill:#fef9e7,stroke:#b7950b,color:#1a1a1a

    Q(["Query"]):::input --> SYN["Synonym<br/>Expansion"]:::process --> FTS["tsvector<br/>@@"]:::process --> RANK:::formula
    FTS -- "0 results" --> TRI["Trigram<br/>Fallback<br/><i>similarity > 0.3</i>"]:::process --> OUT
    RANK --> OUT(["Results"])

    subgraph RANK ["Ranking Formula"]
        F["ts_rank_cd × (1.0 + quality_boost + paid_boost)"]
        QB["quality: composite/100 × 0.5"]
        PB["paid: 0.00 | 0.15 | 0.25"]
    end
```

> A high-quality free listing beats a low-quality premium listing. Quality is earned, visibility is bought — but quality always wins the tiebreak.

---

## Verification & Trust

```mermaid
stateDiagram-v2
    [*] --> Unclaimed : seeded from import
    Unclaimed --> Claimed : owner claims + email verified
    Claimed --> Verified : Companies House match + domain match
    Verified --> PremiumVerified : paid tier + enhanced evidence
    Claimed --> Unclaimed : claim abandoned (90d)

    state Claimed {
        [*] --> AutoApprove : CH active + domain email match
        [*] --> AutoReject : CH dissolved
        [*] --> ManualReview : evidence insufficient
        [*] --> DisputeResolution : competing claim
    }
```

---

## Event-Driven Coordination

25 typed domain events connect the four sub-entities. ~50 async consumers react to state changes. No polling, no shared state.

```mermaid
flowchart LR
    classDef dl fill:#d4efdf,stroke:#1e8449,color:#1a1a1a
    classDef ops fill:#d6eaf8,stroke:#2e86c1,color:#1a1a1a
    classDef pp fill:#e8daef,stroke:#6c3483,color:#1a1a1a
    classDef cr fill:#fce4ec,stroke:#c0392b,color:#1a1a1a
    classDef bus fill:#f9e79f,stroke:#b7950b,color:#333

    DL["D&L<br/><i>9 events</i>"]:::dl
    OPS["Ops<br/><i>3 events</i>"]:::ops
    PP["PP<br/><i>9 events</i>"]:::pp
    CR["CR<br/><i>4 events</i>"]:::cr

    EB(["Event Bus"]):::bus

    DL --> EB
    OPS --> EB
    PP --> EB
    CR --> EB

    EB --> DL
    EB --> OPS
    EB --> PP
    EB --> CR
```

<details>
<summary><b>Key event flows</b></summary>

| Trigger | Event | Key Consumers |
|---|---|---|
| User claims listing | `claim_approved` | D&L: quality recalc, enrichment upgrade · CR: trigger reset, win-back cancel · PP: search reindex |
| Paddle webhook | `subscription_tier_changed` | D&L: enrichment cadence adjust · PP: feature gates refresh · CR: revenue metrics update |
| Subscription cancelled | `subscription_ended` | CR: churn analysis + win-back scheduling · PP: downgrade feature access · Ops: update records |
| Quality drops below 40 | `quality_score_changed` | CR: low-quality intervention (notification + 30d check) |
| GDPR erasure | `erasure_completed` | PP: purge search indexes · CR: anonymise churn logs, cancel win-backs |
| Listing goes stale | `decay_signal_detected` | Ops: create ticket if unreachable · Intel: annotate with ticket status |

</details>

---

## Infrastructure Layer (S0)

Six shared modules that every domain builds on.

```
┌──────────────────────────────────────────────────────────────┐
│                    Shared Infrastructure                      │
├──────────────┬──────────────┬──────────────┬─────────────────┤
│  Event Bus   │  Scheduler   │ Flow Engine  │ Decision Logger │
│  25 events   │  35 actions  │ erasure +    │ typed decisions  │
│  ~50 async   │  self-perp.  │ closure      │ audit trail     │
│  consumers   │  retry logic │ orchestrated │                 │
├──────────────┼──────────────┼──────────────┼─────────────────┤
│    Email Transport (Resend)  │  Object Storage (R2)          │
│    logging · suppression ·   │  upload · download · variants  │
│    bounce handling · DSAR    │  WebP processing via sharp     │
└──────────────────────────────┴───────────────────────────────┘
```

---

## Intelligence Layer (S9)

The entity's perception, learning, and autonomy systems.

```mermaid
flowchart TD
    classDef perception fill:#d4efdf,stroke:#1e8449,color:#1a1a1a
    classDef decision fill:#fef9e7,stroke:#b7950b,color:#1a1a1a
    classDef learning fill:#e8daef,stroke:#6c3483,color:#1a1a1a
    classDef action fill:#d6eaf8,stroke:#2e86c1,color:#1a1a1a

    subgraph PERCEIVE ["Perception"]
        QS["Quality Scoring<br/><i>5 dimensions, 0-100</i>"]:::perception
        DECAY["Decay Detection<br/><i>website, email, CH, social, postcode</i>"]:::perception
        ANALYTICS["Analytics Pipeline<br/><i>search terms, demographics,<br/>competitor bench, enquiry response</i>"]:::perception
    end

    subgraph DECIDE ["Intelligence"]
        L["Learning Hypotheses<br/><i>L1-L7 measurement</i>"]:::decision
        CHURN["Proactive Churn<br/><i>engagement decline + billing signals</i>"]:::decision
        REVENUE["Revenue Health<br/><i>8-metric extended perception</i>"]:::decision
    end

    subgraph ACT ["Action"]
        CEREMONY["12 Ceremony Handlers<br/><i>taxonomy review, data health,<br/>principal briefing, etc.</i>"]:::action
        ENRICH["Enrichment Scheduling<br/><i>tiered cadence by verification</i>"]:::action
        INTERVENE["Interventions<br/><i>churn, quality, conversion</i>"]:::action
    end

    PERCEIVE --> DECIDE --> ACT
    ACT -.-> |"feedback"| PERCEIVE
```

---

## Codebase at a Glance

```
callsheet/
│
├── 0-strategic-frame/           # Entity architecture frame, output style guides
├── 1-investigation/             # 14 research deliverables (LOCKED)
├── 2-concept-design/            # 5 domain specs, 341 stress-test scenarios
│   └── diagrams/                # 38 Mermaid diagrams (technical + plain English)
├── 3-requirements/              # 11 slices (v2), 5 interface specs, 693 AC
├── 4-work-management/           # 82 work items, 93 retros, epochs/arcs/chapters
├── 5-launch-readiness/          # Deployment readiness tracker
│
├── src/
│   ├── app/                     # Next.js 16 pages (24 routes)
│   │   ├── admin/               # 8-page admin panel
│   │   ├── dashboard/           # Provider + buyer dashboard
│   │   ├── search/              # Full-text search with facets
│   │   ├── providers/[slug]/    # SSG + ISR listing profiles
│   │   └── api/                 # tRPC, auth, webhooks
│   │
│   ├── server/
│   │   ├── routers/             # 31 tRPC routers (20 domain + 10 admin + root)
│   │   └── trpc.ts              # Context, middleware, procedures
│   │
│   ├── domains/
│   │   ├── data-and-listings/   # Quality, decay, analytics, consumers
│   │   ├── commercial/          # Pricing, conversion, churn, win-back
│   │   ├── operations/          # Paddle, billing, compliance, support
│   │   ├── intelligence/        # Ceremony handlers, perception consumers
│   │   └── platform/            # Buyer UX, dashboard, enquiry, reminders
│   │
│   ├── lib/
│   │   ├── events/              # Event bus + singleton + types
│   │   ├── scheduler/           # 35 deferred action handlers
│   │   ├── flows/               # Orchestrated flow engine
│   │   ├── email/               # Resend transport + logging
│   │   └── services/            # DI container (AppServices)
│   │
│   └── db/
│       ├── schema/              # 8 schema files (~50 tables, 17 migrations)
│       └── seed/                # Taxonomy (7/64/269) + demo data
│
├── drizzle/                     # Migration SQL files
├── e2e/                         # Playwright API-level tests
└── .claude/skills/              # 12 AI agent pipeline skills
```

---

## Test Suite

```
703 unit tests        ██████████████████████████░░░░  40%
1,013 integration     ████████████████████████████████████████████░░  59%
7 E2E (API-level)     █░░░░░░░░░░░░░░░░░░░░░░░░░░░░░   1%
─────────────────────────────────────────────────────
1,723 total           All passing. 0 type errors.
```

Integration tests run against a real Postgres instance (Supabase local). No mocked databases.

---

## Build Sequence

The platform was built in 11 vertical slices, each stress-tested with 20+ boundary scenarios before implementation.

```
S0  Infrastructure    ████████████████████  52 AC   Event bus, scheduler, flow engine, email, storage
S1  Data Model        ████████████████████  42 AC   Schema, search, CRUD, integrity, consumers
S2  Onboarding        ████████████████████  41 AC   Account creation, listing creation, CH lookup
S3  Claim & Verify    ████████████████████  48 AC   Claim evaluation, approval/rejection, disputes
S4  Subscriptions     ████████████████████  50 AC   Paddle webhooks, feature gating, downgrade
S5  Provider Exp      ████████████████████  46 AC   Dashboard, enquiry inbox, profile strength
S6  Buyer Exp         ████████████████████  52 AC   Search page, shortlists, buyer dashboard
S7  Operations        ████████████████████ 101 AC   Admin panel, compliance, billing, health
S8  Commercial        ████████████████████  93 AC   Conversion, churn, win-back, revenue
S9  Entity Intel      ████████████████████ 101 AC   Quality scoring, decay, analytics, learning
S10 Hardening         ░░░░░░░░░░░░░░░░░░░░  72 AC   Not yet decomposed
    Presentation      ████████████████████  35 AC   tRPC wiring, UI components, search page
```

---

## Tech Stack

| Layer | Technology | Why |
|---|---|---|
| Framework | **Next.js 16** | App Router, RSC, ISR, API routes |
| Language | **TypeScript 5.9** (strict) | Zero `any`, zero type errors |
| API | **tRPC 11** | End-to-end type safety, batch requests |
| Database | **PostgreSQL** via **Supabase** | Full-text search, `pg_trgm`, JSONB |
| ORM | **Drizzle** | Type-safe schema, migrations, `$type<T>()` for JSONB |
| Auth | **Better Auth** | Email/password, session management |
| Payments | **Paddle** | Merchant of record, webhook-driven |
| Email | **Resend** | Transactional email with bounce handling |
| Storage | **Cloudflare R2** | S3-compatible, WebP variant generation |
| Styling | **Tailwind v4** + **shadcn/ui** | CSS-first config, Radix primitives |
| Testing | **Vitest** + **Playwright** | Unit + real-DB integration + API-level E2E |
| Hosting | **Vercel** | Edge-ready, ISR support |
| **Target cost** | **~£36/month** | Supabase free + Vercel free + R2 free tier + Resend free |

---

## Getting Started

```bash
# Prerequisites: Node.js 20+, Docker (for Supabase local)

# 1. Clone and install
git clone https://github.com/Rwb3n/callsheet.git
cd callsheet
npm install

# 2. Start local Supabase
npx supabase start

# 3. Set up environment
cp .env.example .env.local
# DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres

# 4. Push schema + seed
drizzle-kit push
npm run db:custom-sql
npm run db:seed
npm run db:seed-demo

# 5. Run
npm run dev          # http://localhost:3000

# 6. Test
npm run test              # 703 unit tests
npm run test:integration  # 1,013 integration tests (needs Supabase running)
npm run typecheck         # 0 errors
```

<details>
<summary><b>Nuclear reset</b></summary>

```bash
npm run db:reset    # supabase reset → drizzle push → custom-sql → seed → seed-demo
npm run dev:demo    # db:reset + dev server
```

</details>

---

## Architecture Diagrams

38 Mermaid diagrams in two versions — [technical](2-concept-design/diagrams/technical/) and [plain English](2-concept-design/diagrams/plain-english/). All render natively on GitHub.

| # | Technical | Plain English |
|---|---|---|
| 1 | [Macro Topology](2-concept-design/diagrams/technical/01-macro-topology.md) | [The Big Picture](2-concept-design/diagrams/plain-english/01-big-picture.md) |
| 2 | [Entity Relationships](2-concept-design/diagrams/technical/02-entity-relationship.md) | [Users and Listings](2-concept-design/diagrams/plain-english/02-users-and-listings.md) |
| 3 | [Procurement Engine](2-concept-design/diagrams/technical/03-procurement-engine.md) | [How the System Hires Humans](2-concept-design/diagrams/plain-english/03-hiring-humans.md) |
| 4 | [Paddle Webhooks](2-concept-design/diagrams/technical/04-paddle-webhook-routing.md) | [What Happens When Someone Pays](2-concept-design/diagrams/plain-english/04-payments.md) |
| 5 | [Search & Ranking](2-concept-design/diagrams/technical/05-search-ranking.md) | [How Search Works](2-concept-design/diagrams/plain-english/05-how-search-works.md) |
| 6 | [GDPR Erasure](2-concept-design/diagrams/technical/06-gdpr-erasure.md) | [Deleting Someone's Data](2-concept-design/diagrams/plain-english/06-deleting-data.md) |
| 7 | [Event Consumer Matrix](2-concept-design/diagrams/technical/07-event-consumer-matrix.md) | [Department Notifications](2-concept-design/diagrams/plain-english/07-department-notifications.md) |
| 8 | [Verification Escalation](2-concept-design/diagrams/technical/08-verification-escalation.md) | [How Trust Builds](2-concept-design/diagrams/plain-english/08-trust-badges.md) |
| 9 | [Decay & Enrichment](2-concept-design/diagrams/technical/09-data-decay-loop.md) | [Keeping Data Fresh](2-concept-design/diagrams/plain-english/09-keeping-data-fresh.md) |
| 10 | [Scheduler (35 actions)](2-concept-design/diagrams/technical/10-deferred-action-scheduler.md) | [The Task Scheduler](2-concept-design/diagrams/plain-english/10-task-scheduler.md) |
| 11 | [Support Triage](2-concept-design/diagrams/technical/11-support-triage.md) | [Support Requests](2-concept-design/diagrams/plain-english/11-support-requests.md) |
| 12 | [Claim Volume](2-concept-design/diagrams/technical/12-claim-volume.md) | [Claim Capacity](2-concept-design/diagrams/plain-english/12-claim-capacity.md) |
| 13 | [Onboarding Paths](2-concept-design/diagrams/technical/13-onboarding-paths.md) | [Three Paths to a Listing](2-concept-design/diagrams/plain-english/13-three-paths-to-listing.md) |
| 14 | [Conversion Funnel](2-concept-design/diagrams/technical/14-conversion-funnel.md) | [Converting Free to Paid](2-concept-design/diagrams/plain-english/14-converting-free-to-paid.md) |
| 15 | [Churn & Win-back](2-concept-design/diagrams/technical/15-churn-winback.md) | [When Someone Cancels](2-concept-design/diagrams/plain-english/15-cancellation.md) |
| 16 | [S0 Infrastructure](2-concept-design/diagrams/technical/16-s0-infrastructure.md) | [The Six Shared Tools](2-concept-design/diagrams/plain-english/16-shared-tools.md) |
| 17 | [Comms Pipeline](2-concept-design/diagrams/technical/17-communications-pipeline.md) | [Email End to End](2-concept-design/diagrams/plain-english/17-email-lifecycle.md) |
| 18 | [Integrity & Taxonomy](2-concept-design/diagrams/technical/18-integrity-taxonomy.md) | [Listing Quality Checks](2-concept-design/diagrams/plain-english/18-listing-quality-checks.md) |
| 19 | [Search Infrastructure](2-concept-design/diagrams/technical/19-search-infrastructure.md) | [Search Under the Hood](2-concept-design/diagrams/plain-english/19-search-under-the-hood.md) |

---

## Project Phases

```
Phase 0 — Strategic Frame        ██████████████████████████████  ACTIVE
Phase 1 — Investigation          ██████████████████████████████  COMPLETE (LOCKED)
Phase 2 — Concept Design         ██████████████████████████████  COMPLETE (341 scenarios)
Phase 3 — Requirements           ██████████████████████████████  COMPLETE (11 slices, 693 AC)
Phase 4 — Work Management        ██████████████████████████████  ACTIVE (82 work items)
Phase 5 — Launch Readiness       ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  PENDING
```

---

## Key Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Account model | Unified (buyer + provider) | Every user is both. Provider is opt-in facet. |
| Sub-entity boundaries | 4 autonomous domains | Black-box composability. Typed contracts only. |
| Search | PostgreSQL FTS + pg_trgm | Good enough until 10-20K listings. Service layer abstracts. |
| Ranking | Quality × relevance + paid boost | Quality earned (0-100 composite), visibility bought (tier multiplier). |
| Pricing | £199 / £399 / £699 annual | Standard / Premium / Partner. Freelancer discount considered. |
| Verification | 4-tier (Unclaimed → Premium Verified) | Companies House API automated. Progressive trust. |
| Events | In-process TypeScript bus | ~50 async consumers via `waitUntil()`. Migrate at >30% request duration. |
| Transactions | Orchestrated flows + event reactions | No distributed transactions. Erasure/closure are stepped flows. |

---

## Settled — Not Open for Discussion

These decisions are final. The rationale is documented in [entity-architecture-frame.md](0-strategic-frame/entity-architecture-frame.md) and concept design specs.

- Modular monolith (extract when bottlenecks demand)
- Domain events as primary coordination mechanism
- Application-level in-process event bus
- TypeScript const exports for schema versioning
- Sub-entity composability as a hard constraint
- No shared mutable state across domain boundaries

---

## License

Proprietary. All rights reserved.

---

<p align="center">
  <i>Built by an autonomous entity, for autonomous entities.</i>
</p>
