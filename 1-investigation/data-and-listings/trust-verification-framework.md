# Investigation: Trust, Verification & Credit Quality Framework for a B2B Production Services Directory

## Background Context

CALLSHEET is a planned B2B discovery and matching platform for the UK broadcast, film, and television production industry. It is a greenfield competitor to 4rfv.co.uk, a 15+ year-old Belfast-based directory of ~4,700 production service providers.

Providers on CALLSHEET are companies and individuals offering production services: post-production houses, camera operators, equipment hire companies, studios, VFX artists, catering firms, etc. Each provider has a profile with service capabilities (mapped to a taxonomy), location, equipment, accreditations, and a portfolio of past work credits.

The platform uses a flat-fee subscription revenue model where providers pay to be listed with enhanced visibility. Buyers (production companies, producers, agencies) search for free.

**The problem:** Without credible quality differentiation, CALLSHEET is just another list. Two providers tagged with identical capabilities (e.g., "VFX → Compositing, London") appear side by side in search results — one might be a BAFTA-winning post house with 30 staff, the other a solo freelancer with a student showreel. The taxonomy treats them identically because taxonomies describe capabilities, not quality.

Trust and verification signals solve this, but they must be:
- **Scalable** — manually verifying 4,700+ providers is impractical
- **Credible** — self-reported quality claims are meaningless
- **Resistant to gaming** — if verification affects search ranking, providers will try to manipulate it
- **Operationally sustainable** — the ongoing cost of maintaining verification must be manageable for a small team

This investigation covers two linked problems:

**Problem 1: Verification** — How does CALLSHEET confirm that a provider is who they say they are? The proposed verification tiers are:
- **Unclaimed:** Platform-enriched listing from public data. Provider hasn't engaged.
- **Claimed:** Provider has confirmed their identity and basic profile information.
- **Verified:** Platform has independently checked key facts (company registration, website, social profiles).
- **Premium:** Paying subscriber with verified status and enhanced listing features.

**Problem 2: Credit quality** — How does CALLSHEET make a provider's track record structured, comparable, and trustworthy? The proposed credit schema captures: project name, client/commissioner, role, year, format (feature/TV/commercial/etc.), genre, awards, and a verification status (self-reported / IMDb-linked / client-confirmed). But the sourcing, verification, and operational sustainability of this data is unresolved.

## Research Plan

Research how comparable platforms handle trust, verification, and portfolio/credit quality:

(1) Research how **Google Business Profile** (formerly Google My Business) handles business verification. Document: the verification process (postcard, phone, email, video, or instant verification), what "verified" means to searchers, how Google detects and handles fraudulent claims, the operational model (automated vs manual review), and any published data on verification rates (what percentage of listed businesses are verified).

(2) Research how **Trustpilot** (trustpilot.com) handles business verification and trust signals. Document: how businesses claim their profiles, what verification involves, how Trustpilot combats fake reviews and gaming, and how the trust score is calculated and displayed.

(3) Research how **Clutch.co** (clutch.co), a B2B services directory, handles verification and quality signals. Clutch is particularly relevant because it serves B2B service providers (agencies, developers, designers) and uses verified client reviews as a core quality signal. Document: how providers are listed, how reviews are collected and verified, how the ranking/scoring algorithm works, and the operational model for maintaining review quality.

(4) Research how **ProductionHub** (productionhub.com) handles provider verification and portfolio display. Document: whether there is a verification system, how credits/portfolio are structured, whether credits are verified or self-reported, and how buyers assess provider quality on the platform.

(5) Research how **Mandy.com** (mandy.com) handles provider verification and portfolio/credits. Document the same dimensions as above, with particular attention to how freelancer credits are presented and whether there's any cross-referencing with IMDb or other industry databases.

(6) Research **IMDb** (imdb.com) and its **IMDbPro** service as a source of verified production credits. Document: how credits are added to IMDb (who can submit, what verification exists), the IMDb API or data access options for third-party platforms, whether IMDb data can be used programmatically to verify a provider's claimed credits, any licensing or terms of use restrictions, and the coverage gap (IMDb is strong for film/TV but weak for commercial, corporate, and digital content).

(7) Research how **Companies House** (companieshouse.gov.uk) data can be used for automated business verification in the UK. Document: the Companies House API (availability, rate limits, data fields), what can be programmatically verified (company active status, registered address, directors, incorporation date, SIC codes), how to handle sole traders and freelancers who are not registered at Companies House, and any costs associated with API access.

(8) Research how **Upwork** (upwork.com) handles its **Job Success Score** and **Top Rated** badge system as an example of a composite quality/trust score. Document: what inputs feed the score (client reviews, job completion, responsiveness, etc.), how the score is displayed to buyers, whether the score is transparent to providers, how Upwork prevents gaming, and any published criticism of the system (e.g., bias towards established freelancers, penalising new entrants).

(9) Research **the cold start problem for trust systems** — how platforms establish credibility for providers who are new to the platform but not new to the industry. A VFX house with 20 years of BAFTA-winning work joins CALLSHEET and starts at the same trust level as a brand-new freelancer. Sources to check: academic papers or industry articles on trust bootstrapping in marketplaces, and how platforms like Airbnb, eBay, and Uber handled this during growth phases.

(10) Research **UK GDPR implications** of storing and displaying verification data. Specifically: (a) using Companies House data to publicly display company registration status on a provider's profile — is this permissible without consent? (b) linking to or displaying IMDb credits — intellectual property and data licensing considerations. (c) storing and displaying client-confirmed credits where the client is named — any consent requirements from the client side? (d) automated decision-making provisions under UK GDPR Article 22 — if a composite trust score affects search ranking (and therefore commercial outcomes), does this constitute automated decision-making that gives providers a right to contest?

(11) For each platform analysed, document the **operational cost model** for verification: how many staff are involved, what percentage is automated vs manual, what the cost per verification is (if available), and how verification scales as the platform grows. If exact figures aren't available, estimate based on the verification process described.

(12) Synthesise findings into a recommended framework for CALLSHEET covering:
- Verification tier definitions with specific automated and manual checks per tier
- Credit schema with recommended sourcing methods (self-reported, IMDb-linked, client-confirmed) and the operational feasibility of each
- Composite quality score model: what inputs, how weighted, whether visible to providers
- Gaming prevention mechanisms
- Operational cost estimate for V1 (4,700 providers)
- Cold start mitigation strategy for established providers joining the platform

## Deliverable

A research report containing:
- Platform-by-platform analysis of trust/verification systems (Google Business Profile, Trustpilot, Clutch, ProductionHub, Mandy, IMDb/IMDbPro, Upwork)
- Companies House API capability assessment
- GDPR assessment for verification and credit data
- Recommended verification framework for CALLSHEET (tiers, checks, automation)
- Recommended credit quality framework (schema, sourcing, verification methods)
- Composite quality score model proposal
- Operational cost estimate
- Risks, tradeoffs, and gaming prevention strategies
