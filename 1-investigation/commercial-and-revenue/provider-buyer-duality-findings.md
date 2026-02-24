# Provider/Buyer Duality — Findings & Decisions

**Domain:** Commercial & Revenue  
**Status:** FINDINGS COMPLETE  
**Last updated:** 2026-02-10  
**Research source:** `provider-buyer-duality-research.md` (full research report)  
**Origin:** Stress test Gap #10 — "Provider/buyer duality"

---

## Summary

The flat-fee directory model is structurally sound for V1 — but structurally incomplete as a destination. The stress test hypothesis (that provider/buyer duality might invalidate the directory model) was partially confirmed: the model isn't *wrong*, but treating it as the terminal business model would cap growth and miss the platform's core structural advantage.

The production industry is a **market network**, not a two-sided marketplace. NFX explicitly names media production as a textbook example. Every entity is simultaneously provider and buyer. This isn't a complication — it's the single most valuable characteristic of the ecosystem, because each user acquired adds to both supply and demand simultaneously, halving effective customer acquisition cost.

**The critical V1 decision this research surfaces is architectural, not commercial:** every user must have a **unified account** that is both a provider profile and a buyer account from day one, even though the V1 commercial model only charges the provider side.

`[Source: Research — stress test conclusion + marketplace liquidity §1]`

---

## Key Finding 1: Production Industry Is a Market Network

NFX's taxonomy distinguishes market networks from traditional two-sided marketplaces. Market networks are ecosystems where professionals buy and sell services *to each other* in an industry community. Key characteristics:

- Many-to-many transaction patterns (not buyer→seller one-way)
- Professionals operate in both roles
- SaaS tools sit alongside the network
- Stronger defensibility than traditional marketplaces

NFX explicitly lists media production alongside law, architecture, event planning, and real estate. HoneyBook (event industry) is the closest operational analog — event planners use proposals/invoicing (SaaS) while discovering and transacting with florists, photographers, caterers (N-sided marketplace).

**Implication for CALLSHEET:** The platform is not "a directory that might become a marketplace." It is a market network from the start that *launches* with a directory commercial model.

`[Source: Research — marketplace liquidity §3, NFX framework]`

---

## Key Finding 2: Every Comparable Platform Ignores the Duality

Seven platforms analysed. None explicitly addresses dual-role users:

| Platform | Account Architecture | Dual-Role Handling | Fee Overlap Relief |
|---|---|---|---|
| **ProductionHub** | Single account, profile overlay | Implicit — listing + search in one account | None |
| **Mandy** | Bifurcated (employer/talent paths) | Informal — talent sub also enables employer features | None |
| **The Knowledge** | No registration needed for search | Sidesteps it — buyer side is completely free | N/A |
| **Bark** | Separate buyer/seller journeys | Ignores it entirely | None |
| **Upwork** | Single account, role switcher | Explicit engineering — but fees compound across roles | None |
| **Fiverr** | Unified account, opt-in seller | Buyer by default, seller opt-in | None |
| **Airbnb** | Unified single account | Full integration — identity, reviews, trust carry across | None |

**No platform offers fee relief for dual-role users.** This is a genuine design opportunity. Any fee architecture that acknowledges cross-role participation would be structurally differentiated.

`[Source: Research — platform analysis §§1-3]`

---

## Key Finding 3: Unified Account Is an Architectural Decision, Not a V2 Feature

Two account architectures exist across comparable platforms:

**Bifurcated** (Mandy, Bark): Separate provider and buyer journeys. Simpler to build. But permanently fragments the user identity and prevents cross-role data collection. You can never retroactively unify accounts without a painful migration.

**Unified** (LinkedIn, Airbnb, Fiverr, Upwork): Single identity operates in both roles. More complex upfront. But enables cross-role reputation, dual-role engagement data, and the buyer-to-provider pipeline (Airbnb: 22% of hosts first tried as guests — cited in their S-1 as a competitive advantage).

**This decision must be made at V1.** Retrofitting a bifurcated model into a unified one is a migration project, not a feature toggle. The data model, the onboarding flow, the identity system, and the engagement tracking all depend on this choice.

**Recommendation: Unified.** Every account is both a provider profile and a buyer account from the moment of creation, regardless of which role the user *thinks* they're signing up for.

`[Source: Research — LinkedIn/Airbnb §3, recommendation §1]`

---

## Key Finding 4: The Cold-Start Problem Simplifies

Andrei Hagiu and Julian Wright (platform economics): *"One way to simplify a two-sided chicken-and-egg problem is to reduce it to a one-sided chicken-and-egg problem, by focusing on users that can act as both buyers and sellers."*

Willy Braun (marketplace analytics): *"Buyer/seller overlap decreases your average CAC since you acquire both a buyer and a seller at the same time."*

This is the most strategically important finding. CALLSHEET doesn't need to solve a two-sided cold start. Each production company onboarded is simultaneously a provider (visible to commissioners) and a buyer (searching for crew and equipment). Each acquisition event creates value on both sides.

**Implication:** Customer acquisition cost modelling should reflect the dual-sided value of each user, not treat provider acquisition and buyer acquisition as separate line items.

`[Source: Research — marketplace liquidity §1, Hagiu/Wright + Braun frameworks]`

---

## Key Finding 5: Five Commercial Models Evaluated

The research evaluated five options against: revenue predictability, growth implications, operational complexity, industry alignment, and precedent.

| Option | Verdict | Why |
|---|---|---|
| **A: Directory** (providers pay, buyers free) | Sound for V1 launch. Not a destination. | Proven in UK production (The Knowledge). Revenue-predictable. But caps growth at provider willingness-to-pay for listings. |
| **B: Freemium** (providers + buyers both have premium tiers) | Right for V2/V3. Premature for V1. | Requires scale to justify buyer-side premium features. Designing those features before having usage data is guesswork. |
| **C: Network membership** (everyone pays same fee) | Commercially dangerous. | Universal paywall kills growth. Angie's List: 90% of 100M visitors bounced at paywall on an *established* platform. |
| **D: Transaction/lead model** (charge per connection) | Structurally misaligned. | Production is relationship-driven. Per-lead penalises first contact, captures nothing from ongoing relationship. High disintermediation risk. |
| **E: Hybrid evolution** (directory V1 → buyer premium V2 → SaaS V3) | **Strongest option.** | Launch simplicity + designed-in evolution. Mirrors LinkedIn, Yelp, Upwork trajectories. |

**Recommendation: Option E** — directory model at V1, market-network architecture from day one, buyer-side features added when usage data justifies them.

`[Source: Research — five models evaluation §§A-E]`

---

## Key Finding 6: Single-Player Mode Is the Bootstrapping Strategy

"Come for the tool, stay for the network" (Chris Dixon, a16z). Provide standalone value before the network reaches critical mass. Precedents: OpenTable (restaurant reservation software → booking platform), Instagram (photo filters → social network), HoneyBook (proposals/invoicing → market network).

CALLSHEET candidates for single-player-mode value:
- Portfolio/showreel hosting (useful regardless of buyer traffic)
- Availability calendar (providers manage their schedule)
- Digital call sheets (production management tool)
- Crew scheduling / production management

These are V2/V3 features commercially, but identifying them now informs platform architecture. The data model and account system should be designed to accommodate workflow tools alongside directory features.

`[Source: Research — single-player mode §2, Chris Dixon/Sangeet Choudary frameworks]`

---

## Key Finding 7: Model Transitions Are Painful — Plan the Path Now

Four cautionary tales from the research:

| Platform | Transition | Outcome |
|---|---|---|
| **Thumbtack** | Directory → pay-per-bid → algorithmic matching → hybrid | 4 model changes in 15 years. Each improved efficiency but caused provider backlash. Revenue reached ~$400M — but painfully. |
| **Angie's List** | Consumer paywall → freemium → merger with HomeAdvisor | Identity crisis. Revenue deliberately cut from $1.8B to $1.2B to restore coherence. FTC lawsuits. |
| **Houzz** | Community + directory → e-commerce marketplace | Power users (designers) felt betrayed. $4B valuation, still struggling for profitability. |
| **Yelp** | Free listings → advertising → transactions → SaaS | Most successful transition — added value at each step rather than extracting it. |

**Pattern:** Platforms that added value at each transition step succeeded. Those that extracted value or changed the implied contract failed. CALLSHEET should plan V1→V2→V3 now so each step adds capability rather than renegotiating terms.

`[Source: Research — cautionary tales §§1-4]`

---

## Recommended Commercial Evolution Path

### V1 (Months 0–18): Directory with Market-Network DNA

**Commercial model:** Flat-fee provider subscriptions (£199/£399/£699 annual — confirmed in `analogous-directory-pricing-findings.md`). Buyers search, message, and enquire for free.

**Architecture:** Unified account. Every user is both provider and buyer from account creation. Provider listing is an opt-in activation on a base account, not a separate account type. This is the Airbnb/LinkedIn choice, not the Mandy/Bark choice.

**What this means operationally:**
- Onboarding asks "what do you do?" not "are you a provider or buyer?"
- Every account gets search, messaging, shortlisting tools regardless of listing status
- A production company creating a listing simultaneously gets buyer tools
- A freelancer creating a profile simultaneously gets the ability to post crew calls
- Cross-role engagement data is captured from day one

### V2 (Months 12–24): Buyer-Side Premium

**Trigger:** Usage data shows demand for buyer-side features (see metrics below).

**Likely premium buyer features** (based on comparable platform patterns):
- Brief/job posting with enhanced distribution
- Saved searches and automated alerts
- Shortlisting and collaboration tools (team-based crew selection)
- Availability calendar integration

**Pricing:** Optional premium tier at £15–30/month, distinct from provider listing subscription. A company operating in both roles pays for both — but gets differentiated value from each.

### V3 (Months 24–36+): Market Network

**Trigger:** Feature request patterns signal demand for workflow tools.

**Capabilities:**
- SaaS workflow tools (production management, call sheets, crew scheduling, invoicing)
- Transaction-adjacent monetisation (optional booking/payment infrastructure, not required)
- "Come for the tool, stay for the network" retention dynamics

This follows HoneyBook's trajectory and the Chris Dixon playbook.

---

## Metrics That Trigger V1→V2 Transition

Transition should be data-driven, not calendar-driven. Seven metrics to track from launch:

| Metric | Threshold | What It Means |
|---|---|---|
| **Dual-role ratio** (% of paying providers who also use buyer features monthly) | >40% | Buyer-side value proposition validated |
| **Search frequency per user/month** | >8 searches/month | Search is habitual enough to support premium features |
| **Buyer→provider conversion** (% of free searchers who eventually pay for listing) | >10% | Airbnb guest→host pipeline is working |
| **Provider renewal rate** | >70% annual | Directory value prop is strong — safe to layer new streams |
| **Repeat connection rate** (same buyer contacts same provider) | >30% of connections | Facilitating relationships (good) but disintermediation risk (monitor) |
| **Time-to-first-value** (time to first enquiry or relevant search result) | Track weekly | Liquidity metric. Andrew Chen: 300+ listings with 100+ verified shifts growth dynamics. |
| **Feature request patterns** | 3+ of top 10 requests are buyer-side tools | Market signalling readiness for V2 |

`[Source: Research — metrics §]`

---

## Impact on Existing Project Decisions

### What This Confirms

| Decision | Status | Evidence |
|---|---|---|
| V1 pricing at £199/£399/£699 annual | **Confirmed** | Option E retains provider-side flat fee at V1. Pricing holds. |
| Buyers search free | **Confirmed** | Universal across all 7 platforms. Marketplace theory supports subsidising demand side. |
| Analytics as conversion lever (freemium research) | **Confirmed** | Engagement data is both the conversion trigger and the intelligence layer that powers V2. |
| Anti-patterns from freemium research | **Confirmed** | No competitor ads on profiles, no buyer-side friction, no opaque ranking — all reinforced. |

### What This Changes

| Change | Impact | Where |
|---|---|---|
| **Unified account architecture** | Data model needs Account entity wrapping Provider + Buyer roles, not Provider as core entity | `data-model-proposal.md` — see below |
| **"Directory" is launch vehicle, not business model** | Strategic positioning should acknowledge market-network aspiration, not present as "a better directory" | `strategic-positioning.md` — candidate for V2 revision |
| **V2 buyer-side premium features** | Must be designed into the platform architecture even if not monetised at V1 | Platform & Product investigation |
| **Dual-role engagement tracking** | Data model needs to capture both provider-side and buyer-side behaviour per account | `data-model-proposal.md` — see below |
| **CAC modelling** | Each acquisition creates dual-sided value. Business case should reflect this. | Commercial modelling (concept design phase) |

### What This Opens for Investigation

| Question | Domain | Priority |
|---|---|---|
| What does the unified account onboarding flow look like? | Platform & Product | High — affects UX from day one |
| Which single-player-mode tools are highest value? | Platform & Product | Medium — V2 scoping |
| How does cross-role reputation work? (A provider's responsiveness as a buyer affects their trust score?) | Data & Listings / Trust | Medium — trust framework implications |
| How does the data model accommodate buyer-side entities? | Data & Listings | High — see below |

---

## Data Model Implications

The current data model (`data-model-proposal.md`) has `Provider` as the core entity. The duality research requires a structural change:

### Current: Provider-Centric

```
Provider (core entity)
├── Identity, Profile, Capabilities, Location, etc.
├── Engagement (platform-generated analytics)
└── Commercial (subscription tier)
```

### Required: Account-Centric with Role Facets

```
Account (core entity)
├── Identity (person or organisation — verified once, shared across roles)
├── Provider Facet (opt-in activation)
│   ├── Profile, Capabilities, Location, Availability, Credits
│   ├── Provider Engagement (views, searches, enquiries received)
│   └── Provider Commercial (subscription tier)
├── Buyer Facet (always active)
│   ├── Search History, Saved Searches, Shortlists
│   ├── Enquiries Sent, Connections Made
│   ├── Buyer Engagement (search frequency, response patterns)
│   └── Buyer Premium (V2 — subscription for enhanced buyer tools)
└── Cross-Role
    ├── Reputation (composite of provider responsiveness + buyer reliability)
    ├── Network (connections, past collaborations)
    └── Verification (shared — one identity verification covers both roles)
```

**This is a conceptual schema change, not a full redesign.** The Provider entity fields are all still valid — they move under a Provider Facet within an Account wrapper. The key additions are:
- Account as root entity (not Provider)
- Buyer Facet capturing search/engagement behaviour
- Cross-Role layer for shared reputation and verification
- Verification done once at account level, not separately per role

**Recommendation:** Flag this for data model revision during concept design. The investigation-phase data model was correctly scoped to Provider — the duality research has now expanded the required scope.

---

## Cross-References

| Document | Relationship |
|---|---|
| `analogous-directory-pricing-findings.md` | Pricing confirmed at £199/£399/£699. Duality research doesn't change pricing — it changes the account architecture and evolution path. |
| `freemium-conversion-findings.md` | Conversion mechanics (analytics-as-lever, activation triggers, anti-patterns) all hold. Engagement tracking needs to cover both provider-side and buyer-side behaviour. |
| `competitor-pricing-findings.md` | Market map still valid. No competitor addresses duality explicitly — this is CALLSHEET's differentiation opportunity. |
| `data-model-proposal.md` | Requires Account-centric revision in concept design phase. See §Data Model Implications above. |
| `onboarding-flow-investigation.md` | Unified account changes the onboarding design. "What do you do?" not "Are you a provider or buyer?" |
| `trust-verification-framework.md` | Verification applies at account level, not provider level. Cross-role reputation is a new consideration. |

---

## All Commercial & Revenue Research — Final Status

| Investigation | Status | Key Decision |
|---|---|---|
| UK competitor pricing | ✅ Complete | Market map, pricing gaps, Companies House financials |
| Analogous directory pricing | ✅ Complete | Cross-market validation confirms £199/£399/£699 |
| Freemium conversion benchmarks | ✅ Complete | Tier structure, conversion targets (3-8%), anti-patterns, activation strategy |
| Provider/buyer duality | ✅ Complete | **Option E confirmed. Unified account architecture required at V1. Market network, not directory.** |
| **Pricing decision** | ✅ Resolved | £199/£399/£699 annual. Monthly at premium. |

### Remaining Commercial Scoping Gaps (Not Investigation Briefs)

| Gap | Phase | Notes |
|---|---|---|
| Advertising revenue model | Concept Design | Rate card, format, timing relative to traffic milestones |
| VAT treatment | Concept Design | Ex-VAT or inc-VAT display. 20% perceived price difference. |
| Buyer-side premium pricing (V2) | Post-V1 launch | Data-driven — requires usage metrics to scope |
