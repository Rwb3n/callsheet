# Taxonomy Analysis — Findings

**Domain:** Data & Listings  
**Status:** Complete (initial analysis)  
**Last updated:** 2026-02-10  
**Source:** Live analysis of 4rfv.co.uk homepage and subcategory pages

---

## 4rfv Current Structure

**Type:** 2-level flat hierarchy (Category → Subcategory)  
**Top-level categories:** 32  
**Total listing appearances:** ~27,000+ (inflated by cross-listing)  
**Estimated unique providers:** ~4,700 (from prior scrape)

## Key Findings

### 1. Category Overlap is Systemic

Multiple categories describe the same providers from different angles:
- "Broadcast Equipment" / "AV Equipment" / "Broadcast Kit Hire" / "Cameras" / "Lighting Equipment" — a single equipment company could appear in all five
- "Production Companies" / "Corporate Video" / "Event Production" — a production company doing all three is listed three times
- "Production Services" and "Support Services" are catch-all dumping grounds

**Implication:** The taxonomy conflates WHAT a provider does, WHAT they sell/hire, and WHO they are. CALLSHEET must separate these dimensions.

### 2. Dead Categories

| Category | Listings | Why it's dead |
|---|---|---|
| Duplication | 932 | DVD authoring/replication — industry has moved on |
| Internet TV | 338 | "Web video" and "website design" — absorbed into mainstream production |
| Content Management | 330 | Vague; "interactive services" and "playout systems" don't belong together |

932 listings in Duplication alone suggest significant data decay — these providers either don't exist or have pivoted.

### 3. Missing Modern Categories

The following production service areas have no representation in 4rfv's taxonomy:

- Virtual production (LED volume, real-time engines)
- Drone operations (separate from legacy "aerial filming")
- AI-assisted post-production
- Cloud rendering and remote collaboration
- Immersive/XR content production
- Podcast production (video)
- Social media content production
- Intimacy coordination
- Sustainability/green production services
- Data/workflow management (MAM/DAM)

### 4. No Attribute-Based Discovery

4rfv's ONLY discovery mechanisms are:
1. Browse a category
2. Text search

There is no way to filter by:
- Location + service type
- Availability
- Budget range
- Equipment owned
- Credits/experience
- Verification status

This is the dead-end profile problem: you find a category, see a list, click through, and have no structured way to compare or narrow.

### 5. Cross-Listing Inflates Everything

The top categories by listing count:
- Corporate Video: 3,214
- Production Companies: 3,136
- Music & Recording: 2,278
- Camera Crew: 1,627
- Post Production: 1,621

But a significant percentage of these are the same providers listed in multiple categories. The actual provider base is likely 4,500-5,000 unique entities.

### 6. Subcategory Quality is Inconsistent

Some categories have useful subcategories:
- Broadcast Kit Hire → Camera Hire, Equipment Hire, Sound Hire ✓

Others are vague or redundant:
- Studios → "Studios", "Studios & Stages" (what's the difference?)
- Support Services → includes "Uncategorised" as a subcategory

### 7. Geographic Filtering Exists but is Weak

4rfv supports location-based browsing (e.g., "Post Production Facilities in London West") but this is category + location only. No radius search, no postcode search, no "near me."

---

## Structural Diagnosis

4rfv's taxonomy was designed ~15 years ago as a **browsing directory** (like Yellow Pages) and has never been restructured. Categories were added incrementally rather than designed systematically. The result is:

- Overlapping categories that reflect different facets of the same providers
- Legacy categories that reflect a pre-streaming, pre-digital industry
- Missing categories for modern production workflows
- No separation between entity type (company/freelancer), service capability, and transaction type (hire/buy/consult)
- No structured attributes beyond category membership

## Recommendation

See: `taxonomy-v1-proposal.md` for the proposed CALLSHEET taxonomy that addresses these issues.

The fundamental design shift is:
- **4rfv:** Provider → Category (1:many, unstructured)
- **CALLSHEET:** Provider → Capabilities + Attributes + Assets (structured, searchable, matchable)
