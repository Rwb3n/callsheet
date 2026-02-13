# CALLSHEET — Investor Presentation Package

**Status:** Draft v2 — stress tested (20 scenarios, 12 fixes applied)
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
[Derived from Companies House filings, published pricing, estimated customer counts]
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

### 3.3 TAM / SAM / SOM

```
TAM (Total Addressable Market)
  UK production services directory spend:        £15-20M/yr
  Derived from: Companies House filings (MBI £14.57M total revenue,
  Flagship Media <£1M) + estimated customer counts x published pricing.
  Includes: listing fees, advertising, print, events across all platforms.

SAM (Serviceable Addressable Market)
  Broadcast/film/TV B2B services directory segment:  £3-5M/yr
  4rfv (<£1M) + The Knowledge's directory share (est. £2-4M of MBI's £14.57M).
  Excludes: print publications, production intelligence subscriptions,
  talent/crew marketplaces (Mandy), trade event revenue.

SOM (Serviceable Obtainable Market)
  Year 1 target:    £71K  (1.4-2.4% of SAM)
  Year 3 target:    £200K (4-7% of SAM)
  10K providers:    £151K (3-5% of SAM)
```

The SAM is deliberately conservative. V2 verticals (gaming, events, digital content) and buyer-side premium expand TAM beyond the current production directory market.

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

**Launch discount impact on year 1 actual revenue:** The projections above use full pricing. The £99 launch discount (first 500 Standard subscribers) reduces year 1 collected revenue. At target scenario: if all 181 Standard subscribers take the discount, year 1 Standard revenue = 181 × £99 = £17,919 (vs £36,019 at full price). Year 1 actual collected revenue at target = ~£53K. Year 2 revenue returns to full pricing as discount subscribers renew at £199.

### 5.4 Cost Structure

```
INFRASTRUCTURE COSTS (launch, 4,700 listings)
=============================================
Vercel Pro (hosting)              £16/mo
Supabase Pro (database)           £20/mo
Better Auth (authentication)       £0    (self-hosted, free at scale)
Cloudflare R2 (image storage)      £0    (10GB free tier)
Resend (transactional email)       £0    (3K emails/mo free tier)
Paddle (payments)                  0 fixed (5% + 50¢ USD per transaction)
                                  ------
TOTAL INFRASTRUCTURE:             £36/mo  (~£432/yr)

Paddle fee assumption: ~5% of gross revenue. Per-transaction component
(50¢ USD) is immaterial at annual billing cadence. Annual billing is
the default; monthly exists but is not promoted. Revenue projections
assume 90% annual / 10% monthly billing mix.

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

Paddle transaction fees (5% + 50¢ USD per transaction):
  Year 1 (at ~£53K collected):   ~£2,700
  Year 2+ (at £71K run-rate):    ~£3,600
                                  --------
ALL-IN YEAR 1 COST:             ~£6,000
ALL-IN YEAR 2+ COST:            ~£7,000
```

### 5.5 Margin Profile

```
YEAR 1 (actual collected, with launch discount):

                      CONSERVATIVE    TARGET         OPTIMISTIC
Revenue:              £28,659         £52,941        £76,824
All-in costs:         ~£4,680         ~£6,000        ~£7,590
                      -------         -------        -------
Net margin:           £23,979         £46,941        £69,234
Margin %:             84%             89%            90%

YEAR 2+ (full pricing, no launch discount):

                      CONSERVATIVE    TARGET         OPTIMISTIC
Run-rate ARR:         £38,559         £71,041        £103,124
All-in costs:         ~£5,180         ~£7,030        ~£9,090
                      -------         -------        -------
Net margin:           £33,379         £64,011        £94,034
Margin %:             87%             90%            91%

Note: Costs include Paddle fees (~5% of revenue).
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

### 8.2 Claim Rate Assumptions

The conversion funnel has two stages: claim (free) then upgrade (paid). The seed-to-claim rate determines the addressable base for paid conversion.

```
                        Conservative    Target      Optimistic
Seed listings:          4,700           4,700       4,700
Claim rate (6 months):  10%             20%         35%
Claimed listings:       470             940         1,645
Paid conversion (of claimed): 30%      28%         23%
Paying customers:       141             259         376

Note: Paid conversion as % of claimed is higher than the 3-8%
headline figure because the headline measures conversion against
ALL seed listings. Of providers who actively claim, a much higher
proportion converts — the claim itself is a strong intent signal.
```

**Claim rate benchmarks:** Yelp reports 7.74M claimed pages out of an estimated 50M+ total business listings (~15% claim rate). Production industry providers have stronger incentive to claim (competitive, reputation-conscious). Planning assumption: 15–25% claim rate in first 6 months. [Assumption — no direct production-directory claim rate data exists]

### 8.3 Cold Start Solution

The production industry is a market network. Every provider is also a buyer. Each acquisition adds to both supply and demand simultaneously. [Source: provider-buyer-duality-findings.md — Hagiu/Wright, "reduce a two-sided chicken-and-egg problem to a one-sided problem by focusing on users that act as both buyers and sellers"]

CALLSHEET does not need to solve a two-sided cold start. The 4,700 seed listings provide immediate buyer utility (searchable directory). Claiming providers become both supply (their profile) and demand (they search for crew and services).

### 8.4 No Paid Acquisition Required at V1

- 4rfv has 110,000+ monthly uniques — these buyers will search for alternatives when they find better results elsewhere
- SEO on actively-maintained, verified listings vs decaying static pages
- Production industry is tight-knit: word-of-mouth is the primary channel
- Trade publications and production forums as awareness channels
- No Yelp-style aggressive outbound (hard constraint: anti-pattern from research)

---

## 9. Financial Summary

```
YEAR 1 SCENARIO MODELLING (run-rate ARR at full pricing)
=========================================================

                        Conservative    Target      Optimistic
                        ------------    ------      ----------
Seed providers:         4,700           4,700       4,700
Conversion rate:        3%              5.5%        8%
Paying customers:       141             259         376
Run-rate ARR:           £38,559         £71,041     £103,124

Year 1 ACTUAL collected (with £99 launch discount on Standard):
  Discounted Standard:  £9,801          £17,919     £26,037
  Premium + Partner:    £18,858         £35,022     £50,787
  TOTAL COLLECTED Y1:   ~£28,659        ~£52,941    ~£76,824

All-in costs:           ~£4,680         ~£6,000     ~£7,590
Net margin (Y1 actual): £23,979         £46,941     £69,234
Margin %:               84%             89%         90%

Infrastructure:         £432/yr         £432/yr     £432/yr
Paddle fees (~5%):      ~£1,500         ~£2,700     ~£3,900
Operating overhead:     ~£2,750         ~£2,750     ~£2,750

Year 2 returns to full pricing (£199 Standard on renewal).


GROWTH SCENARIO (10,000 providers, full pricing)
=================================================

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
| Claim rate (6 months) | 15–25% | Yelp ~15% claim rate; production industry stronger incentive | Medium — no direct analogue |
| Paid conversion (of seed) | 3–8% | B2B SaaS benchmarks (n=1,000+) | Medium — no direct analogue |
| Tier split | 70/25/5 | Analogous directory patterns | Medium |
| Annual retention | 70% | Between LinkedIn Premium (65%) and B2B SaaS median (~85%) | Medium — planning assumption |
| Billing mix | 90% annual / 10% monthly | Annual is default; monthly not promoted | Low |
| Provider growth | Organic to 10K by Y3 | No paid acquisition budget | Medium — depends on SEO + word-of-mouth |
| Infrastructure cost | £36/mo | Itemised vendor pricing | Low |

### 9.2 Churn Sensitivity

No production-directory churn benchmark exists. The table below shows steady-state paying customers and ARR at different annual retention rates, assuming target conversion (5.5% of seed base) with continuous new conversion replacing churned customers.

```
CHURN IMPACT AT DIFFERENT RETENTION RATES
(target scenario: 259 new paying customers/year, constant acquisition)

Annual retention:     50%         65%         75%         85%
                      ====        ====        ====        ====
Year 1 paying:        259         259         259         259
Year 2 paying:        389         427         453         479
Year 3 paying:        454         537         599         666
Steady-state paying:  518         740         1,036       1,727
Steady-state ARR:     £142K       £203K       £284K       £474K

Formula: steady-state = new_per_year / (1 - retention_rate)
Year 2 = 259 new + (259 x retention)
Year 3 = 259 new + (year 2 total x retention)

Note: Steady-state assumes constant 259 new/year from a static 4,700 base.
Provider growth (to 10K by Y3) increases new customers per year and
accelerates convergence.
```

**Reference:** LinkedIn Premium reports 65% first-year renewal. Annual billing (CALLSHEET's default) typically achieves higher retention than monthly. Planning assumption: 65–75% annual retention.

### 9.3 Three-Year Projection

```
                        Year 1          Year 2          Year 3
                        ======          ======          ======
Provider base:          4,700           6,500           10,000
  (growth: organic, SEO, outreach)
New paid (5.5%):        259             358             550
Returning (70% ret.):   --              181             378
Total paying:           259             539             928

Revenue (full pricing):
  New customers:        £71K            £98K            £151K
  Renewals:             --              £50K            £104K
  TOTAL ARR:            £71K            £148K           £255K

Year 1 actual collected (with launch discount):
  Standard at £99:      £18K
  Premium + Partner:    £35K
  TOTAL COLLECTED Y1:   ~£53K

Infrastructure:         £432            £600            £828
Paddle fees (~5%):      £3.6K           £7.4K           £12.8K
Operating overhead:     £3.3K           £2.5K           £2.5K
                        -----           -----           -----
All-in costs:           £7.3K           £10.5K          £16.1K
Net margin:             ~£46K (Y1 disc) ~£138K          ~£239K
Margin %:               86%             93%             94%

Assumptions: 70% annual retention, 90% annual billing,
provider base grows to 10K by Y3 (organic only),
tier split 70/25/5 constant, full pricing from Y2.
```

### 9.4 What Is Not Modelled

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

## 11. Founder & Entity Structure

### 11.1 Founder

[PLACEHOLDER — Complete before distribution]

| Field | Detail |
|---|---|
| Name | [Founder name] |
| Role | Sole director, CALLSHEET Ltd. Principal (Layer 6). |
| Domain expertise | [Production industry experience, technical background, relevant prior work] |
| Technical capability | [Full-stack / architecture / AI experience — what qualifies them to build and operate the entity] |
| Why this market | [Personal connection to the production industry, insight that triggered the opportunity] |
| Time commitment | [Full-time / part-time. Note: entity architecture reduces operational burden to governance + strategic direction] |

### 11.2 Entity Operating Structure

CALLSHEET is designed to operate without permanent staff. The founder sets governance and receives learnings. The entity operates.

```
FOUNDER (principal)
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

**Key point:** No salaries, no office, no permanent headcount. Human resources are procured on-demand for tasks the entity cannot yet perform autonomously. The founder's ongoing involvement is governance and strategic direction — not operations.

---

## 12. Use of Funds (If Applicable)

CALLSHEET is viable as a bootstrap (£36/month infrastructure, <£3,300/year operating costs, breakeven at 3 annual subscribers). External funding accelerates but is not required.

**If self-funded:**

```
Year 1 total outlay:   ~£6,000 (all-in at target scenario)
Year 1 collected:      ~£53,000 (target, with launch discount)
Year 1 net margin:     ~£47,000
Year 2 run-rate ARR:   ~£148,000 (full pricing + renewals)
Payback period:        Month 1 (breakeven = 3 annual subscribers)
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

**SEIS/EIS note:** CALLSHEET Ltd is eligible for SEIS (Seed Enterprise Investment Scheme). Individual investors receive 50% income tax relief on up to £200,000 invested per tax year. The company can raise up to £250,000 lifetime under SEIS. Advance assurance from HMRC can be obtained pre-investment. Capital gains tax exemption on SEIS shares held 3+ years. This makes early-stage risk significantly more attractive for UK angel investors.

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

## 14. Exit / Returns

CALLSHEET is designed for capital efficiency, not a binary exit event. Multiple return paths exist:

**1. Dividend stream (primary path).** At 89% margin on £71K ARR (target Y1), the business generates ~£63K distributable profit in year 1 with near-zero reinvestment requirements. At steady-state (£255K ARR, Y3), annual distributable profit exceeds £239K. For a £25–50K SEIS investment, dividend returns alone achieve payback within 1–2 years.

**2. Strategic acquisition.** The production services directory market has consolidation precedent: GlobalData acquired MBI (The Knowledge's parent) in 2022. A platform with verified data, active listings, and a proven subscription base is an acquisition target for media conglomerates, recruitment platforms, or vertical SaaS roll-ups. Likely acquirers: GlobalData (already in the space), Spotlight/The Casting Networks (adjacent vertical), or PE-backed directory roll-ups.

**3. Framework licensing.** The entity architecture (Layers 1–2) is vertical-agnostic. A proven substrate creates optionality: license to other verticals, spin out additional entities (events, gaming, digital content), or sell the framework IP separately from the CALLSHEET instance.

**4. Secondary sale.** SEIS shares become CGT-exempt after 3 years. A profitable, autonomous business with minimal operational burden is attractive to lifestyle-focused acquirers or small PE funds.

**Planning assumption:** Dividend returns are the base case. Acquisition and framework licensing are upside scenarios that become viable at scale (10K+ providers, £150K+ ARR).

---

## 15. Summary

```
+===================================================================+
|                                                                   |
|  CALLSHEET replaces a decaying incumbent in a £15-20M market      |
|  with a capital-efficient autonomous platform.                    |
|                                                                   |
|  Infrastructure: £36/month.                                       |
|  Breakeven: 3 annual subscribers.                                 |
|  Year 1: ~£53K collected (launch discount), £71K run-rate ARR.    |
|  Year 3: £255K ARR at 94% margin (10K providers, 70% retention).  |
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
