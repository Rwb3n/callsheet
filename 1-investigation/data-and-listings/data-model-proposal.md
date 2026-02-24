# Data Model Proposal (Revised)

**Domain:** Data & Listings  
**Status:** Draft v2 — **ARCHITECTURAL REVISION FLAGGED**  
**Last updated:** 2026-02-10  
**Revision notes:** Incorporates entity type model, location model, lifecycle, credits schema, capacity attributes from taxonomy stress test

> **⚠ Architecture Note:** The provider/buyer duality research (`provider-buyer-duality-findings.md`) recommends an Account-centric model where Provider is a facet of a unified Account entity, not the root entity. The fields below remain valid — they move under a Provider Facet. An Account wrapper, Buyer Facet, and Cross-Role layer need to be designed during concept design. See duality findings §Data Model Implications for the conceptual schema.

---

## Core Entity: Provider

A provider is the fundamental record in CALLSHEET. One provider = one real-world entity (person or organisation).

### Entity Model

```
Provider
├── Identity
│   ├── Name (current trading name)
│   ├── Entity Type (enum: Freelancer, Company, Education, Industry Body, Public Sector, Non-Profit)
│   ├── Formerly Known As[] (aliases for rebrands/mergers)
│   ├── Companies House Number (if applicable)
│   ├── VAT Number (optional)
│   └── Founded/Established Year
│
├── Profile
│   ├── Bio/Description (free text, max ~500 words)
│   ├── Logo/Headshot
│   ├── Website URL
│   ├── Social Profiles[] (LinkedIn, Instagram, Vimeo, YouTube, IMDb, X)
│   ├── Contact Email
│   ├── Contact Phone
│   └── Media[] (showreel URL, gallery images)
│
├── Capabilities
│   ├── Taxonomy Tags[] (Sector → Service Area → Specialisation, multi-select)
│   ├── Transaction Types[] (Hire, Buy, Service, Consult)
│   ├── Works In[] (Drama, Documentary, Commercial, Corporate, Entertainment, News, Sport, Music, Digital/Social)
│   └── Free-Text Tags[] (unstructured niche capabilities)
│
├── Location
│   ├── Base Location (postcode + derived region + geo coordinates)
│   ├── Service Regions[] (multi-select UK/Ireland regions)
│   ├── Travel Willingness (enum: Local only, Regional, UK-wide, International)
│   └── Additional Locations[] (for multi-site businesses)
│       ├── Address
│       ├── Postcode + geo
│       ├── Contact details (if different from main)
│       └── Location-specific attributes (equipment, capacity — for S5 facilities)
│
├── Availability
│   ├── Status (enum: Available, Available From [date], Unavailable)
│   ├── Seasonal Patterns (text/tags: "Typically unavailable Jun-Aug")
│   └── Lead Time (enum: Same day, 1 week, 2-4 weeks, 6+ weeks)
│
├── Commercial
│   ├── Budget Tier (enum: £ / ££ / £££)
│   ├── Day Rate (optional, provider-disclosed)
│   ├── Currency (enum: GBP, EUR, Both)
│   └── Subscription Tier (Free, Standard, Premium — internal, drives visibility)
│
├── Credentials
│   ├── Accreditations[] (BECTU, Equity, BAFTA, ISO, CAA, SIA, etc.)
│   ├── Equipment Owned[] (tagged from controlled vocabulary)
│   ├── Software/Tools[] (tagged from controlled vocabulary)
│   ├── Tax Regime Expertise[] (UK Film Tax Relief, Section 481, HETV, etc.)
│   └── Regulatory Compliance[] (CAA, SIA, HSE, Ofcom)
│
├── Credits[]
│   ├── Project Name (text)
│   ├── Client/Commissioner (text, optional)
│   ├── Role/Service Provided (mapped to taxonomy)
│   ├── Year (number)
│   ├── Format (enum: Feature, TV Series, TV One-Off, Short, Commercial, Corporate, Music Video, Digital/Social)
│   ├── Genre[] (tags: Drama, Documentary, Comedy, etc.)
│   ├── Awards[] (tags)
│   └── Verification (enum: Self-reported, IMDb-linked, Client-confirmed)
│
├── Verification
│   ├── Tier (enum: Unclaimed, Claimed, Verified, Premium)
│   ├── Claimed Date
│   ├── Verified Date
│   ├── Verification Method[] (Companies House, domain match, social match, etc.)
│   └── Last Verification Check
│
├── Quality Score (internal composite — see trust-verification-framework.md)
│   ├── Completeness Score
│   ├── Freshness Score
│   ├── Credit Depth Score
│   ├── Engagement Score
│   └── Composite Score
│
├── Lifecycle
│   ├── Status (enum: Active, Inactive, Merged, Dissolved)
│   ├── Created Date
│   ├── Last Updated (provider or enrichment)
│   ├── Last Provider Login
│   ├── Merged Into (provider_id, if applicable)
│   └── Succeeded By (provider_id, if applicable)
│
└── Capacity (conditional — primarily S6 Production Support and S5 Facilities)
    ├── Max Crew/Event Size (number range)
    ├── Fleet/Stock Size (enum: Small, Medium, Large)
    ├── Stage Size (dimensions, sq ft/m)
    ├── Power (amps, 3-phase boolean)
    └── Parking/Basecamp (boolean + capacity)
```

---

## Entity Relationships

```
Provider (1) ──── has many ──── Capabilities (taxonomy tags)
Provider (1) ──── has many ──── Credits
Provider (1) ──── has many ──── Locations (for multi-site)
Provider (1) ──── has many ──── Accreditations
Provider (1) ──── has many ──── Free-Text Tags
Provider (1) ──── may merge into ──── Provider (1) [lifecycle]
Provider (1) ──── may succeed ──── Provider (1) [lifecycle]
```

### Engagement Tracking (Platform-Generated)

Required for analytics-as-conversion-lever strategy. See `freemium-conversion-findings.md` for rationale — 74% of LinkedIn Premium subscribers cite "who viewed your profile" as top upgrade reason. Show the count free, gate the detail behind Tier 1.

```
Provider.Engagement
├── Profile Views (total count — visible to free tier)
├── Profile Viewers[] (company/buyer identities — Tier 1+ only)
│   ├── Viewer ID (anonymised or named depending on tier)
│   ├── Viewer Type (production company, agency, broadcaster, etc.)
│   ├── Timestamp
│   └── Source (search result, direct link, category browse, matching)
├── Search Appearances (count of times listing appeared in buyer searches)
├── Search Terms[] (what buyers searched to find this provider — Tier 1+ only)
├── Enquiries Received (count)
├── Enquiry Response Rate (%)
├── Enquiry Response Time (average)
└── Weekly/Monthly Trend Data (Tier 1+ only)
```

**Free tier sees:** Profile view count, search appearance count, enquiry count.  
**Tier 1 sees:** Full viewer identities, search terms, trend data, response metrics.  
**Tier 2 sees:** Above + competitor benchmarking (category averages for views, enquiry rate, response time).

### Not Modelled in V1 (Flagged for Concept Design)

- **Account entity wrapping Provider + Buyer facets** — see `provider-buyer-duality-findings.md`. The duality research requires Account as root entity, not Provider. Provider fields below become a facet within an Account wrapper.
- **Buyer Facet** (search history, saved searches, shortlists, enquiries sent, buyer engagement metrics) — needed for unified account architecture and V2 buyer-side premium features.
- **Cross-Role layer** (shared reputation, network/connections, account-level verification) — enables trust signals that carry across provider and buyer behaviour.
- Provider → Provider relationships (partnerships, preferred suppliers, team members)
- Provider → Project relationships (beyond credits — active project tracking)
- Reviews/Endorsements (V2 — community trust layer)

---

## Data Sources per Field

| Field Group | Provider Self-Service | Platform Enrichment | Automated Check |
|---|---|---|---|
| Identity | Name, entity type | Companies House, VAT lookup | Companies House status |
| Profile | All fields | Website scrape, social detection | Website liveness, social activity |
| Capabilities | Taxonomy tags, free-text | Inferred from website/portfolio | — |
| Location | Base, service regions | Postcode geo-lookup | — |
| Availability | All fields | — | — |
| Commercial | Budget tier, day rate | Competitor pricing signals | — |
| Credentials | Self-declared | Membership API checks (where available) | — |
| Credits | Self-reported | IMDb scrape, website portfolio | IMDb cross-reference |
| Verification | — (platform-assigned) | Companies House, WHOIS, social | Automated liveness checks |
| Quality Score | — (platform-calculated) | All of the above | Composite calculation |

---

## Provider vs Platform Controlled Fields

| Owner | Fields |
|---|---|
| **Provider controls** | Name, bio, contact, website, social links, media, capabilities, availability, budget, day rate, credits (self-reported), free-text tags |
| **Platform controls** | Verification tier, quality score, enriched data (Companies House status, social detection), lifecycle status |
| **Shared** | Accreditations (provider claims, platform can verify), credits (provider enters, platform can IMDb-link), location (provider sets, platform geo-enriches) |

---

## V1 Minimum Viable Record

For a provider to appear in search results, the following must be present:

| Field | Required | Source |
|---|---|---|
| Name | Yes | Provider or enrichment |
| Entity Type | Yes | Provider or inferred |
| At least 1 Taxonomy Tag (Service Area level) | Yes | Provider or inferred |
| Base Location (at least region level) | Yes | Provider or enrichment |
| Contact (email or website) | Yes | Provider or enrichment |
| Lifecycle Status = Active | Yes | Default or check |

Everything else is progressive enhancement — improves quality score, search ranking, and profile utility but isn't required to exist in the system.

---

## Schema Considerations

### Controlled Vocabularies Needed

| Vocabulary | Scope | Governance |
|---|---|---|
| Taxonomy (Sector/Service Area/Specialisation) | ~200 terms | Quarterly review ceremony |
| Equipment | Camera brands/models, software, hardware | Annual update + provider suggestions |
| Accreditations | Industry bodies, certifications | Annual update |
| Regions | UK + Ireland geographic regions | Static (rarely changes) |
| Genres | Content genres/formats | Stable, occasional additions |
| Synonyms | Alias lookup table for search | Ongoing operational maintenance |

### Multi-Location Handling

For providers with multiple physical locations (studios, depots, offices):

- Each location is a sub-record within the provider entity
- Each location can have its own: address, contact details, equipment list, capacity attributes
- Search results can surface location-level matches: "Studio X — Manchester branch" rather than just "Studio X"
- Provider still appears as ONE entity in results — locations are shown as expandable detail

### Internationalisation Notes (V2 prep)

- All text fields: UTF-8
- Currency: stored as ISO 4217 code
- Location: stored as coordinates + postcode + free-text address (not dependent on UK postcode format)
- Dates: ISO 8601
- These choices keep the schema extensible beyond UK/Ireland without refactoring

---

## Open Questions

1. **Search index design** — which fields are indexed for full-text search vs faceted filtering? (Platform & Product investigation)
2. **Data import format** — if bulk-importing from 4rfv scrape, what's the ETL mapping? (Depends on scrape data format)
3. **API design** — provider self-service API vs admin-only? Public search API? (Platform & Product investigation)
4. **GDPR compliance** — legitimate interest basis for unclaimed B2B listings. Provider right to erasure. Data retention policy. (Operations investigation)
5. **Image/media storage** — CDN, max file sizes, format requirements (Platform & Product investigation)
