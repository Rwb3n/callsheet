# Freemium Conversion — Findings & Decisions

**Domain:** Commercial & Revenue  
**Status:** FINDINGS COMPLETE — decisions pending cross-reference with competitor pricing research  
**Last updated:** 2026-02-10  
**Research source:** `freemium-conversion-benchmarks-research.md` (full research report)

---

## Summary

Research covering 1,000+ B2B SaaS products, six major directory platforms, and detailed LinkedIn/Yelp case studies has produced a concrete tier structure, pricing range, conversion targets, and a set of hard constraints for the CALLSHEET free/paid boundary.

The core strategic principle: **the free tier serves buyers, the paid tiers serve providers' competitive ambitions.** The free/paid line must never compromise the buyer experience.

---

## Key Findings

### 1. Conversion Rate Benchmarks

| Source | Dataset | Benchmark |
|---|---|---|
| Lenny Rachitsky / Kyle Poyar / Pendo (2023) | n=1,000+ B2B SaaS | 3-5% "good", 6-8% "great" (self-serve freemium) |
| OpenView (2022) | n=450+ | 5% median freemium-to-paid |
| ProfitWell | n=73,000+ | 3-5% average, top performers 10%+ |
| First Page Sage (2021-2025) | n=80+ SaaS clients | 2.6% organic freemium-to-paid |
| Yelp (public financials, 2024) | 7.74M claimed pages → 515K paying | ~6.7% conversion |

**CALLSHEET planning number: 3-5% at launch, 6-8% target at maturity.**

On ~4,700 providers, 3-5% = **140-235 paying customers at V1.**

`[Source: Research §1, benchmarks table and Yelp financial data]`

**Caveat:** Yelp's 6.7% is B2C. LinkedIn's 15-18% is inflated by enterprise purchases. Neither is a direct B2B directory analogue. The Lenny/Poyar/Pendo dataset (n=1,000+ B2B SaaS) is the most reliable reference. Yelp is useful as an upper bound for a mature platform.

### 2. What Drives Conversion (Ranked by Evidence)

| Rank | Feature | Evidence | Conversion Impact |
|---|---|---|---|
| 1 | **Analytics / engagement visibility** | 74% of LinkedIn Premium subscribers cite "who viewed your profile" as top upgrade reason | Highest proven lever |
| 2 | **Priority search placement** | Featured listings triple directory-generated leads | High — measurable volume difference |
| 3 | **Competitor ads on free profiles** | Yelp/Trustpilot model — creates negative value on free tier | High but **reputationally dangerous** — do not use |
| 4 | **Verified/trust badges** | Amazon Prime badge drives 15-25% conversion lift; 87% find ads more trustworthy with trust marks | Moderate, consistent |
| 5 | **Review solicitation tools** | BazaarVoice: 144% increase in conversion when shoppers engage with reviews | Moderate — sleeper lever |
| 6 | **Portfolio/media limits** | No specific published data for directories | Weak as primary lever — has a ceiling |

`[Source: Research §3, feature evidence hierarchy]`

**Key insight:** Analytics is the *conversion lever* (the teaser that drives upgrades) but not the *primary value*. Patrick Campbell / ProfitWell: "analytics products have terrible willingness-to-pay; retention is terrible; NPS is terrible." The provider is paying for **visibility**. Analytics proves the visibility works.

`[Source: Research §6, ProfitWell value metric analysis]`

### 3. The Activation Window

| Finding | Source |
|---|---|
| Users engaging with core features in first week are 5x more likely to convert | Gartner / Mixpanel |
| 3-step onboarding achieves 72% completion vs 16% for 7-step | Chameleon.io |
| Nearly half of freemium users vanish within 30 days | Rachitsky/Timen |
| Companies running 10+ conversion experiments/quarter achieve 60% higher conversion | ProfitWell (n=1,000+) |
| Product Qualified Leads convert at 3x rate (25% vs 8%) | ProfitWell |

`[Source: Research §7, activation data]`

**CALLSHEET activation event:** First evidence of buyer engagement within 7 days. If actual enquiries aren't flowing (cold start), substitute with search appearance data: "your profile appeared in X buyer searches this week."

### 4. Contact Information Must Stay Free

Asymmetric gating is the universal pattern across all six platforms studied: **provider contact details are freely visible to buyers.** Gating provider contact from buyers is rare, counterproductive, and should be avoided.

| Platform | Provider contact visible to buyers? | How providers are monetised |
|---|---|---|
| Yelp | Yes — full details free | CPC advertising, enhanced profiles |
| Clutch | Yes | Sponsored placement, algorithmic priority |
| Houzz | Yes | Lead gen, enhanced profiles |
| Angi | Yes (after dropping buyer paywall) | Annual fee + pay-per-lead |
| Bark | Yes (profiles visible) | Pay-per-lead (buyer details gated from providers) |
| Thumbtack | Yes | Pay-per-lead |

**Angie's List case study:** Charged buyers $22/year → constrained buyer growth so severely the model was abandoned in 2016 before merging with HomeAdvisor. Businesses lose 93% of potential visitors when content is paywalled.

`[Source: Research §8, contact gating analysis + Angie's List history §2]`

**CALLSHEET hard constraint: Provider contact details (phone, email, website) are always visible to buyers on all tiers, including free.**

### 5. Anti-Patterns — Hard Constraints

These are non-negotiable based on the research evidence:

| Anti-Pattern | Why | Evidence |
|---|---|---|
| **Never show competitor listings on a provider's profile page** | Yelp's single most criticised tactic. 2,045+ FTC complaints, class-action lawsuit, *Billion Dollar Bully* documentary. In a tight-knit industry, this would be fatal. | `Research §4, Yelp FTC complaints` |
| **Never gate provider contact details from buyers** | Angie's List proved buyer friction is fatal. Production managers expect free access. | `Research §8, Angie's List case study` |
| **Never use opaque algorithmic ranking** | Yelp's review-filtering opacity fuelled extortion allegations for a decade. Clearly label "Featured" vs organic. | `Research §4, Yelp review filtering` |
| **Never use aggressive outbound sales** | Yelp documented 20+ calls/week to single businesses. Catastrophic in a small production community. | `Research §4, Yelp sales tactics` |
| **Set the free/paid line at launch and don't move it** | Evernote reduced free from 100K notes to 50 → "data hostage" backlash, mass migration to Notion/Obsidian. Zero-price effect: users irrationally resist charges after prolonged free use. | `Research §9, Evernote + zero-price effect` |
| **Don't monetise before demonstrating demand** | "Most directories fail" because founders monetise before traffic exists. No visits → no signups → no money. | `Research §9, Connor Finlayson` |

### 6. The "Too Generous" Trap

Equals (spreadsheet tool) launched generous free plan Nov 2022 → business stalled within 6 months. CEO publicly called freemium "a decision that broke our business." Codecademy waited 4 years to monetise: "we should've monetised sooner — diminishing returns providing a free product."

`[Source: Research §9, Equals and Codecademy case studies]`

**Rule:** When you solve a complete problem completely for free, you eliminate your monetisation opportunity. The free tier must leave something meaningful ungated but also leave providers wanting more.

---

## Proposed Tier Structure

### Free Tier — "The Buyer-Satisfying Base"

Everything a buyer needs to find, evaluate, and contact a provider:

| Feature | Included |
|---|---|
| Company/individual name + full contact details (phone, email, website) | ✓ |
| Business description, service categories (taxonomy), location/service regions | ✓ |
| Up to 5 portfolio items or structured credits | ✓ |
| Appear in search results (organic ranking) | ✓ |
| Receive and respond to buyer enquiries (unlimited) | ✓ |
| Basic analytics: total view count as a number ("viewed X times this month") | ✓ — but NOT who viewed |

Follows Price Intelligently's 80/20 rule: 80% of functionality free, 20% of high-value features gated. Mirrors Yelp's genuinely useful free tier that drove 7.74M claimed pages.

`[Source: Research §10, free tier definition + §6 Price Intelligently 80/20]`

### Tier 1 — "Professional" (£29-49/month)

The primary conversion lever. Gates **visibility amplification** and **engagement intelligence**:

| Feature | Rationale |
|---|---|
| Full analytics dashboard — see which companies viewed you, search terms, weekly trends | LinkedIn playbook: 74% cite this as top upgrade reason |
| Enhanced search ranking — priority placement | Featured listings triple directory leads |
| Unlimited portfolio items — full showreel, unlimited credits, galleries | Removes the 5-item cap from free |
| Verified badge — "CALLSHEET Verified" trust signal | Trust marks increase buyer engagement 15-25% |
| Review solicitation tools — request endorsements from past collaborators | 144% conversion lift when buyers engage with reviews |
| Availability calendar — show real-time availability to buyers | Reduces wasted enquiries |

**Primary conversion trigger:** Analytics-based notification within 7 days of profile creation:  
*"Your listing was viewed 47 times this month by 12 different production companies — upgrade to Professional to see which ones and appear higher in their searches."*

`[Source: Research §10, Tier 1 definition + §3 feature evidence + §5 LinkedIn playbook]`

### Tier 2 — "Featured" (£79-129/month)

Upsell for active providers already getting value from Tier 1:

| Feature | Rationale |
|---|---|
| Featured placement — "Recommended" sections, category spotlights, homepage | Maximum visibility |
| Competitor benchmarking — profile views, enquiry rate, response time vs category averages | Competitive intelligence |
| AI matching priority — first to appear in buyer-provider matching | Core platform differentiator |
| Branded profile — custom header, logo prominence, styled layout | Visual distinction |
| Direct booking integration — availability checking + booking requests through platform | Reduces friction to hire |
| Multi-user access — team members can manage listing | Relevant for larger companies |

### Expected Conversion Rates

| Metric | Conservative | Target | Optimistic |
|---|---|---|---|
| Free → Tier 1 | 3% | 5-6% | 8% |
| Tier 1 → Tier 2 | 15% | 20-25% | 30% |
| Overall paid rate | 3.5% | 6% | 10% |
| Time to first conversion | 30-60 days | 14-30 days | 7-14 days |

`[Source: Research §10, conversion rate projections grounded in §1 Lenny/Poyar benchmarks + §2 Yelp maturity data]`

### Revenue Projection (V1, illustrative)

Based on ~4,700 providers at launch:

| Scenario | Paid providers | Revenue/month (at £39 avg Tier 1) | Revenue/year |
|---|---|---|---|
| Conservative (3%) | 141 | £5,499 | £65,988 |
| Target (5.5%) | 259 | £10,101 | £121,212 |
| Optimistic (8%) | 376 | £14,664 | £175,968 |

**Note:** Does not include Tier 2 uplift. Assumes £39 average (midpoint of £29-49 range). **SUPERSEDED: See `analogous-directory-pricing-findings.md` for confirmed pricing (£199/£399/£699 annual) and updated revenue projections.** The projections below used SaaS-anchored monthly pricing; the confirmed annual pricing produces lower per-tier revenue but higher expected conversion in this market.

---

## Activation Strategy

| Timing | Action | Rationale |
|---|---|---|
| Day 0 | After profile creation: "Your listing is now visible to X production companies in your category" | Immediate value signal, even if estimated |
| Day 3 | Email with first engagement data: "Your profile appeared in Y searches this week" | Prove the platform is working |
| Day 7 | **Critical window.** If enquiry received → "see who's viewing you" upgrade prompt. If no enquiry → curated buyer demand data for their category | 5x conversion likelihood if activated in first week |
| Day 14 | LinkedIn-style blurred data email: "3 production companies viewed your full profile — upgrade to see who" + contextual offer (first month free or 20% discount) | Information gap users feel compelled to close |
| Day 30 | If not converted → social proof: "47 [category] providers in your region upgraded to Professional this month" | Peer pressure in a relationship-driven industry |

`[Source: Research §10, activation triggers + §7 time-to-value data]`

---

## Decisions Pending

| Decision | Blocked By | Notes |
|---|---|---|
| Final pricing (£29 or £39 or £49 for Tier 1) | Competitor pricing research | **RESOLVED.** Confirmed at £199/yr (£19/mo). Two independent research streams (competitor + analogous) converged on £199/£399/£699 annual. See `analogous-directory-pricing-findings.md` for full synthesis. The monthly prices in this document (£29-49/mo) were anchored on B2B SaaS norms, not the UK production market. |
| Free portfolio limit (5 items — is this right?) | Taxonomy/data model finalisation | Needs testing: is 5 enough to be useful but limited enough to convert? |
| Verification as paid-only or available to all | Trust/verification framework research | If verification requires payment, it's a conversion lever. If free, it's a data quality tool. Different strategic role. |
| Launch timing of monetisation relative to directory population | Provider/buyer duality research | Can't charge until buyer traffic exists to deliver engagement data |
| Sales-assist for high-value providers | Operations investigation | Sales-assist drives 5-7% conversion vs 3-5% self-serve. Worth it for post houses, studio groups. Operational cost unknown. |

---

## Flagged Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Cold start — no buyer traffic at launch means no engagement data → conversion triggers don't fire | High | Pre-populate with scraped/enriched data. Drive initial buyer traffic via SEO, industry partnerships, direct outreach to production managers. Consider synthetic engagement signals ("estimated monthly searches in your category") during cold start. |
| Yelp's 6.7% benchmark is B2C, not B2B | Medium | Use Lenny/Poyar B2B SaaS data (3-5%) as primary planning number. Yelp is an upper bound for maturity. |
| £29-49/month may be too low or too high for UK production market | Medium | Cross-reference with competitor pricing research. Test with 5-10 industry contacts before committing. |
| Free tier too generous (Equals/Evernote trap) | Medium | The 5-portfolio-item cap and gated analytics create a clear conversion trigger. Monitor free→paid rate monthly. If below 2% after 6 months, tighten the cap. |
| Small industry — aggressive monetisation tactics travel fast | High | All anti-patterns listed above are hard constraints, not guidelines. One bad story from a respected DoP or line producer could kill adoption. |
