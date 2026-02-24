# Onboarding Flow Design for CALLSHEET: Competitive Analysis and Recommendations

**Domain:** Platform & Product  
**Status:** FINDINGS COMPLETE  
**Last updated:** 2026-02-10  
**Origin:** Stress test Gap #2 — "Onboarding friction"  
**Key dependency:** `provider-buyer-duality-findings.md` — unified account architecture confirmed before this research began

---

## Summary

Analysis of seven comparable platforms reveals that the most successful dual-role architectures — Fiverr's capability-layering model and ProductionHub's account-plus-profile model — treat provider status as an opt-in activation on a base account, not a separate registration path. This directly validates CALLSHEET's unified account decision.

The critical finding: **progressive disclosure dramatically outperforms front-loaded forms**. CloudSecure saw a 278% conversion lift by reducing initial fields from 12 to 3. LinkedIn's profile strength meter alone drove 55% more completions. For a production directory serving users from 2-minute solo freelancers to hour-long multi-service company setups, tiered onboarding with intelligent suggestion is the primary design challenge.

Three onboarding paths within one unified account: **freelancer activation** (3–5 minutes, 4-step wizard), **company activation** (8–15 minutes, deeper service mapping), and **claim-existing-listing** (2–3 minutes, highest conversion path and primary supply-side growth engine).

---

## Key Finding 1: How Comparable Platforms Handle Dual-Role Onboarding

Seven platforms analysed through the lens of "how does this handle someone who is both provider and buyer?"

| Platform | Account Architecture | Dual-Role Handling | CALLSHEET Relevance |
|---|---|---|---|
| **ProductionHub** | Single account, profile is opt-in overlay | Implicit — listing + search in one account. No role-switching UI. | Closest model to CALLSHEET. Elegant but invisible — users may not discover dual-role capability. |
| **Fiverr** | Unified. Buyer by default, "Become a Seller" opt-in | Cleanest unified model. Buying/selling coexist, navigation offers both modes. | **Best pattern to study.** Buyer-by-default with provider as activation layer. |
| **Upwork** | Single login, but freelancer/client are separate profiles | Heavy context switch via dropdown. Independent financials per role. | Too much friction for production's frequent role-switching. Avoid this weight. |
| **Mandy** | Activity-based bifurcation | One account holds multiple talent profiles + employer posting. "Post a Job" available everywhere. | Pragmatic but hidden — no explicit "you can be both" messaging. |
| **The Knowledge** | Bifurcated | Separate registration paths for searchers vs listed suppliers. No seamless switching. | **Pattern to avoid.** |
| **Bark** | Bifurcated | Hard separation between Professionals and Customers. No dual-role feature. | **Pattern to avoid.** |

**No platform offers fee relief for dual-role users.** No platform explicitly messages the dual-role capability during onboarding. Both are differentiation opportunities.

`[Source: Research — dual-role analysis §1]`

---

## Key Finding 2: Progressive Disclosure Evidence

| Source | Finding | Impact |
|---|---|---|
| CloudSecure (2024) | Reduced registration from 12 fields to 3 | **278% conversion lift** (2.3% → 8.7%). 65% completed second phase later. |
| HubSpot (40,000 forms) | Reducing from 4 to 3 fields | Conversion increased by nearly half |
| Unbounce | Field count vs conversion | **U-shaped curve** — bottoms at 4 fields, climbs again for longer contextual forms |
| Venture Harbour | 30+ question multi-step form in 4 logical steps | **53% conversion rate** |
| BrokerNotes / astroturf company | Multi-step vs single-page forms | **35–214% improvement** for multi-step |
| NNGroup | Progressive disclosure levels | Recommend **exactly 2 levels**. 3+ levels = users get lost. |
| LinkedIn profile strength meter | "40x more likely to receive opportunities" | **55% increase** in full profile completion |
| Chameleon.io | Onboarding tour length | 3-step tours: **72% completion**. 7-step tours: **16% completion**. |

**Key variable is not field count but perceived effort and clarity of value exchange.** B2B users have higher friction tolerance than consumer signups because motivation is clear: visibility equals business.

`[Source: Research — progressive disclosure §3]`

---

## Key Finding 3: Pre-Populated Listings and Claim Flows

The "claim your business" pattern (Google Business Profile, Yelp, Trustpilot, Clutch, G2) is directly relevant to CALLSHEET's strategy of pre-populating enriched listings from scraped 4rfv data.

**Conversion advantage comes from two forces:**
1. **Reduced cognitive load** — owners verify and edit rather than building from scratch
2. **Endowment effect** — people value something more when they already "have" it

| Platform | Verification Method | Key Data Point |
|---|---|---|
| Google Business Profile | 6 methods: postcard, phone/SMS, email, video, live video call, Search Console | Complete profiles receive **7x more clicks**. Claimed profiles appear **2.7x more frequently** in local search. |
| Yelp | Phone verification. Auto-unclaims after 90 days inactivity. | Claimed profiles see **51% more reviews**. |
| Trustpilot | **Domain email matching** as primary — if claimant's email matches company domain, setup completes immediately. | Auto-creates profiles when customers leave reviews. |
| Clutch | Gmail, LinkedIn, or company email. Manual staff verification when email doesn't match. | — |
| Bark | Aggressive scraping. No formal verification beyond SMS. | Generates complaints but drives significant supply growth. |

James McClure (former Airbnb GM): *"Go to your target supply with a simple proposition — 'claim your listing to start seeing the sales.'"* Venyu (UK B2B events marketplace) reported **near-100% onboarding success** with pre-populated listings vs much lower cold outreach conversion.

**Recommended verification priority for CALLSHEET:**
1. Business email domain match (fastest, lowest friction)
2. LinkedIn authentication (proves professional identity)
3. Phone verification to listed business number
4. Manual review by staff for edge cases

**Legal note:** Under UK GDPR, scraping and displaying B2B data is defensible under **legitimate interest**, but clear opt-out and removal mechanisms must be available from day one. CALLSHEET must differentiate from Bark's approach (creating accounts without consent) — CALLSHEET creates visible directory listings from public data with clear "Claim or remove this listing" options, not accounts.

`[Source: Research — claim flows §4]`

---

## Key Finding 4: Intelligent Suggestions Are Untapped

**No production services directory currently uses intelligent suggestions during onboarding.** ProductionHub, The Knowledge, LA 411, NY 411 — all rely on manual category selection from static lists. This is CALLSHEET's most significant onboarding differentiation opportunity.

LinkedIn's skill suggestion system uses collaborative filtering ("Browsemap") + network embeddings. Result: users with **5+ skills are contacted 33x more** by recruiters.

**For CALLSHEET at launch: rule-based system curated by industry experts.** Collaborative filtering has a cold-start problem. Domain knowledge makes rule-based feasible: selecting "Director of Photography" → suggest Drone Operator, Steadicam Operator, Lighting Camera. Selecting equipment → suggest ARRI, RED, Sony VENICE for camera department.

**Risks and mitigations:**
- **Over-claiming** (users adding skills they barely have) → distinguish "I specialise in this" vs "I can do this"
- **Suggestion fatigue** → limit to 3–5 per step
- **Popularity bias** → weight niche specialisations appropriately
- **Profile homogenisation** → show reasoning ("80% of DPs in your region also list this") so users make informed choices

`[Source: Research — intelligent suggestions §5]`

---

## Key Finding 5: Competitive Onboarding Timing

| Platform | Time to Live (Simple) | Time to Live (Complex) | Blocking Factor |
|---|---|---|---|
| Bark | **3–5 min** | 30–60 min | None — immediately live |
| Mandy | **5–7 min** | 1–3 hours | None — immediately live |
| ProductionHub | 5–10 min + **1–3 day wait** | 30–60 min + wait | Manual staff approval |
| The Knowledge | 5–10 min | 1–2 hours | Unclear — pricing front-loaded |
| Upwork | 15–30 min + **approval wait** | 30–60 min | Manual approval |
| Fiverr | **30–60 min** | 1–2 hours | Mandatory videos + 1 published Gig before activation |

**CALLSHEET targets:** Freelancer listing live in **3–5 minutes**. Company listing live in **8–15 minutes**. Claimed listing live in **2–3 minutes**. No manual approval blocking go-live.

`[Source: Research — comparison matrix §6]`

---

## Recommended Onboarding Architecture

### Shared Foundation: Account Creation (All Paths)

Every user creates a base account: **full name, email, password** (or SSO via Google/LinkedIn). This account immediately grants buyer capabilities — searching, saving providers, sending enquiries. No provider listing created yet.

One qualifying question at signup: **"What do you do in production?"** — multi-select of high-level roles (Producer, Director, Camera, Sound, Post-Production, etc.). This personalises the dashboard without forcing a provider/buyer declaration.

### Path A: Freelancer/Individual Activation (3–5 minutes)

Triggered by "Create your listing" CTA from account dashboard. **4-step wizard:**

| Step | Content | Intelligent Suggestions |
|---|---|---|
| **1 — Your role** | Select primary department/sector from visual grid | Suggest 3–5 related service areas based on selection |
| **2 — Your details** | Professional title, tagline, location, day rate (optional). Pre-populate name/email from account. | — |
| **3 — Your profile** | Headshot upload, brief bio (100–200 words), website/showreel link (optional). Real-time search result preview. | — |
| **4 — Go live** | Review and publish. Profile strength meter at 40–50%. Clear prompts for next actions. | "Add portfolio items and credits to reach 60%" |

### Path B: Company/Facility Activation (8–15 minutes)

Branches when user indicates "Company" rather than "Individual" at step 1.

| Step | Content | Intelligent Suggestions |
|---|---|---|
| **1 — Your company** | Company name, type (post house, equipment hire, studio, etc.), employee count | Suggest relevant sectors/service areas based on company type |
| **2 — Your services** | Multi-select service areas within sectors. Allow specialisation drilling. | "Post-production houses typically offer: Offline Editing, Online Editing, Colour Grading, Sound Mixing, VFX. Select all that apply." |
| **3 — Your details** | Description (200–300 words), logo, address, website, social links. Pre-populate from domain lookup where possible. | — |
| **4 — Go live** | Review and publish with profile strength meter. | Clear path to full completion over following sessions. |

### Path C: Claiming a Pre-Existing Enriched Listing (2–3 minutes)

The highest-conversion path and primary supply-side growth engine.

| Step | Content | Key Design Decision |
|---|---|---|
| **0 — Discovery** | Unclaimed listing displays: "Is this your business? Claim this listing to take control." Shows existing data. | Endowment effect — they already "have" a listing |
| **1 — Verify** | Sign in with Google/LinkedIn or create account with business email. Domain match = **auto-verify immediately**. | Domain email matching is primary verification method |
| **2 — Review and correct** | All pre-populated fields in editable form. Highlight potentially inaccurate fields. **Never require re-entering existing data.** | Reduced cognitive load |
| **3 — Enhance** | Profile strength meter at 30–40% (pre-populated data contributing). Prompt: "Add logo and description to reach 60%." | Optional guided tour of enhancement features |
| **4 — Go live as claimed** | "Claimed" badge displayed. Access to analytics dashboard. | Immediate value signal |

---

## Minimum Viable Profile

**4 mandatory fields + 1 strongly encouraged:**

| Field | Required? | Rationale |
|---|---|---|
| Name or company name | **Required** | Identifies the listing |
| Primary service category | **Required** | Enables search matching (Sector → Service Area) |
| Location or service area | **Required** | Enables geographic filtering |
| One-line description or professional title | **Required** | Appears in search results |
| Profile photo or company logo | **Strongly encouraged** | Listings without images rank lower but still appear |

The unified account already captures name and email at account creation. So listing activation adds **only 3 new fields** (category, location, description). Pre-populated listings via Path C make even these auto-filled.

`[Cross-reference: data-quality-framework.md — Completeness dimension. MVP listing scores ~15/25 on Completeness, enough to clear the 15-point minimum for search visibility.]`

---

## Progressive Disclosure Schedule

| Timing | What to Ask | Profile Strength Target |
|---|---|---|
| **Account creation** (minute 0) | Name, email, password/SSO, "What do you do?" | N/A (no listing yet) |
| **Listing activation** (minutes 1–5) | Category, location, description, photo | ~35% |
| **First session** (minutes 5–15) | 2–3 more service areas, bio, website/showreel. Intelligent suggestions fire. | ~60% |
| **Week 1 emails** (days 1–7) | Day 1: "Your listing is live." Day 3: "Add portfolio — 3x more views." Day 7: "Complete credits." Deep-links to specific sections. | ~70% |
| **Weeks 2–8 prompts** | Contextual. After first enquiry: "Add more service areas." After view milestone: "Add team members." After 30 days: "Review details." | 80%+ |
| **Seasonal/event** | "Awards season — add recent credits." "Listing last updated 90 days ago — keep it fresh." | Maintenance |

`[Cross-reference: freemium-conversion-findings.md — §10 activation triggers. Day 0/3/7/14/30 sequence aligns.]`

---

## Six Implications of Unified Account for Onboarding Design

| Implication | Design Decision |
|---|---|
| **No buyer/provider binary at signup** | Ask "What do you do in production?" — personalise dashboard based on answer, but both roles always available |
| **Provider listing = feature activation, not registration** | "Turn on your listing" from dashboard, not separate landing page. Fiverr's "Become a Seller" is the pattern. |
| **Dashboard serves both roles simultaneously** | Incoming enquiries AND saved provider shortlists on same screen. No Upwork-style heavy context switch. |
| **Search works before listing activation** | Directory search, save, enquire all available immediately on account creation. Establishes platform value before asking for listing effort. |
| **Messaging reflects dual-role reality** | "Search 5,000+ providers, and create your own listing in under 3 minutes." Not "Welcome, provider!" |
| **Cross-role data benefits** | Company name at account creation pre-populates provider listing. Repeated searches for a category → "Would you like to create a listing in this category?" |

`[Source: duality findings — unified account architecture §3]`

---

## Risks and Tradeoffs

| Risk | Severity | Mitigation |
|---|---|---|
| **Minimal MVP degrades directory quality** — 4-field listings are findable but uninformative | Medium | Weight search ranking toward profile completeness. Display "New listing — profile in progress" indicator. |
| **35% never return to complete profile** (CloudSecure second-phase data) | Medium | Week 1 email sequence is critical. Outcome-linked messaging ("profiles with X get Y more enquiries"). Consider making photo required after initial data. |
| **Intelligent suggestions need manual curation at launch** | Medium | Start with high-confidence associations only (DP → Drone, Sound Recordist → Boom Op). Partner with industry advisors. Expand as data accumulates. |
| **Claim flow creates legal/reputational risk** | High | Differentiate from Bark. CALLSHEET creates directory listings from public data with clear "Claim or remove" options. Not creating accounts without consent. GDPR legitimate interest basis with opt-out from day one. |
| **Unified account confuses users expecting traditional directory** | Low | For supply-side outreach, position listing activation as primary value prop. Platform capabilities discovered organically. Don't force the unified model concept. |
| **Mandatory pre-listing content kills conversion** (Fiverr: 30–60 min before seller activation) | High | No mandatory educational content before listing creation. Any education is optional, contextual, delivered after listing is live. |

---

## Decisions Confirmed

| Decision | Status | Evidence |
|---|---|---|
| Unified account with opt-in provider activation | **Confirmed** | ProductionHub and Fiverr both validate. Bifurcated models (The Knowledge, Bark) create friction. |
| "What do you do?" not "Are you a provider or buyer?" | **Confirmed** | Every successful dual-role platform avoids binary role selection at signup. |
| 3–5 minute target for freelancer listing activation | **Confirmed** | Bark: 3–5 min. Mandy: 5–7 min. Competitive parity requires ≤5 min. |
| Pre-populated claim flow as primary supply-side growth engine | **Confirmed** | Google, Yelp, Trustpilot, Clutch all use claim flows. Near-100% onboarding success reported (Venyu). Endowment effect + reduced cognitive load. |
| Profile strength meter (not raw quality score) | **Confirmed** | LinkedIn: 55% more completions. Bark: 80% target with progress bar. Universal best practice. |
| Domain email matching as primary verification | **Confirmed** | Trustpilot model — fastest, lowest friction. Immediate auto-verification when domain matches. |

## Decisions for Concept Design

| Decision | Phase | Notes |
|---|---|---|
| Exact visual design of the profile strength meter | Concept Design | Progress bar vs percentage vs tier labels (Beginner → All-Star) |
| Rule-based suggestion map for all 7 sectors | Concept Design | Requires industry advisor input. Start with Camera, Post-Production, Sound (highest volume). |
| Dashboard layout for dual-role users | Concept Design | How to present provider analytics + buyer search tools without mode-switching |
| Claim flow email template and outreach sequence | Concept Design + Operations | Tone, frequency, legal disclaimers for the ~3,500 unclaimed listings |
| Whether photo is required or strongly encouraged | Concept Design | Start with encouraged; revisit based on completion rate data |

---

## Cross-References

| Document | Relationship |
|---|---|
| `provider-buyer-duality-findings.md` | Unified account architecture is the primary constraint on onboarding design. This research validates it. |
| `data-quality-framework.md` | Completeness dimension scoring (§Completeness) defines what "minimum viable profile" means in score terms. MVP listing ≈ 15/25 Completeness. Profile strength meter aligns with quality score gamification (§Provider-Facing Quality Score). |
| `freemium-conversion-findings.md` | Activation trigger sequence (Day 0/3/7/14/30) maps directly to progressive disclosure schedule. Analytics-as-conversion-lever applies to profile strength prompts. |
| `taxonomy-v1-proposal.md` | Sector → Service Area → Specialisation hierarchy is the structure intelligent suggestions navigate. |
| `data-model-proposal.md` | Account-centric model (from duality revision) means onboarding creates Account first, Provider Facet second. |
| `trust-verification-framework.md` | Verification tiers (Claimed → Verified → Premium Verified) map to claim flow outcomes. Domain email matching populates Verified tier. |
