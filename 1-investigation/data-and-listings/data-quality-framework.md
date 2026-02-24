# Data Quality Framework

**Domain:** Data & Listings  
**Status:** COMPLETE  
**Last updated:** 2026-02-10  
**Inputs:** `data-model-proposal.md`, `listing-decay-research.md` (decay benchmarks), `freemium-conversion-findings.md` (quality-as-conversion-lever), 4rfv spot-check priors  
**Downstream:** Sets the envelope for `trust-verification-framework.md`. Feeds into search ranking (Platform & Product) and operational workload (Operations).

---

## Purpose

CALLSHEET's differentiator is data quality. 4rfv has ~4,700 listings with no freshness tracking, no enrichment, and spot-check evidence of 15–20% dead/unmaintained websites and 5–10% dissolved entities. "Better data" is a claim until there's a scoring model, detection ruleset, and maintenance cadence to back it up. This framework defines all three.

---

## Decay Model: What We're Fighting

### Published Benchmarks

The best-evidenced annual decay rate for B2B listing databases is **22–30%**, meaning roughly a quarter of records develop at least one material inaccuracy per year. No creative-industry-specific measurement exists — this is a genuine research gap. The benchmarks below are drawn from `listing-decay-research.md`.

| Data Field | Annual Decay Rate | Source Quality | Planning Number |
|---|---|---|---|
| **Entity existence** (company dissolved/ceased trading) | 11–13% | Strong (Companies House FYE 2021–2025) | **12%** |
| **Email addresses** | 22–30% | Moderate (D&B, DealSignal, RevenueBase tracking) | **25%** |
| **Phone numbers** | 12–24% | Weak (vendor estimates, limited primary data) | **18%** |
| **Physical addresses** | 5–10% | Moderate (SEC relocation data, business birth/death rates) | **8%** |
| **Website URLs** | 10–15% (estimated) | Weak (no published study; inference from closures + rebranding) | **12%** |
| **Contact persons / job titles** | 25–40% | Strong (BLS tenure data: median 3.9 years) | **30%** |
| **Any field changed** | ~70% | Moderate (John Coe 2009, n=1,200 — includes trivial changes) | N/A — too broad |

`[Source: listing-decay-research.md — §§1-4]`

### Creative Industry Multiplier

Proxy data suggests creative industry directories face above-average decay. DCMS data: 93.4% microbusinesses (vs 89.1% UK average), 12.8% annual death rate in Information & Communication, 9.9% net decline in creative business numbers 2019–2024. Agency staff turnover ~27–30%. Freelancer intermittency: 42–50% describe work as inconsistent.

**Planning assumption for CALLSHEET:** ~25–35% of listings will develop at least one material inaccuracy per year. This means on a base of 4,700 records, roughly **1,175–1,645 listings need attention annually** — or approximately **100–140 per month**.

`[Source: listing-decay-research.md — §4, creative industry proxy data]`

### 4rfv Baseline (Spot-Check Priors)

From manual inspection during taxonomy analysis (not systematic — treat as directional):

- **15–20%** of listings had websites that were dead, redirected, or clearly unmaintained (copyright dates 3+ years old, placeholder content)
- **5–10%** appeared to be entities that no longer exist (dissolved companies, freelancers who've moved on)
- **No timestamps anywhere** — no "last updated" fields, no way to determine when any listing was last touched
- **No enrichment signals** — no Companies House cross-referencing, no social profile detection, no automated liveness checks

This is the quality floor CALLSHEET needs to beat from day one.

---

## Quality Scoring Model

### Five Dimensions

Each listing receives a composite quality score from 0–100 based on five weighted dimensions. The weights reflect what matters most for buyer utility (the core product) and platform credibility.

| Dimension | Weight | Definition | What It Measures |
|---|---|---|---|
| **Completeness** | 25% | % of relevant schema fields populated | Does the listing have the information a buyer needs? |
| **Freshness** | 25% | Time since last meaningful update (provider action or enrichment check) | Is the data current? |
| **Accuracy** | 20% | Do verifiable fields match external sources? | Does the data reflect reality? |
| **Richness** | 15% | Portfolio items, credits, media, accreditations present beyond minimum | Is there enough to evaluate the provider? |
| **Verification** | 15% | Has the provider claimed the listing? What verification tier? | Can we trust the source? |

**Why these weights:** Completeness and Freshness are weighted highest because they're the dimensions 4rfv fails on most visibly (missing data + no update tracking). Accuracy is third because it requires external checks that are operationally expensive. Richness is a quality signal but has diminishing returns. Verification is important but binary in effect — a listing is either claimed or it isn't.

### Dimension Scoring Rules

#### Completeness (0–25 points)

Score based on populated fields relative to the entity type's expected field set. Not all fields are equal — contact details matter more than optional metadata.

| Field Group | Points | Required For Full Score |
|---|---|---|
| **Identity** (name, entity type) | 3 | Both populated |
| **Contact** (email + phone + website — at least 2 of 3) | 5 | Two of three channels working |
| **Capabilities** (at least 1 taxonomy tag at Service Area level) | 4 | Mapped to taxonomy |
| **Location** (base location + at least region-level precision) | 3 | Geocodable |
| **Description** (bio/description text) | 3 | ≥50 words |
| **Profile visual** (logo or headshot) | 2 | Image present |
| **Social presence** (at least 1 social profile linked) | 2 | Link resolves |
| **Credits** (at least 1 structured credit) | 3 | Structured per schema |

**Total possible: 25.** Minimum viable listing (appears in search) requires Identity + Contact + Capabilities + Location = **15 points minimum**.

#### Freshness (0–25 points)

Based on the most recent of: provider login/edit, successful enrichment check, or provider-initiated profile update.

| Last Meaningful Update | Points |
|---|---|
| Within 30 days | 25 |
| 31–90 days | 20 |
| 91–180 days | 15 |
| 181–365 days | 10 |
| 1–2 years | 5 |
| 2+ years or unknown | 0 |

**"Meaningful update" defined as:** Provider edits any field, provider logs in and confirms "details still correct," enrichment check returns a changed or confirmed value, or provider responds to an enquiry through the platform. Automated system touches (e.g., nightly liveness checks that return no change) do not count — the point is evidence that the data has been reviewed or validated, not that a bot pinged it.

**Implication for 4rfv import:** On a 4,700-record base with no existing timestamps, every record starts at Freshness = 0. The score only improves when the provider claims the listing, an enrichment check is run, or the provider takes any action. This creates a natural incentive for providers to engage early.

#### Accuracy (0–20 points)

Based on automated external verification checks. Not all checks apply to all entity types.

| Check | Points | Applies To | Method |
|---|---|---|---|
| **Companies House status = Active** | 5 | Companies only (not freelancers) | API check |
| **Website resolves** (HTTP 200, not parked/placeholder) | 4 | All with website field | HTTP HEAD request + basic content check |
| **Email deliverable** (MX record exists, no hard bounce) | 4 | All with email field | MX lookup + SMTP verification (no send) |
| **Phone contactable** (number format valid, not disconnected) | 3 | All with phone field | Format validation; periodic manual spot-check |
| **Social profiles resolve** | 2 | All with social links | URL check |
| **Postcode valid and geocodes correctly** | 2 | All | Postcode lookup |

**Total possible: 20.** Some checks yield binary results (Companies House active or not); others require interpretation (website resolves but content is clearly outdated). The scoring should be conservative — award points only when the check passes cleanly.

**Freelancer-specific note:** Freelancers without a Companies House number skip that check (5 points). Their maximum Accuracy score is 15/20, which is then scaled to 20. This avoids penalising freelancers for not being incorporated.

#### Richness (0–15 points)

Measures depth of profile content beyond the minimum viable listing.

| Content | Points | Threshold |
|---|---|---|
| **Credits** | 5 | 1 credit = 1pt, up to 5 |
| **Portfolio/media** | 4 | 1 item = 1pt, up to 4 |
| **Accreditations** | 3 | 1 accreditation = 1pt, up to 3 |
| **Works In tags** | 2 | At least 2 genre/format tags |
| **Equipment/tools listed** | 1 | At least 1 |

**Total possible: 15.** Richness has the weakest correlation with data quality (a listing can be thin but accurate) but strongly correlates with buyer utility. It also aligns with the freemium conversion lever: gating unlimited portfolio items behind Tier 1 means providers who want higher Richness scores need to upgrade.

#### Verification (0–15 points)

Based on verification tier from the data model.

| Tier | Points | Definition |
|---|---|---|
| **Unclaimed** | 0 | Enriched record, provider hasn't engaged |
| **Claimed** | 5 | Provider has registered and confirmed ownership |
| **Verified** | 10 | Platform has confirmed identity via Companies House, domain match, or equivalent |
| **Premium Verified** | 15 | Verified + additional credential checks (insurance, accreditations, references) |

**This is where the trust/verification framework plugs in.** The Verification dimension here defines the scoring envelope. The trust/verification investigation (`trust-verification-framework.md`) defines what "Verified" and "Premium Verified" specifically require — which checks, what evidence, what cadence. Design that investigation to populate these tiers.

---

## Composite Score Interpretation

| Score Range | Classification | Visibility Treatment | Operational Action |
|---|---|---|---|
| **80–100** | Excellent | Full search visibility. Eligible for "Featured" and matching priority. | Routine maintenance only. |
| **60–79** | Good | Full search visibility. Standard ranking. | Monitor for Freshness decay. |
| **40–59** | Fair | Appears in search but ranked below Good/Excellent. Flagged with "unverified" or "not recently updated" indicator visible to buyers. | Enrichment check scheduled. Provider outreach if claimed. |
| **20–39** | Poor | Appears in search only if directly matching a specific query. Not shown in browse/category views. | Active outreach to provider. Enrichment check mandatory. |
| **0–19** | Critical | Hidden from search. Accessible only via direct URL. | Candidate for archival. Final outreach before removal. |

**The threshold question from the brief:** Listings should be hidden from search at **<20 composite score**. This is deliberately low — the bar for appearing in search should be low to maintain directory volume, but the bar for ranking well should be high to reward quality. A listing with a name, one contact channel, one taxonomy tag, and a valid postcode can appear; it just won't rank above richer, fresher, verified competitors.

**What a freshly-imported 4rfv record scores (estimated):**

Taking a typical unclaimed import with name, phone, email, website, one category, town:

| Dimension | Likely Score | Reasoning |
|---|---|---|
| Completeness | ~15/25 | Has identity, contact, capabilities, location. Missing description, visual, social, credits. |
| Freshness | 0/25 | No timestamp data. Starts at zero. |
| Accuracy | 8–16/20 | Depends on whether website/email/CH checks pass. If 15–20% have dead websites, many will lose 4 points here. |
| Richness | 0/15 | No credits, portfolio, accreditations, tags in the import data. |
| Verification | 0/15 | Unclaimed. |

**Estimated composite for a typical unclaimed import: 23–31 out of 100.** This puts most unclaimed imports in the "Poor" band — visible in search only on direct match, not in browse views. The score immediately improves to 28–36 if the first enrichment cycle confirms the website and email are live. It jumps to 33–41 when the provider claims the listing (Verification +5). This creates a natural ladder: import → enrich → claim → complete profile → verify.

---

## Decay Detection Ruleset

### Automated Checks (Run Without Human Intervention)

| Signal | Check Method | Frequency | Score Impact |
|---|---|---|---|
| Website returns 4xx/5xx for 7+ consecutive days | HTTP HEAD request | Weekly | Accuracy: −4 points |
| Email hard bounces (MX record gone or SMTP permanent failure) | MX + SMTP check | Monthly | Accuracy: −4 points |
| Companies House status ≠ Active | Companies House API | Monthly | Accuracy: −5 points. Triggers immediate review. |
| Postcode no longer valid | Postcode lookup | Quarterly | Accuracy: −2 points |
| Social profile URLs return 404 | URL check | Monthly | Accuracy: −2 points |
| No provider login or platform activity in 180+ days | Activity log | Continuous | Freshness score degrades per schedule above |

### Provider-Triggered Signals

| Signal | Detection | Score Impact |
|---|---|---|
| Provider updates any field | Activity log | Freshness resets to 25 |
| Provider confirms "details still current" (annual prompt) | In-app prompt | Freshness resets to 25 |
| Provider responds to buyer enquiry via platform | Enquiry system | Freshness resets to 25 |
| Provider uploads new credit or portfolio item | Activity log | Richness may increase; Freshness resets |

### External / Event-Triggered Signals

| Signal | Source | Action |
|---|---|---|
| Company enters dissolution/liquidation | Companies House streaming API (or polling) | Flag for immediate review. Score zeroed if confirmed. |
| Company changes registered name | Companies House | Update record. Flag for provider confirmation. |
| Company changes registered address | Companies House | Update record. Trigger location re-verification. |
| Domain registration expires (WHOIS) | Periodic WHOIS check | Accuracy: −4 points (website). Flag for review. |

---

## Enrichment Cadence

### Tiered Schedule

Not all records need the same maintenance frequency. The cadence is proportional to the record's value (claimed/paid vs unclaimed) and risk (time since last verification).

| Record Type | Full Enrichment Cycle | Liveness Checks | Provider Prompt |
|---|---|---|---|
| **Paid tier (Professional/Premium/Partner)** | Quarterly | Weekly (website, email) | Annual confirmation prompt + post-renewal check |
| **Claimed, free tier** | Semi-annually | Fortnightly (website, email) | Annual confirmation prompt |
| **Unclaimed (enriched only)** | Annually | Monthly (website, email) | N/A — outreach to claim |
| **New imports (4rfv migration)** | Immediate on import | Weekly until first enrichment cycle | Claim prompt sent on import |

### What "Full Enrichment Cycle" Includes

1. Companies House status + registered address check
2. Website liveness + content check (is the site clearly maintained?)
3. Email deliverability check (MX + SMTP verification)
4. Social profile resolution check (all linked profiles)
5. Phone number format validation (periodic manual spot-check for disconnected numbers — not automatable at scale)
6. Postcode geocoding validation
7. IMDb cross-reference for listed credits (where applicable)
8. Recalculate composite quality score

### Estimated Operational Load at Launch (~4,700 records)

| Task | Volume | Frequency | Annual Touches |
|---|---|---|---|
| Liveness checks (automated) | 4,700 | Weekly–monthly depending on tier | ~120,000 |
| Full enrichment cycles (automated + review) | 4,700 | 1–4x/year depending on tier | ~10,000 |
| Manual reviews (flagged by automated checks) | ~100–140/month (25–35% annual decay) | Continuous | ~1,200–1,700 |
| Provider outreach (unclaimed listings) | ~3,500 (est. 75% unclaimed at launch) | One-off campaign + periodic follow-up | ~5,000 touches |

The automated checks are computationally trivial. The manual reviews and provider outreach are the real operational cost. This feeds directly into the Operations investigation for headcount planning.

---

## Escalation Paths

When a decay signal fires, the response follows a defined escalation path. The goal is to fix the data, not to punish the provider.

### For Claimed Listings

```
Signal detected (automated check fails)
  → Record flagged internally (no visibility change yet)
  → If provider is active: in-app notification + email within 48 hours
    → Provider updates data → flag cleared, score recalculated
    → No response in 14 days → second notification
    → No response in 30 days → listing downgraded in search ranking (score recalculated with failed check)
    → No response in 90 days → listing moved to "Unverified" status. Visible but with warning indicator.
    → No response in 180 days + multiple failed checks → listing hidden from search. Direct URL still works. Final email.
    → No response in 365 days → listing archived. Removed from search and browse entirely.
```

### For Unclaimed Listings

```
Signal detected (automated check fails)
  → Record flagged internally
  → Enrichment check: can we fix the data automatically? (e.g., Companies House address change → auto-update)
    → Yes → update and recalculate. No outreach needed.
    → No → manual review queue
      → If fixable with reasonable effort (e.g., new website URL found via Google) → update
      → If not fixable → score degrades per normal schedule
      → If entity dissolved (Companies House confirmed) → archive immediately
```

### For Paid Listings

Paid providers get the fastest response and most generous grace periods, because they're paying for the service and have a commercial relationship.

```
Signal detected
  → Immediate in-app notification + email
  → If critical (Companies House dissolution, website dead) → account manager contact within 24 hours (Partner tier) or 48 hours (Professional/Premium)
  → Grace period: 30 days for non-critical, 7 days for critical before any visibility impact
  → Visibility is NEVER reduced for paid listings without direct provider contact attempt
```

---

## Provider-Facing Quality Score

**Should providers see their own quality score?** Yes — but framed as a profile strength indicator, not a punishment metric.

### Design Principles

- Call it **"Profile Strength"** not "Quality Score" — the former is aspirational, the latter is judgmental
- Show it as a progress bar or percentage, not a raw number out of 100
- Make each dimension actionable: "Add a showreel to improve your profile strength" rather than "Your Richness score is 4/15"
- Tie it to conversion messaging: "Profiles with 80%+ strength receive 3x more buyer views" (once we have the data to support this claim)
- **Never hide the methodology.** Every provider should see exactly what their score is and what they can do to improve it. Opaque scoring was one of the anti-patterns from the freemium research (Yelp's review-filtering opacity fuelled extortion allegations for a decade).

### Gamification Alignment with Freemium Tiers

| Provider Action | Score Impact | Free Tier? | Paid Tier? |
|---|---|---|---|
| Complete all Identity fields | +3 Completeness | ✓ | ✓ |
| Add description (50+ words) | +3 Completeness | ✓ | ✓ |
| Add logo/headshot | +2 Completeness | ✓ | ✓ |
| Link social profiles | +2 Completeness + Accuracy check | ✓ | ✓ |
| Add 1–5 credits | +1–5 Richness | Up to 5 (free cap) | Unlimited |
| Add portfolio/media items | +1–4 Richness | Up to 5 (free cap) | Unlimited |
| Upload showreel | +1 Richness | ✗ (Tier 1+) | ✓ |
| Get verified | +10 Verification | ✓ (basic) | ✓ (premium) |
| Confirm details annually | +25 Freshness reset | ✓ | ✓ |

The profile-strength indicator naturally creates conversion pressure: providers hit a ceiling on Richness because free-tier portfolio limits cap their score. "Upload a showreel to reach 80% profile strength — upgrade to Professional" is the softest possible upsell.

`[Cross-reference: freemium-conversion-findings.md — §3 analytics-as-conversion-lever, §10 activation triggers]`

---

## Record Lifecycle States

| State | Visible in Search | Visible via Direct URL | Score Calculation | Provider Can Edit |
|---|---|---|---|---|
| **Active** | Yes | Yes | Full | Yes (if claimed) |
| **Under Review** | Yes (no ranking change) | Yes | Frozen | Yes |
| **Degraded** | Yes (ranked lower) | Yes | Active (with failed checks reflected) | Yes |
| **Suspended** | No | Yes (with warning) | Frozen | Yes (to resolve issues) |
| **Archived** | No | No (404) | N/A | No (must contact support to reactivate) |

### Hard Rules

1. **A listing is never deleted.** It can be archived (removed from all public access) but the record persists internally for audit trail and potential reactivation.
2. **A claimed listing is never hidden without provider contact.** At least two notification attempts across two channels (in-app + email) before any visibility reduction.
3. **A paid listing is never hidden without human review.** No automated system should reduce visibility for a paying provider without a support team member confirming the action.
4. **Companies House dissolution = immediate archival.** The entity doesn't exist. There's nothing to maintain. If the dissolution is later reversed (rare but possible), the listing can be reactivated.
5. **Provider right to erasure (GDPR) = immediate full deletion.** Unlike archival, this removes all data. The record is not recoverable. This is the one case where records are truly deleted.

---

## Relationship to Trust/Verification Framework

This quality framework defines the scoring envelope. The trust/verification investigation (`trust-verification-framework.md`) should define:

- What specific checks constitute "Verified" status (Companies House match, domain ownership, social profile confirmation?)
- What additional checks constitute "Premium Verified" (insurance, accreditation confirmation, reference checks?)
- How credit verification works (self-reported → IMDb-linked → client-confirmed progression)
- What trust signals buyers see (badges, verification indicators, quality tier display)
- Cadence and cost of verification checks

The Verification dimension (15% of composite score) and the Accuracy dimension (20%) are both populated by outputs from the trust/verification framework. This framework defines the weights and thresholds; the trust/verification framework defines the inputs.

---

## Open Questions (Carried Forward)

| Question | Resolution Path |
|---|---|
| Should the composite score directly affect search ranking, or should ranking be a separate algorithm that includes score as one input? | Platform & Product investigation |
| What's the legal position on maintaining unclaimed B2B listings? GDPR legitimate interest basis. | Operations investigation — legal review |
| Phone number verification at scale — no reliable automated method exists for UK numbers. Manual spot-check is the only option. What's the acceptable sample rate? | Operations investigation — cost modelling |
| Freelancer vs company scoring: freelancers skip the Companies House check. Should they have additional checks to compensate, or is scaling the 15/20 to 20 sufficient? | Trust/verification investigation |
| At 10,000+ records, does the manual review volume (~200–300/month) require dedicated headcount? | Operations investigation — staffing model |

---

## Cross-References

| Document | Relationship |
|---|---|
| `data-model-proposal.md` | Quality Score entity defined there. This framework populates its scoring rules. Account-centric revision (from duality research) wraps this under Provider Facet. |
| `listing-decay-research.md` | Decay rate benchmarks. Planning numbers drawn from §§1–4. |
| `freemium-conversion-findings.md` | Analytics-as-conversion-lever. Profile strength indicator aligns with upgrade triggers (§10). |
| `trust-verification-framework.md` | Sets envelope. Verification and Accuracy dimensions populated by trust/verification outputs. |
| `taxonomy-v1-proposal.md` | Capabilities scoring depends on taxonomy tag mapping. |
| `provider-buyer-duality-findings.md` | Quality scoring applies to Provider Facet within unified Account model. Buyer-side quality metrics are V2. |
