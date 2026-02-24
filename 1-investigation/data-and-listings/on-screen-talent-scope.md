# Investigation: Should a B2B Production Services Directory Include On-Screen Talent?

## Background Context

CALLSHEET is a planned B2B discovery and matching platform for the UK broadcast, film, and television production industry. It is a greenfield competitor to 4rfv.co.uk, a 15+ year-old Belfast-based directory of ~4,700 production service providers.

The platform's V1 taxonomy covers 7 sectors of production services: Production, Post-Production, Crew & Talent (technical crew only), Equipment & Technology, Facilities & Locations, Production Support, and Business Services. Each sector contains service areas and specialisations that providers can tag as capabilities.

The revenue model is flat-fee subscription: providers pay to be listed with enhanced visibility. Buyers (production companies, producers, agencies) search for free.

**The scope question:** 4rfv.co.uk includes a "Casting and Agents" category (831 listings) which mixes two fundamentally different things:
1. **Casting directors and talent agents** — B2B service providers who help productions find talent
2. **On-screen talent** — actors, presenters, voice artists, models, extras — individuals whose profiles require demographic attributes, physical characteristics, headshots, performance reels, and agent representation details

CALLSHEET's current V1 taxonomy includes casting directors and talent agents (as B2B service providers under Business Services → Recruitment) but **excludes individual on-screen talent profiles**. This investigation determines whether that exclusion is correct, and what the implications are.

On-screen talent profiles are structurally different from B2B service provider profiles. A service provider profile describes capabilities, equipment, location, and credits. A talent profile describes physical appearance, age range, skills (e.g., stage combat, accents, instruments), representation, and availability — plus headshots and showreels. These are different data models serving different search patterns.

## Research Plan

Research existing talent platforms, competitor directories, and the casting/talent ecosystem to inform the scope decision:

(1) Analyse **Spotlight** (spotlight.com), the UK's primary casting directory used by the entertainment industry. Document: who can list (membership requirements), what a talent profile contains (fields, media, attributes), how casting directors search for talent, pricing model for talent and for casting professionals, and market position/penetration in the UK industry.

(2) Analyse **Casting Networks** (castingnetworks.com) as a Spotlight competitor. Document: the same dimensions as above, plus geographic focus (UK vs US vs global), and any overlap with B2B production services (do they list crew or only talent?).

(3) Analyse how **Mandy.com** (mandy.com) handles talent alongside crew and production services. Document: whether talent and crew share the same profile structure or have different templates, how search works across talent vs crew, whether buyers find this combined approach useful or confusing, and any user reviews or industry commentary on the combined model.

(4) Analyse how **ProductionHub** (productionhub.com) handles or excludes talent. Document: whether talent profiles exist on the platform, and if so, how they differ from service provider profiles. If talent is excluded, note how the platform positions itself relative to talent-specific platforms.

(5) Analyse how **The Knowledge** (theknowledgeonline.com) handles or excludes talent. Same documentation as above.

(6) Research the **UK casting ecosystem structure**: How do productions currently find on-screen talent? What is the typical workflow (production → casting director → agent → talent)? What role do directories play vs personal networks? Is the ecosystem adequately served by existing platforms (Spotlight, Casting Networks) or is there unmet demand?

(7) Research **GDPR and data protection implications** of storing talent profile data in the UK. Talent profiles may include: age/age range, ethnicity, physical measurements, disability status, gender identity. These are special category personal data under UK GDPR. Document: the legal basis required to process this data, consent requirements, data subject rights implications, and any precedent or guidance from the ICO specifically relevant to casting/talent platforms.

(8) Research whether any B2B production service directories have **successfully added talent as a later expansion** (V2/V3). Look for case studies of platforms that started as crew/service directories and expanded into talent, or vice versa. Document: what worked, what didn't, and whether the combined model increased or fragmented the user base.

(9) Estimate the **market size** of on-screen talent in the UK who might list on such a platform. Sources to check: Equity (the UK performers' union) membership numbers, Spotlight listing numbers, and any published data on the size of the UK acting/presenting/voiceover workforce.

(10) Synthesise findings into a decision framework comparing four options:
- **Option A:** Exclude talent entirely from V1 and all future versions
- **Option B:** Include casting directors and talent agents only (current V1 plan) — no individual talent profiles
- **Option C:** Include talent in V1 with a separate profile template and data model
- **Option D:** Exclude talent from V1 but design the platform architecture to accommodate talent profiles in a future version (V2+)

For each option, evaluate: development cost/complexity, data protection burden, competitive positioning, addressable market impact, and risk of scope creep.

## Deliverable

A research report containing:
- Platform-by-platform analysis of how talent is handled (Spotlight, Casting Networks, Mandy, ProductionHub, The Knowledge)
- UK casting ecosystem overview
- GDPR/data protection assessment for talent data
- Market size estimate for UK on-screen talent
- Decision framework with four options evaluated on cost, risk, market impact, and strategic fit
- Recommended option with rationale
