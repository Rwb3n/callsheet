# 4rfv Data Profile — CS-WORK-024 AC-01

**Source:** `4-work-management/4rfv_directory.db`
**Table:** `companies`
**Row count:** 4657
**Column count:** 20
**Profiled:** 2026-02-24

## Critical Findings Summary

**Extract from `companies_all`, not `companies`.** The `companies` table is a stripped-down merge output missing `description` (3,845 rows, avg 885 chars), `contact_person` (3,635 rows), `products_services` (240 rows), `social_media`, and `url` (4rfv source page). The `companies` table can be joined via `original_ids[0]` → `companies_all.id` (100% join rate verified).

**No Companies House numbers exist.** The column is 100% null. Entity type inference must use **name heuristic**: 1,108 names (23.8%) contain "Ltd"/"Limited"/"PLC"/"LLP"/"Inc" → `company`. Remainder → `freelancer`. No CH verification possible at import time.

**Region is 100% null.** Must be inferred from `city` (92.6% populated) or `postal_code` (93.9%).

**Country field is dirty.** 94 rows (2.0%) have non-UK values. Of those, ~30 are genuinely non-UK (Ireland, USA, Germany). ~64 have postcodes, county names, typos ("Engalnd", "Heartfordshire"), or addresses in the country field. These can mostly be normalised to "United Kingdom".

**Postal codes: 49 invalid (1.1%).** Patterns: missing space (`WC1 X8RW`), missing half (`SW1`, `W1`, `SG6`), transposed characters (`WN6 OXQ` = `WN6 0XQ`), extra digits (`KA1 36BJ`). Most recoverable by regex normalisation. Some are incomplete (outcode only) — extract to `basePostcode` as-is, mark as partial.

**Emails: very clean.** 84.8% populated, 99.9% valid format. 2 invalid (`peter@kaurus.com @ paul@kaurus.com` — dual email in one field, `email allan@readsnurseries.co.uk` — prefix text). 706 null (15.2%).

**Phones: moderately clean.** 97.5% populated. 91.8% match standard UK phone regex. 334 "other" format (international with non-UK prefixes, double-zero prefixes, odd formatting). Extraction should normalise +44/0xxx formats, pass through others as-is.

**Websites: clean.** 96.6% populated. 100% have `http://` or `https://` prefix. 97.7% are `http://` (old scrape). 5 URLs are actually email addresses (misplaced data).

**Addresses: 67% multi-line (3,123 rows).** 18 contain embedded postcodes. 194 are blank strings. 35 contain just "London" (city misplaced). Not used for `ImportRecord` directly — postcode + city are separate fields.

**Subcategory mapping: complex.** 790 subcategories across 43 categories, mapped via `company_subcategory` (12,208 rows). 60% of companies have 1 subcategory, but long tail up to 86. Some categories are clearly noise (product names as category names: "Movcam Cage For The Sony Alpha...", "Quartz 66X64 SDI Video Router..."). 78 subcategories have ≤2 companies. Top subcategories map cleanly to CALLSHEET taxonomy (Camera Equipment, Aerial Filming, Animation, Studios).

**Duplicate canonical names: 9 pairs.** Low volume. Downstream dedup (pipeline Phase 3) handles this.

**Encoding: minimal.** 3 descriptions with encoding artefacts. 0 HTML entities. 0 encoding issues in names. The scrape was clean.

### Extraction Decision Log

| Decision | Rationale |
|----------|-----------|
| Source table: `companies_all` joined to `companies` | `companies` lacks description and products_services. Join via `original_ids[0]` → `companies_all.id`. |
| Entity type: name heuristic (Ltd/Limited/PLC/LLP → company, else freelancer) | CH number column is 100% null. Name pattern is the only signal. |
| Region: derive from city | Region column is 100% null. City is 92.6% populated. Map UK cities → regions via lookup table. |
| Bio: `companies_all.description` | Average 885 chars. 3,845/4,721 rows have descriptions. |
| Services: `company_subcategory` → taxonomy mapping | 790 subcategories → 269 CALLSHEET specialisations. Products_services only covers 240 rows — insufficient as primary source. |
| Postcode normalisation: regex cleanup + accept partial | 49 invalid postcodes. Most recoverable. Incomplete outcodes accepted as partial postcodes. |
| Country filter: import all, normalise non-UK to "United Kingdom" where applicable | 94 non-UK rows. ~30 genuinely foreign (import anyway — some UK companies list foreign offices). |
| Phone: pass through, no normalisation | Too many formats. Pipeline downstream can normalise later. ImportRecord accepts raw string. |
| Website: strip to domain | All have protocol prefix. ImportRecord field is `websiteUrl`. |

---

## Schema

| # | Column | Type | Nullable |
|---|--------|------|----------|
| 0 | `company_id` | INTEGER | yes |
| 1 | `name` | TEXT | no |
| 2 | `canonical_name` | TEXT | yes |
| 3 | `companies_house_number` | TEXT | yes |
| 4 | `is_active` | INTEGER | yes |
| 5 | `last_verified` | DATE | yes |
| 6 | `primary_email` | TEXT | yes |
| 7 | `primary_phone` | TEXT | yes |
| 8 | `primary_website` | TEXT | yes |
| 9 | `address` | TEXT | yes |
| 10 | `city` | TEXT | yes |
| 11 | `region` | TEXT | yes |
| 12 | `postal_code` | TEXT | yes |
| 13 | `country` | TEXT | yes |
| 14 | `enrichment_priority` | INTEGER | yes |
| 15 | `last_enriched` | DATE | yes |
| 16 | `needs_update` | INTEGER | yes |
| 17 | `original_ids` | TEXT | yes |
| 18 | `data_quality_score` | REAL | yes |
| 19 | `migration_date` | TIMESTAMP | yes |

## Column Profiles

### `company_id`

| Metric | Value |
|--------|-------|
| Null | 0 (0.0%) |
| Blank (empty string) | 0 (0.0%) |
| Non-empty | 4657 (100.0%) |
| Distinct values | 4657 |
| Length: min/avg/max | 1 / 4 / 4 |

**Top values (by frequency):**

- `1 (1)`
- `2 (1)`
- `3 (1)`
- `4 (1)`
- `5 (1)`
- `6 (1)`
- `7 (1)`
- `8 (1)`

### `name`

| Metric | Value |
|--------|-------|
| Null | 0 (0.0%) |
| Blank (empty string) | 0 (0.0%) |
| Non-empty | 4657 (100.0%) |
| Distinct values | 4657 |
| Length: min/avg/max | 3 / 22 / 89 |

**Pattern matches:**

- url_strict: 1 (0.0%)
- url_loose: 1 (0.0%)
- uk_postcode_loose: 3 (0.1%)

**Top values (by frequency):**

- `'GCM Services' (1)`
- `01zero-one Training Courses Film & TV London (1)`
- `020 Locksmiths Ltd (1)`
- `1 st 4 film Corporate Video (1)`
- `100 Prints (1)`
- `107 Meridian F M (1)`
- `1080 Media Organisation Ltd (1)`
- `1080dots Digital Signage (1)`

### `canonical_name`

| Metric | Value |
|--------|-------|
| Null | 0 (0.0%) |
| Blank (empty string) | 0 (0.0%) |
| Non-empty | 4657 (100.0%) |
| Distinct values | 4648 |
| Length: min/avg/max | 3 / 21 / 89 |

**Pattern matches:**

- url_strict: 1 (0.0%)
- url_loose: 1 (0.0%)
- uk_postcode_loose: 3 (0.1%)

**Top values (by frequency):**

- `absolute broadcast (2)`
- `aggreko generators (2)`
- `autocue (2)`
- `bloomberg television (2)`
- `ceres productions (2)`
- `elev8 access platforms (2)`
- `excel charter (2)`
- `picture palace films (2)`

### `companies_house_number`

| Metric | Value |
|--------|-------|
| Null | 4657 (100.0%) |
| Blank (empty string) | 0 (0.0%) |
| Non-empty | 0 (0.0%) |
| Distinct values | 0 |
| Length: min/avg/max | 0 / 0 / 0 |

### `is_active`

| Metric | Value |
|--------|-------|
| Null | 0 (0.0%) |
| Blank (empty string) | 0 (0.0%) |
| Non-empty | 4657 (100.0%) |
| Distinct values | 1 |
| Length: min/avg/max | 1 / 1 / 1 |

**Top values (by frequency):**

- `1 (4657)`

### `last_verified`

| Metric | Value |
|--------|-------|
| Null | 4657 (100.0%) |
| Blank (empty string) | 0 (0.0%) |
| Non-empty | 0 (0.0%) |
| Distinct values | 0 |
| Length: min/avg/max | 0 / 0 / 0 |

### `primary_email`

| Metric | Value |
|--------|-------|
| Null | 706 (15.2%) |
| Blank (empty string) | 0 (0.0%) |
| Non-empty | 3951 (84.8%) |
| Distinct values | 3806 |
| Length: min/avg/max | 10 / 23 / 44 |

**Pattern matches:**

- email_strict: 3949 (99.9%)
- email_loose: 3951 (100.0%)
- uk_postcode_loose: 3 (0.1%)
- high_unicode: 1 (0.0%)

**Top values (by frequency):**

- `info@scruffydogltd.com (10)`
- `info@eloquenceautocue.com (9)`
- `david@homeonfilm.com (4)`
- `info@cuebox.com (4)`
- `hello@trickboxtv.com (4)`
- `info@ttx.co.uk (4)`
- `info@360red.co.uk (3)`
- `info@voytek.co.uk (3)`

### `primary_phone`

| Metric | Value |
|--------|-------|
| Null | 117 (2.5%) |
| Blank (empty string) | 0 (0.0%) |
| Non-empty | 4540 (97.5%) |
| Distinct values | 4369 |
| Length: min/avg/max | 1 / 13 / 44 |

**Pattern matches:**

- uk_postcode_strict: 2 (0.0%)
- uk_postcode_loose: 2 (0.0%)
- phone: 4166 (91.8%)

**Top values (by frequency):**

- `+44 (0) 800 211 8604 (9)`
- `07831 299669 (5)`
- `020 8367 2820 (5)`
- `0207 8019111 (4)`
- `+44 (0)7979 445899 (4)`
- `01452 729903 (4)`
- `0116 2533 420 (3)`
- `01752 339906 (3)`

### `primary_website`

| Metric | Value |
|--------|-------|
| Null | 159 (3.4%) |
| Blank (empty string) | 0 (0.0%) |
| Non-empty | 4498 (96.6%) |
| Distinct values | 4282 |
| Length: min/avg/max | 13 / 28 / 118 |

**Pattern matches:**

- email_strict: 5 (0.1%)
- email_loose: 5 (0.1%)
- url_strict: 4498 (100.0%)
- url_loose: 4498 (100.0%)
- uk_postcode_loose: 6 (0.1%)
- phone: 2 (0.0%)

**Top values (by frequency):**

- `http://www.bbc.co.uk (17)`
- `http://www.4rfv.co.uk (11)`
- `http://www.nationwideplatforms.co.uk (8)`
- `http://www.scruffydogltd.com (7)`
- `http://store.virginmedia.com (6)`
- `http://www.extremefacilities.com (5)`
- `http://www.discoverychannel.co.uk (5)`
- `http://www.agstudios.co.uk (4)`

### `address`

| Metric | Value |
|--------|-------|
| Null | 16 (0.3%) |
| Blank (empty string) | 194 (4.2%) |
| Non-empty | 4447 (95.5%) |
| Distinct values | 3868 |
| Length: min/avg/max | 1 / 30 / 143 |

**Pattern matches:**

- uk_postcode_loose: 18 (0.4%)
- high_unicode: 4 (0.1%)

**Top values (by frequency):**

- `London (35)`
- `Unit E3
OYO Business Park
Park Lane (7)`
- `10-11 Percy Street (7)`
- `Surrey (6)`
- `Kent (5)`
- `Pinewood Studios (5)`
- `Pinewood Studios
Pinewood Road
Buckinghamshire (5)`
- `15-17 Este Road (5)`

### `city`

| Metric | Value |
|--------|-------|
| Null | 290 (6.2%) |
| Blank (empty string) | 53 (1.1%) |
| Non-empty | 4314 (92.6%) |
| Distinct values | 1057 |
| Length: min/avg/max | 1 / 8 / 48 |

**Top values (by frequency):**

- `London (1487)`
- `Manchester (113)`
- `Bristol (103)`
- `Glasgow (79)`
- `Birmingham (69)`
- `Cardiff (45)`
- `Leeds (43)`
- `Edinburgh (38)`

### `region`

| Metric | Value |
|--------|-------|
| Null | 4657 (100.0%) |
| Blank (empty string) | 0 (0.0%) |
| Non-empty | 0 (0.0%) |
| Distinct values | 0 |
| Length: min/avg/max | 0 / 0 / 0 |

### `postal_code`

| Metric | Value |
|--------|-------|
| Null | 282 (6.1%) |
| Blank (empty string) | 0 (0.0%) |
| Non-empty | 4375 (93.9%) |
| Distinct values | 3450 |
| Length: min/avg/max | 2 / 7 / 8 |

**Pattern matches:**

- uk_postcode_strict: 4326 (98.9%)
- uk_postcode_loose: 4326 (98.9%)
- high_unicode: 1 (0.0%)

**Top values (by frequency):**

- `SL0 0NH (49)`
- `TW17 0QD (27)`
- `WD6 1JG (10)`
- `EC1V 2NX (9)`
- `W1B 3HH (9)`
- `B35 6AN (9)`
- `SW11 2TL (8)`
- `W1T 1DN (8)`

### `country`

| Metric | Value |
|--------|-------|
| Null | 0 (0.0%) |
| Blank (empty string) | 0 (0.0%) |
| Non-empty | 4657 (100.0%) |
| Distinct values | 57 |
| Length: min/avg/max | 1 / 14 / 21 |

**Pattern matches:**

- uk_postcode_strict: 6 (0.1%)
- uk_postcode_loose: 6 (0.1%)
- ch_number: 1 (0.0%)

**Top values (by frequency):**

- `United Kingdom (4563)`
- `Ireland (12)`
- `USA (11)`
- `London (5)`
- `Germany (4)`
- `NI (3)`
- `India (3)`
- `Italy (2)`

### `enrichment_priority`

| Metric | Value |
|--------|-------|
| Null | 0 (0.0%) |
| Blank (empty string) | 0 (0.0%) |
| Non-empty | 4657 (100.0%) |
| Distinct values | 4 |
| Length: min/avg/max | 2 / 2 / 2 |

**Top values (by frequency):**

- `70 (3805)`
- `50 (836)`
- `90 (9)`
- `85 (7)`

### `last_enriched`

| Metric | Value |
|--------|-------|
| Null | 4657 (100.0%) |
| Blank (empty string) | 0 (0.0%) |
| Non-empty | 0 (0.0%) |
| Distinct values | 0 |
| Length: min/avg/max | 0 / 0 / 0 |

### `needs_update`

| Metric | Value |
|--------|-------|
| Null | 0 (0.0%) |
| Blank (empty string) | 0 (0.0%) |
| Non-empty | 4657 (100.0%) |
| Distinct values | 1 |
| Length: min/avg/max | 1 / 1 / 1 |

**Top values (by frequency):**

- `1 (4657)`

### `original_ids`

| Metric | Value |
|--------|-------|
| Null | 0 (0.0%) |
| Blank (empty string) | 0 (0.0%) |
| Non-empty | 4657 (100.0%) |
| Distinct values | 4657 |
| Length: min/avg/max | 3 / 6 / 37 |

**Top values (by frequency):**

- `[2575] (1)`
- `[2406] (1)`
- `[4353] (1)`
- `[1202] (1)`
- `[4443] (1)`
- `[1002] (1)`
- `[2324] (1)`
- `[456] (1)`

### `data_quality_score`

| Metric | Value |
|--------|-------|
| Null | 4657 (100.0%) |
| Blank (empty string) | 0 (0.0%) |
| Non-empty | 0 (0.0%) |
| Distinct values | 0 |
| Length: min/avg/max | 0 / 0 / 0 |

### `migration_date`

| Metric | Value |
|--------|-------|
| Null | 0 (0.0%) |
| Blank (empty string) | 0 (0.0%) |
| Non-empty | 4657 (100.0%) |
| Distinct values | 1 |
| Length: min/avg/max | 19 / 19 / 19 |

**Pattern matches:**

- phone: 4657 (100.0%)

**Top values (by frequency):**

- `2025-09-14 17:15:50 (4657)`

## Cross-Column Misplacement

- Postcode pattern found in `primary_email`: 3 rows
- Postcode pattern found in `address`: 18 rows
- Postcode pattern found in `country`: 6 rows
- Postcode pattern found in `name`: 3 rows
- Postcode pattern found in `canonical_name`: 3 rows
- Phone pattern found in `migration_date`: 4657 rows

## Subcategory Analysis

**Categories:** 43
**Subcategories:** 790
**company_subcategory rows:** 4721 companies with assignments

### Subcategories per company distribution

| Subcats | Companies |
|---------|-----------|
| 1 | 2838 |
| 2 | 603 |
| 3 | 492 |
| 4 | 170 |
| 5 | 101 |
| 6 | 86 |
| 7 | 78 |
| 8 | 68 |
| 9 | 59 |
| 10 | 42 |
| 11 | 35 |
| 12 | 26 |
| 13 | 24 |
| 14 | 15 |
| 15 | 16 |
| 16 | 13 |
| 17 | 6 |
| 18 | 9 |
| 19 | 10 |
| 20 | 6 |
| 21 | 5 |
| 22 | 2 |
| 23 | 4 |
| 25 | 1 |
| 26 | 1 |
| 27 | 1 |
| 28 | 2 |
| 29 | 2 |
| 30 | 1 |
| 31 | 1 |
| 33 | 1 |
| 45 | 1 |
| 47 | 1 |
| 86 | 1 |

### Top 30 subcategories (by company count)

| Subcategory | Category | Companies |
|-------------|----------|-----------|
| Camera Equipment - Hire | Broadcast Kit hire | 29 |
| Aerial Filming | Aerial Filming | 28 |
| Aerial Filming Drones | Aerial Filming | 28 |
| Animation | Animation | 28 |
| Animation - 3D Computer Generated | Animation | 28 |
| Broadcast Equipment - Manufacture & Sale | Broadcast Equipment | 28 |
| Camera - Crew | Camera crew | 28 |
| Cameraman | Camera crew | 28 |
| Crew Hire | Camera crew | 28 |
| Lighting Cameraman | Camera crew | 28 |
| Production Companies - Corporate & Non Broadcast | Corporate video | 28 |
| Studios | Studios | 28 |
| 3 | Music - Production | 28 |
| Animation - Production Companies | Animation | 27 |
| Archive | Archive | 27 |
| Broadcast Equipment - Hire | Broadcast Kit hire | 27 |
| Sound Equipment - Hire | Broadcast Kit hire | 27 |
| corporate video production companies | Corporate video | 27 |
| Corporate Video Production Company | Corporate video | 27 |
| Production Companies - Commercials and Promos | Corporate video | 27 |
| Video Production Company | Corporate video | 27 |
| Events | Event production | 27 |
| Training | Jobs & Training | 27 |
| Lighting | Lighting Equipment | 27 |
| Transport - Vehicles | Locations | 27 |
| Voice Over Studios | Music & recording | 27 |
| Audio - Post Production | Post Production | 27 |
| High Definition | Post Production | 27 |
| Production Companies - Film & Television | Production Companies | 27 |
| Propmaker | Props & Models | 27 |

### Categories summary

| Category | Subcategory count |
|----------|-------------------|
|  | 0 |
|  | 0 |
| AV Equipment | 12 |
| Aerial Filming | 5 |
| Animation | 22 |
| Archive | 18 |
| Broadcast Audio | 22 |
| Broadcast Equipment | 50 |
| Broadcast Facilities | 29 |
| Broadcast Kit hire | 19 |
| Camera crew | 32 |
| Cameras | 34 |
| Casting and Agents | 32 |
| Catering | 3 |
| Content Management | 23 |
| Corporate video | 20 |
| Duplication | 37 |
| Event production | 11 |
| Internet TV | 11 |
| Jobs & Training | 17 |
| Lighting Equipment | 12 |
| Locations | 51 |
| Logistics and Transport | 29 |
| Makeup - Wigs, Prosthetics, Suppliers, Artists | 3 |
| Media Distillery Launches Search And Discovery Suite | 0 |
| Modelmaking | 2 |
| Movcam Cage For The Sony Alpha A7s Camera (Black) 303-2201 (3032201) | 0 |
| Multi-Stage Virtual Production Made Possible With SP At Trilogy Studios | 0 |
| MultiDyne Expands openGear Range | 0 |
| Music & recording | 34 |
| Music - Production | 5 |
| Music Composition | 5 |
| Outside broadcast | 18 |
| Post Production | 39 |
| Production Companies | 17 |
| Production Services | 59 |
| Props & Models | 38 |
| Quartz 66X64 SDI Video Router In 8RU Frame (Software 5.02) With Dallas | 0 |
| SFX & Stunts | 20 |
| Scenery & Set | 16 |
| Studios | 16 |
| Support Services | 17 |
| System Integration | 12 |

### Low-use subcategories (≤2 companies): 78

| Subcategory | Category | Companies |
|-------------|----------|-----------|
| 360 Immersive Audio | Broadcast Audio | 2 |
| Compliance Recording | Broadcast Audio | 2 |
| Custom-Built Adaptors | Broadcast Equipment | 2 |
| EVS-Disc Recorders | Broadcast Equipment | 2 |
| Stereoscopic 3D | Broadcast Equipment | 2 |
| Timecode | Broadcast Equipment | 2 |
| Cell Phone Rental | Broadcast Kit hire | 2 |
| Camera Filters | Cameras | 2 |
| Field Recorders | Cameras | 2 |
| Broadcast Subtitling Systems | Content Management | 2 |
| Game Show Systems | Content Management | 2 |
| News Room Automation | Content Management | 2 |
| USB Duplication | Duplication | 2 |
| Video Tape Restoration | Duplication | 2 |
| Audio PA Finance | Event production | 2 |
| Film Set Cooling | Locations | 2 |
| Pest Control | Locations | 2 |
| ATA Carnets | Logistics and Transport | 2 |
| De-Rig Facilities | Logistics and Transport | 2 |
| Limos - For Sale | Logistics and Transport | 2 |
| Pro Mastering | Post Production | 2 |
| Apartments | Production Services | 2 |
| Military and Police Advisor | Production Services | 2 |
| On-line PR and Marketing | Production Services | 2 |
| Photo Restoration and Airbrushing | Production Services | 2 |
| Rights & Royalties | Production Services | 2 |
| Props - Plant Hire | Props & Models | 2 |
| Soft Tooling | Props & Models | 2 |
| Translight | Props & Models | 2 |
| Set & Scenery Salvage & Recycle | Scenery & Set | 2 |
| Sprung panel flooring - Hire | Scenery & Set | 2 |
| Publicists | Support Services | 2 |
| Mounting Brackets | Broadcast Equipment | 1 |
| Natural History Production Equipment | Broadcast Equipment | 1 |
| Studio Masterclock | Broadcast Equipment | 1 |
| Broadcast Data Disposal | Broadcast Facilities | 1 |
| Teletext - Mhp Interactive | Broadcast Facilities | 1 |
| Independent Film Maker Equipment Hire | Broadcast Kit hire | 1 |
| Camera-mounted Recorders | Cameras | 1 |
| Circus Training | Casting and Agents | 1 |

## Specific Quality Checks

### Companies House numbers

- Total with CH number: 0
- Valid format: 0
- Invalid format: 0

### Postcodes (postal_code)

- Total with postcode: 4375
- Valid UK format: 4326
- Invalid format: 49
- Invalid samples: `KA1 36BJ`, `WA11`, `WN6 OXQ`, `C3 V 9JU`, `SW1`, `EH46 &HJ`, `SG6`, `W1 4 0DA`, `W1`, `IP6 OEQ`, `BH22`, `W814 4LJ`, `IP12`, `WD3 4 AJ`, `WC1 X8RW`

### Emails (primary_email)

- Total with email: 3951
- Valid format: 3949
- Invalid format: 2
- Invalid samples: `peter@kaurus.com @ paul@kaurus.com`, `email allan@readsnurseries.co.uk`

### Websites (primary_website)

- Total with website: 4498
- Has http(s):// prefix: 4498
- Missing protocol but looks like domain: 0
- Other: 0
- http:// count: 4395
- https:// count: 103

### Region values

| Region | Count |
|--------|-------|

### Duplicate canonical_name entries: 9

| Name | Count |
|------|-------|
| absolute broadcast | 2 |
| aggreko generators | 2 |
| autocue | 2 |
| bloomberg television | 2 |
| ceres productions | 2 |
| elev8 access platforms | 2 |
| excel charter | 2 |
| picture palace films | 2 |
| positive media | 2 |

### Entity type inference preview

- With CH number (→ company): 0 (0.0%)
- Without CH number (→ freelancer): 4657 (100.0%)
- Names containing Ltd/Limited/PLC/LLP/Inc: 1108 (23.8%)
- These have no CH number, so entity type = "company" by name heuristic

### Phone format breakdown

- +44 international: 372
- 0xxx national: 3834
- Short/suspect (< 7 digits): 0
- Other: 334
- Other samples: `+31 582889076`, `(+44) 01753 656 181`, `+353 (0) 1 276 5502`, `+31208202025`, `+46 13218120`, `+49 461 66 28 30 0`, `001 818 3333000`, `1-310-341-3876`, `+33 (0)557 262 262`, `+497112195080`, `0044 28 90 319008`, `0044 (0) 121 233 3441`, `00 44 (0)1604 881095`, `0044 (0) 2890 314 981 / Mob 0044 7710 761535`, `114 23 291-80`

### Non-UK countries

- Non-UK rows: 94 (2.0%)
| Country | Count |
|---------|-------|
| Ireland | 12 |
| USA | 11 |
| London | 5 |
| Germany | 4 |
| NI | 3 |
| India | 3 |
| Italy | 2 |
| . | 2 |
| Engalnd | 2 |
| Caerphilly | 2 |
| Switzerland | 2 |
| France | 2 |
| LS8 | 1 |
| Netherlands | 1 |
| Rotherham | 1 |
| South Gloucestershire | 1 |
| M1 69HQ | 1 |
| Isle of Anglesey | 1 |
| Co Wicklow | 1 |
| GERMANY | 1 |
| Heartfordshire | 1 |
| 56656 | 1 |
| China | 1 |
| Otley West Yorkshire | 1 |
| 99546 | 1 |
| BS240ds | 1 |
| Co Waterford | 1 |
| County Down | 1 |
| Bn15 0Bq | 1 |
| U.K. | 1 |
| Croatia | 1 |
| NY10018 | 1 |
| bt62 3re | 1 |
| Dublin 7 | 1 |
| Carmarthenshire | 1 |
| Ll689EG | 1 |
| Canada | 1 |
| Namibia | 1 |
| County Durham | 1 |
| Bucks | 1 |
| U. K | 1 |
| Spain | 1 |
| United States | 1 |
| 2a Brackenbury Road | 1 |
| Cyprus | 1 |
| North Humberside | 1 |
| 400076 | 1 |
| FRANCE | 1 |
| Wd233fa | 1 |
| Russia | 1 |
| Turkey | 1 |
| U.K | 1 |
| 32182 | 1 |
| Flintshire | 1 |
| cv2 4hh | 1 |
| ITALY | 1 |

### Name quality

- Leading/trailing whitespace: 0
- HTML entities: 0
- Encoding artefacts: 0
- Contains quotes: 14
- Contains parentheses: 229
- Quote samples: `'GCM Services'`, `Agents' Association (GB)`, `Antonio's TV and Film Catering`, `Dave Cockburn's Squeaky Pictures`, `Donal O'Farrell`

### Address quality

- Address contains postcode: 18
- Multi-line addresses: 3123

### Email domain distribution (top 20)

| Domain | Count |
|--------|-------|
| gmail.com | 138 |
| hotmail.com | 34 |
| aol.com | 33 |
| hotmail.co.uk | 19 |
| mac.com | 18 |
| btconnect.com | 16 |
| btinternet.com | 16 |
| yahoo.co.uk | 14 |
| compuserve.com | 11 |
| bbc.co.uk | 11 |
| yahoo.com | 10 |
| scruffydogltd.com | 10 |
| outlook.com | 9 |
| eloquenceautocue.com | 9 |
| ntlworld.com | 8 |
| virgin.net | 8 |
| nationwideplatforms.co.uk | 8 |
| me.com | 7 |
| btclick.com | 6 |
| blueyonder.co.uk | 6 |

## companies_all vs companies comparison

**companies_all:** 4721 rows, 21 columns
**companies:** 4657 rows, 20 columns

companies_all columns:
- `id` (INTEGER)
- `name` (TEXT)
- `url` (TEXT)
- `description` (TEXT)
- `address` (TEXT)
- `city` (TEXT)
- `postal_code` (TEXT)
- `country` (TEXT)
- `phone` (TEXT)
- `mobile` (TEXT)
- `email` (TEXT)
- `website` (TEXT)
- `contact_person` (TEXT)
- `social_media` (TEXT)
- `logo_url` (TEXT)
- `products_services` (TEXT)
- `gallery_urls` (TEXT)
- `showreel_url` (TEXT)
- `scraped` (INTEGER)
- `created_at` (TIMESTAMP)
- `is_uk` (INTEGER)

Columns only in companies_all: id, url, description, phone, mobile, email, website, contact_person, social_media, logo_url, products_services, gallery_urls, showreel_url, scraped, created_at, is_uk
Columns only in companies: company_id, canonical_name, companies_house_number, is_active, last_verified, primary_email, primary_phone, primary_website, region, enrichment_priority, last_enriched, needs_update, original_ids, data_quality_score, migration_date

Sample rows from companies_all (first 5):

- ID undefined: id=`1`, name=`Marzano Films Limited`, url=`https://www.4rfv.co.uk/c/32983/marzano-films-limit`, description=`Marzano Films is an Aerial Filming Company based i`, address=`Studios`, city=`Shepperton`, postal_code=`TW17 0QD`, country=`England`, phone=`0208 049 5640`, mobile=`07785 277 567`, email=`john@marzanofilms.com`, website=`http://www.marzanofilms.com`, contact_person=`John Marzano`, social_media=`["http://www.marzanofilms.com"]`, products_services=`["Aerial Filming", "Aerial Photography", "Aerial C`, gallery_urls=`["https://www.4rfv.co.uk/gallery/32983/c155a711-0f`, scraped=`1`, created_at=`2025-03-09 11:28:56`, is_uk=`1`
- ID undefined: id=`2`, name=`Flying Cameras Ltd`, url=`https://www.4rfv.co.uk/c/14796/flying-cameras-ltd`, description=`After a 7 year period of as a Clapper/Loader, Focu`, address=`The White House
Drakes View, Staddon Heights`, city=`Plymouth`, postal_code=`PL9 9SP`, country=`United Kingdom`, mobile=`07971 020088`, email=`simonwerry@icloud.com`, website=`http://www.flyingcameras.ltd`, social_media=`["http://www.flyingcameras.ltd", "https://twitter.`, products_services=`["Aerial Cameraman", "Aerial Director Of Photograp`, gallery_urls=`["https://www.4rfv.co.uk/gallery/14796/3b83cf29-9d`, scraped=`1`, created_at=`2025-03-09 11:28:56`, is_uk=`1`
- ID undefined: id=`3`, name=`Hovercam`, url=`https://www.4rfv.co.uk/c/44114/hovercam`, description=`Hovercam are industry leading helicopter and remot`, address=`Denham Aerodrome
Hangar Road
Uxbridge
Greater`, city=`London`, postal_code=`UB9 5DF`, country=`England`, phone=`+44 1752 482711`, email=`phil@hovercam.co.uk`, website=`http://www.hovercam.co.uk`, contact_person=`Phil`, social_media=`["http://www.hovercam.co.uk"]`, gallery_urls=`["https://www.4rfv.co.uk/gallery/44114/27265bb2-73`, scraped=`1`, created_at=`2025-03-09 11:28:56`, is_uk=`1`
- ID undefined: id=`4`, name=`Aerial - Helicopter Film Services Ltd UK`, url=`https://www.4rfv.co.uk/c/17358/aerial-helicopter-f`, description=`We are Helicopter Film ServicesTake your filming t`, address=`3 The Merlin Centre
Lancaster Road`, city=`High Wycombe`, postal_code=`HP12 3QL`, country=`England`, phone=`01895 833365`, email=`info@helicopterfilm.tv`, website=`http://www.helicopterfilmservices.com`, contact_person=`Derek Desmond`, social_media=`["http://www.helicopterfilmservices.com", "https:/`, products_services=`["Crew", "Aerial Equipment", "Tracking Vehicles", `, gallery_urls=`["https://www.4rfv.co.uk/gallery/17358/ff16c83f-76`, scraped=`1`, created_at=`2025-03-09 11:28:56`, is_uk=`1`
- ID undefined: id=`5`, name=`Aerial Camera Systems (ACS)`, url=`https://www.4rfv.co.uk/c/6115/aerial-camera-system`, description=`Aerial Camera Systems has a unique inventory of hi`, address=`Pickmere Grange
Pickmere Lane
Pickmere`, city=`Knutsford`, postal_code=`WA16 0JJ`, country=`United Kingdom`, phone=`+44 (0)1483426767`, email=`enquiries@acsmedia.com`, website=`https://www.aerialcamerasystems.com/`, contact_person=`Antonia Wood`, social_media=`["https://www.aerialcamerasystems.com/", "https://`, gallery_urls=`["https://www.4rfv.co.uk/gallery/6115/7d30894e-856`, scraped=`1`, created_at=`2025-03-09 11:28:56`, is_uk=`1`


companies_all rows with description: 3845
Description length: min=1, avg=885, max=3803
companies_all rows with products_services: 240
companies_all rows with contact_person: 3635
companies_all rows with social_media: 4721
companies_all rows with showreel_url: 0
companies_all rows with logo_url: 0

products_services samples:
- `["Aerial Filming", "Aerial Photography", "Aerial Co-ordination", "Aerial Filming Drones", "Aerial Filming Helicopters", "Aerial Filming Crew", "Helico`
- `["Aerial Cameraman", "Aerial Director Of Photography", "Aerial Film Director", "Aerial film Coordinator", "Aerial coordinator", "Shotover Aerial filmi`
- `["Crew", "Aerial Equipment", "Tracking Vehicles", "Drones", "helicopters", "stabilised camera systems", "aerial crews and equipment"]`
- `["Aerial Camera Operators", "Aerial Co-Ordination", "Aerial Filming", "Aircraft", "Aerial Camera Mounts", "Helicopters", "Gyro Camera Mounts", "Aerial`
- `["ARRI Cameras", "ARRI Alexa Mini", "RED Cameras", "Inspire 2 with X7", "Night Flying", "Indoor Flying", "BBC, Netflix and 1st Option Approved", "Insp`

Descriptions with encoding artefacts: 3
Descriptions with HTML entities: 0
Encoding samples: `Specialist ServicesSolar power generation, Bio fuel / LPG power generation.Silen`, `F. D. I. Adds AutoCAD LT to Art Department TrainingFilm Design International has`, `BorisTV is a HD outside broadcast company with over a decade of industry experie`

### original_ids → companies_all.id join check
First 100 companies: 100 joinable via original_ids[0] → companies_all.id, 0 not joinable

## All tables in database

- `additional_issues`: 76 rows
- `categories`: 43 rows
- `companies`: 4657 rows
- `companies_all`: 4721 rows
- `companies_all_backup`: 4721 rows
- `companies_merged`: 4657 rows
- `company_subcategory`: 12208 rows
- `company_subcategory_backup`: 12208 rows
- `dead_urls`: 18 rows
- `dedup_groups`: 4721 rows
- `scrape_log`: 5592 rows
- `sqlite_sequence`: 1 rows
- `subcategories`: 790 rows

## Deep Audit Findings (2026-02-24)

Second-pass audit targeting problems hidden by aggregate statistics.

### Duplicate Companies (same business, multiple rows)

153 groups share the same website with different names. Major offenders: BBC (17 entries), Eloquence Autocue (9), Nationwide Platforms (8), Scruffy Dog (7), Virgin Media/Cable Tel (6), Extreme Facilities (5), Discovery Channel (5). These are single businesses listed multiple times for different service categories — the 4rfv scraper created one "company" per service page. Pipeline Phase 3 dedup will catch exact-name matches but not same-website-different-name duplicates.

106 email-based duplicate groups. 165 phone-based duplicate groups. Significant overlap with the website-based groups.

### Records Skipped by Extraction (57 total)

- **32 BBC regional divisions** — BBC Glasgow, BBC Cardiff, BBC Childrens, etc. Website is bbc.co.uk with no production service keywords in name.
- **17 4rfv.co.uk placeholder websites** — unfinished scrape entries with the source site as their own website.
- **5 Discovery Channel divisions** — Discovery Civilisations, Discovery Home & Leisure, etc.
- **2 Channel 4, 1 ITV** — broadcaster divisions, not production companies.

### Geographic Data Errors

183 companies claim city="London" but have non-London postcodes. The top cluster: SL0 0NH (Pinewood Studios, Iver — 49 companies) and TW17 0QD (Shepperton Studios — 27 companies). These are studio tenants tagged as "London" by 4rfv. The postcode is correct; the city is misleading. Extraction uses postcode for region derivation, so this doesn't affect region mapping.

### Name Quality

- 7 names with leading `@` symbol (4rfv display artefact) — cleaned by `cleanName()`.
- 1 name with surrounding quotes — cleaned.
- 33 names > 60 chars (descriptions or keywords stuffed into name field).
- 3 names with trailing location info (e.g., "Nationwide Platforms - Birmingham").

### Phone Field Contamination

- 3 phone fields contain postcodes (not phone numbers).
- 16 contain text labels ("Mobile", "Diary:", "London office").
- 30 contain multiple numbers (separated by `/`, `Mobile`, `,`).
- `cleanPhoneField()` extracts the first valid number, discards postcodes and dots.

### Description Quality

- 866 companies have no description (from `companies_all`).
- 19 descriptions are under 20 chars (9 are just `.`). Discarded by `cleanBio()`.
- 189 descriptions embed contact info (phone numbers, email addresses in text). Kept as-is — these are part of the business description.
- 24 descriptions mention the business is closed/ceased. Skipped by `shouldSkip()` where phrasing matches (`permanently closed`, `ceased trading`, etc.).

### Subcategory Over-Assignment

84 companies have 15+ subcategories. The extreme case: "Location Two Location" with 86 subcategories (including unrelated ones like "CD Mastering", "Batteries", "Chauffeur Driven Limos"). These are scraper artefacts — the company page had links to many categories. The extraction maps all subcategories to CALLSHEET specialisations, so over-categorised companies get a long services list. Pipeline Phase 1 does not cap services count.

### Out-of-Domain Entries

13 companies have only out-of-domain subcategories (locksmiths, hotels, pest control, apartment rentals). Another 13 have only "Uncategorised" as their subcategory. These pass through extraction with services derived from keyword/category fallback. The pipeline does not filter by domain relevance.
