# CALLSHEET — Investor Presentation

**Status:** Draft v2 — stress tested (20 scenarios, 12 fixes applied)
**Date:** February 2026
**Confidentiality:** For prospective investors and advisors only

---

## 1. What Is CALLSHEET?

> CALLSHEET is a modern online directory for the UK broadcast, film, and TV production industry. It replaces outdated incumbents with actively-maintained data, intelligent search, and verified provider profiles — at a fraction of the cost to run.

Think of it as the Yellow Pages for production services — except the Yellow Pages hasn't been updated since the late 1990s, charges nearly £400 a year for a basic listing, and gives you no way to tell whether the company you're looking at is any good.

CALLSHEET fixes that. Providers get verified profiles with analytics. Buyers get trustworthy search results. The whole thing costs £416 a month to run — £36 for the platform infrastructure and £380 for the AI that operates the business.

---

## 2. The Problem

The UK production services directory market is worth £15–20 million a year across all platforms. The dominant player, 4rfv.co.uk, has been operating since roughly 1996. It works like a static phonebook: you get a company name, a phone number, maybe a logo, and that's it.

### What £395 a year buys you at 4rfv today

- A logo and 1,000 characters of description
- Six images
- No analytics — you have no idea who viewed your profile
- No verification or trust badges
- No way to update your listing yourself — it's all manual
- No self-service signup — you have to go through a sales process

The listing data decays and nobody maintains it. Profile pages are dead ends — buyers arrive, see minimal information, and leave. Meanwhile, the production industry is changing. Virtual production, AI tooling, and shifting commissioning economics are creating new companies and freelancers who don't have established networks. They need a way to find work and be found. The current platforms don't serve them.

---

## 3. The Market

### Who's in it now

| Platform | What They Charge | What They Offer | Weakness |
|---|---|---|---|
| The Knowledge (owned by GlobalData) | £495–£1,120/yr | 15,000+ entries, 500 categories | Built on a WordPress template. No analytics, no verification. |
| 4rfv (Flagship Media Group) | £120–£500/yr | ~4,700 active providers, 110K monthly visitors | 1990s technology. 94% debt ratio. No self-service. Assets contracting. |
| Mandy | ~£99/yr | 2.4–2.9M profiles globally | Individual talent/crew focus, not B2B services. UK share declining. |
| Kays | £48 one-off | Print + digital bundle | Niche and shrinking. |

*Sources: Companies House filings (MBI/GlobalData £14.57M total revenue; Flagship Media micro-entity filing, <£1M). Published pricing pages. Estimated customer counts cross-referenced with historical ABC-audited traffic.*

### What none of them offer

At any price point, no current platform provides: profile analytics (who viewed your listing), automated verification and trust badges, self-service activation, intelligent search or matching, active data enrichment, modern mobile-first design, or competitor benchmarking. CALLSHEET offers all of these.

### Market sizing

| Measure | Value | Basis |
|---|---|---|
| TAM (total directory market) | £15–20M/yr | Companies House filings + published pricing × estimated customer counts |
| SAM (B2B broadcast/film/TV directories) | £3–5M/yr | 4rfv (<£1M) + The Knowledge directory share (est. £2–4M of MBI's £14.57M) |
| Year 1 target | £71K run-rate ARR | 5.5% conversion of 4,700 seed providers |
| Year 3 target | £255K ARR | 10,000 providers, 70% annual retention |

These numbers are conservative. They exclude future verticals (gaming, events, digital content) and buyer-side premium revenue, both of which expand the addressable market beyond the current production directory segment.

---

## 4. The Product

### How it works

#### For providers (the paying customers)

CALLSHEET launches with approximately 4,700 provider listings imported from publicly available data. These listings are visible and searchable from day one. Providers claim their listing by verifying their email, get automatically verified against Companies House, and can then upgrade to a paid tier for analytics, priority placement, and trust badges.

The key upgrade trigger: once a provider claims their free listing, they can see that people are viewing their profile — but not who. To see who's looking, they upgrade. This is the same conversion lever that drives LinkedIn Premium subscriptions: 74% of LinkedIn Premium users cite "who viewed your profile" as their top reason for paying.

#### For buyers (the users who search)

Buyers search by service type, location, specialisation, and availability. They see enriched, verified profiles with portfolios, credentials, trust badges, and reviews. Sending an enquiry is always free — CALLSHEET never gates contact information behind a paywall. Buyers can shortlist and compare providers.

### Trust and verification

No incumbent offers automated verification. CALLSHEET uses a four-tier system:

| Tier | How It Works | Trust Level |
|---|---|---|
| Unclaimed | Seeded from public data | Low — unverified |
| Claimed | Owner creates account, email verified | Medium |
| Verified | Companies House match + domain email match | High |
| Premium Verified | Paid tier + enhanced evidence package | Highest |

The Companies House API provides automated identity checks at near-zero cost. Domain email matching adds a second verification layer. Claims that fall between confidence thresholds go to on-demand human review — not a permanently staffed team.

### Pricing

| Tier | Annual Price | Monthly Price | Who It's For |
|---|---|---|---|
| Free | £0 | £0 | Directory population. Satisfies buyers. |
| Standard | £199/yr | £19/mo | Sole traders, emerging freelancers |
| Premium | £399/yr | £39/mo | Established freelancers, small companies |
| Partner | £699/yr | £69/mo | Established companies, facilities, post houses |

Three independent research streams — UK competitor pricing analysis, cross-market analogous directory analysis, and freemium conversion benchmarks — independently converged on these price points. The Standard tier sits below the "under £200" psychological threshold and above 4rfv's basic listing (£120). The Partner tier undercuts The Knowledge's premier offering (£1,120) by nearly half.

**Launch discount:** First-year Standard at £99 (annual only). First 500 subscribers or 6 months, whichever comes first. This matches Mandy's price point and reduces the switching cost to near-zero.

---

## 5. The Business Model

### Revenue

Flat-fee provider subscriptions. No per-transaction fees to customers. Paddle acts as merchant of record, handling VAT collection and remittance. No buyer-side monetisation at launch.

The model evolves in stages, each triggered by evidence rather than assumption:

| Stage | Revenue Source | Trigger |
|---|---|---|
| V1 (launch) | Provider subscriptions: £199/£399/£699 | Launch |
| V2 (at scale) | V1 + buyer premium tier, advanced search, market intelligence | Annual renewal rate exceeds 70% |
| V3 (market network) | V2 + workflow tools, project matching, invoicing | Usage data shows SaaS demand |

This mirrors proven trajectories. LinkedIn started with recruitment ads, added Premium subscriptions, then expanded into SaaS tools. Yelp started with listings, added cost-per-click, then enterprise products. CALLSHEET starts with the simplest model and evolves based on data.

### What it costs to run

#### Infrastructure (monthly)

| Service | Cost (launch) | Cost (at 50,000 listings) |
|---|---|---|
| Vercel Pro (hosting) | £16/mo | £16/mo |
| Supabase Pro (database) | £20/mo | £36/mo |
| Authentication | £0 (self-hosted) | £0 |
| Image storage (Cloudflare R2) | £0 (free tier) | £1/mo |
| Email (Resend) | £0 (free tier) | £16/mo |
| Payments (Paddle) | 5% + 50p per transaction | 5% + 50p per transaction |
| AI compute (Claude subscription) | £380/mo | £380/mo* |
| **Total infrastructure** | **£416/month** | **£449/month** |

*\*The AI compute cost covers the autonomous decision-making layer — claim evaluation, data quality scoring, churn intervention, support triage, and decay detection. At V1 scale, a fixed subscription covers this workload. At growth scale, a transition to API-based billing (budgeted at £200/month based on projected decision volume) may reduce this cost. The subscription figure is used for all projections as the conservative assumption.*

#### Operating costs (annual)

| Item | Cost |
|---|---|
| Companies House incorporation | £12 (one-off) |
| Virtual office | ~£300/yr |
| ICO registration | £40/yr |
| Insurance (PI + cyber) | ~£400/yr |
| Compliance advisor (initial) | ~£1,000 (one-off) |
| Accountant | ~£1,200/yr |
| Email service for GDPR notices | ~£200/yr |
| Domain + miscellaneous | ~£100/yr |
| **Total operating (Year 1)** | **~£3,250** |

> **All-in Year 1 cost** (infrastructure + operating + Paddle fees): approximately **£11,000** at target scenario.
>
> **All-in Year 2+ cost:** approximately **£11,000**.
>
> **Breakeven point:** 25 annual Standard subscribers (£4,975 — covers infrastructure).

---

## 6. Financial Projections

### Conversion benchmarks

CALLSHEET's planning numbers are anchored to published B2B SaaS conversion data, not guesswork:

| Source | Dataset | Conversion Rate |
|---|---|---|
| Lenny Rachitsky / Kyle Poyar / Pendo | 1,000+ B2B SaaS companies | 3–5% good, 6–8% great |
| OpenView Partners | 450+ companies | 5% median |
| ProfitWell | 73,000+ companies | 3–5% average, 10%+ top quartile |
| Yelp (public financials, 2024) | 7.74M claimed → 515K paying | ~6.7% |

**CALLSHEET planning number:** 3–5% at launch, targeting 6–8% at maturity. The projections below use 5.5% as the target scenario.

### Year 1 projections (4,700 seed providers)

Tier distribution assumption: 70% Standard / 25% Premium / 5% Partner (based on analogous directory tier uptake patterns).

| | Conservative (3%) | Target (5.5%) | Optimistic (8%) |
|---|---|---|---|
| Paying customers | 141 | 259 | 376 |
| Run-rate ARR (full pricing) | £38,559 | £71,041 | £103,124 |
| Year 1 actual collected* | ~£28,659 | ~£52,941 | ~£76,824 |
| All-in costs | ~£9,818 | ~£11,154 | ~£12,467 |
| Net margin (Year 1) | £18,841 | £41,787 | £64,357 |
| Margin % | 66% | 79% | 84% |

*\*Year 1 actual collected is lower than run-rate ARR because of the £99 launch discount on Standard subscriptions. Year 2 returns to full pricing (£199) on renewal. Costs include £4,992/yr infrastructure (platform + AI compute), ~£3,250 operating costs, and Paddle transaction fees (~5.5% of revenue).*

### Three-year projection

| | Year 1 | Year 2 | Year 3 |
|---|---|---|---|
| Provider base | 4,700 | 6,500 | 10,000 |
| New paid (5.5%) | 259 | 358 | 550 |
| Returning (70% retention) | — | 181 | 378 |
| Total paying | 259 | 539 | 927 |
| Total ARR | £71K | £148K | £255K |
| Infrastructure | £4,992 | £4,992 | £5,388 |
| All-in costs | ~£11.2K | ~£15.4K | ~£21.6K |
| Net margin | ~£42K (discounted Y1) | ~£133K | ~£233K |
| Margin % | 79% | 90% | 92% |

Assumptions: 70% annual retention (between LinkedIn Premium at 65% and B2B SaaS median at ~85%), 90% annual billing, provider base grows to 10,000 by Year 3 through organic channels only, tier split remains constant, full pricing from Year 2. Infrastructure includes AI compute (£380/month) throughout.

### Churn sensitivity

No production-directory churn benchmark exists. The table below shows what happens to the steady-state paying customer base at different retention rates, assuming constant acquisition of 259 new paying customers per year:

| Annual Retention | Year 1 | Year 3 | Steady State | Steady-State ARR |
|---|---|---|---|---|
| 50% | 259 | 454 | 518 | £142K |
| 65% | 259 | 537 | 740 | £203K |
| 75% | 259 | 599 | 1,036 | £284K |
| 85% | 259 | 666 | 1,727 | £474K |

### Key assumptions and their risks

| Assumption | Value | Risk Level |
|---|---|---|
| Seed providers from public data | 4,700 | Low — data confirmed |
| Claim rate (first 6 months) | 15–25% | Medium — no direct production-directory analogue (Yelp: ~15%) |
| Paid conversion (of total seed) | 3–8% | Medium — B2B SaaS benchmarks, not production-specific |
| Tier split (Standard/Premium/Partner) | 70/25/5 | Medium — analogous directory patterns |
| Annual retention | 70% | Medium — planning assumption |
| Infrastructure cost (incl. AI compute) | £416/month | Low — itemised vendor pricing + current subscription |
| Provider growth to 10K by Year 3 | Organic only | Medium — depends on SEO and word-of-mouth |

---

## 7. How It Launches

### Phase 1: Seed the directory

Import approximately 4,700 provider listings from publicly available data. Enrich each listing through the Companies House API and domain verification. Send GDPR-compliant Article 14 notices giving data subjects a 30-day window to object.

### Phase 2: Providers claim their listings

Every provider already has a listing. They verify their email and the listing becomes theirs — this creates an immediate endowment effect. The free tier gives them a full, buyer-visible profile. But the analytics ("who viewed you") are behind the paywall.

### Phase 3: Convert (months 1–6)

Target: 3–5% free-to-paid conversion. The launch discount (£99 Standard) reduces friction to near-zero. Day 7 engagement is the critical activation window — research shows that Product Qualified Leads (users who engage with the product within the first week) convert at 3× the rate of passive signups.

### Phase 4: Grow (months 6–12+)

Actively-maintained, verified listings outrank decaying competitors on search engines. The production industry is tight-knit — word-of-mouth is the primary growth channel. No aggressive outbound sales (this was identified as an anti-pattern in the research phase). Target: 10,000 providers, 5.5% conversion, approximately £151K ARR.

### Why this works without paid advertising

- 4rfv has 110,000+ monthly visitors — these buyers will find better results elsewhere
- SEO on fresh, verified listings vs. decaying static pages is a structural advantage
- Production is a reputation industry — provider-to-provider referrals are the natural channel
- Every user is simultaneously a provider and a buyer, so each acquisition adds to both supply and demand

---

## 8. Why Incumbents Can't Catch Up

The competitive advantage is structural, not just product-level. Five factors work together:

#### 1. Active data vs. passive phonebook

Incumbents wait for providers to update their own listings. CALLSHEET enriches continuously: Companies House API, domain verification, social signals, decay detection. Business listing data decays at roughly 22–30% per year. Nobody else is maintaining it.

#### 2. Provider-buyer duality

In the production industry, most companies are simultaneously providers and buyers. A post-production house sells editing services and buys freelance colourists. This means every acquisition adds to both supply and demand. Effective customer acquisition cost is halved compared to a two-sided marketplace.

#### 3. Capital efficiency

£416/month infrastructure (including AI compute). No permanent staff for routine operations. The business is designed to operate autonomously (more on this in Section 9). This means the company doesn't need to raise significant capital to run, and margins reach 79–92% depending on scale.

#### 4. Incumbent vulnerability

4rfv operates on ASP.NET (a technology stack from the early 2000s), has a 94% debt ratio with contracting assets, and relies on manual sales. The Knowledge runs on a WordPress template (Listeo — a £69 off-the-shelf theme) and is owned by GlobalData, a corporate parent with different priorities. Neither has the engineering capacity to rebuild.

#### 5. Verification as a trust layer

No incumbent offers automated verification. CALLSHEET's four-tier system creates something the industry currently lacks: a way to distinguish a BAFTA-winning post house from a student with a showreel. Trust badges drive 15–25% conversion lift in analogous markets.

---

## 9. The Bigger Idea: Autonomous Business Architecture

> This section describes the founder's thesis about how businesses should work. CALLSHEET is the first test of that thesis. Early investors get positioned at the ground floor of a framework, not just a single directory business.

### The concept

Most businesses need people to run them. Someone processes the support tickets. Someone reviews the billing. Someone decides which listings to prioritise in search. Someone monitors whether the data is still accurate. CALLSHEET is designed so that these routine decisions are made by the system itself, not by a human operator.

This isn't hypothetical AI hype. It's a specific, scoped design: the business has defined decision-making rules, confidence thresholds, and escalation triggers. When a provider claims a listing, the system checks Companies House, matches the domain, and either auto-approves, auto-rejects, or flags for human review — based on how confident it is. When data starts decaying, the system detects it and acts. When a subscriber shows churn signals, the system intervenes.

The human founder sets the rules (governance) and handles the edge cases the system can't. Over time, the system earns more autonomy based on its track record. This is called "autonomy graduation."

### What this costs

The autonomous decision layer runs on a Claude AI subscription at £380/month. This covers the compute required for claim evaluation, quality scoring, churn detection, support triage, and decay monitoring at V1 scale. At growth scale, the system may transition to API-based billing — the Operations specification budgets £200/month for API costs, which would actually reduce this line item. The projections throughout this document use the higher £380 figure as the conservative assumption.

### Why this matters commercially

#### Operational leverage

No salaries. No office. No permanent headcount. Human resources are procured on-demand for specific tasks the system can't perform yet (compliance review, edge-case claim adjudication). This is why the margin profile is 79–92% — and improves as revenue scales against the fixed AI cost.

#### The framework is reusable

CALLSHEET is the first instance of a design pattern. The governance rules, the decision architecture, the way the system monitors its own performance — none of this is specific to production directories. A future business in a different vertical (events, gaming, digital content) could use the same underlying framework with different domain knowledge.

CALLSHEET's operational data is, simultaneously, R&D data for the framework. Every decision the system makes, every escalation it triggers, every edge case it encounters — these feed back into improving the framework itself.

#### What this means for early investors

If you invest in CALLSHEET, you're investing in a production directory business with strong unit economics and clear competitive advantages. That's the base case.

The upside case is that the framework works. If the autonomous operating model proves out through CALLSHEET's real-world operation, the founder intends to apply the same architecture to other verticals. Early investors are positioned to have first sight of those future opportunities.

This is not a contractual commitment — it's the founder's thesis about where the value compounds. CALLSHEET is the proof of concept. The framework is the long game.

### How the system is structured

The business operates across four domains, each designed as a semi-autonomous unit with defined responsibilities:

| Domain | What It Handles | Examples of Autonomous Decisions |
|---|---|---|
| Data & Listings | Data quality, verification, taxonomy, decay detection | Auto-approve/reject claims within confidence thresholds, detect stale listings |
| Operations | Support triage, compliance, billing, human procurement | Route support queries, schedule compliance reviews, reconcile payments |
| Platform & Product | Search, onboarding, admin, email | Rank search results, manage onboarding flows, handle account closures |
| Commercial & Revenue | Pricing, conversion, churn, retention | Trigger upgrade prompts, intervene on churn signals, manage win-back campaigns |

Each domain starts with conservative decision authority at launch and earns more autonomy based on its track record. The founder retains governance oversight, sets the rules the system operates within, and reviews escalations.

---

## 10. Risks

Every investment carries risk. These are the ones that matter most, and what's being done about them:

| Risk | Severity | Mitigation |
|---|---|---|
| Seed data source restricted (4rfv requires licence) | High | Public-data legal basis documented. Budget set aside for licence if needed. The entire launch depends on this data. |
| Conversion rate below 3% | Medium | £416/month infrastructure means low burn. Breakeven is 25 Standard subscribers. There is time and margin to iterate. |
| Incumbent responds | Low | 4rfv lacks engineering capacity (94% debt, ASP.NET). The Knowledge is owned by a corporate parent. Neither can pivot technology quickly. |
| GDPR compliance failure | High | Compliance advisor engaged pre-launch. Article 14 notification process designed. ICO registration before any data processing. |
| Production industry too small | Medium | £15–20M existing market. V2 verticals expand TAM. Architecture is vertical-agnostic from day one. |
| AI compute costs increase | Low | Current cost is a fixed £380/month subscription. At scale, API billing (£200/month budget) is likely cheaper. AI pricing is trending downward across all providers. |
| Autonomous operation doesn't work at V1 | Low | V1 autonomy is deliberately conservative and scoped. Human escalation is designed in. Graduation is earned, not assumed. |

---

## 11. Founder

> [PLACEHOLDER — To be completed before distribution]

| Field | Detail |
|---|---|
| Name | [Founder name] |
| Role | Sole director, CALLSHEET Ltd |
| Domain expertise | [Production industry experience, technical background, relevant prior work] |
| Technical capability | [What qualifies them to build and operate the entity] |
| Why this market | [Personal connection to the production industry, insight that triggered the opportunity] |
| Time commitment | [Full-time / part-time. Note: entity architecture reduces operational burden to governance + strategic direction] |

CALLSHEET is designed to operate without permanent staff. The founder sets governance, reviews escalations, and receives dividends and framework learnings. On-demand contractors are procured for tasks the system cannot yet perform autonomously: compliance advisor (~£500–1,500 initial), accountant (~£1,200/year), edge-case reviewers and content moderators (per-task).

---

## 12. What Your Money Does

> CALLSHEET is viable as a bootstrap. £416/month infrastructure (including AI compute), <£3,300/year operating costs, breakeven at 25 annual Standard subscribers. External funding accelerates the business but is not required for it to exist.

### If self-funded

| | Amount |
|---|---|
| Year 1 total outlay | ~£11,000 |
| Year 1 collected revenue (target) | ~£53,000 (with launch discount) |
| Year 1 net margin | ~£42,000 |
| Year 2 run-rate ARR | ~£148,000 (full pricing + renewals) |
| Payback period | Month 3–4 (breakeven = 25 annual Standard subscribers) |

### If externally funded

**Indicative raise: £25,000–50,000 (SEIS-eligible).**

| Allocation | % of Raise | Purpose |
|---|---|---|
| Data acquisition + enrichment | 30% | Accelerate beyond the 4rfv seed dataset |
| Compliance + legal | 15% | Comprehensive GDPR review, terms, data processing agreements |
| Marketing + awareness | 25% | Trade publications, events, targeted outreach campaigns |
| Operational runway (12 months) | 20% | Infrastructure (incl. AI compute), insurance, accountant, contingency |
| Framework R&D | 10% | Development of the reusable autonomous business framework |

### SEIS tax relief

CALLSHEET Ltd is eligible for the Seed Enterprise Investment Scheme (SEIS). This is a UK government scheme designed to make early-stage investment more attractive by reducing your risk:

- 50% income tax relief — invest £10,000 and £5,000 comes off your tax bill that year
- Capital gains tax exemption on SEIS shares held for 3+ years
- Loss relief — if the business fails, you can offset the remaining loss against income tax
- Maximum lifetime SEIS raise: £250,000. Individual investors can invest up to £200,000 per tax year
- Advance assurance from HMRC can be obtained before investment, confirming eligibility

**In practice:** if you invest £10,000, your effective risk after tax relief is £5,000. If CALLSHEET hits its target Year 1 margin of 79%, your share of distributable profit begins returning that investment in the first year. If it fails entirely, SEIS loss relief means you recover a significant portion through tax offsets.

---

## 13. How You Get Paid Back

CALLSHEET is designed for capital efficiency, not a binary exit event. Multiple return paths exist:

#### 1. Dividend stream (primary path)

At 79% margin on £53K collected revenue (target Year 1 with launch discount), the business generates approximately £42K in distributable profit. At steady state (£255K ARR, Year 3), annual distributable profit exceeds £233K. For a £25–50K SEIS investment, dividend returns alone achieve payback within 1–2 years.

#### 2. Strategic acquisition

The production services directory market has consolidation precedent: GlobalData acquired MBI (The Knowledge's parent) in 2022. A platform with verified data, active listings, and a proven subscription base is an acquisition target for media conglomerates, recruitment platforms, or vertical SaaS roll-ups.

#### 3. Framework licensing

If the autonomous operating model proves out, the framework itself becomes an asset. It can be licensed to other verticals, used to spin out additional entities, or sold as IP separately from the CALLSHEET instance. This is upside, not a planning assumption.

#### 4. Secondary sale

SEIS shares become CGT-exempt after 3 years. A profitable, autonomous business with minimal operational burden is attractive to lifestyle-focused acquirers or small PE funds.

> **Planning assumption:** dividend returns are the base case. Acquisition and framework licensing are upside scenarios that become viable at scale (10,000+ providers, £150K+ ARR).

---

## 14. How You'll Know It's Working

**North star metric:** paid conversion rate (target: 5.5%).

#### Leading indicators (early signals)

- Claim rate — what percentage of seed listings get claimed by their owners
- Day 7 activation — do claimed providers engage with analytics within the first week?
- Search-to-enquiry rate — are buyers actually contacting providers through the platform?
- Profile view velocity — the foundation for the analytics conversion lever

#### Revenue metrics

- MRR / ARR and growth trajectory
- Tier distribution — healthy mix across Standard / Premium / Partner
- Annual vs monthly billing mix — annual is more stable
- Annual renewal rate — target >70% (this is the V2 trigger)

#### System health

- Autonomous decision accuracy — are the system's claim approvals correct?
- Escalation frequency — trending down means the system is learning
- Data quality score — listing freshness and completeness
- Infrastructure cost per paying customer — should decrease as base grows

---

## 15. Summary

> CALLSHEET replaces a decaying incumbent in a £15–20M market with a capital-efficient, autonomously-operated platform.
>
> **Infrastructure:** £416/month (including AI compute).
> **Breakeven:** 25 annual Standard subscribers.
> **Year 1:** ~£53K collected (launch discount), £71K run-rate ARR, 79% margin.
> **Year 3:** £255K ARR at 92% margin.
>
> No permanent staff. No office. No paid acquisition.
> An autonomous entity that operates itself.
>
> The base case is a high-margin dividend stream. The upside case is a reusable framework for building autonomous businesses across multiple verticals.

---

*Supporting documentation available on request. This document summarises research and design work spanning competitor analysis, conversion benchmarks, pricing validation, entity architecture, and operational modelling — documented across 14+ research and design files.*