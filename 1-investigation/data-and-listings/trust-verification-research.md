# Trust, verification, and credit quality framework for CALLSHEET

**CALLSHEET can escape the "just another list" trap by implementing a four-tier verification framework that combines automated Companies House checks, peer-confirmed credits, and structured quality signals — starting with roughly 65–85% automation at an estimated £35,000–£55,000 first-year cost for 4,700 providers.** This report synthesises findings from seven comparable platforms (Google Business Profile, Trustpilot, Clutch.co, ProductionHub, Mandy.com, IMDb/IMDbPro, Upwork), the Companies House API, UK GDPR requirements, and academic literature on trust bootstrapping. The core insight: no single verification mechanism is sufficient. The platforms that create genuine quality differentiation — Clutch, Upwork, Google's Local Services Ads — all use composite signals combining identity verification, credential validation, and ongoing performance data.

---

## What seven platforms reveal about verification that actually works

The seven platforms researched fall into three distinct models of trust-building, each with lessons for CALLSHEET.

**Identity-first platforms** (Google Business Profile, Companies House) verify that the provider *is who they claim to be*. Google's verification has shifted from postcards to video recording — now roughly **80% of verifications use video** — requiring providers to show business signage, location, and proof of management. Despite this, **only 64% of listed businesses are verified** and Google removed **12 million fake profiles** in 2024 alone. The lesson: identity verification is necessary but insufficient. Google's own system confirms identity without confirming quality, which is why Google introduced the separate "Google Verified" badge for Local Services Ads, adding background checks, licensing, and insurance verification on top of basic identity.

**Review-centric platforms** (Trustpilot, Clutch.co, Upwork) layer quality signals on top of identity. Trustpilot processes **61 million reviews annually**, removing **4.5 million fakes** (90% automatically via ML/AI). Its TrustScore uses a Bayesian average starting with **7 phantom reviews at 3.5 stars** — preventing score volatility for new businesses. Clutch takes this further with **phone-verified client reviews**, structured around project scope, budget, and outcomes. Clutch's "Ability to Deliver" score (out of 40 points) weights reviews at 50%, client experience at 25%, and market presence at 25%. Upwork's Job Success Score calculates across **four time windows** (6, 12, 24 months, and trending) and displays the highest — an elegant mechanism that protects providers from short-term dips while rewarding consistency.

**Industry-specific platforms** (ProductionHub, Mandy.com, IMDb) attempt credit and portfolio verification with varying success. ProductionHub manually reviews every new profile but **credits are self-reported** with no database cross-referencing. Mandy.com's peer-confirmation system — where directors/producers verify that someone worked on their production — has **low adoption** because professionals find the verification requests intrusive. IMDb's editorial review requires **on-screen credit as the gold standard**, but this systematically excludes below-the-line crew who rarely receive on-screen billing, and has **near-zero coverage** for commercials, corporate video, and live events.

---

## The Companies House API delivers high-value automated verification for free

Companies House provides the single most cost-effective verification signal available to CALLSHEET. The REST API is **completely free**, returns **real-time data**, and can verify company status, directors, incorporation date, SIC codes, filing compliance, and insolvency history. At 600 requests per 5 minutes, **initial verification of all 4,700 providers takes approximately 3 hours**.

The API enables a traffic-light scoring system:

- **Green**: Active company, accounts filed on time, confirmation statement current, SIC code matches production services (codes 59111–59200), incorporated more than 2 years ago
- **Amber**: Active but accounts overdue, very recently incorporated, or SIC code misaligned (roughly **30% of post-production/VFX companies** register under generic SIC codes like 62090 "IT consultancy")
- **Red**: Dissolved, in liquidation, proposal to strike off, insolvency history, or disqualified directors

The critical gap is **sole traders and partnerships**, who are not registered at Companies House. In UK film/TV production, **54% of the workforce is self-employed** and roughly 36% of freelancers are sole traders. For CALLSHEET's provider base — which likely skews toward established service companies rather than individual freelancers — an estimated **65–85% are limited companies** verifiable via the API. The remaining 15–35% require alternative verification: VAT registration checks (HMRC API available), trade body membership confirmation (BECTU, PGGB, GTC, BSC), or document-based verification.

One important caveat from the Companies House documentation: the register records what companies file but **does not verify accuracy**. The Economic Crime and Corporate Transparency Act 2023 gave Companies House new verification powers, but full implementation is still rolling out.

---

## IMDb credit verification is technically feasible but commercially uncertain

IMDb's commercial API, available exclusively through AWS Data Exchange, provides structured credit data for **25.9 million titles and 14.8 million person records** refreshed daily. A verification flow is technically straightforward: provider claims credit → CALLSHEET looks up person ID (nconst) and title ID (tconst) in licensed data → confirms match exists → displays as "IMDb-verified credit."

**Three barriers make this a Phase 2 investment, not a launch requirement.**

First, pricing is opaque. IMDb does not publish commercial licence costs; historic references suggest **$15,000+/year minimum** (2011 data; likely higher now). All AWS Marketplace listings say "Contact Us." Second, the free non-commercial datasets are prohibited for commercial use and only include **directors, writers, and the top ~10 principal cast/crew per title** — missing the vast majority of below-the-line crew that constitute CALLSHEET's provider base. Third, coverage gaps are severe for CALLSHEET's market: commercials, corporate video, music videos, and live events are **poorly covered or ineligible** for IMDb listing. A VFX compositor with 15 years of award-winning commercial work may have zero IMDb presence.

The pragmatic launch approach: allow providers to **link their public IMDb page** (permitted under IMDb's terms of service) as a reference signal, without licensing the underlying data. This costs nothing and provides a "View credits on IMDb" link that adds credibility. Full data integration can follow once unit economics justify the licensing cost.

**Alternative UK credit sources** offer better coverage for CALLSHEET's market. The Production Guild of Great Britain (PGGB) maintains a production database cross-referencing members to productions. BECTU membership (roughly 40,000 members) validates professional status. Spotlight gates entry on professional credits or accredited training. The Knowledge Online lists 15,000+ UK production companies and crew. None offer APIs, but membership verification is feasible through manual or semi-automated checks.

---

## Recommended verification tier definitions for CALLSHEET

Based on the research, the four existing tiers should be populated with specific checks as follows.

### Tier 1 — Unclaimed (0 points)

Platform-enriched listing from public data. The provider has not engaged.

**Automated checks (no provider input required):**
- Scrape public directories (4rfv.co.uk, The Knowledge, Film London Directory, PGGB member search) for basic provider information
- Companies House API lookup by company name if identifiable — record company status, incorporation date, SIC codes
- Website existence and SSL verification (domain age via WHOIS as a maturity signal)
- Social media presence detection (LinkedIn company page, Instagram, Vimeo)
- IMDb page detection via name/company matching (link only, no data extraction without licence)

**Displayed to buyers:** Basic information with a clear "Unclaimed — this listing has not been confirmed by the provider" label. Minimal trust signals. Similar to Trustpilot's unclaimed profile model.

**Operational cost:** Near-zero marginal cost. Automated enrichment during initial data import.

### Tier 2 — Claimed (1–5 points)

Provider has confirmed their identity and basic profile information.

**Provider actions required:**
- Create account with business email (domain-matched, following Trustpilot's model)
- Confirm or correct basic profile information (name, services, location)
- Accept platform terms of service (important for Article 22 mitigation — see GDPR section)
- Upload a profile photo or company logo

**Automated checks triggered by claim:**
- Email domain verification (match to claimed website)
- Companies House API verification (if limited company): active status, incorporation date, directors, SIC codes
- For sole traders: prompt for alternative verification evidence (VAT number, trade body membership)
- LinkedIn company page existence check
- Website bidirectional link verification (provider adds a link to CALLSHEET on their site, confirming ownership)

**Points allocation:**
- Email domain match: +1
- Companies House active status confirmed: +2
- Website bidirectional link verified: +1
- Profile photo/logo uploaded: +1

**Displayed to buyers:** "Claimed" badge. Company registration date shown (e.g., "Registered since 2008") if Companies House data available.

**Operational cost:** Mostly automated. Manual review only for edge cases (unmatched email domains, sole traders). Estimated **5 minutes average manual time per provider** for the 15–35% requiring intervention.

### Tier 3 — Verified (6–10 points)

Platform has independently checked key facts.

**Automated checks (beyond Claimed):**
- Companies House deep verification: accounts not overdue, confirmation statement current, no insolvency history, no disqualified directors
- VAT registration verification via HMRC API (if applicable)
- Social media profile consistency check (same business name, logo, location across platforms)

**Semi-automated checks:**
- Trade body membership verification: cross-reference claimed BECTU, PGGB, GTC, BSC, Directors UK membership against public member directories (partially automatable; some require manual lookup)
- IMDb presence confirmation: verify claimed IMDb page matches provider identity (manual review of link)
- Website quality assessment: professional presence, portfolio/showreel hosted, client list published

**Manual checks (staff-performed):**
- At least **one client-confirmed credit** (see credit schema below): CALLSHEET contacts a named client reference and confirms the provider worked on a stated project. This follows Clutch's model of phone/email-verified client reviews, but lighter-weight — confirming the working relationship rather than conducting a full structured interview
- Portfolio/showreel review: staff confirms uploaded work samples are genuine and professional-grade (not stock footage, student work, or misattributed content)

**Points allocation:**
- Companies House deep verification clean: +1
- Trade body membership confirmed: +1
- Client-confirmed credit verified: +2 (up to 2 credits = +4)
- Portfolio/showreel quality confirmed: +1
- IMDb presence verified: +1

**Displayed to buyers:** "Verified" badge with specific verified attributes shown (e.g., "Companies House verified", "BECTU member", "1 client-confirmed credit"). Following Google's Local Services Ads model, show *which* checks have been passed.

**Operational cost:** Estimated **20–30 minutes manual time per provider**. The client credit confirmation is the bottleneck — expect **30–50% response rate** from client references based on Mandy.com's experience with peer verification.

### Tier 4 — Premium Verified (11–15 points)

Paying subscriber with verified status and enhanced listing features.

**All Verified checks plus:**
- Minimum of **3 client-confirmed credits** with at least 2 from different clients
- At least one credit within the **last 24 months** (recency signal)
- Professional indemnity or public liability insurance verified (document upload + manual check)
- Optional: industry award verification (BAFTA, RTS, Broadcast Awards — cross-referenced against public award databases)
- Annual re-verification commitment (provider agrees to annual refresh of key data points)
- Enhanced portfolio: multiple showreel categories, case studies with named projects and budgets (following Clutch's structured review format)

**Points allocation:**
- 3+ client-confirmed credits: +2 (beyond the +4 from Verified tier)
- Insurance verified: +1
- Industry award verified: +1
- Annual re-verification current: +1

**Displayed to buyers:** "Premium Verified" badge (distinct colour/design from Verified). Full verification breakdown visible. Priority placement in search results (following Clutch's model where verified providers rank above non-verified). No competitor profiles displayed on their listing page (Clutch charges $499/year for this feature).

**Operational cost:** Estimated **45–60 minutes manual time per provider** for initial verification, plus **15–20 minutes annually** for re-verification. Insurance verification requires document review. Award verification is one-time per award.

---

## A credit schema built on three sourcing tiers

Credits are the core quality differentiator in production services. The schema should support three sourcing methods with clear trust labelling.

**Self-reported credits** (lowest trust, always available): Provider enters production title, role, year, and production type (film, TV, commercial, corporate, music video, live event). No verification required. Displayed with a neutral label: "Provider-reported." This is the baseline — every provider can add credits immediately, avoiding the cold start problem. ProductionHub and most industry directories operate entirely at this level.

**IMDb-linked credits** (medium trust, automated): Provider claims an IMDb page. CALLSHEET staff verify the link matches the provider's identity (or, with a commercial licence, this is automated via API lookup). Credits linked to IMDb are labelled "IMDb-listed" with a link to the IMDb page. This signal is meaningful because IMDb credits undergo **editorial review against on-screen billing** — they are not purely self-reported. However, absence of IMDb credits should never be treated as a negative signal, given the severe coverage gaps for commercials, corporate, and live events.

**Client-confirmed credits** (highest trust, manual): CALLSHEET contacts the named client and confirms the working relationship. The confirmation request is lightweight: "Did [Provider] work on [Project] in the role of [Role] during [Year]? Yes/No." This follows Clutch's verified review model but is narrower — confirming the credit rather than soliciting a full review. Client-confirmed credits display the client company name (not individual name, for GDPR minimisation) and a "Client-confirmed" badge.

The credit data model should capture: **production title, provider role/department, year, production type** (film | TV series | TV single | commercial | corporate | music video | live event | digital content), **client company** (optional, for confirmation), **sourcing method** (self-reported | IMDb-linked | client-confirmed), and **verification date**.

---

## Composite quality score: transparent, multi-signal, and visible

Drawing on Upwork's JSS (composite scoring across multiple windows), Clutch's Ability to Deliver (40-point composite), and Trustpilot's TrustScore (Bayesian average with recency weighting), CALLSHEET's quality score should follow these design principles:

**Inputs and weights** (15-point envelope, matching the existing Verification dimension):

| Signal | Points | Automation |
|---|---|---|
| Identity verification (Claimed tier) | 0–5 | 90% automated |
| Credential verification (Verified tier) | 0–5 | 50% automated |
| Credit depth and recency | 0–3 | Manual verification |
| Premium commitment signals | 0–2 | Manual verification |

**Within the credit depth component**, weight should reflect three factors: **volume** (more confirmed credits = higher score), **recency** (credits within 24 months weighted more heavily, following Trustpilot's decay function), and **source quality** (client-confirmed > IMDb-linked > self-reported). Apply a Bayesian prior similar to Trustpilot's approach — start every provider at a neutral midpoint rather than zero.

**Visibility:** The score should be **visible to providers** and **explained in terms of its components**. Upwork's greatest criticism is the opacity of its Job Success Score — freelancers with perfect 5-star public ratings find their JSS inexplicably low due to hidden private feedback. Academic research (Wood & Lehdonvirta, 2023) documents the "reputational insecurity" this creates. CALLSHEET should show providers exactly which checks they've passed and which remain, with clear guidance on how to improve their score.

**Visibility to buyers:** Display the tier badge (Unclaimed/Claimed/Verified/Premium Verified) prominently. Show specific verified attributes rather than a single numerical score. A buyer searching for "VFX → Compositing, London" should immediately see that Provider A is "Premium Verified, 12 client-confirmed credits, BAFTA-nominated, BECTU member, est. 2004" while Provider B is "Claimed, 3 self-reported credits." This attribute-level display is more informative and harder to game than a single score.

**Score impact on ranking:** The composite score should influence search ranking — verified providers appearing above unverified, premium above standard — but should **not be the sole ranking factor**. Allow providers to sort by relevance, recency, or verification level. This both creates commercial incentive for premium subscriptions and mitigates Article 22 risk by giving buyers agency over ranking.

---

## Gaming prevention requires both technical and structural defences

Every platform researched has documented gaming vulnerabilities. CALLSHEET should implement layered prevention.

**Credit fraud prevention:** Client-confirmed credits are the hardest to fake because they require an external party to confirm. Self-reported credits should be spot-checked: randomly select 5–10% of self-reported credits per quarter and attempt to verify them. Flag providers whose self-reported credits cannot be confirmed. Trustpilot's approach of **public consumer warnings** (red banners on profiles with detected fraud) is an effective deterrent — the reputational cost of being caught exceeds the benefit of gaming.

**Review manipulation prevention:** If CALLSHEET adds client reviews (beyond simple credit confirmation), follow Trustpilot's model: screen **100% of reviews** with automated pattern detection before publication. Require reviewer identity verification via LinkedIn or business email. Clutch's structured review format (covering specific project dimensions rather than open-ended text) makes fabrication harder because fake reviewers struggle with specifics like project budget and timeline.

**Subscription gaming prevention:** The risk with a paid Premium Verified tier is that it creates a perception (real or perceived) that paying directly buys quality status. Clutch faces heavy criticism for this — Reddit threads describe it as "pay-to-play." CALLSHEET should maintain **clear separation** between payment (which buys enhanced visibility features) and verification (which requires independent checks). A paying provider who fails verification checks should not receive the Premium Verified badge. Display transparency labels following Clutch's model: indicate that premium providers are paying subscribers and that verification is independently assessed.

**Identity manipulation prevention:** Google's experience shows that even video verification can be gamed. The most effective defence is **multi-factor verification** — combining Companies House data (automated), trade body membership (semi-automated), and client references (manual). Gaming all three simultaneously is substantially harder than gaming any single check.

---

## GDPR requires transparency and a human-in-the-loop for ranking

Four specific GDPR findings shape CALLSHEET's design.

**Companies House data display is permissible** under legitimate interest (Article 6(1)(f)) for company-level data. Director names are personal data — even though publicly available on the register, the ICO explicitly states that reuse requires transparency obligations under Article 14 (informing individuals within one month). CALLSHEET should include Companies House data processing in its privacy notice and consider whether displaying director names is necessary or whether confirming directorship without naming individuals suffices (data minimisation principle).

**IMDb linking is safe; data reproduction requires a licence.** IMDb's terms grant a "limited, revocable, and nonexclusive right to create a hyperlink" to IMDb pages, provided links are not misleading. Scraping or displaying IMDb credit data without a commercial licence violates IMDb's terms and potentially infringes copyright. The practical approach: link to IMDb pages; do not reproduce data.

**Client-confirmed credits naming companies (not individuals) avoid most GDPR complexity.** Companies are not data subjects under UK GDPR. If the confirmation system names only the client company ("confirmed by BBC") rather than individuals at the company, GDPR obligations are minimal. If individuals are named, legitimate interest applies but transparency notices are required.

**The composite trust score creates a medium-high Article 22 risk under current UK GDPR.** The landmark CJEU SCHUFA ruling (December 2023) held that even generating an automated score — not just making a decision based on it — can trigger Article 22 if the score plays a "determining role" in outcomes with "legal or similarly significant effects." If CALLSHEET becomes a significant procurement channel and its trust score materially affects commercial outcomes for providers, Article 22 could apply. However, the Data (Use and Access) Act 2025 (Royal Assent June 2025) **relaxes the general prohibition on automated decision-making** involving non-special category data, making CALLSHEET's trust scoring likely permissible by default once DUAA provisions take effect (expected 2026). **Recommended mitigations regardless of DUAA timing:** introduce meaningful human oversight of rankings (not token review — genuine authority to override), provide providers with clear explanation of scoring logic, offer a formal appeal mechanism, conduct a Data Protection Impact Assessment before launch, and include the scoring mechanism in provider terms of service.

---

## Solving the cold start: established providers should not start at zero

The cold start problem is CALLSHEET's most commercially sensitive challenge. A BAFTA-winning post house joining the platform should not appear identical to a student freelancer. Five strategies address this.

**Credential import at registration.** During onboarding, prompt providers to connect existing credentials: Companies House registration (automated verification in minutes), IMDb page link, trade body memberships (BECTU, PGGB, GTC, BSC, Directors UK), industry awards, and existing client references. Each verified credential immediately contributes to the composite score. This follows the academic framework of **reputation bootstrapping through inheritance** (Malik & Bouguettaya, 2009) — importing trust from external, established institutions.

**Algorithmic boost for new listings.** Following Airbnb's model, give new CALLSHEET listings temporary enhanced visibility for 30–60 days. Airbnb's new listing boost has been documented to significantly increase initial booking rates. Display a "New to CALLSHEET" badge during this period. This ensures new providers get exposure while building their platform-specific track record.

**Tiered entry points.** Allow providers with strong external credentials to skip directly to Verified tier during onboarding if they can provide: Companies House verification (automated) + at least one client reference (manual confirmation) + trade body membership. This fast-track is particularly important for CALLSHEET's competitive positioning against 4rfv.co.uk — established providers will not adopt a new platform that makes them appear less credible than they are.

**Portfolio as implicit quality signal.** Allow providers to upload showreels and link to hosted work on Vimeo/YouTube. While portfolio quality assessment is subjective, professional-grade work is visually distinguishable from student or amateur work. ProductionHub's model of staff review of portfolio content during onboarding is operationally feasible for 4,700 providers.

**LinkedIn Verified integration.** LinkedIn now has **100+ million verified members** and offers a self-serve API for third-party platforms to integrate verification badges. A "LinkedIn Verified" signal on CALLSHEET profiles would import professional trust at near-zero cost. LinkedIn's VP of Trust Products has explicitly positioned Verified as a portable trust signal across platforms.

---

## Operational cost estimate for V1 at 4,700 providers

Operational costs vary dramatically by tier. The following estimates assume a UK-based operations team and current market rates.

**Automated verification (Unclaimed + Claimed tiers):** Companies House API queries, email domain checks, website verification, and social media detection are near-zero marginal cost. **One-time development cost: £15,000–£25,000** for API integration, automated scoring logic, and provider onboarding flow. **Ongoing cost: negligible** (API is free, compute costs minimal).

**Semi-automated verification (Verified tier):** Trade body membership checks, IMDb link verification, and portfolio review require **manual intervention averaging 20–30 minutes per provider**. Assuming 30% of the 4,700 providers pursue Verified status (1,410 providers) at launch:

- **1,410 providers × 25 min = ~588 hours**
- At £25/hour (blended rate for verification staff): **~£14,700**
- Ongoing: ~100 new verifications/month × 25 min = ~42 hours/month = **~£1,050/month**

**Client credit confirmation (Verified + Premium Verified tiers):** The most labour-intensive check. Each confirmation requires drafting an outreach email, following up, and recording the response. Expect **30–50% response rate** from client references based on Mandy.com's experience with peer verification. Per credit: **15–20 minutes staff time**.

- Initial batch: 1,410 providers × 2 average credits each × 15 min = ~705 hours = **~£17,600**
- Response follow-up and re-sends approximately double the time: **~£35,000 total for initial credit confirmation round**

**Premium Verified (manual-intensive):** Insurance document review, award verification, enhanced portfolio review. Assuming 10% of providers (470) pursue Premium at launch: **470 × 50 min = ~392 hours = ~£9,800.**

**Total estimated V1 operational cost:**

| Category | One-time | Annual ongoing |
|---|---|---|
| Development (API integration, scoring logic, UI) | £15,000–£25,000 | — |
| Automated verification (4,700 providers) | £500 (compute) | £200 |
| Semi-automated verification (1,410 at Verified) | £14,700 | £12,600 |
| Client credit confirmation (initial round) | £35,000 | £15,000 |
| Premium Verified (470 providers) | £9,800 | £8,000 |
| Quality assurance and appeals | — | £5,000 |
| **Total** | **£75,000–£85,000** | **£40,800** |

**Staffing model:** One full-time verification specialist (£30,000–£40,000 salary) plus part-time support during initial verification sprint. This aligns with ProductionHub's model of a small team with industry backgrounds — CALLSHEET's verification staff should understand UK production to make informed quality judgments during portfolio review and credit confirmation.

**Scaling note:** The verification model becomes more efficient over time. Once initial verification is complete, ongoing costs are driven by new provider onboarding and annual re-verification. If CALLSHEET grows to 10,000 providers, the semi-automated and manual components scale linearly — requiring approximately 2 FTE verification staff. Clutch, at 280,000+ providers, employs an estimated 175–275 total staff with a significant proportion dedicated to review processing.

---

## Risks, tradeoffs, and what could go wrong

**The biggest risk is over-engineering verification at the cost of adoption.** If CALLSHEET requires extensive verification before providers see any value, established providers will not bother migrating from 4rfv.co.uk. The framework should allow providers to claim and populate profiles quickly (Tier 2 in minutes), with verification as an opt-in enhancement rather than a gate. Trustpilot's model — where unclaimed profiles exist and businesses can claim them for free — is the right adoption model.

**Credential-heavy systems create structural bias.** A framework that weights IMDb credits, BAFTA nominations, and 20-year Companies House histories will systematically favour established London post houses over talented newcomers, sole traders, and providers working primarily in commercials or corporate — segments where external credentials are sparser. The framework must include a clear **newcomer pathway** with the Rising Talent-style visibility boost and alternative signals (portfolio quality, responsiveness, profile completeness).

**The pay-to-play perception will emerge.** Clutch's most damaging criticism is the perception that paying directly buys credibility. Every design decision should reinforce the separation between payment (commercial features) and verification (independently assessed). Never allow a provider to achieve Verified or Premium Verified status through payment alone.

**Client credit confirmation has an uncertain response rate.** If clients routinely ignore confirmation requests, the system produces few verified credits and the trust hierarchy collapses. Mitigate by making the confirmation request extremely low-friction (one-click "Yes, we worked with them"), by allowing providers to submit the request themselves (cc'ing CALLSHEET for verification), and by accepting alternative evidence (published case studies, award submissions listing the provider) when direct confirmation fails.

**Article 22 risk requires proactive management.** Even though the DUAA 2025 relaxes UK automated decision-making restrictions, implementation timing is uncertain. Build the human oversight mechanism from day one — a staff member who reviews composite scores quarterly, with documented authority to override rankings. This is both good practice and legal protection.

**IMDb licensing may never make economic sense.** At likely $15,000+/year with opaque pricing, IMDb data licensing is a significant commitment for a startup with 4,700 providers. The link-based approach (free, permitted by ToS) provides 80% of the trust signal at 0% of the cost. Only pursue licensing once CALLSHEET reaches sufficient scale that automated credit verification materially reduces manual workload.

## Conclusion

The platforms that differentiate quality most effectively — Clutch in B2B services, Upwork in freelance marketplaces, Google's Local Services Ads in local services — share three characteristics: they combine automated identity checks with human-verified performance signals, they make verification transparent to both providers and buyers, and they create clear commercial incentive for providers to invest in verification without allowing payment alone to substitute for genuine quality evidence.

CALLSHEET's framework should launch with two immediate technical integrations (Companies House API for automated business verification and email domain matching for identity confirmation), one manual process (client credit confirmation following Clutch's phone-verified review model), and one strategic design choice (transparent, attribute-level quality display rather than an opaque composite score). The cold start problem is solved not by a single mechanism but by credential import from multiple external sources — Companies House, trade bodies, IMDb links, LinkedIn Verified — creating a portfolio of trust signals that reflects the reality that quality in UK production services is multidimensional. A BAFTA-winning post house and a talented newcomer are both legitimate, but they should look different on the platform from day one.
