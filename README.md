# CALLSHEET — Investor Presentation Package

**Status:** Draft v1
**Prepared:** 2026-02-13
**Confidential:** For prospective investors and advisors only

---

## 1. One-Liner

CALLSHEET is an autonomous B2B discovery platform for UK production services — broadcast, film, and TV — replacing a legacy incumbent with actively-maintained data, intelligent matching, and a £36/month operating cost.

---

## 2. Problem

The UK production services directory market generates £15–20M/year across all platforms. The dominant incumbent (4rfv.co.uk, est. ~1996) operates as a static phonebook: no enrichment, no verification, no analytics, no self-service activation. Listings decay and nobody maintains them. Profile pages are dead ends.

The production industry is at an inflection point. Virtual production, AI tooling, and shifting commissioning economics create new entrants — companies and freelancers who lack established networks and need a platform to find and be found.

**What buyers experience today:**

```
+-------------------------------------------------------+
|  4rfv.co.uk — Typical Provider Page                   |
|-------------------------------------------------------|
|  Company Name                                         |
|  [stock placeholder image — no logo]                  |
|  Town, County                                         |
|  Tel: 0XX XXXX XXXX                                   |
|  www.example.com                                      |
|                                                       |
|  (no description, no portfolio, no reviews,           |
|   no analytics, no verification status)               |
|                                                       |
|  --> Dead end. User leaves.                           |
+-------------------------------------------------------+
```

**What providers get for £395/year at 4rfv:**

- Logo and 1,000 characters of description
- 6 images
- No analytics on who viewed their profile
- No verification or trust badge
- No control over when or how listing updates
- Manual sales process (no self-service)

---

## 3. Market

### 3.1 UK Production Directory Landscape

```
UK Production Directory Market (~£15-20M/year)
==============================================

  THE KNOWLEDGE (MBI / GlobalData)
  |- 15,000+ entries, 500 categories
  |- 21,500-25,000 monthly uniques, 80,000 registered
  |- £495-1,120/yr tiers
  |- Revenue: est. £2-4M/yr (parent MBI: £14.57M total)
  |- Tech: WordPress Listeo theme (off-the-shelf)

  4RFV (Flagship Media Group)
  |- ~4,700 unique active providers (claims 12,500)
  |- 110,000+ monthly uniques (historically ABC-audited)
  |- £120-500/yr tiers
  |- Revenue: <£1M/yr (micro-entity filing)
  |- Tech: ASP.NET/IIS, no self-service e-commerce
  |- Financials: 94% debt ratio, assets contracting

  MANDY
  |- 2.4-2.9M profiles globally (individual-focused)
  |- ~£99/yr individual membership
  |- Talent/crew marketplace, not B2B services
  |- UK share declining

  KAYS
  |- Print + digital bundle, £48 one-off
  |- Niche, shrinking relevance
```

### 3.2 Market Gap

No incumbent offers any of the following at any price:

| Capability | 4rfv | The Knowledge | Mandy | **CALLSHEET** |
|---|:---:|:---:|:---:|:---:|
| Profile analytics (who viewed) | -- | -- | -- | **Yes** |
| Verification / trust badges | -- | -- | Basic | **4-tier** |
| Self-service activation | -- | -- | Yes | **Yes** |
| Intelligent search / matching | -- | -- | -- | **Yes** |
| Active data enrichment | -- | -- | -- | **Yes** |
| Modern mobile-first UX | -- | -- | Partial | **Yes** |
| Competitor benchmarking | -- | -- | -- | **Yes** |

The £150–400/year pricing zone is structurally underserved for feature-rich B2B listings. 4rfv charges £395 for a logo and description. The Knowledge charges £495 for bottom-tier search priority. Neither offers analytics, verification, or self-service.

---

## 4. Product

### 4.1 How CALLSHEET Works

```
PROVIDER JOURNEY                     BUYER JOURNEY
===============                      =============

 4,700 seed listings                 Search by service, location,
 imported from public data           specialisation, availability
        |                                    |
        v                                    v
 Unclaimed listing exists            Browse enriched, verified
 (visible, searchable)               provider profiles
        |                                    |
        v                                    v
 Provider claims listing             View portfolio, credentials,
 (email verification)                trust badges, reviews
        |                                    |
        v                                    v
 Companies House auto-verify         Send enquiry (always free,
 (4-tier trust system)               no contact gating)
        |                                    |
        v                                    v
 Free tier: basic profile            Shortlist, compare providers
 Paid tiers: analytics,
 priority placement, badges
        |
        v
 "Who viewed your profile"
 drives upgrade conversion
 (74% of LinkedIn Premium
  cite this as top reason)
```

### 4.2 Four-Tier Verification

```
UNCLAIMED          CLAIMED            VERIFIED           PREMIUM VERIFIED
=========          =======            ========           ================
Seeded from        Owner creates      Companies House    Paid tier +
public data        account +          match + domain     enhanced evidence
                   email verified     email match        package

  [?]         -->    [C]         -->    [V]         -->    [V+]

Trust: Low         Trust: Medium      Trust: High        Trust: Highest
```

Auto-approve/reject within confidence thresholds. Between thresholds: human review procured on-demand (not permanently staffed).

### 4.3 Pricing

| Tier | Annual | Monthly | Target |
|---|---|---|---|
| **Free** | £0 | £0 | Directory population. Buyer-satisfying base. |
| **Standard** | £199/yr | £19/mo | Sole traders, emerging freelancers |
| **Premium** | £399/yr | £39/mo | Established freelancers, small companies |
| **Partner** | £699/yr | £69/mo | Established companies, facilities, post houses |

**Launch discount:** First-year Standard at £99 (annual only). First 500 subscribers or 6 months, whichever first. Matches Mandy's price point — reduces switching cost to near-zero.

**Pricing convergence:** Three independent research streams (UK competitor analysis, cross-market analogous directory analysis, freemium conversion benchmarks) independently converged on £199/£399/£699.

| Tier | Below | Above | Rationale |
|---|---|---|---|
| Standard £199 | 4rfv Basic (£120) | -- | "Under £200" psychological threshold |
| Premium £399 | Clutch Verified (~£399) | 4rfv Profile (£395) | Natural sweet spot |
| Partner £699 | The Knowledge Premier (£1,120) | Checkatrade Lite (~£1,022) | Top tier without lead-gen pricing |

### 4.4 Feature Differentiation

```
FREE                STANDARD (£199)      PREMIUM (£399)       PARTNER (£699)
====                ===============      ===============      ==============
Basic profile       + Analytics          + Priority search    + Top placement
Name, contact       + Who viewed you     + Competitor bench   + Featured badge
Category listing    + Engagement stats   + Review tools       + Multiple categories
                    + Extended profile   + Portfolio media    + Sponsored visibility
                    + Logo/branding      + Trust badges       + Dedicated support
```

The free tier serves buyers. Paid tiers serve providers' competitive ambitions. Free/paid line is set at launch and never moved.

---

## 5. Business Model

### 5.1 Revenue Model

Flat-fee provider subscriptions. Paddle as merchant of record (handles VAT collection/remittance globally). No per-transaction fees to customers. No buyer-side monetisation at V1.

**Evolution path:**

```
V1: Directory           V2: Buyer Premium        V3: SaaS Tools
(launch)                (at scale)               (market network)
================        ================         ================
Provider subs only      + Buyer premium tier     + Workflow tools
£199/£399/£699          + Advanced search        + Project matching
Flat-fee annual         + Shortlist features     + Invoicing/booking
                        + Market intelligence    + Industry analytics

Trigger: Launch         Trigger: >70% annual     Trigger: Usage data
                        renewal rate             shows SaaS demand
```

This mirrors proven trajectories: LinkedIn (recruitment ads → premium → SaaS), Yelp (listings → CPC → enterprise), Upwork (marketplace → enterprise SaaS).

### 5.2 Unit Economics

**Primary conversion lever:** Analytics visibility. 74% of LinkedIn Premium subscribers cite "who viewed your profile" as top upgrade reason. [Source: freemium-conversion-findings.md — §2]

**Conversion benchmarks (B2B SaaS, n=1,000+):**

| Source | Dataset | Rate |
|---|---|---|
| Lenny Rachitsky / Kyle Poyar / Pendo | n=1,000+ B2B SaaS | 3–5% good, 6–8% great |
| OpenView | n=450+ | 5% median |
| ProfitWell | n=73,000+ | 3–5% average, 10%+ top |
| Yelp (public financials, 2024) | 7.74M claimed → 515K paying | ~6.7% |

**CALLSHEET planning number:** 3–5% at launch, 6–8% target at maturity.

### 5.3 Revenue Projections (4,700 seed providers)

Tier distribution assumption: 70% Standard / 25% Premium / 5% Partner (based on analogous directory tier uptake patterns).

```
                      CONSERVATIVE    TARGET         OPTIMISTIC
                      3% conversion   5.5%           8%
                      ============    ============   ============
Paid customers:       141             259            376
  Standard (70%):      99              181            263
  Premium  (25%):      35               65             94
  Partner   (5%):       7               13             19

Revenue:
  Standard:           £19,701         £36,019        £52,337
  Premium:            £13,965         £25,935        £37,506
  Partner:             £4,893          £9,087        £13,281
                      -------         -------        -------
  TOTAL ARR:          £38,559         £71,041        £103,124

Monthly equiv:         £3,213          £5,920         £8,594
```

**At 10,000 providers (growth):** Target conversion yields ~£151K ARR.

### 5.4 Cost Structure

```
INFRASTRUCTURE COSTS (launch, 4,700 listings)
=============================================
Vercel Pro (hosting)              £16/mo
Supabase Pro (database)           £20/mo
Better Auth (authentication)       £0    (self-hosted, free at scale)
Cloudflare R2 (image storage)      £0    (10GB free tier)
Resend (transactional email)       £0    (3K emails/mo free tier)
Paddle (payments)                  0 fixed (5% + 40p per transaction)
                                  ------
TOTAL INFRASTRUCTURE:             £36/mo  (~£432/yr)

INFRASTRUCTURE COSTS (growth, 50,000 listings)
==============================================
Vercel Pro                        £16/mo
Supabase Pro (upgraded)           £36/mo
Cloudflare R2                      £1/mo
Resend (paid plan)                £16/mo
                                  ------
TOTAL INFRASTRUCTURE:             £69/mo  (~£828/yr)
```

```
OPERATING COSTS (estimated annual)
===================================
Companies House incorporation      £12 one-off
Virtual office                    ~£300/yr
ICO registration                   £40/yr
Insurance (PI + cyber)            ~£400/yr
Compliance advisor (initial)      ~£1,000 one-off
Accountant                        ~£1,200/yr
Resend Pro (for Art 14 batch)     ~£200/yr
Domain + misc                     ~£100/yr
                                  --------
TOTAL OPERATING (year 1):        ~£3,250

Paddle transaction fees:
  At target ARR (£71K):          ~£3,850/yr (5% + 40p)
                                  --------
ALL-IN YEAR 1 COST:             ~£7,530
```

### 5.5 Margin Profile

```
                      CONSERVATIVE    TARGET         OPTIMISTIC
Revenue:              £38,559         £71,041        £103,124
All-in costs:         ~£5,680         ~£7,530        ~£9,590
                      -------         -------        -------
Net margin:           £32,879         £63,511        £93,534
Margin %:             85.3%           89.4%          90.7%

Note: Costs include Paddle fees scaled to revenue.
      No salaries — entity operates autonomously.
      No paid acquisition — organic + SEO + direct outreach.
```

---

## 6. Competitive Advantage

### 6.1 Structural Moats

**1. Active data enrichment vs passive directory.** Incumbents wait for providers to update listings. CALLSHEET enriches continuously: Companies House API, domain verification, social signal, decay detection. Data quality is perception, not a feature.

**2. Market network architecture.** Every user is simultaneously provider and buyer. Each acquisition adds to both supply and demand. Effective CAC is halved. [Source: provider-buyer-duality-findings.md — Hagiu/Wright framework]

**3. Capital efficiency.** £36/month infrastructure. No human operator for routine operations. The entity operates autonomously within its decision authority and procures human resources on-demand when needed.

**4. Incumbent vulnerability.** 4rfv: 94% debt ratio, contracting assets, family-run, dated technology (ASP.NET), manual sales process. The Knowledge: £495 minimum paid tier on a WordPress template, owned by GlobalData (corporate parent with different priorities). Neither can respond with technology because they lack the engineering capacity.

**5. Verification as trust infrastructure.** No incumbent offers automated verification. CALLSHEET's 4-tier system (Companies House API, domain matching, social signal) creates a trust layer the industry lacks. Trust badges drive 15–25% conversion lift.

### 6.2 Why Now

- Virtual production and AI tooling create new industry entrants who need to be found
- Incumbent technology debt is now structural (ASP.NET, WordPress templates)
- AI-native operating model enables autonomous operation at near-zero marginal cost
- Paddle-as-merchant-of-record eliminates VAT compliance overhead that historically blocked solo operators
- Production industry consolidation (studios merging, new facilities opening) increases directory demand

---

## 7. Entity Architecture

CALLSHEET is not a product operated by a human founder. It is an autonomous commercial entity. The platform is what the entity *does*. The entity itself is a cognitive system that perceives its environment, makes decisions, takes action, and procures human or machine resources when it cannot act alone.

### 7.1 Six-Layer Architecture

```
LAYER 6: PRINCIPAL (Owner)
  Sets purpose, governance, kill conditions. Receives dividends + learnings.

LAYER 5: LEGAL SHELL (CALLSHEET Ltd)
  Companies House, banking, contracts, HMRC, ICO.

LAYER 4: MEATSPACE INTERFACE
  Human procurement (on-demand contractors, compliance advisor).
  Machine procurement (APIs, cloud, payment processor).
  Market-facing communication (email, support, onboarding).

LAYER 3: DOMAIN INSTANCE (four autonomous sub-entities)
  +-----------------------------------------------------+
  | CALLSHEET (root entity — orchestrator)               |
  |                                                      |
  |  +------------------+  +------------------+          |
  |  | DATA & LISTINGS  |  | OPERATIONS       |          |
  |  | Quality scoring,  |  | Support triage,  |          |
  |  | claim evaluation, |  | compliance,      |          |
  |  | verification,     |  | billing recon,   |          |
  |  | taxonomy, decay   |  | human procure    |          |
  |  +------------------+  +------------------+          |
  |                                                      |
  |  +------------------+  +------------------+          |
  |  | PLATFORM &       |  | COMMERCIAL &     |          |
  |  | PRODUCT          |  | REVENUE          |          |
  |  | Search, onboard, |  | Pricing, churn,  |          |
  |  | admin, email,    |  | conversion,      |          |
  |  | account closure  |  | win-back, tiers  |          |
  |  +------------------+  +------------------+          |
  |                                                      |
  |  Communication: typed domain events (25 event types) |
  |  No shared mutable state across sub-entity boundaries|
  +-----------------------------------------------------+

LAYER 2: COGNITIVE SUBSTRATE (reusable across future entities)
  HAIOS orchestration, perception, decision engine, learning.
  Fractal: same pattern at root level and inside each sub-entity.

LAYER 1: CORE INVARIANTS (governance kernel)
  Non-negotiable rules. Entity cannot modify. Escalation triggers.
  Financial limits. Kill conditions. GDPR constraints.
```

### 7.2 Why This Matters to Investors

**Operational leverage.** The entity does not require a human operator for routine operations. Quality scoring, claim verification, decay detection, churn intervention, search ranking, compliance scheduling — all execute as decision architectures within sub-entities. Human resources are procured on-demand for tasks the entity cannot perform autonomously (compliance review, edge-case claim adjudication).

**Autonomy graduation.** Each sub-entity earns expanded decision authority based on its track record:

```
SUB-ENTITY          V1 (launch)                   V2 (earned)
==========          ===========                   ===========
Data & Listings     Quality scoring, auto-approve/ Adjust confidence thresholds
                    reject claims within thresholds autonomously, manage
                                                   enrichment budget

Operations          Support triage, task routing,   Procure contractors
                    billing reconciliation          autonomously within budget

Platform            Search ranking, onboarding,     Adjust ranking weights,
                    account closure orchestration   A/B test onboarding

Commercial          Conversion triggers, churn      Adjust trigger thresholds,
                    intervention, win-back          modify conversion messaging
```

**Framework value.** CALLSHEET is the first instance of a reusable entity framework. Layers 1 and 2 (governance kernel + cognitive substrate) are vertical-agnostic. A future entity in a different vertical shares the substrate but has different Layer 3 sub-entities. CALLSHEET's operational data is R&D data for the framework.

**Composability.** Sub-entities are black boxes with typed contracts. Any sub-entity can be replaced, upgraded, or reconfigured without rewriting the system — as long as its contract is preserved. This is not microservices for the sake of it; it is the structural guarantee that the entity can evolve without replatforming.

---

## 8. Go-to-Market

### 8.1 Launch Strategy

```
PHASE 1: Seed (pre-launch)
  Import ~4,700 provider listings from public data (4rfv)
  Enrich via Companies House API, domain verification
  Send Article 14 GDPR notices (30-day window)

PHASE 2: Claim (launch)
  Providers claim their listings (email verification)
  Immediate endowment effect: "your listing already exists"
  Free tier: full buyer-visible profile
  Conversion lever: "who viewed your profile" analytics

PHASE 3: Convert (months 1-6)
  Target: 3-5% free-to-paid conversion (140-235 paying)
  Launch discount: £99 first-year Standard (first 500)
  Activation window: day 7 engagement is critical
  Product Qualified Leads convert at 3x rate (25% vs 8%)

PHASE 4: Grow (months 6-12+)
  SEO: actively maintained listings outrank decaying incumbents
  Organic: provider-to-provider referrals (market network)
  Direct outreach: targeted at underserved categories
  Target: 10,000 providers, 5.5% conversion (~£151K ARR)
```

### 8.2 Cold Start Solution

The production industry is a market network. Every provider is also a buyer. Each acquisition adds to both supply and demand simultaneously. [Source: provider-buyer-duality-findings.md — Hagiu/Wright, "reduce a two-sided chicken-and-egg problem to a one-sided problem by focusing on users that act as both buyers and sellers"]

CALLSHEET does not need to solve a two-sided cold start. The 4,700 seed listings provide immediate buyer utility (searchable directory). Claiming providers become both supply (their profile) and demand (they search for crew and services).

### 8.3 No Paid Acquisition Required at V1

- 4rfv has 110,000+ monthly uniques — these buyers will search for alternatives when they find better results elsewhere
- SEO on actively-maintained, verified listings vs decaying static pages
- Production industry is tight-knit: word-of-mouth is the primary channel
- Trade publications and production forums as awareness channels
- No Yelp-style aggressive outbound (hard constraint: anti-pattern from research)

---

## 9. Financial Summary

```
YEAR 1 SCENARIO MODELLING
==========================

                        Conservative    Target      Optimistic
                        ------------    ------      ----------
Seed providers:         4,700           4,700       4,700
Conversion rate:        3%              5.5%        8%
Paying customers:       141             259         376
ARR:                    £38,559         £71,041     £103,124

All-in costs:           ~£5,680         ~£7,530     ~£9,590
Net margin:             £32,879         £63,511     £93,534
Margin %:               85%             89%         91%

Infrastructure:         £432/yr         £432/yr     £432/yr
Paddle fees:            ~£2,000         ~£3,850     ~£5,600
Operating overhead:     ~£3,250         ~£3,250     ~£3,250


GROWTH SCENARIO (10,000 providers)
===================================

                        Conservative    Target      Optimistic
Conversion rate:        3%              5.5%        8%
Paying customers:       300             550         800
ARR:                    £82,000         £151,000    £219,000

Infrastructure:         ~£828/yr        ~£828/yr    ~£828/yr
Net margin %:           ~84%            ~89%        ~91%


BREAKEVEN
=========
Monthly infrastructure: £36
Required to break even: 3 Standard annual subscribers (£597)
                        or 2 Standard monthly subs (£38/mo)
```

### 9.1 Key Assumptions

| Assumption | Value | Source | Risk |
|---|---|---|---|
| Seed providers | 4,700 | 4rfv scrape analysis | Low — data exists |
| Conversion rate | 3–8% | B2B SaaS benchmarks (n=1,000+) | Medium — no direct analogue |
| Tier split | 70/25/5 | Analogous directory patterns | Medium |
| Churn | Not modelled | No production-directory churn data exists | Medium — annual billing reduces churn vs monthly |
| Provider growth | Organic only | No paid acquisition budget | Low risk — no CAC to recover |
| Infrastructure cost | £36/mo | Itemised vendor pricing | Low |

### 9.2 What Is Not Modelled

- **Churn.** No production-directory churn benchmark exists. LinkedIn Premium: 65% annual renewal. Design mitigation: annual billing default, win-back flows, churn intervention decision architecture.
- **Buyer-side revenue.** V2 opportunity. Not projected until usage data proves demand.
- **Advertising/sponsorship.** 4rfv generates £290–600 per advertising unit. CALLSHEET architecture supports sponsored placements but they are not modelled for V1 revenue.
- **SaaS tool revenue.** V3 opportunity (project matching, invoicing, workflow tools). Architecturally anticipated but not commercially active.

---

## 10. Risk Assessment

| Risk | Severity | Mitigation |
|---|---|---|
| 4rfv data source restricted (licence required) | HIGH | Document public-data basis. Budget for licence if needed. Entire launch strategy depends on seed data. |
| Conversion below 3% | MEDIUM | £36/mo infrastructure means near-zero burn. Iterate on conversion levers. Breakeven = 3 annual subs. |
| Incumbent response | LOW | 4rfv lacks engineering capacity (ASP.NET, 94% debt). The Knowledge owned by corporate parent. Neither can pivot technology quickly. |
| GDPR compliance failure | HIGH | Compliance advisor engaged pre-launch. Article 14 process specified. DSAR decision architecture designed. ICO registration before any data processing. |
| Production industry too small | MEDIUM | £15–20M existing market. V2 verticals (gaming, events, digital content) expand TAM. Architecture is vertical-agnostic from day one. |
| Entity cannot operate autonomously at V1 | LOW | V1 autonomy is scoped and conservative: scoring, routing, scheduling. Human escalation is designed in. Graduation is earned, not assumed. |

---

## 11. Team / Entity Structure

CALLSHEET is designed to operate without permanent staff. The principal (founder, sole director) sets governance and receives learnings. The entity operates.

```
PRINCIPAL (founder)
  |
  +-- Sets governance (Layer 1)
  +-- Reviews escalations
  +-- Receives dividends + framework learnings
  +-- Procures initial resources (compliance, accountant)
  |
  v
CALLSHEET Ltd (legal shell)
  |
  v
CALLSHEET (autonomous entity)
  |
  +-- Data & Listings: quality, verification, enrichment
  +-- Operations: support, compliance, billing
  +-- Platform: search, onboarding, admin, email
  +-- Commercial: pricing, conversion, churn, win-back
  |
  +-- On-demand human procurement:
      +-- Compliance advisor (~£500-1,500 initial)
      +-- Accountant (~£1,200/yr)
      +-- Edge-case claim reviewers (per-task)
      +-- Content moderators (per-task)
```

**Key point:** No salaries, no office, no permanent headcount. Human resources are procured on-demand for tasks the entity cannot yet perform autonomously. The principal's ongoing involvement is governance and strategic direction — not operations.

---

## 12. Use of Funds (If Applicable)

CALLSHEET is viable as a bootstrap (£36/month infrastructure, <£3,300/year operating costs, breakeven at 3 annual subscribers). External funding accelerates but is not required.

**If self-funded:**

```
Year 1 total outlay:   ~£7,530 (all-in at target scenario)
Year 1 net margin:     ~£63,500 (target)
Payback period:        Month 1 (if 3+ annual subscribers)
```

**If externally funded (indicative allocation):**

```
Amount: £25,000-50,000 (SEIS-eligible)

Allocation:
  Data acquisition + enrichment       30%   Accelerate beyond 4rfv seed
  Compliance + legal                  15%   Comprehensive GDPR, T&Cs, DPA
  Marketing + awareness               25%   Trade publications, events,
                                            targeted outreach campaigns
  Operational runway (12 months)      20%   Infrastructure, insurance,
                                            accountant, contingency
  Framework R&D                       10%   Layer 2 substrate development
                                            for entity portfolio thesis
```

**SEIS/EIS note:** CALLSHEET Ltd is eligible for SEIS (Seed Enterprise Investment Scheme) — investors receive 50% income tax relief on up to £200,000 invested. Advance assurance from HMRC can be obtained pre-investment. This makes early-stage risk significantly more attractive for UK angel investors.

---

## 13. Key Metrics to Track

```
NORTH STAR: Paid conversion rate (target: 5.5%)

Leading indicators:
  - Claim rate (seed listings claimed / total seed)
  - Day 7 activation (engaged with analytics within 7 days)
  - Search-to-enquiry rate (buyer engagement)
  - Profile view velocity (foundation for analytics lever)

Revenue metrics:
  - MRR / ARR
  - Tier distribution (Standard / Premium / Partner)
  - Annual vs monthly billing mix
  - Annual renewal rate (target: >70% for V2 trigger)

Entity health:
  - Autonomous decision accuracy (claims, quality scores)
  - Escalation frequency (trending down = graduation candidate)
  - Data quality score (listing freshness, completeness)
  - Infrastructure cost / paying customer
```

---

## 14. Summary

```
+===================================================================+
|                                                                   |
|  CALLSHEET replaces a decaying incumbent in a £15-20M market      |
|  with a capital-efficient autonomous platform.                    |
|                                                                   |
|  Infrastructure: £36/month.                                       |
|  Breakeven: 3 annual subscribers.                                 |
|  Target year 1: £71K ARR at 89% margin.                          |
|  Growth path: 10,000 providers -> £151K ARR.                      |
|  Evolution: directory -> buyer premium -> SaaS tools.             |
|                                                                   |
|  No permanent staff. No office. No paid acquisition.              |
|  An autonomous entity that operates itself.                       |
|                                                                   |
+===================================================================+
```

---

## Cross-References

| Document | Relationship |
|---|---|
| `0-strategic-frame/entity-architecture-frame.md` | Governing design frame. Entity architecture (§7) derives from this. |
| `0-strategic-frame/strategic-positioning.md` | Product positioning. Problem + market (§§2–3) summarise this. |
| `1-investigation/commercial-and-revenue/competitor-pricing-findings.md` | Market data, competitor analysis, pricing benchmarks. |
| `1-investigation/commercial-and-revenue/analogous-directory-pricing-findings.md` | Cross-market pricing validation, revenue projections. |
| `1-investigation/commercial-and-revenue/freemium-conversion-findings.md` | Conversion benchmarks, activation window, anti-patterns. |
| `1-investigation/commercial-and-revenue/provider-buyer-duality-findings.md` | Market network thesis, cold start, unified account. |
| `1-investigation/platform-and-product/platform-architecture-decisions.md` | Infrastructure cost breakdown (£36/month). |
| `2-concept-design/commercial-and-revenue.md` (v4) | Subscription lifecycle, tier differentiation, pricing architecture. |
| `5-launch-readiness/LAUNCH-READINESS-TRACKER.md` | Pre-launch workstreams, dependency map, timeline. |
