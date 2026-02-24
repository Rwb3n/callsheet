# Investigation: Onboarding Flow Design for a B2B Production Services Directory

## Background Context

CALLSHEET is a planned B2B discovery and matching platform for the UK broadcast, film, and television production industry. It is a greenfield competitor to 4rfv.co.uk, a 15+ year-old Belfast-based directory of ~4,700 production service providers. CALLSHEET's differentiator is active data enrichment, intelligent matching, and modern UX — replacing 4rfv's passive, decaying phonebook model.

Providers on CALLSHEET are companies and individuals offering production services: post-production houses, camera operators, equipment hire companies, studios, catering firms, VFX artists, etc. Each provider has a profile containing:

- **Entity type** (Freelancer, Company, Educational Institution, Industry Body, Public Sector, Non-Profit)
- **Service capabilities** mapped to a 3-level taxonomy: 7 Sectors (e.g., Production, Post-Production, Crew, Equipment, Facilities, Production Support, Business Services) → ~50 Service Areas → ~200 Specialisations
- **Attributes**: base location, service regions, travel willingness, availability, budget tier, equipment owned, accreditations, transaction types (hire/buy/service/consult)
- **Structured credits**: past projects with project name, client, role, year, format, genre
- **Verification tier**: Unclaimed → Claimed → Verified → Premium

The platform uses a flat-fee subscription revenue model where providers pay to be listed with enhanced visibility. Buyers (production companies, producers, agencies searching for services) use the platform for free.

> **⚠ Cross-reference:** The provider/buyer duality research (`provider-buyer-duality-findings.md`) now requires a **unified account model** where every user is both provider and buyer from account creation. Onboarding must ask "what do you do?" not "are you a provider or buyer?" The provider listing is an opt-in activation on a base account, not a separate account type. This significantly affects the onboarding flow design.

## Problem Statement

During taxonomy stress testing, a critical gap was identified: **the most valuable providers on the platform are the most complex to onboard.** A large post-production house might need to tag across 4 sectors, 8 service areas, and 20+ specialisations, plus populate location data, equipment lists, credits, and accreditations. If onboarding feels like a bureaucratic form, these high-value providers will abandon the process.

Conversely, a solo freelance camera operator has a simple profile — one sector, one service area, two specialisations, a short kit list. Their onboarding should take 2 minutes.

Additionally, many providers will already exist on the platform as **unclaimed enriched listings** (scraped from 4rfv or enriched from public data sources). Their onboarding experience is fundamentally different — they're claiming and correcting an existing profile, not building one from scratch.

The challenge: one onboarding system must serve freelancers, large multi-service companies, and providers claiming pre-existing listings — without frustrating any of them.

## Research Plan

Research websites, competitor platforms, UX pattern libraries, and industry case studies:

(1) Analyse the onboarding and profile creation flow of **ProductionHub** (productionhub.com), a US-based film/TV production directory. Document: how many steps, what fields are required vs optional, how service categories are selected, how the profile looks once complete, and what the free vs paid tier distinction involves.

(2) Analyse the onboarding and profile creation flow of **Mandy.com** (mandy.com), a UK-based film/TV/theatre crew and talent platform. Document: how freelancers vs companies register, how skills/services are tagged, whether there is progressive disclosure (start simple, add detail later), and how portfolio/credits are handled.

(3) Analyse the onboarding and profile creation flow of **The Knowledge** (theknowledgeonline.com), a long-established UK film/TV directory. Document: listing submission process, required vs optional fields, how categories are assigned, and pricing for listings.

(4) Analyse the onboarding and profile creation flow of **Bark.com** (bark.com), a UK-based B2B service marketplace (not production-specific). Document: how service providers register, how multi-service providers handle capability tagging, whether the platform uses guided/wizard-style onboarding, and how the platform handles the "claim your business" flow for pre-existing listings.

(5) Analyse the onboarding and profile creation flow of **Upwork** (upwork.com) and/or **Fiverr** (fiverr.com). Document: how freelancers define their services, how skills are tagged (free-text vs controlled vocabulary), whether the platform suggests skills based on initial selections, and how portfolio/past work is structured.

(6) Research UX best practices for **progressive disclosure in onboarding flows** — the pattern where users complete a minimal profile to start and are prompted to add detail over time. Look for case studies, UX pattern libraries (e.g., Nielsen Norman Group, Baymard Institute), and SaaS onboarding teardowns that address the tension between data completeness and signup friction.

(7) Research UX best practices for **"claim your business" flows** — the pattern used by Google Business Profile, Yelp, Trustpilot, and similar platforms where a business already has a listing and the owner claims/verifies it. Document: how identity is verified during claiming, what the pre-populated profile looks like, and what the conversion rate difference is between claiming an existing profile vs registering from scratch (if data is available).

(8) Research whether any of the above platforms or comparable B2B directories use **intelligent suggestion during onboarding** — e.g., "You selected Director of Photography — most DPs also list Drone Operator and own ARRI cameras. Do these apply to you?" Document any examples of this pattern and its effect on profile completeness.

(9) For each platform analysed, document: the **minimum viable profile** (what's required to go live), the **estimated time to complete onboarding**, and any **gamification or incentive mechanisms** used to encourage profile completion after initial signup (e.g., progress bars, "complete your profile to appear in more searches").

(10) Synthesise findings into a comparison matrix covering: number of onboarding steps, required vs optional fields, progressive disclosure (yes/no), claim-existing flow (yes/no), intelligent suggestions (yes/no), minimum viable profile definition, completion incentives, and estimated onboarding time for a simple vs complex provider.

## Deliverable

A research report containing:
- Competitor onboarding flow analysis (per platform above)
- Comparison matrix
- Identified best practices applicable to CALLSHEET
- Recommended onboarding architecture (multi-path: freelancer, company, claim-existing)
- Minimum viable profile definition recommendation
- Progressive disclosure strategy recommendation
- Risks and tradeoffs identified
