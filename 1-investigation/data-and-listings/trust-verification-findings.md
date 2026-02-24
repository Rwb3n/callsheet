# Trust, Verification & Credit Quality — Findings & Decisions

**Domain:** Data & Listings  
**Status:** FINDINGS COMPLETE  
**Last updated:** 2026-02-10  
**Research source:** `trust-verification-research.md` (full research report)  
**Origin:** Stress test Gap #13 — "Trust signals underspecified" + Gap #14 — "Credits need structure"

---

## Summary

No single verification mechanism is sufficient. The platforms that create genuine quality differentiation — Clutch, Upwork, Google's Local Services Ads — all use composite signals combining identity verification, credential validation, and ongoing performance data. CALLSHEET's framework combines automated Companies House checks, peer-confirmed credits, and structured quality signals across four tiers, with roughly 65–85% automation at an estimated £35,000–£55,000 first-year cost for 4,700 providers.

The central design principle: **verification tiers are independently assessed — payment buys enhanced visibility, not credibility.** A paying provider who fails verification checks does not receive a Verified badge. This separation is the single most important anti-pattern to enforce, based on Clutch's "pay-to-play" criticism.

---

## Key Finding 1: Three Verification Models Across Seven Platforms

| Model | Platforms | What It Proves | Lesson for CALLSHEET |
|---|---|---|---|
| **Identity-first** | Google Business Profile, Companies House | Identity is necessary but insufficient. Google verified only 64% of listings and removed 12M fakes in 2024. | Companies House API is the foundation — but it only proves "is who they say they are," not "is good at what they do." |
| **Review-centric** | Trustpilot, Clutch, Upwork | Quality signals layered on identity create genuine differentiation. Clutch's phone-verified reviews, Upwork's multi-window JSS. | Client-confirmed credits are the CALLSHEET equivalent. Lighter than Clutch's full structured interview. |
| **Industry-specific** | ProductionHub, Mandy, IMDb | Credit verification in production is hard. IMDb excludes below-the-line crew. Mandy's peer confirmation has low adoption. ProductionHub credits are self-reported. | No existing production platform has solved this. CALLSHEET's three-tier credit schema (self-reported → IMDb-linked → client-confirmed) is differentiated. |

`[Source: Research §1 — platform analysis]`

---

## Key Finding 2: Companies House API — High Value, Free, With Gaps

**Capabilities:** REST API, completely free, real-time data. Verifies company status, directors, incorporation date, SIC codes, filing compliance, insolvency history. Initial verification of all 4,700 providers takes approximately **3 hours** at 600 requests per 5 minutes.

**Traffic-light scoring:**

| Signal | Green | Amber | Red |
|---|---|---|---|
| Company status | Active | Active but accounts overdue | Dissolved, in liquidation, strike-off |
| Filing | Accounts + confirmation statement current | One overdue | Multiple overdue |
| SIC code | 59111–59200 (production services) | Generic code (62090 "IT consultancy") — ~30% of post/VFX companies | Unrelated code |
| Age | Incorporated >2 years | <2 years | N/A |
| Directors | No disqualifications | N/A | Disqualified director(s) |

**Critical gap: sole traders and partnerships.** Not registered at Companies House. In UK film/TV production, 54% of workforce is self-employed, ~36% of freelancers are sole traders. For CALLSHEET's provider base (skewing toward established companies), estimated **65–85% are limited companies** verifiable via API. Remaining 15–35% need alternatives: VAT registration (HMRC API), trade body membership, document-based verification.

**Caveat:** Companies House records what companies file but does not verify accuracy. Economic Crime and Corporate Transparency Act 2023 gave new verification powers, but full implementation still rolling out.

`[Source: Research §2 — Companies House API]`

---

## Key Finding 3: IMDb — Link at V1, Licence at V2 (Maybe)

| Approach | Cost | Coverage | Automation | Recommendation |
|---|---|---|---|---|
| **Link to public IMDb page** | Free (permitted by ToS) | Whoever has an IMDb page | Manual identity match | **V1 — do this** |
| **Free non-commercial datasets** | Free | Directors, writers, top ~10 cast/crew per title only | Automated but prohibited for commercial use | **Do not use** |
| **Commercial API (AWS Data Exchange)** | Opaque — likely $15,000+/year minimum | 25.9M titles, 14.8M person records | Fully automated | **V2 at earliest — only when unit economics justify** |

**Coverage gaps are severe for CALLSHEET's market.** Commercials, corporate video, music videos, live events are poorly covered or ineligible for IMDb listing. A VFX compositor with 15 years of award-winning commercial work may have zero IMDb presence. **Absence of IMDb credits must never be treated as a negative signal.**

**Alternative UK credit sources** with better coverage: PGGB production database, BECTU membership (40,000 members), Spotlight (gates entry on professional credits), The Knowledge Online (15,000+ entries). None offer APIs; membership verification is manual or semi-automated.

`[Source: Research §3 — IMDb API/licensing]`

---

## Key Finding 4: GDPR Shapes Design in Four Specific Ways

| Issue | Finding | CALLSHEET Design Implication |
|---|---|---|
| **Companies House data display** | Permissible under legitimate interest (Art 6(1)(f)) for company-level data. Director names are personal data — ICO says reuse requires Art 14 transparency obligations (inform within 1 month). | Include in privacy notice. Consider confirming directorship without naming individuals (data minimisation). |
| **IMDb linking** | ToS permit "limited, revocable, nonexclusive right to create a hyperlink." Scraping/displaying credit data without licence violates ToS + potential copyright infringement. | Link to IMDb pages only. Do not reproduce data. |
| **Client-confirmed credits** | Companies are not data subjects under UK GDPR. Naming client company ("confirmed by BBC") = minimal GDPR. Naming individuals = legitimate interest applies but transparency notices required. | Name companies, not individuals, in client-confirmed credits. |
| **Composite trust score — Article 22 risk** | CJEU SCHUFA ruling (Dec 2023): even *generating* an automated score can trigger Art 22 if it plays a "determining role" in outcomes with "legal or similarly significant effects." **However:** Data (Use and Access) Act 2025 (Royal Assent June 2025) relaxes the general prohibition on automated decision-making for non-special category data. | **Medium-high risk under current UK GDPR, likely permissible under DUAA once provisions take effect (expected 2026).** Mitigate regardless: meaningful human oversight, clear scoring explanation, formal appeal mechanism, DPIA before launch, scoring in provider ToS. |

`[Source: Research §7 — GDPR analysis]`

---

## Verification Tier Definitions (Populates Data Quality Framework)

These populate the Verification dimension (0–15 points) defined in `data-quality-framework.md`.

### Tier 1 — Unclaimed (0 points)

Platform-enriched listing from public data. Provider has not engaged.

**Automated checks (no provider input):**
- Companies House API lookup (if company identifiable)
- Website existence + SSL + domain age (WHOIS)
- Social media presence detection (LinkedIn, Instagram, Vimeo)
- IMDb page detection via name/company matching (link only)

**Displayed to buyers:** "Unclaimed — this listing has not been confirmed by the provider." Minimal trust signals.

**Operational cost:** Near-zero marginal. Automated enrichment during initial data import.

### Tier 2 — Claimed (1–5 points)

Provider has confirmed identity and basic profile information.

**Provider actions:**
- Create account with business email (domain-matched)
- Confirm/correct basic profile info
- Accept platform ToS
- Upload photo/logo

**Automated checks triggered by claim:**
- Email domain verification → match to claimed website
- Companies House API: active status, incorporation date, directors, SIC codes
- For sole traders: prompt for VAT number or trade body membership
- LinkedIn company page existence
- Website bidirectional link verification

**Points allocation:**

| Check | Points |
|---|---|
| Email domain match | +1 |
| Companies House active status | +2 |
| Website bidirectional link | +1 |
| Photo/logo uploaded | +1 |

**Displayed to buyers:** "Claimed" badge. Company registration date if available.

**Operational cost:** Mostly automated. ~5 min manual per provider for the 15–35% requiring intervention (unmatched email domains, sole traders).

### Tier 3 — Verified (6–10 points)

Platform has independently checked key facts.

**Automated checks (beyond Claimed):**
- Companies House deep verification: accounts not overdue, confirmation statement current, no insolvency, no disqualified directors
- VAT registration (HMRC API, if applicable)
- Social media consistency (same name, logo, location across platforms)

**Semi-automated checks:**
- Trade body membership (BECTU, PGGB, GTC, BSC, Directors UK) — cross-reference against public directories
- IMDb presence confirmation (verify link matches identity)
- Website quality assessment (professional presence, portfolio, client list)

**Manual checks (staff-performed):**
- At least **1 client-confirmed credit** — CALLSHEET contacts named client reference, confirms working relationship. Lightweight: "Did [Provider] work on [Project] as [Role] in [Year]? Yes/No." Follows Clutch model but narrower.
- Portfolio/showreel review — staff confirms genuine, professional-grade work

**Points allocation:**

| Check | Points |
|---|---|
| Companies House deep verification clean | +1 |
| Trade body membership confirmed | +1 |
| Client-confirmed credit (up to 2 credits) | +2 each (max +4) |
| Portfolio/showreel quality confirmed | +1 |
| IMDb presence verified | +1 |

**Displayed to buyers:** "Verified" badge with specific verified attributes shown (e.g., "Companies House verified", "BECTU member", "1 client-confirmed credit"). Show *which* checks passed — following Google's Local Services Ads model.

**Operational cost:** ~20–30 min manual per provider. Client credit confirmation is bottleneck — expect **30–50% response rate** from references (Mandy.com's peer verification experience).

### Tier 4 — Premium Verified (11–15 points)

Paying subscriber with verified status and enhanced features.

**All Verified checks plus:**
- **3+ client-confirmed credits** (at least 2 from different clients)
- At least 1 credit within **last 24 months** (recency signal)
- Professional indemnity or public liability insurance verified (document upload + manual check)
- Optional: industry award verification (BAFTA, RTS, Broadcast Awards — cross-reference public databases)
- Annual re-verification commitment
- Enhanced portfolio (multiple showreel categories, case studies with named projects/budgets)

**Points allocation (beyond Verified tier):**

| Check | Points |
|---|---|
| 3+ client-confirmed credits | +2 |
| Insurance verified | +1 |
| Industry award verified | +1 |
| Annual re-verification current | +1 |

**Displayed to buyers:** "Premium Verified" badge (distinct design from Verified). Full verification breakdown visible. Priority search placement. No competitor profiles on listing page.

**Operational cost:** ~45–60 min manual per provider initial, ~15–20 min annually for re-verification.

**Critical constraint: payment ≠ verification.** A paying subscriber who cannot pass Verified checks does not get Premium Verified badge. They get Premium visibility features (analytics, enhanced search ranking, branded profile) with their actual verification tier displayed. This separation must be absolute.

`[Source: Research §4 — tier definitions]`

---

## Credit Schema — Three Sourcing Tiers

| Source | Trust Level | Verification | Label Displayed | Cold Start? |
|---|---|---|---|---|
| **Self-reported** | Lowest | None — provider enters title, role, year, type | "Provider-reported" | Available immediately |
| **IMDb-linked** | Medium | Staff verify link matches identity (or API at V2) | "IMDb-listed" + link to IMDb page | Available immediately if provider has IMDb page |
| **Client-confirmed** | Highest | CALLSHEET contacts named client, confirms credit | "Client-confirmed" + client company name | Requires outreach — 30–50% response rate |

**Credit data model fields:** production title, provider role/department, year, production type (film | TV series | TV single | commercial | corporate | music video | live event | digital content), client company (optional), sourcing method (self-reported | IMDb-linked | client-confirmed), verification date.

**Design principle:** Absence of high-trust credits must never penalise providers. A new freelancer with zero IMDb credits and no client confirmations still has a functional listing with self-reported credits. The credit hierarchy creates incentive to verify, not punishment for not verifying.

`[Source: Research §5 — credit schema]`

---

## Composite Score Design Principles

**The data quality framework defines the 0–15 Verification dimension.** This research populates it.

**Scoring inputs and weights:**

| Signal | Points | Automation Level |
|---|---|---|
| Identity verification (Claimed tier checks) | 0–5 | ~90% automated |
| Credential verification (Verified tier checks) | 0–5 | ~50% automated |
| Credit depth and recency | 0–3 | Manual verification |
| Premium commitment signals | 0–2 | Manual verification |

**Credit depth sub-scoring:** Weight volume (more confirmed credits = higher), recency (last 24 months weighted more heavily — Trustpilot's decay function), and source quality (client-confirmed > IMDb-linked > self-reported). Bayesian prior at neutral midpoint (not zero) — preventing score volatility for new providers.

**Provider-facing display:** Show as "Profile Strength" progress bar with component breakdown. Every check passed/remaining is visible with clear guidance on how to improve. **Never opaque.** Upwork's greatest criticism is JSS opacity — freelancers with 5-star ratings find their JSS inexplicably low due to hidden private feedback. Academic research (Wood & Lehdonvirta, 2023) documents "reputational insecurity" this creates.

**Buyer-facing display:** Tier badge (Unclaimed/Claimed/Verified/Premium Verified) prominently. Plus specific verified attributes — not a single numerical score. A buyer searching "VFX → Compositing, London" should immediately distinguish: Provider A = "Premium Verified, 12 client-confirmed credits, BAFTA-nominated, BECTU member, est. 2004" vs Provider B = "Claimed, 3 self-reported credits."

**Ranking impact:** Composite score influences search ranking (verified above unverified, premium above standard) but is **not the sole ranking factor**. Buyers can sort by relevance, recency, or verification level. This creates commercial incentive for premium subscriptions while mitigating Article 22 risk by giving buyers agency.

`[Source: Research §6 — composite scoring + §7 — GDPR]`

---

## Cold Start: Established Providers Must Not Start at Zero

Five strategies to solve the cold start:

| Strategy | Mechanism | Implementation Phase |
|---|---|---|
| **Credential import at registration** | Prompt for Companies House, IMDb link, trade body memberships, awards, client references during onboarding. Each verified credential immediately contributes to score. | V1 launch |
| **Algorithmic boost for new listings** | Temporary enhanced visibility for 30–60 days (Airbnb model). "New to CALLSHEET" badge. | V1 launch |
| **Tiered entry points** | Fast-track to Verified if: Companies House verified + 1 client reference + trade body membership. Established providers skip the queue. | V1 launch |
| **Portfolio as implicit quality signal** | Showreel/Vimeo/YouTube links. Staff review at Verified tier. Professional-grade work visually distinguishable from amateur. | V1 launch |
| **LinkedIn Verified integration** | 100M+ verified members. Self-serve API for third-party integration. Near-zero cost trust signal import. | V1 or V2 depending on API access |

**Key framing from academic literature:** Malik & Bouguettaya (2009) — "reputation bootstrapping through inheritance." Import trust from external, established institutions rather than building from zero on a new platform.

`[Source: Research §8 — cold start]`

---

## Gaming Prevention

| Attack Vector | Defence | Precedent |
|---|---|---|
| **Fake credits** | Client-confirmed credits require external party. Spot-check 5–10% of self-reported credits quarterly. Flag unconfirmable credits. | Trustpilot's public consumer warnings (red banners) as deterrent |
| **Review manipulation** | Screen 100% of reviews with automated pattern detection before publication. Require reviewer identity via LinkedIn/business email. Clutch's structured review format makes fabrication harder. | Trustpilot removes 4.5M fakes/year (90% automated via ML) |
| **Pay-to-play perception** | Absolute separation between payment (visibility features) and verification (independently assessed). Paying provider who fails checks = no Verified badge. | Clutch's heaviest criticism is pay-to-play perception |
| **Identity fraud** | Multi-factor: Companies House (automated) + trade body (semi-automated) + client references (manual). Gaming all three simultaneously is substantially harder than any single check. | Google removed 12M fake profiles in 2024 despite video verification |

`[Source: Research §9 — gaming prevention]`

---

## Operational Cost Estimate — V1 at 4,700 Providers

| Category | One-time | Annual Ongoing |
|---|---|---|
| Development (API integration, scoring logic, UI) | £15,000–£25,000 | — |
| Automated verification (4,700 providers) | £500 | £200 |
| Semi-automated verification (~1,410 at Verified, assuming 30%) | £14,700 | £12,600 |
| Client credit confirmation (initial round) | £35,000 | £15,000 |
| Premium Verified (~470, assuming 10%) | £9,800 | £8,000 |
| Quality assurance and appeals | — | £5,000 |
| **Total** | **£75,000–£85,000** | **£40,800** |

**Staffing model:** 1 FTE verification specialist (£30,000–£40,000 salary) + part-time support for initial sprint. Must have UK production industry background — quality judgments on portfolio and credits require domain expertise.

**Scaling:** At 10,000 providers, semi-automated and manual components scale linearly → ~2 FTE verification staff. Clutch at 280,000+ providers employs estimated 175–275 total staff with significant proportion on review processing.

**Key bottleneck:** Client credit confirmation. 30–50% response rate means roughly half of outreach produces no result. Mitigation: one-click confirmation ("Yes, we worked with them"), allow providers to initiate the request themselves (cc'ing CALLSHEET), accept alternative evidence (published case studies, award submissions).

`[Source: Research §10 — operational costs]`

---

## Risks and Tradeoffs

| Risk | Severity | Mitigation |
|---|---|---|
| **Over-engineering verification kills adoption** | High | Providers can claim in minutes (Tier 2). Verification is opt-in enhancement, not gate. Trustpilot's unclaimed profile model. |
| **Credential-heavy system biases toward established London post houses** | Medium | Newcomer pathway: "New to CALLSHEET" boost, alternative signals (portfolio quality, responsiveness, profile completeness). Never penalise absence of IMDb/awards. |
| **Pay-to-play perception emerges** | High | Absolute separation: payment ≠ verification. Paying subscriber who fails checks = no badge. Transparency labels on premium listings. |
| **Client confirmation response rate collapses** | Medium | One-click confirmation, provider-initiated requests, alternative evidence accepted. If systemic, reduce credit confirmation weight in scoring. |
| **Article 22 risk on automated scoring** | Medium | Human oversight from day one (not token — genuine override authority). Clear scoring explanation. Formal appeal mechanism. DPIA. DUAA 2025 likely resolves this once provisions take effect. |
| **IMDb licensing never makes economic sense** | Low | Link-based approach (free, ToS-permitted) provides ~80% of trust signal at 0% cost. Only pursue licence when scale justifies. |
| **Sole trader verification gap** | Medium | 15–35% of providers can't be Companies House verified. VAT checks (HMRC API), trade body membership, LinkedIn Verified as alternative signals. |

---

## Decisions Confirmed

| Decision | Status | Evidence |
|---|---|---|
| Four-tier verification model (Unclaimed → Claimed → Verified → Premium Verified) | **Confirmed** | Aligns with data quality framework Verification dimension. Google, Clutch, Upwork all use composite multi-tier models. |
| Companies House API as foundation of automated verification | **Confirmed** | Free, real-time, covers 65–85% of providers. Traffic-light scoring straightforward. |
| IMDb: link at V1, licence deferred | **Confirmed** | $15,000+/year with opaque pricing. Coverage gaps for commercials/corporate. Link is free and ToS-permitted. |
| Three-tier credit schema (self-reported → IMDb-linked → client-confirmed) | **Confirmed** | No existing production platform has this. Differentiator vs 4rfv/The Knowledge/Mandy (all self-reported only). |
| Attribute-level display, not opaque composite score | **Confirmed** | Upwork JSS opacity is most-criticised feature. Google LSA shows which checks passed. Transparent display harder to game. |
| Payment and verification are independent | **Confirmed** | Clutch's pay-to-play perception is cautionary tale. Premium Verified requires passing verification checks, not just paying. |
| Client credit confirmation as highest-trust signal | **Confirmed** | Follows Clutch's phone-verified review model. Lighter weight (yes/no confirmation, not structured interview). 30–50% response rate is the constraint. |

## Decisions for Concept Design

| Decision | Phase | Notes |
|---|---|---|
| Verification badge visual design (Claimed/Verified/Premium Verified) | Concept Design | Distinct colours/shapes. Must be immediately distinguishable in search results. |
| Client credit confirmation UX (email template, one-click flow, provider-initiated vs platform-initiated) | Concept Design + Operations | The bottleneck process. Must be extremely low-friction for referees. |
| Whether to display director names from Companies House or confirm directorship without naming | Concept Design | GDPR data minimisation question. May need legal input. |
| Newcomer pathway specifics (boost duration, badge design, alternative signal weighting) | Concept Design | 30-day or 60-day boost? What happens when boost expires? |
| Article 22 mitigation implementation (human oversight cadence, appeal process, DPIA scope) | Concept Design + Legal | Need legal review before launch. DUAA timing uncertain. |
| Sole trader verification path specifics | Concept Design | Which combination of VAT + trade body + LinkedIn constitutes "equivalent to Companies House"? |

---

## Cross-References

| Document | Relationship |
|---|---|
| `data-quality-framework.md` | This research **populates** the Verification dimension (0–15 points). Tier definitions map directly to point allocations. Freshness/Accuracy dimensions use Companies House signals defined here. |
| `onboarding-flow-findings.md` | Claim flow (Path C) triggers Tier 2 checks. Domain email matching is primary verification method for claims. Fast-track to Verified tier during onboarding uses credential import defined here. |
| `freemium-conversion-findings.md` | "Verified badge" is a paid-tier feature — but verification itself is independent of payment. Analytics-as-conversion-lever uses engagement data that verification enriches. |
| `provider-buyer-duality-findings.md` | Verification applies at **account level**, not provider level. Cross-role reputation (a provider's responsiveness as a buyer affects trust) is a V2 consideration flagged here. |
| `data-model-proposal.md` | Credit schema fields (title, role, year, type, client, source, verification date) need to be added. Verification tier stored at Account level per duality architecture. |
| `competitor-pricing-findings.md` | No UK competitor offers verification at any price. This is a differentiator that reinforces the £199/£399/£699 value proposition. |

---

## Data & Listings Investigation — Final Status

With this research complete, all Data & Listings investigation deliverables are done:

| Deliverable | Status |
|---|---|
| Taxonomy analysis (4rfv structural findings) | ✅ Complete |
| V1 taxonomy proposal (7 sectors, ~50 service areas, ~200 specialisations) | ✅ Complete |
| Data model proposal | ✅ Complete (revision flagged for concept design — account-centric model) |
| Data quality framework (scoring, decay, enrichment, escalation) | ✅ Complete |
| Trust/verification framework (tiers, checks, credits, GDPR, costs) | ✅ Complete |

### Remaining Mini-Investigations (Not Data & Listings)

| Investigation | Domain | Status |
|---|---|---|
| On-screen talent scope (Gap #4) | Data & Listings | Investigation brief — not yet researched |

### Investigation Phase — Overall Status After This Deliverable

| Domain | Status | Remaining |
|---|---|---|
| **Data & Listings** | **Near-complete** | On-screen talent scope (Gap #4) is the last item |
| **Platform & Product** | Onboarding complete. Main investigation not started. | Platform investigation brief needed |
| **Commercial & Revenue** | **Complete** | All 4 research streams done, pricing confirmed |
| **Operations** | Not started | Downstream of all |
