# On-Screen Talent Scope — Findings & Decision

**Domain:** Data & Listings  
**Status:** FINDINGS COMPLETE  
**Last updated:** 2026-02-11  
**Origin:** Stress test Gap #4 — "On-screen talent scope undefined"

---

## Summary

Exclude individual on-screen talent profiles from V1. Include all talent-facing B2B services. The boundary is **business entities vs. individual performers** — matching The Knowledge's model with broader category coverage to close the competitive gap against 4rfv.

This is not "exclude all talent" — it's "include all talent-adjacent B2B services while excluding individual performer profiles." A production coordinator searching CALLSHEET for "voice-over" should find voice-over agencies and production companies, not individual voice artists.

---

## The Central Question Answered: What's the Actual Cost of Exclusion?

**Low — provided the B2B talent-services layer is complete.**

UK production buyers segment their search behaviour. They go to Spotlight for actors. They go to specialist agencies for voice and presenters. They go to directories like The Knowledge and 4rfv for crew and services. CALLSHEET's credibility depends on comprehensively covering the B2B production services ecosystem — which includes casting directors, talent agents, and voice-over agencies as service businesses. It does not depend on hosting individual actor headshots.

The risk is not in excluding talent profiles. It is in leaving gaps where buyers search for legitimate B2B services (like voice-over agencies) and find nothing. **That gap exists in the current V1 taxonomy and needs closing.**

---

## Key Finding 1: Spotlight Is a Near-Monopoly — Competing Is Futile

Spotlight claims **99% of UK professional TV productions** are cast through its platform. ~65,000–70,000 performers at £216/year. Every major UK broadcaster and theatre company casts through Spotlight. The phrase "if you're not in Spotlight, people think you're not working or you're dead" captures the platform's position.

Spotlight and Casting Networks are owned by the same parent company (Talent Systems), which also controls Staff Me Up (crew hiring), Tagmin (agent management software, 500+ UK agencies), and Cast It (studio casting decisions). A single entity controls the entire UK digital casting infrastructure.

Spotlight also operates a "Contacts" directory — a B2B industry address book covering 100+ categories at £480/year for enhanced listings. Basic but established, occupying adjacent territory to CALLSHEET.

**Implication:** Any attempt to include individual actor profiles competes directly with a monopoly-strength incumbent backed by significant capital. This is not a market gap — it is a fortified position.

`[Source: Research §1 — UK casting ecosystem]`

---

## Key Finding 2: Voice-Over and Presenters Are the Real Edge Case

Not all on-screen talent uses the Spotlight pipeline. Voice-over artists and presenters operate as **freelance service providers** sourced through fundamentally different B2B workflows.

**Voice-over artists:** Hired without casting directors in most corporate/commercial/e-learning contexts. Buyers contact specialist agencies (Qvoice, Soho Voices, Matinée), receive demos, select a voice, receive delivered audio — functionally identical to hiring a sound studio. Online marketplaces (Voices.com, Voquent, Voice123) treat voice work as freelance service transactions.

**Presenters:** Corporate video, events, and branded content presenters sourced through specialist agencies or booked directly. The corporate/commercial presenter market bypasses the traditional casting pipeline entirely.

**Competitive evidence is decisive.** 4rfv includes categories for "Television Presenters," "Voice Talent – Independent" (individual profiles), and 12+ categories of talent agents and casting services. The Knowledge lists voice-over agencies and casting directors as B2B entities but not individual performers.

**If a buyer searches CALLSHEET for "voice-over" or "presenter" and gets zero results, this creates a competitive gap against 4rfv.** For actors, buyers know to go to Spotlight. For voice and presenter services, buyers expect to find these alongside other production services.

`[Source: Research §2 — voice-over and presenter analysis]`

---

## Key Finding 3: No Platform Has Successfully Bolted Talent onto a Crew Directory

The expansion evidence is unequivocal. **No B2B production services directory has successfully added individual talent profiles as a V2/V3 expansion within a single platform.**

| Platform | Approach | Outcome |
|---|---|---|
| **Talent Systems** (Spotlight + Casting Networks + Staff Me Up) | Portfolio of separate brands, each maintaining own identity and user base | **Most successful model** — avoids quality dilution |
| **Mandy/Casting Call Pro** | Merged talent platform (CCP) into crew platform (Mandy) under single brand | **Primary cautionary tale** — Trustpilot ~3.4 stars, users report quality dilution, broken filtering, profile data loss. "The rot set in when CCP became Mandy." |
| **ProductionHub** | Fully integrated talent + crew using same profile infrastructure | Technically feasible but talent profiles lack depth vs dedicated casting platforms. US-focused. |
| **Stage 32** | All-in-one networking/education hub (500K–1M members) | Succeeded because it's a networking platform, not a hiring directory. Revenue from webinars, not matching. |

**The architectural lesson:** Talent and crew profiles have fundamentally different data models (headshots vs. equipment lists, playing age vs. day rate, physical attributes vs. technical certifications), serve different buyer workflows (casting director searches vs. production manager procurement), and attract different decision-makers. Combining them requires either separate templates and search interfaces (undermining simplicity) or a unified template (serving neither well).

`[Source: Research §3–4 — competitor analysis and expansion case studies]`

---

## Key Finding 4: GDPR Is Manageable — Not a Blocker, Not a Reason to Exclude

Talent profiles with ethnicity, disability status, and potentially gender identity = **special category data under UK GDPR Article 9**. Higher compliance bar, but routine and well-precedented.

| Data Type | Classification | Legal Basis |
|---|---|---|
| Ethnicity | Special category (racial/ethnic origin) | Explicit consent (Art 9(2)(a)) + manifestly made public (Art 9(2)(e)) |
| Disability status | Special category (health data) | Explicit consent |
| Gender identity | Not automatically special per ICO, treat as such as precaution | Explicit consent |
| Age, height, eye colour, measurements | Standard personal data | Legitimate interest or consent |

**Practical compliance cost:** £10,000–£20,000 first-year (legal setup + development + ongoing). Multiple UK platforms (Spotlight, Casting Networks, Mandy, The Casting Collective) already process this data at scale without ICO enforcement action.

**ICO posture:** An ICO audit of AI recruitment tools (November 2024) made ~300 recommendations around protected characteristic filtering and data retention — signalling active interest but focused on improving practices, not shutting platforms down.

**Bottom line:** GDPR adds cost but is not a reason to exclude talent. If the decision were otherwise commercially sound, GDPR compliance is a standard cost of business.

`[Source: Research §5 — GDPR analysis]`

---

## Key Finding 5: The Talent Market Is Large but Mostly Locked Up

| Segment | UK Size Estimate | Spotlight Competition? | CALLSHEET Relevance |
|---|---|---|---|
| Professional actors | ~50,000 (Equity) / 65–70K (Spotlight) | Direct, monopoly-strength | **None at V1** — impossible to displace |
| Presenters/hosts (corporate, events, digital) | 3,000–5,000 | Minimal | **V2+ potential** — sourced via agencies and direct booking |
| Voice-over artists | 3,000–7,000 | Minimal | **V2+ potential** — freelance service model |
| Commercial/multi-hyphenate talent | 5,000–10,000 | Partial | Uncertain |
| Stunt performers | 300–400 (British Stunt Register) | None | **V1 as B2B** — stunt coordinators are service providers |
| Background artists (extras) | 100,000–200,000 registered | None | Low value — agencies handle |

**Revenue potential from individual talent profiles (V2+):** Conservative 3,000–5,000 subscribers at £15–25/month = **£720K–£1.5M ARR**. Optimistic 10,000–15,000 = **£2.4–£4.5M ARR**. Meaningful but carries significant acquisition cost and product complexity.

**Professional actors would be extremely difficult to attract.** Already paying £216/year for Spotlight (essential) plus potentially £10–20/month for Mandy/Backstage. A third subscription is a hard sell.

`[Source: Research §6 — market sizing]`

---

## Decision: Option D — Exclude Individual Talent from V1, Architect for V2+

Four options were evaluated. Option D is the strongest strategic position.

| Option | Verdict | Why |
|---|---|---|
| **A — Exclude talent entirely, all versions** | Too restrictive | Permanently excluding even talent agencies leaves CALLSHEET less useful than 4rfv for common workflows. Conflates "no performer profiles" with "no talent-adjacent categories." |
| **B — CDs and agents only (current V1 plan)** | Good start, needs expansion | Matches The Knowledge but still missing voice-over agencies, presenter agencies as explicit categories. Creates gap against 4rfv. |
| **C — Include individual talent in V1** | Premature and risky | Every comparable merger/expansion has experienced quality dilution. Competes with Spotlight monopoly. 8–12 weeks additional dev. £10–20K GDPR compliance. Scope creep risk very high. |
| **D — Exclude individual talent, architect for V2+** | **Recommended** | Clear V1 scope. Preserves optionality. Data-driven expansion trigger. |

---

## V1 Taxonomy Amendment Required

The current V1 plan needs category expansion to close the 4rfv gap:

| Category | V1 Status | Action |
|---|---|---|
| Casting directors | Already included | No change |
| Talent agents | Already included (under Business Services → Recruitment) | No change |
| Voice-over agencies | **Missing** | **Add to V1 taxonomy** |
| Presenter/speaker agencies | **Missing** | **Add to V1 taxonomy** |
| Extras/supporting artist agencies | **Missing** | **Add to V1 taxonomy** |
| Stunt coordinators | **Missing as explicit category** | **Add to V1 taxonomy** |
| Child performer agencies | **Missing** | **Add to V1 taxonomy** |
| Model agencies | **Missing** | **Add to V1 taxonomy** |
| Voice-over production companies | **Missing** | **Add to V1 taxonomy** |
| Individual actors | Not included | **Exclude — V2+ decision** |
| Individual voice artists | Not included | **Exclude — V2+ decision** |
| Individual presenters | Not included | **Exclude — V2+ decision** |

**The boundary is clear: business entities = in. Individual performer profiles = out.**

This mirrors exactly where The Knowledge draws the line, with broader category coverage to match 4rfv. It's coherent with CALLSHEET's B2B positioning and eliminates the competitive gap without triggering GDPR, development, or scope creep costs of individual talent profiles.

**→ taxonomy-v1-proposal.md needs a revision to add these categories.** They likely sit under a new "Talent Services" service area within Business Services, or as a dedicated sector if volume warrants it. This is a concept design decision.

---

## Architecture Decisions for V1 That Preserve V2+ Optionality

| Decision | Rationale | Cost |
|---|---|---|
| Profile schema includes "provider type" field (business entity vs. individual freelancer) | Enables future distinction without schema migration | Minimal |
| Category taxonomy designed as extensible — individual talent subcategories can be added under existing parents (e.g., "Voice-Over" → "Voice-Over Agencies" + future "Voice-Over Artists") | Avoids restructuring taxonomy at V2 | Already built into taxonomy hierarchy |
| Search analytics layer captures zero-result queries from launch | Reveals actual demand for individual talent searches — the primary V2 trigger | Standard analytics feature |
| Consent architecture accommodates future special category data fields (not exposed in V1) | Avoids privacy architecture retrofit | £2,000–5,000 additional design consideration |

---

## V2+ Expansion Triggers (Evidence-Based, Not Assumed)

The decision to add individual talent profiles should be triggered by data, not by assumption or competitive anxiety:

| Trigger | Threshold | Data Source |
|---|---|---|
| Zero-result searches for individual talent | >5% of total searches returning zero results for talent-related queries | Search analytics |
| User feedback requesting talent profiles | Consistent theme in support requests / NPS feedback | Customer feedback system |
| Competitive move by 4rfv or The Knowledge into individual talent | Major feature launch or acquisition | Competitive monitoring |
| B2B directory traction validated | >2,000 active provider listings, positive unit economics | Internal metrics |
| Voice-over / presenter agency demand exceeds B2B coverage | Agencies request ability to list individual artists within their profiles | Provider feedback |

---

## Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Buyers search for "voice-over" and find nothing | **High if taxonomy not expanded** | Add voice-over agencies, presenter agencies, etc. to V1 taxonomy. This is the critical amendment. |
| V2 talent expansion triggers Mandy-style quality dilution | Medium | Maintain separate profile templates if/when talent is added. Never merge crew and talent into single search. Talent Systems' portfolio-of-brands is the model. |
| Excluding talent permanently limits TAM | Low at V1, medium long-term | V2+ expansion preserves the £720K–£4.5M ARR opportunity. Architecture decisions made now reduce future cost. |
| GDPR special category data complexity deters V2 expansion | Low | Compliance cost is £10–20K — standard, not prohibitive. Multiple UK platforms already operate at scale. |
| Spotlight moves into B2B directory space via "Contacts" expansion | Low-medium | Spotlight's Contacts directory is basic. CALLSHEET's modern UX, analytics, and verification create differentiation even if Spotlight expands. |

---

## Cross-References

| Document | Relationship |
|---|---|
| `taxonomy-v1-proposal.md` | **Needs revision** — add voice-over agencies, presenter agencies, extras agencies, stunt coordinators, model agencies, child performer agencies, voice-over production companies as B2B service categories |
| `data-model-proposal.md` | "Provider type" field (business entity vs. individual) should be included in schema. Preserves V2+ optionality. |
| `trust-verification-findings.md` | B2B talent service providers (agencies, studios) use the same verification tiers as all other service providers. No special handling needed. |
| `onboarding-flow-findings.md` | Talent agencies onboard via Company path (Path B). No new onboarding path required. |
| `strategic-positioning.md` | V1 positioning as B2B production services directory is reinforced. Talent exclusion is coherent with strategic frame. |
| `freemium-conversion-findings.md` | Voice-over agencies and presenter agencies are additional provider categories that increase addressable free-tier base. |

---

## Data & Listings Investigation — Complete

With this research, **all Data & Listings investigation deliverables are done:**

| Deliverable | Status |
|---|---|
| Taxonomy analysis (4rfv structural findings) | ✅ Complete |
| V1 taxonomy proposal (7 sectors, ~50 service areas, ~200 specialisations) | ✅ Complete (revision flagged — add talent-facing B2B categories) |
| Data model proposal | ✅ Complete (revision flagged — add provider type field) |
| Data quality framework | ✅ Complete |
| Trust/verification framework | ✅ Complete |
| On-screen talent scope | ✅ Complete |

**Next domain to progress:** Platform & Product (main investigation — brief exists but not started) or Operations (downstream of all).
