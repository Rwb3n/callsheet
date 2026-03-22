// 4rfv SQLite extraction → ImportRecord[] — CS-WORK-024 AC-02/AC-03/AC-05/AC-06/AC-07
// Reads companies + companies_all (joined via original_ids[0] → companies_all.id).
// Applies entity type inference, taxonomy mapping, field cleaning.
// Deterministic: stable sort by company_id, no random IDs.

import Database from "better-sqlite3"
import path from "path"
import type { ImportRecord } from "./types"
import { mapCompanyServices } from "./taxonomy-map"

// ── Types ──

type CompanyRow = {
  company_id: number
  name: string
  canonical_name: string
  companies_house_number: string | null
  primary_email: string | null
  primary_phone: string | null
  primary_website: string | null
  address: string | null
  city: string | null
  postal_code: string | null
  country: string | null
  original_ids: string
}

type CompanyAllRow = {
  id: number
  description: string | null
  contact_person: string | null
}

type SubcatRow = { subcat_name: string; cat_name: string }

export type SkippedRecord = {
  companyId: number
  name: string
  reason: string
}

export type ExtractionResult = {
  records: ImportRecord[]
  skipped: SkippedRecord[]
  stats: {
    total: number
    extracted: number
    skipped: number
    entityTypes: { company: number; freelancer: number }
    withEmail: number
    withPhone: number
    withWebsite: number
    withPostcode: number
    withBio: number
    avgServices: number
  }
  unmapped: string[]
}

// ── Cleaning functions ──

const COMPANY_PATTERN = /\b(ltd|limited|plc|llp|inc|corp|group|holdings)\b/i

function inferEntityType(name: string, chNumber: string | null): "company" | "freelancer" {
  if (chNumber && chNumber.trim()) return "company"
  if (COMPANY_PATTERN.test(name)) return "company"
  return "freelancer"
}

// ── Skip rules (exported for testing) ──

// Broadcaster divisions are not production service companies
const BROADCASTER_DOMAINS = [
  "bbc.co.uk", "itv.com", "channel4.com", "channel5.com",
  "sky.com", "virginmedia.com", "discoverychannel.co.uk",
]

export function shouldSkip(
  name: string,
  website: string | null,
  description: string | null,
): { skip: boolean; reason: string } {
  const w = (website ?? "").toLowerCase().replace(/^https?:\/\/(www\.)?/, "").replace(/\/.*$/, "")
  const n = name.toLowerCase()

  // Skip broadcaster divisions (BBC Glasgow, Discovery Home & Leisure, etc.)
  for (const domain of BROADCASTER_DOMAINS) {
    if (w === domain || w.startsWith(domain + "/")) {
      // Only skip if the name doesn't contain production-service keywords
      if (!/\b(studio|production|hire|crew|equipment|facility|post)\b/i.test(n)) {
        return { skip: true, reason: `broadcaster division (${domain})` }
      }
    }
  }

  // Skip self-referential 4rfv.co.uk websites with no other useful data
  if (w === "4rfv.co.uk" || w.startsWith("4rfv.co.uk/")) {
    return { skip: true, reason: "website is 4rfv.co.uk (placeholder)" }
  }

  // Skip descriptions that explicitly say closed/ceased
  if (description) {
    const d = description.toLowerCase()
    if (/\b(permanently closed|no longer trad|ceased trad|company dissolved|gone out of business)\b/.test(d)) {
      return { skip: true, reason: "description indicates defunct" }
    }
  }

  return { skip: false, reason: "" }
}

// ── Name cleaning ──

export function cleanName(raw: string): string {
  let n = raw.trim()

  // Remove leading/trailing quotes
  n = n.replace(/^['"""]+|['"""]+$/g, "")

  // Remove leading @ (4rfv display artefact)
  n = n.replace(/^@\s*/, "")

  return n.trim()
}

// ── Phone cleaning ──

export function cleanPhoneField(raw: string | null): string | null {
  if (!raw) return null
  let p = raw.trim()
  if (!p) return null

  // If the "phone" is actually a postcode, discard it
  if (/^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i.test(p)) return null

  // If it's just a dot or too short to be a phone, discard
  if (p === "." || p.length < 5) return null

  // Extract first phone number from multi-number fields
  // "020 8876 4451 Mobile 07785 226432" → "020 8876 4451"
  // "01531 820059 / 07866455661" → "01531 820059"
  const firstPhone = p.match(/^(\+?\d[\d\s\-()]{6,})/)
  if (firstPhone) return firstPhone[1].trim()

  return p
}

const UK_POSTCODE_FIX = /^([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})$/i

function cleanPostcode(raw: string | null): string | null {
  if (!raw) return null
  let s = raw.trim().toUpperCase()
  if (!s) return null

  // Fix missing space: "SW111TL" → "SW11 1TL"
  const noSpace = s.replace(/\s+/g, "")
  const match = noSpace.match(/^([A-Z]{1,2}\d[A-Z\d]?)(\d[A-Z]{2})$/)
  if (match) {
    s = `${match[1]} ${match[2]}`
  }

  // Fix letter O → digit 0 in postcode (common OCR/typo: "OXQ" → "0XQ" is wrong, but "O" at position where digit expected)
  // Only fix the digit portion: "WN6 OXQ" → letter O where 0 expected in the inward code first char
  s = s.replace(/^([A-Z]{1,2}\d[A-Z\d]?\s*)O([A-Z]{2})$/, "$10$2")

  // Fix ampersand: "EH46 &HJ" → "EH46 6HJ" (unlikely — skip, just trim)
  s = s.replace(/&/g, "")

  // Validate final form
  if (UK_POSTCODE_FIX.test(s)) return s

  // Accept partial outcodes (e.g., "SW1", "W1") — useful for region inference
  if (/^[A-Z]{1,2}\d[A-Z\d]?$/i.test(s)) return s

  return s // Return as-is even if not perfect — downstream can filter
}

function cleanEmail(raw: string | null): string | null {
  if (!raw) return null
  let s = raw.trim()
  if (!s) return null

  // Fix "email prefix@domain" pattern
  s = s.replace(/^email\s+/i, "")

  // Fix dual-email: take first one
  if (s.includes("@") && s.includes(" @ ")) {
    s = s.split(" @ ")[0].trim()
  }
  if (s.includes(" ")) {
    // Multiple emails separated by space — take first
    const parts = s.split(/\s+/)
    const emailPart = parts.find((p) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p))
    if (emailPart) s = emailPart
  }

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s.toLowerCase() : null
}

function cleanWebsite(raw: string | null): string | null {
  if (!raw) return null
  const s = raw.trim()
  if (!s) return null

  // Skip if it's actually an email
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return null

  // Ensure protocol
  if (/^https?:\/\//i.test(s)) return s
  if (/^[a-z0-9].*\.[a-z]{2,}/i.test(s)) return `https://${s}`

  return s
}

// cleanPhone delegates to cleanPhoneField (defined above skip rules)
function cleanPhone(raw: string | null): string | null {
  return cleanPhoneField(raw)
}

function cleanBio(raw: string | null): string | null {
  if (!raw) return null
  let s = raw.trim()
  if (!s) return null

  // Discard placeholder bios (single dot, single character)
  if (/^\.+$/.test(s) || s.length < 10) return null

  // Fix common encoding artefacts
  s = s.replace(/â€™/g, "'")
  s = s.replace(/â€"/g, "—")
  s = s.replace(/â€œ/g, '"')
  s = s.replace(/â€\x9d/g, '"')
  s = s.replace(/Â£/g, "£")
  s = s.replace(/Ã©/g, "é")
  s = s.replace(/Ã¨/g, "è")
  s = s.replace(/Ã¼/g, "ü")
  s = s.replace(/Â /g, " ")
  s = s.replace(/ï»¿/g, "")

  // Collapse whitespace
  s = s.replace(/\s+/g, " ").trim()

  return s || null
}

function normaliseCountry(country: string | null): boolean {
  if (!country) return true
  const c = country.trim().toLowerCase()
  // Accept UK variants
  if (
    c === "united kingdom" || c === "uk" || c === "u.k." || c === "u.k" ||
    c === "u. k" || c === "england" || c === "engalnd" || c === "scotland" ||
    c === "wales" || c === "northern ireland"
  ) return true
  // Accept UK county names / city names used as country (data error — still UK)
  const ukCountyOrCity = [
    "london", "surrey", "kent", "bucks", "ni", "county durham",
    "county down", "north humberside", "heartfordshire", "flintshire",
    "carmarthenshire", "isle of anglesey", "caerphilly",
    "south gloucestershire", "rotherham", "otley west yorkshire",
  ]
  if (ukCountyOrCity.includes(c)) return true
  // Accept postcodes used as country (data error)
  if (/^[A-Z]{1,2}\d/i.test(c)) return true
  // Accept numeric codes (foreign zip codes used as country — data error, but treat as UK-ish)
  if (/^\d{4,6}$/.test(c)) return true
  // Accept addresses used as country (e.g., "2a Brackenbury Road")
  if (/\d+[a-z]?\s+/i.test(c)) return true
  // Genuinely non-UK
  return false
}

function cityToRegion(city: string | null): string | null {
  if (!city) return null
  const c = city.trim().toLowerCase()

  const regionMap: Record<string, string> = {
    "london": "London",
    "manchester": "North West",
    "liverpool": "North West",
    "preston": "North West",
    "bolton": "North West",
    "chester": "North West",
    "warrington": "North West",
    "blackburn": "North West",
    "burnley": "North West",
    "wigan": "North West",
    "birmingham": "West Midlands",
    "coventry": "West Midlands",
    "wolverhampton": "West Midlands",
    "solihull": "West Midlands",
    "walsall": "West Midlands",
    "bristol": "South West",
    "exeter": "South West",
    "bath": "South West",
    "plymouth": "South West",
    "gloucester": "South West",
    "swindon": "South West",
    "cheltenham": "South West",
    "taunton": "South West",
    "bournemouth": "South West",
    "leeds": "Yorkshire and The Humber",
    "sheffield": "Yorkshire and The Humber",
    "bradford": "Yorkshire and The Humber",
    "york": "Yorkshire and The Humber",
    "hull": "Yorkshire and The Humber",
    "huddersfield": "Yorkshire and The Humber",
    "doncaster": "Yorkshire and The Humber",
    "wakefield": "Yorkshire and The Humber",
    "halifax": "Yorkshire and The Humber",
    "newcastle": "North East",
    "newcastle upon tyne": "North East",
    "sunderland": "North East",
    "durham": "North East",
    "middlesbrough": "North East",
    "gateshead": "North East",
    "darlington": "North East",
    "nottingham": "East Midlands",
    "leicester": "East Midlands",
    "derby": "East Midlands",
    "lincoln": "East Midlands",
    "northampton": "East Midlands",
    "norwich": "East of England",
    "cambridge": "East of England",
    "ipswich": "East of England",
    "colchester": "East of England",
    "peterborough": "East of England",
    "luton": "East of England",
    "chelmsford": "East of England",
    "southend-on-sea": "East of England",
    "reading": "South East",
    "oxford": "South East",
    "brighton": "South East",
    "southampton": "South East",
    "portsmouth": "South East",
    "guildford": "South East",
    "canterbury": "South East",
    "maidstone": "South East",
    "winchester": "South East",
    "crawley": "South East",
    "slough": "South East",
    "high wycombe": "South East",
    "milton keynes": "South East",
    "watford": "South East",
    "st albans": "South East",
    "aylesbury": "South East",
    "glasgow": "Scotland",
    "edinburgh": "Scotland",
    "aberdeen": "Scotland",
    "dundee": "Scotland",
    "inverness": "Scotland",
    "perth": "Scotland",
    "stirling": "Scotland",
    "cardiff": "Wales",
    "swansea": "Wales",
    "newport": "Wales",
    "wrexham": "Wales",
    "bangor": "Wales",
    "belfast": "Northern Ireland",
    "derry": "Northern Ireland",
    "lisburn": "Northern Ireland",
    "newry": "Northern Ireland",
  }

  return regionMap[c] ?? null
}

// ── Main extraction ──

export function extract4rfv(dbPath: string): ExtractionResult {
  const db = new Database(dbPath, { readonly: true })

  const companies = db.prepare(`
    SELECT company_id, name, canonical_name, companies_house_number,
           primary_email, primary_phone, primary_website,
           address, city, postal_code, country, original_ids
    FROM companies
    ORDER BY company_id
  `).all() as CompanyRow[]

  const getCompanyAll = db.prepare(`
    SELECT id, description, contact_person
    FROM companies_all
    WHERE id = ?
  `)

  const getSubcats = db.prepare(`
    SELECT s.name as subcat_name, c.name as cat_name
    FROM company_subcategory cs
    JOIN subcategories s ON cs.subcategory_id = s.id
    JOIN categories c ON s.category_id = c.id
    WHERE cs.company_id = ?
  `)

  const records: ImportRecord[] = []
  const skippedRecords: SkippedRecord[] = []
  const unmappedSubcats = new Set<string>()
  const entityCounts = { company: 0, freelancer: 0 }
  let withEmail = 0, withPhone = 0, withWebsite = 0, withPostcode = 0, withBio = 0
  let totalServices = 0

  for (const company of companies) {
    // Parse original_ids to join to companies_all
    let allOriginalIds: number[] = []
    try {
      allOriginalIds = JSON.parse(company.original_ids) as number[]
    } catch {
      // Skip if original_ids can't be parsed
    }
    const originalId = allOriginalIds[0] ?? null

    // Get enrichment data from companies_all
    let description: string | null = null
    if (originalId !== null) {
      const allRow = getCompanyAll.get(originalId) as CompanyAllRow | undefined
      if (allRow) {
        description = allRow.description
      }
    }

    // Skip check — broadcaster divisions, 4rfv placeholders, defunct
    const skipResult = shouldSkip(company.name, company.primary_website, description)
    if (skipResult.skip) {
      skippedRecords.push({
        companyId: company.company_id,
        name: company.name,
        reason: skipResult.reason,
      })
      continue
    }

    // Get subcategories via original_ids (company_subcategory.company_id → companies_all.id)
    const subcatSet = new Map<string, SubcatRow>()
    for (const oid of allOriginalIds) {
      const rows = getSubcats.all(oid) as SubcatRow[]
      for (const r of rows) {
        subcatSet.set(`${r.cat_name}::${r.subcat_name}`, r)
      }
    }
    const subcats = [...subcatSet.values()]

    // Map services
    const services = mapCompanyServices(
      subcats.map((sc) => ({ name: sc.subcat_name, category: sc.cat_name })),
    )

    // Track unmapped
    for (const sc of subcats) {
      const mapped = mapCompanyServices([{ name: sc.subcat_name, category: sc.cat_name }])
      if (mapped.length === 0) unmappedSubcats.add(sc.subcat_name)
    }

    // Clean name
    const name = cleanName(company.name)

    // Entity type
    const entityType = inferEntityType(name, company.companies_house_number)
    entityCounts[entityType]++

    // Clean fields
    const email = cleanEmail(company.primary_email)
    const phone = cleanPhone(company.primary_phone)
    const website = cleanWebsite(company.primary_website)
    const postcode = cleanPostcode(company.postal_code)
    const bio = cleanBio(description)
    const region = cityToRegion(company.city)

    if (email) withEmail++
    if (phone) withPhone++
    if (website) withWebsite++
    if (postcode) withPostcode++
    if (bio) withBio++
    totalServices += services.length

    const record: ImportRecord = {
      sourceId: `4rfv-${company.company_id}`,
      name,
      entityType,
      contactEmail: email ?? undefined,
      contactPhone: phone ?? undefined,
      websiteUrl: website ?? undefined,
      basePostcode: postcode ?? undefined,
      baseRegion: region ?? undefined,
      bio: bio ?? undefined,
      services,
    }

    if (company.companies_house_number?.trim()) {
      record.companiesHouseNumber = company.companies_house_number.trim()
    }

    records.push(record)
  }

  db.close()

  return {
    records,
    skipped: skippedRecords,
    stats: {
      total: companies.length,
      extracted: records.length,
      skipped: skippedRecords.length,
      entityTypes: entityCounts,
      withEmail,
      withPhone,
      withWebsite,
      withPostcode,
      withBio,
      avgServices: records.length > 0 ? Math.round((totalServices / records.length) * 10) / 10 : 0,
    },
    unmapped: [...unmappedSubcats].sort(),
  }
}

// ── CLI entry point ──

if (require.main === module) {
  const dbPath = path.resolve(process.cwd(), "4-work-management/4rfv_directory.db")
  const result = extract4rfv(dbPath)

  console.log("Extraction complete:")
  console.log(`  Total: ${result.stats.total}`)
  console.log(`  Extracted: ${result.stats.extracted}`)
  console.log(`  Skipped: ${result.stats.skipped}`)
  console.log(`  Entity types: ${result.stats.entityTypes.company} company, ${result.stats.entityTypes.freelancer} freelancer`)
  console.log(`  With email: ${result.stats.withEmail}`)
  console.log(`  With phone: ${result.stats.withPhone}`)
  console.log(`  With website: ${result.stats.withWebsite}`)
  console.log(`  With postcode: ${result.stats.withPostcode}`)
  console.log(`  With bio: ${result.stats.withBio}`)
  console.log(`  Avg services: ${result.stats.avgServices}`)

  if (result.skipped.length > 0) {
    console.log(`\n  Skipped records (${result.skipped.length}):`)
    const byReason = new Map<string, number>()
    for (const s of result.skipped) {
      byReason.set(s.reason, (byReason.get(s.reason) ?? 0) + 1)
    }
    for (const [reason, count] of [...byReason.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`    ${reason}: ${count}`)
    }
  }

  if (result.unmapped.length > 0) {
    console.log(`\n  Unmapped subcategories (${result.unmapped.length}):`)
    for (const s of result.unmapped) console.log(`    - ${s}`)
  }

  // Sample output
  console.log("\nSample records (first 3):")
  for (const r of result.records.slice(0, 3)) {
    console.log(JSON.stringify(r, null, 2))
  }
}
