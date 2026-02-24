# CALLSHEET V1 Taxonomy Proposal (Revised)

**Domain:** Data & Listings  
**Status:** Draft v2  
**Last updated:** 2026-02-10  
**Revision notes:** Incorporates fixes from stress testing (15 gaps identified, 11 resolved here)

---

## Design Principle

**4rfv model:** Provider is filed IN a category. Discovery = browse categories.  
**CALLSHEET model:** Provider HAS capabilities. Discovery = multi-dimensional search.

A provider is a single entity with:
- An **entity type** (what kind of organisation/individual)
- One or more **service capabilities** (mapped to taxonomy)
- **Attributes** (location, equipment, accreditations, availability, budget range)
- **Assets** (portfolio, showreel, structured credits, case studies)
- **Free-text capability tags** (for emerging/niche services not yet in taxonomy)

The taxonomy is ONE dimension of discovery, not the only one.

---

## Entity Types

Providers are classified by organisational type. This affects how they appear in search results, what attributes are relevant, and how they interact with the platform.

| Entity Type | Description | Examples |
|---|---|---|
| **Freelancer** | Individual sole trader or limited company (1 person) | DP, Editor, Sound Recordist |
| **Company** | Commercial business, 2+ people | Post house, hire company, production company |
| **Educational Institution** | University, film school, training provider | NFTS, Ravensbourne, Met Film School |
| **Industry Body** | Union, guild, trade association, certification body | BECTU, BAFTA, Pact, BFI |
| **Public Sector** | Publicly funded broadcaster or organisation | BBC, Channel 4, S4C |
| **Non-Profit** | Charity or social enterprise operating in production | Into Film, ScreenSkills |

A provider selects ONE primary entity type. This is filterable in search.

---

## Taxonomy Structure

Three-level hierarchy: **Sector → Service Area → Specialisation**

### Level 1: Sectors (7)

| # | Sector | What it covers |
|---|---|---|
| S1 | **Production** | Companies and individuals who make content |
| S2 | **Post-Production** | Everything after the shoot |
| S3 | **Crew & Talent** | People for hire — technical crew |
| S4 | **Equipment & Technology** | Kit, software, hardware — sale and hire |
| S5 | **Facilities & Locations** | Physical spaces — studios, stages, locations |
| S6 | **Production Support** | Services that support production but aren't production itself |
| S7 | **Business Services** | Professional services — legal, finance, insurance, training |

**Note on On-Screen Talent:** Actors, presenters, voice artists, and supporting artists are **excluded from V1**. Casting/talent has a fundamentally different data model (demographic attributes, physical characteristics, performance reels) and its own ecosystem (Spotlight, Casting Networks). Casting Directors and Talent Agents ARE included under S7: Recruitment. See investigation brief: `on-screen-talent-scope.md`

---

### Level 2 & 3: Service Areas → Specialisations

#### S1: PRODUCTION

| Service Area | Specialisations |
|---|---|
| **Film Production** | Feature film, Short film, Documentary, Factual |
| **TV Production** | Drama, Entertainment, Factual, News, Sport |
| **Commercial Production** | TV commercials, Online/digital ads, Branded content |
| **Corporate Production** | Corporate film, Internal comms, Training video, Investor/stakeholder |
| **Event Production** | Live event, Conference, Exhibition, Hybrid/virtual event |
| **Content Production** | Social media content, Web series, Podcast (video), Livestream |
| **Animation Production** | 2D, 3D, Stop-motion, Motion graphics, Character animation |
| **Immersive Production** | VR/AR/XR content, 360° video, Interactive experience |
| **Virtual Production** | LED volume, Real-time (Unreal/Unity), Motion capture, Previz |

#### S2: POST-PRODUCTION

| Service Area | Specialisations |
|---|---|
| **Editing** | Offline edit, Online edit, Assembly, Conform |
| **Colour & Grading** | Colour grading, Colour correction, HDR mastering, Film scan |
| **Visual Effects (VFX)** | Compositing, CGI, Matte painting, Rotoscoping, Cleanup |
| **Audio Post** | Sound design, Dubbing/mixing, Foley, ADR, Audio restoration |
| **Music** | Composition, Production music/library, Scoring, Music supervision |
| **Graphics & Titles** | Title design, Lower thirds, Infographics, End credits |
| **Finishing & Delivery** | QC, Format conversion, Mastering, Deliverables, Closed captioning |
| **AI-Assisted Post** | AI upscaling, Automated editing, Speech-to-text, AI colour |
| **Localisation** | Subtitling, Dubbing, Translation, Access services (AD, HOH) |

#### S3: CREW & TALENT (Technical Crew only in V1)

| Service Area | Specialisations |
|---|---|
| **Camera** | Director of Photography, Camera Operator, Focus Puller, Steadicam, Drone Operator |
| **Lighting** | Gaffer, Lighting Director, Best Boy, Lighting Designer |
| **Sound** | Sound Recordist, Boom Operator, Sound Mixer, Sound Designer |
| **Production Crew** | Producer, Line Producer, Production Manager, Production Coordinator, Runner |
| **Direction** | Director, Assistant Director (1st, 2nd, 3rd), Script Supervisor |
| **Art Department** | Production Designer, Art Director, Set Decorator, Props Master, Scenic Artist |
| **Hair, Makeup & Costume** | Makeup Artist, Hair Stylist, Costume Designer, Wardrobe Supervisor, Prosthetics |
| **Stunts & Action** | Stunt Coordinator, Stunt Performer, Fight Choreographer, Armourer |
| **Post Crew** | Editor, Colourist, VFX Artist, Sound Editor, Graphic Designer |
| **Specialist** | Drone Pilot, Underwater Camera, Aerial Coordinator, Technical Director, Intimacy Coordinator |

#### S4: EQUIPMENT & TECHNOLOGY

| Service Area | Specialisations |
|---|---|
| **Camera Systems** | Cinema cameras, Broadcast cameras, Specialty (high-speed, underwater, miniature) |
| **Lenses & Accessories** | Prime, Zoom, Anamorphic, Filters, Matte boxes, Follow focus |
| **Lighting** | Tungsten, HMI, LED, Practicals, Grip/rigging |
| **Sound Equipment** | Microphones, Wireless, Mixers/recorders, Comms |
| **Grip & Rigging** | Dollies, Cranes, Jibs, Sliders, Tracking, Scaffolding |
| **Monitors & Playback** | On-set monitors, Video village, Playback systems |
| **Drones & Aerial** | Drone systems, Stabilised heads, Aerial rigging |
| **Power & Cabling** | Generators, Distribution, Cabling/connectors |
| **Broadcast Systems** | Routers, Switchers, Servers, Playout, Encoding |
| **Software & Cloud** | NLEs, DAWs, VFX software, MAM/DAM, Cloud render, Collaboration tools |
| **Virtual Production Tech** | LED walls/volumes, Tracking systems, Real-time engines, Disguise/Pixotope |

#### S5: FACILITIES & LOCATIONS

| Service Area | Specialisations |
|---|---|
| **Studios** | Sound stage, TV studio, Film studio, Green/blue screen, Insert stage |
| **Recording Studios** | Music recording, Voice/ADR, Foley stage, Podcast studio |
| **Edit & Post Facilities** | Edit suite, Grading suite, Dubbing theatre, Review/screening room |
| **Virtual Production Stages** | LED volume, Motion capture stage, Previz suite |
| **Office & Production Space** | Production office, Writers room, Casting suite |
| **Locations** | Location library, Location management, Location scouting, Permits |
| **Backlots & Standing Sets** | Exterior sets, Period sets, Speciality environments |

#### S6: PRODUCTION SUPPORT

| Service Area | Specialisations | Capacity Indicators |
|---|---|---|
| **Catering** | Location catering, Craft services, Event catering | Max crew size, dietary capabilities |
| **Transport & Logistics** | Unit vehicles, Artiste transport, Freight/shipping, Parking/basecamp | Fleet size, vehicle types, coverage area |
| **Props & Set Dressing** | Prop hire, Prop making, Set dressing, Action vehicles, Greens/plants | Stock volume, workshop capacity |
| **Costume & Wardrobe** | Costume hire, Costume making, Costume breakdown, Millinery | Stock volume, period coverage |
| **Construction** | Set construction, Scenic painting, Metalwork, Carpentry | Workshop size, max build scale |
| **SFX (Physical)** | Pyrotechnics, Mechanical effects, Weather effects, Atmospherics | Licence level, indoor/outdoor |
| **Health & Safety** | H&S supervision, Risk assessment, First aid, Intimacy coordination | Certifications held |
| **Security** | Location security, Asset protection, Crowd management | Team size, SIA licensed |
| **Accommodation** | Crew accommodation, Artists accommodation, Hotels | Capacity, location radius |

#### S7: BUSINESS SERVICES

| Service Area | Specialisations |
|---|---|
| **Finance** | Production accounting, Tax credits/relief, Completion bonds, Cashflow |
| **Insurance** | Production insurance, E&O, Equipment insurance |
| **Legal** | Entertainment law, Rights clearance, Contracts, IP |
| **Training & Education** | Short courses, Degrees, Apprenticeships, Mentoring, CPD |
| **Recruitment** | Permanent, Freelance, Crew agencies, Talent/casting agents |
| **Industry Bodies** | Unions, Guilds, Trade associations, Certification bodies |
| **Marketing & PR** | EPK, Unit publicity, Digital marketing, Social media, Festival strategy |
| **Distribution** | Sales agents, Aggregators, Platform delivery, Theatrical |

---

## Filterable Dimensions (Attribute Layer)

### Core Attributes (All providers)

| Dimension | Type | Details |
|---|---|---|
| **Entity Type** | Enum | Freelancer, Company, Education, Industry Body, Public Sector, Non-Profit |
| **Base Location** | Geo (postcode + region) | Primary address / registered address |
| **Service Regions** | Multi-select regions | Where they actually work — can be multiple regions |
| **Travel Willingness** | Enum | Local only, Regional, UK-wide, International |
| **Availability Status** | Enum + date | Available, Available from [date], Unavailable |
| **Seasonal Patterns** | Text/tags | "Typically unavailable Jun-Aug", "Peak: Sep-Dec" |
| **Lead Time** | Indicator | Same day, 1 week, 2-4 weeks, 6+ weeks |
| **Budget Tier** | Range indicator | £ / ££ / £££ (or actual rates where disclosed) |
| **Transaction Types** | Multi-select | Hire, Buy, Service, Consult |
| **Accreditations** | Tags | BECTU, Equity, BAFTA, ISO, specific certifications |
| **Equipment Owned** | Tags | ARRI Alexa, DaVinci Resolve, Pro Tools, Flame, etc. |
| **Verification Status** | Tier | Unclaimed → Claimed → Verified → Premium |
| **Works In** | Multi-select | Drama, Documentary, Commercial, Corporate, Entertainment, News, Sport, Music, Digital/Social |
| **Free-Text Tags** | Unstructured | Provider-entered niche capabilities not in taxonomy |

### Jurisdiction Attributes

| Dimension | Type | Details |
|---|---|---|
| **Country** | Multi-select | UK, Republic of Ireland, Both |
| **Currency** | Enum | GBP, EUR, Both |
| **Tax Regime Expertise** | Tags | UK Film Tax Relief, Section 481, HETV, Animation Tax Relief |
| **Regulatory Compliance** | Tags | CAA (drones), SIA (security), HSE, Ofcom |

### Capacity Attributes (Support services — S6)

| Dimension | Type | Details |
|---|---|---|
| **Max Crew/Event Size** | Number range | "Up to 50", "50-200", "200+" |
| **Coverage Area** | Regions | Where they can physically deploy |
| **Fleet/Stock Size** | Indicator | Small, Medium, Large |

### Location Attributes (Facilities — S5)

| Dimension | Type | Details |
|---|---|---|
| **Locations** | Array of objects | Each with: address, geo, capacity, equipment, availability |
| **Stage Size** | Dimensions | sq ft / sq m |
| **Parking/Basecamp** | Boolean + details | Available, capacity |
| **Power** | Spec | Amps available, 3-phase |

---

## Structured Credits Schema

| Field | Type | Required? |
|---|---|---|
| **Project Name** | Text | Yes |
| **Client/Commissioner** | Text | No |
| **Role/Service Provided** | Text (mapped to taxonomy) | Yes |
| **Year** | Number | Yes |
| **Format** | Enum: Feature, TV Series, TV One-Off, Short, Commercial, Corporate, Music Video, Digital/Social | Yes |
| **Genre** | Tags: Drama, Documentary, Factual, Entertainment, News, Sport, Comedy, Horror, Sci-Fi, etc. | No |
| **Awards** | Tags | No |
| **Verification** | Enum: Self-reported, IMDb-linked, Client-confirmed | No |

---

## Entity Lifecycle

| Event | Handling |
|---|---|
| **New provider** | Created as Unclaimed (enriched) or Claimed (self-registered) |
| **Rebrand** | "Formerly known as" field preserved as alias. Old name searchable. URL redirects. |
| **Merger/Acquisition** | Child entity marked as merged → parent. Credits transfer. Old entity becomes alias/redirect. |
| **Closure** | Marked Inactive. Preserved for credit history. Excluded from search. |
| **Demerger/Spin-off** | New entity created with lineage reference to parent. |

---

## Synonym/Alias Layer

| Canonical Term | Aliases |
|---|---|
| Director of Photography | DP, DoP, Cinematographer, Lighting Cameraman |
| Camera Operator | Cameraman, Camera Op, Shooter |
| Sound Recordist | Sound Mixer (location), Production Sound Mixer, Sound Op |
| Visual Effects | VFX, Digital Effects, CGI (colloquial) |
| Colour Grading | Color Grading, Telecine (legacy), Colour Correction |
| Outside Broadcast | OB, Remote Production, Live Production |
| Dubbing/Mixing | Re-recording, Final Mix, Dub |

Implemented as search-layer lookup table. Maintained as operational asset.

---

## Free-Text Capability Tags

### Purpose
1. Immediate search matching for niche services not yet categorised
2. Governance signal — clusters of similar tags trigger taxonomy review

### Promotion Criteria
- 10+ providers using same/similar tag
- Clear definition and boundary
- Validated buyer search demand

### Review Cadence
- Monthly: automated clustering
- Quarterly: taxonomy review ceremony — promote, merge, or leave

---

## 4rfv Migration Mapping

| 4rfv Category | CALLSHEET Mapping | Notes |
|---|---|---|
| Aerial Filming | S4: Drones & Aerial + S3: Specialist | Split: equipment vs people |
| Animation | S1: Animation Production | Clean 1:1 |
| Archive | S7: Distribution + S2: Finishing & Delivery | Reclassify by function |
| AV Equipment | S4: multiple areas | Decompose into specific equipment types |
| Broadcast Audio | S4: Sound Equipment + S2: Audio Post | Split: kit vs service |
| Broadcast Cameras | S4: Camera Systems | Clean 1:1 |
| Broadcast Equipment | S4: Broadcast Systems | Clean 1:1 |
| Broadcast Facilities | S5: multiple areas | Decompose by facility type |
| Broadcast Kit Hire | S4: all (transaction type = Hire) | Not a category — attribute |
| Lighting Equipment | S4: Lighting | Clean 1:1 |
| Camera Crew | S3: Camera | Clean 1:1 |
| Casting and Agents | S7: Recruitment (agents only V1) | On-screen talent excluded V1 |
| Catering | S6: Catering | Clean 1:1 |
| Content Management | S4: Software & Cloud | Reclassify |
| Corporate Video | S1: Corporate Production | Clean 1:1 |
| Duplication | **DEPRECATED** | DVD-era — remove |
| Event Production | S1: Event Production | Clean 1:1 |
| Internet TV | S1: Content Production + S4: Software & Cloud | Split and modernise |
| Jobs & Training | S7: Training + S7: Recruitment | Split |
| Locations | S5: Locations | Clean 1:1 |
| Logistics and Transport | S6: Transport & Logistics | Clean 1:1 |
| Music & Recording | S2: Music + S5: Recording Studios | Split: service vs facility |
| Outside Broadcast | S4: Broadcast Systems + S5: Facilities | Split: kit vs facility |
| Post Production | S2: multiple areas | Decompose by discipline |
| Production Services | S3 + S6 multiple | Decompose |
| Production Companies | S1: multiple types | Decompose by output |
| Props & Models | S6: Props & Set Dressing | Clean 1:1 |
| Scenery & Set | S6: Construction | Clean 1:1 |
| SFX & Stunts | S6: SFX + S3: Stunts + S2: VFX | Split: physical vs digital vs people |
| Studios | S5: Studios | Clean 1:1 |
| Support Services | S7: multiple areas | Decompose |
| System Integration | S4: Broadcast Systems | Merge |

---

## Validation Checklist (Pre-Lock)

- [ ] Map scraped 4rfv dataset — can every record be cleanly assigned?
- [ ] Test 20-30 real provider websites — does taxonomy capture what they do?
- [ ] Test 5-10 buyer user stories — "I need [X] in [Y] who can [Z]"
- [ ] Benchmark against ProductionHub, Mandy, The Knowledge taxonomies
- [ ] Review with 2-3 industry practitioners
- [ ] Confirm synonym coverage with industry terminology audit

---

## Open Investigations (Pending)

| Ref | Investigation | Doc |
|---|---|---|
| Gap #2 | Onboarding flow for multi-capability providers | `onboarding-flow-investigation.md` |
| Gap #4 | On-Screen Talent scope decision | `on-screen-talent-scope.md` |
| Gap #10 | Provider/buyer duality and commercial implications | `provider-buyer-duality.md` |
| Gap #13/#14 | Trust, verification, and credit quality framework | `trust-verification-framework.md` |
