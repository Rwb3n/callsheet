// Data profiling script for 4rfv SQLite database — CS-WORK-024 AC-01
// Reads companies table, reports per-column: nulls, blanks, value distributions,
// format patterns (emails, postcodes, URLs, phones), encoding anomalies, misplaced data.
// Output: stdout (pipe to data-profile.md)

import Database from "better-sqlite3"
import path from "path"

const DB_PATH = path.resolve(process.cwd(), "4-work-management/4rfv_directory.db")
const db = new Database(DB_PATH, { readonly: true })

type Row = Record<string, unknown>

// ── Helpers ──

function pct(n: number, total: number): string {
  return `${((n / total) * 100).toFixed(1)}%`
}

function topN(counts: Map<string, number>, n: number): [string, number][] {
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, n)
}

const UK_POSTCODE = /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i
const UK_POSTCODE_LOOSE = /[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}/i
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const EMAIL_LOOSE = /[^\s@]+@[^\s@]+\.[^\s@]+/
const URL_RE = /^https?:\/\//i
const URL_LOOSE = /https?:\/\/[^\s]+/i
const PHONE_RE = /(?:\+44|0)\s*\d[\d\s\-()]{8,}/
const CH_NUMBER = /^(?:SC|NI|OC|SO|NC|IP|RC|NP|NO|CE|GE|SA|SZ|SF|SR|FC|FE|LP|NA|NL|NF|SL|SP|IC|SI|OE|SE|R0)?\d{6,8}$/i
const HTML_ENTITY = /&(?:#\d+|#x[0-9a-f]+|[a-z]+);/i
const ENCODING_ARTEFACT = /[\x80-\x9f]|â€™|â€"|â€œ|â€\x9d|Â£|Ã©|Ã¨|Ã¼|Â |ï»¿/
const HIGH_UNICODE = /[\u0080-\u00ff]/

// ── Column analysis ──

interface ColumnProfile {
  name: string
  total: number
  nullCount: number
  blankCount: number
  distinctCount: number
  minLen: number
  maxLen: number
  avgLen: number
  sampleValues: string[]
  patterns: Record<string, number>
  anomalies: string[]
}

function profileColumn(rows: Row[], colName: string): ColumnProfile {
  const total = rows.length
  let nullCount = 0
  let blankCount = 0
  const valueCounts = new Map<string, number>()
  const lengths: number[] = []
  const patternHits: Record<string, number> = {}
  const anomalies: string[] = []

  const patternChecks: [string, RegExp][] = [
    ["email_strict", EMAIL_RE],
    ["email_loose", EMAIL_LOOSE],
    ["url_strict", URL_RE],
    ["url_loose", URL_LOOSE],
    ["uk_postcode_strict", UK_POSTCODE],
    ["uk_postcode_loose", UK_POSTCODE_LOOSE],
    ["phone", PHONE_RE],
    ["ch_number", CH_NUMBER],
    ["html_entity", HTML_ENTITY],
    ["encoding_artefact", ENCODING_ARTEFACT],
    ["high_unicode", HIGH_UNICODE],
  ]

  for (const pc of patternChecks) patternHits[pc[0]] = 0

  for (const row of rows) {
    const val = row[colName]
    if (val === null || val === undefined) {
      nullCount++
      continue
    }
    const s = String(val).trim()
    if (s === "") {
      blankCount++
      continue
    }
    lengths.push(s.length)
    valueCounts.set(s, (valueCounts.get(s) ?? 0) + 1)

    for (const [name, re] of patternChecks) {
      if (re.test(s)) patternHits[name]++
    }
  }

  const nonEmpty = total - nullCount - blankCount
  const sorted = lengths.sort((a, b) => a - b)

  // Collect anomaly samples (encoding artefacts, HTML entities, misplaced postcodes in non-postcode cols)
  const anomalySet = new Set<string>()
  for (const row of rows) {
    if (anomalySet.size >= 5) break
    const val = row[colName]
    if (val === null || val === undefined) continue
    const s = String(val).trim()
    if (ENCODING_ARTEFACT.test(s) || HTML_ENTITY.test(s)) {
      anomalySet.add(s.slice(0, 120))
    }
  }

  // Top 10 sample values by frequency
  const top = topN(valueCounts, 10)

  return {
    name: colName,
    total,
    nullCount,
    blankCount,
    distinctCount: valueCounts.size,
    minLen: sorted[0] ?? 0,
    maxLen: sorted[sorted.length - 1] ?? 0,
    avgLen: nonEmpty > 0 ? Math.round(lengths.reduce((a, b) => a + b, 0) / nonEmpty) : 0,
    sampleValues: top.map(([v, c]) => `${v} (${c})`),
    patterns: Object.fromEntries(Object.entries(patternHits).filter(([, v]) => v > 0)),
    anomalies: [...anomalySet],
  }
}

// ── Cross-column misplacement detection ──

function detectMisplacement(rows: Row[]): string[] {
  const findings: string[] = []
  const postcodeInWrongCol: Record<string, number> = {}
  const emailInWrongCol: Record<string, number> = {}
  const urlInWrongCol: Record<string, number> = {}
  const phoneInWrongCol: Record<string, number> = {}

  const postcodeCol = "postal_code"
  const emailCol = "primary_email"
  const urlCol = "primary_website"
  const phoneCol = "primary_phone"

  for (const row of rows) {
    for (const [col, val] of Object.entries(row)) {
      if (val === null || val === undefined) continue
      const s = String(val).trim()
      if (!s) continue

      if (col !== postcodeCol && UK_POSTCODE_LOOSE.test(s) && !URL_LOOSE.test(s)) {
        postcodeInWrongCol[col] = (postcodeInWrongCol[col] ?? 0) + 1
      }
      if (col !== emailCol && EMAIL_LOOSE.test(s) && !URL_LOOSE.test(s)) {
        emailInWrongCol[col] = (emailInWrongCol[col] ?? 0) + 1
      }
      if (col !== urlCol && URL_LOOSE.test(s)) {
        urlInWrongCol[col] = (urlInWrongCol[col] ?? 0) + 1
      }
      if (col !== phoneCol && PHONE_RE.test(s)) {
        phoneInWrongCol[col] = (phoneInWrongCol[col] ?? 0) + 1
      }
    }
  }

  for (const [col, count] of Object.entries(postcodeInWrongCol)) {
    if (count >= 3) findings.push(`Postcode pattern found in \`${col}\`: ${count} rows`)
  }
  for (const [col, count] of Object.entries(emailInWrongCol)) {
    if (count >= 3) findings.push(`Email pattern found in \`${col}\`: ${count} rows`)
  }
  for (const [col, count] of Object.entries(urlInWrongCol)) {
    if (count >= 3) findings.push(`URL pattern found in \`${col}\`: ${count} rows`)
  }
  for (const [col, count] of Object.entries(phoneInWrongCol)) {
    if (count >= 3) findings.push(`Phone pattern found in \`${col}\`: ${count} rows`)
  }

  return findings
}

// ── Subcategory analysis ──

function profileSubcategories(db: Database.Database) {
  const subcats = db.prepare(`
    SELECT s.id, s.name, s.category_id, c.name as category_name,
           COUNT(cs.company_id) as company_count
    FROM subcategories s
    JOIN categories c ON s.category_id = c.id
    LEFT JOIN company_subcategory cs ON cs.subcategory_id = s.id
    GROUP BY s.id
    ORDER BY company_count DESC
  `).all() as Row[]

  const categories = db.prepare(`
    SELECT c.id, c.name, COUNT(s.id) as subcat_count
    FROM categories c
    LEFT JOIN subcategories s ON s.category_id = c.id
    GROUP BY c.id
    ORDER BY c.name
  `).all() as Row[]

  const companiesPerSubcat = db.prepare(`
    SELECT company_id, COUNT(*) as subcat_count
    FROM company_subcategory
    GROUP BY company_id
    ORDER BY subcat_count DESC
  `).all() as Row[]

  return { subcats, categories, companiesPerSubcat }
}

// ── Main ──

function main() {
  // Schema
  const tableInfo = db.prepare("PRAGMA table_info(companies)").all() as Row[]
  const colNames = tableInfo.map((c) => String(c.name))

  const rowCount = (db.prepare("SELECT COUNT(*) as n FROM companies").get() as Row).n as number
  const rows = db.prepare("SELECT * FROM companies").all() as Row[]

  console.log("# 4rfv Data Profile — CS-WORK-024 AC-01\n")
  console.log(`**Source:** \`4-work-management/4rfv_directory.db\``)
  console.log(`**Table:** \`companies\``)
  console.log(`**Row count:** ${rowCount}`)
  console.log(`**Column count:** ${colNames.length}`)
  console.log(`**Profiled:** ${new Date().toISOString().slice(0, 10)}\n`)

  // Schema overview
  console.log("## Schema\n")
  console.log("| # | Column | Type | Nullable |")
  console.log("|---|--------|------|----------|")
  for (const col of tableInfo) {
    console.log(`| ${col.cid} | \`${col.name}\` | ${col.type} | ${col.notnull === 0 ? "yes" : "no"} |`)
  }
  console.log("")

  // Per-column profiles
  console.log("## Column Profiles\n")
  for (const colName of colNames) {
    const p = profileColumn(rows, colName)
    console.log(`### \`${p.name}\`\n`)
    console.log(`| Metric | Value |`)
    console.log(`|--------|-------|`)
    console.log(`| Null | ${p.nullCount} (${pct(p.nullCount, p.total)}) |`)
    console.log(`| Blank (empty string) | ${p.blankCount} (${pct(p.blankCount, p.total)}) |`)
    console.log(`| Non-empty | ${p.total - p.nullCount - p.blankCount} (${pct(p.total - p.nullCount - p.blankCount, p.total)}) |`)
    console.log(`| Distinct values | ${p.distinctCount} |`)
    console.log(`| Length: min/avg/max | ${p.minLen} / ${p.avgLen} / ${p.maxLen} |`)

    if (Object.keys(p.patterns).length > 0) {
      console.log(`\n**Pattern matches:**\n`)
      for (const [pat, count] of Object.entries(p.patterns)) {
        console.log(`- ${pat}: ${count} (${pct(count, p.total - p.nullCount - p.blankCount)})`)
      }
    }

    if (p.sampleValues.length > 0) {
      console.log(`\n**Top values (by frequency):**\n`)
      for (const v of p.sampleValues.slice(0, 8)) {
        console.log(`- \`${v.slice(0, 100)}\``)
      }
    }

    if (p.anomalies.length > 0) {
      console.log(`\n**Encoding anomaly samples:**\n`)
      for (const a of p.anomalies) {
        console.log(`- \`${a}\``)
      }
    }
    console.log("")
  }

  // Cross-column misplacement
  console.log("## Cross-Column Misplacement\n")
  const misplacements = detectMisplacement(rows)
  if (misplacements.length === 0) {
    console.log("No significant cross-column misplacement detected.\n")
  } else {
    for (const m of misplacements) {
      console.log(`- ${m}`)
    }
    console.log("")
  }

  // Subcategory analysis
  console.log("## Subcategory Analysis\n")
  const { subcats, categories, companiesPerSubcat } = profileSubcategories(db)

  console.log(`**Categories:** ${categories.length}`)
  console.log(`**Subcategories:** ${subcats.length}`)
  console.log(`**company_subcategory rows:** ${companiesPerSubcat.reduce((a, r) => a + 1, 0)} companies with assignments\n`)

  // Subcats per company distribution
  const subcatDist = new Map<number, number>()
  for (const r of companiesPerSubcat) {
    const n = r.subcat_count as number
    subcatDist.set(n, (subcatDist.get(n) ?? 0) + 1)
  }
  console.log("### Subcategories per company distribution\n")
  console.log("| Subcats | Companies |")
  console.log("|---------|-----------|")
  for (const [n, c] of [...subcatDist.entries()].sort((a, b) => a[0] - b[0])) {
    console.log(`| ${n} | ${c} |`)
  }
  console.log("")

  // Top 30 subcategories by company count
  console.log("### Top 30 subcategories (by company count)\n")
  console.log("| Subcategory | Category | Companies |")
  console.log("|-------------|----------|-----------|")
  for (const s of subcats.slice(0, 30)) {
    console.log(`| ${s.name} | ${s.category_name} | ${s.company_count} |`)
  }
  console.log("")

  // Categories summary
  console.log("### Categories summary\n")
  console.log("| Category | Subcategory count |")
  console.log("|----------|-------------------|")
  for (const c of categories) {
    console.log(`| ${c.name} | ${c.subcat_count} |`)
  }
  console.log("")

  // Bottom 30 subcategories (empty or near-empty)
  const bottom = subcats.filter((s) => (s.company_count as number) <= 2)
  if (bottom.length > 0) {
    console.log(`### Low-use subcategories (≤2 companies): ${bottom.length}\n`)
    console.log("| Subcategory | Category | Companies |")
    console.log("|-------------|----------|-----------|")
    for (const s of bottom.slice(0, 40)) {
      console.log(`| ${s.name} | ${s.category_name} | ${s.company_count} |`)
    }
    console.log("")
  }

  // ── Specific quality checks ──
  console.log("## Specific Quality Checks\n")

  // 1. Companies House numbers — valid format?
  const chRows = rows.filter((r) => r.companies_house_number !== null && String(r.companies_house_number).trim() !== "")
  const validCh = chRows.filter((r) => CH_NUMBER.test(String(r.companies_house_number).trim()))
  console.log(`### Companies House numbers\n`)
  console.log(`- Total with CH number: ${chRows.length}`)
  console.log(`- Valid format: ${validCh.length}`)
  console.log(`- Invalid format: ${chRows.length - validCh.length}`)
  if (chRows.length - validCh.length > 0) {
    const invalid = chRows.filter((r) => !CH_NUMBER.test(String(r.companies_house_number).trim()))
    console.log(`- Samples: ${invalid.slice(0, 10).map((r) => `\`${r.companies_house_number}\``).join(", ")}`)
  }
  console.log("")

  // 2. Postcodes — valid format? (column is postal_code)
  const pcRows = rows.filter((r) => r.postal_code !== null && String(r.postal_code).trim() !== "")
  const validPc = pcRows.filter((r) => UK_POSTCODE.test(String(r.postal_code).trim()))
  console.log(`### Postcodes (postal_code)\n`)
  console.log(`- Total with postcode: ${pcRows.length}`)
  console.log(`- Valid UK format: ${validPc.length}`)
  console.log(`- Invalid format: ${pcRows.length - validPc.length}`)
  if (pcRows.length - validPc.length > 0) {
    const invalid = pcRows.filter((r) => !UK_POSTCODE.test(String(r.postal_code).trim()))
    console.log(`- Invalid samples: ${invalid.slice(0, 15).map((r) => `\`${r.postal_code}\``).join(", ")}`)
  }
  console.log("")

  // 3. Emails — valid format? (column is primary_email)
  const emRows = rows.filter((r) => r.primary_email !== null && String(r.primary_email).trim() !== "")
  const validEm = emRows.filter((r) => EMAIL_RE.test(String(r.primary_email).trim()))
  console.log(`### Emails (primary_email)\n`)
  console.log(`- Total with email: ${emRows.length}`)
  console.log(`- Valid format: ${validEm.length}`)
  console.log(`- Invalid format: ${emRows.length - validEm.length}`)
  if (emRows.length - validEm.length > 0) {
    const invalid = emRows.filter((r) => !EMAIL_RE.test(String(r.primary_email).trim()))
    console.log(`- Invalid samples: ${invalid.slice(0, 15).map((r) => `\`${r.primary_email}\``).join(", ")}`)
  }
  console.log("")

  // 4. Websites — valid URL format? (column is primary_website)
  const webRows = rows.filter((r) => r.primary_website !== null && String(r.primary_website).trim() !== "")
  const validWeb = webRows.filter((r) => URL_RE.test(String(r.primary_website).trim()))
  const missingProtocol = webRows.filter((r) => {
    const s = String(r.primary_website).trim()
    return !URL_RE.test(s) && /^[a-z0-9].*\.[a-z]{2,}/i.test(s)
  })
  console.log(`### Websites (primary_website)\n`)
  console.log(`- Total with website: ${webRows.length}`)
  console.log(`- Has http(s):// prefix: ${validWeb.length}`)
  console.log(`- Missing protocol but looks like domain: ${missingProtocol.length}`)
  console.log(`- Other: ${webRows.length - validWeb.length - missingProtocol.length}`)
  if (missingProtocol.length > 0) {
    console.log(`- No-protocol samples: ${missingProtocol.slice(0, 10).map((r) => `\`${r.primary_website}\``).join(", ")}`)
  }
  // Check for http vs https
  const httpCount = webRows.filter((r) => String(r.primary_website).trim().startsWith("http://")).length
  const httpsCount = webRows.filter((r) => String(r.primary_website).trim().startsWith("https://")).length
  console.log(`- http:// count: ${httpCount}`)
  console.log(`- https:// count: ${httpsCount}`)
  console.log("")

  // 5. Region values
  const regionCounts = new Map<string, number>()
  for (const row of rows) {
    const v = row.region
    if (v === null || v === undefined) continue
    const s = String(v).trim()
    if (!s) continue
    regionCounts.set(s, (regionCounts.get(s) ?? 0) + 1)
  }
  console.log("### Region values\n")
  console.log("| Region | Count |")
  console.log("|--------|-------|")
  for (const [r, c] of [...regionCounts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`| ${r} | ${c} |`)
  }
  console.log("")

  // 6. data_quality_score distribution
  const dqsRows = rows.filter((r) => r.data_quality_score !== null && r.data_quality_score !== undefined)
  if (dqsRows.length > 0) {
    const scores = dqsRows.map((r) => Number(r.data_quality_score))
    const buckets = new Map<string, number>()
    for (const s of scores) {
      const bucket = `${Math.floor(s / 10) * 10}-${Math.floor(s / 10) * 10 + 9}`
      buckets.set(bucket, (buckets.get(bucket) ?? 0) + 1)
    }
    console.log("### Data quality score distribution\n")
    console.log("| Range | Count |")
    console.log("|-------|-------|")
    for (const [b, c] of [...buckets.entries()].sort()) {
      console.log(`| ${b} | ${c} |`)
    }
    console.log(`\nMin: ${Math.min(...scores)}, Max: ${Math.max(...scores)}, Mean: ${(scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1)}\n`)
  }

  // 7. Duplicate detection — canonical_name collisions
  const nameCounts = new Map<string, number>()
  for (const row of rows) {
    const cn = row.canonical_name
    if (cn === null || cn === undefined) continue
    const s = String(cn).trim().toLowerCase()
    if (!s) continue
    nameCounts.set(s, (nameCounts.get(s) ?? 0) + 1)
  }
  const dupes = [...nameCounts.entries()].filter(([, c]) => c > 1).sort((a, b) => b[1] - a[1])
  console.log(`### Duplicate canonical_name entries: ${dupes.length}\n`)
  if (dupes.length > 0) {
    console.log("| Name | Count |")
    console.log("|------|-------|")
    for (const [n, c] of dupes.slice(0, 20)) {
      console.log(`| ${n} | ${c} |`)
    }
  }
  console.log("")

  // 8. Entity type inference preview
  const withCh = rows.filter((r) => r.companies_house_number !== null && String(r.companies_house_number).trim() !== "")
  const withoutCh = rows.filter((r) => r.companies_house_number === null || String(r.companies_house_number).trim() === "")
  console.log(`### Entity type inference preview\n`)
  console.log(`- With CH number (→ company): ${withCh.length} (${pct(withCh.length, rows.length)})`)
  console.log(`- Without CH number (→ freelancer): ${withoutCh.length} (${pct(withoutCh.length, rows.length)})`)
  // Company-like names (Ltd, Limited, PLC, LLP, Inc)
  const companyNamePatterns = /\b(ltd|limited|plc|llp|inc|corp|group|holdings)\b/i
  const companyLikeNames = rows.filter((r) => companyNamePatterns.test(String(r.name)))
  console.log(`- Names containing Ltd/Limited/PLC/LLP/Inc: ${companyLikeNames.length} (${pct(companyLikeNames.length, rows.length)})`)
  console.log(`- These have no CH number, so entity type = "company" by name heuristic`)
  console.log("")

  // 9. Phone format breakdown
  console.log("### Phone format breakdown\n")
  const phoneRows = rows.filter((r) => r.primary_phone !== null && String(r.primary_phone).trim() !== "")
  const intlFormat = phoneRows.filter((r) => /^\+44/.test(String(r.primary_phone).trim()))
  const natFormat = phoneRows.filter((r) => /^0[1-9]/.test(String(r.primary_phone).trim()))
  const shortFormat = phoneRows.filter((r) => {
    const s = String(r.primary_phone).trim()
    return s.length < 7 && /^\d+$/.test(s)
  })
  const otherPhone = phoneRows.length - intlFormat.length - natFormat.length - shortFormat.length
  console.log(`- +44 international: ${intlFormat.length}`)
  console.log(`- 0xxx national: ${natFormat.length}`)
  console.log(`- Short/suspect (< 7 digits): ${shortFormat.length}`)
  console.log(`- Other: ${otherPhone}`)
  if (shortFormat.length > 0) {
    console.log(`- Short samples: ${shortFormat.slice(0, 10).map((r) => `\`${r.primary_phone}\``).join(", ")}`)
  }
  const otherPhoneRows = phoneRows.filter((r) => {
    const s = String(r.primary_phone).trim()
    return !(/^\+44/.test(s) || /^0[1-9]/.test(s) || (s.length < 7 && /^\d+$/.test(s)))
  })
  if (otherPhoneRows.length > 0) {
    console.log(`- Other samples: ${otherPhoneRows.slice(0, 15).map((r) => `\`${r.primary_phone}\``).join(", ")}`)
  }
  console.log("")

  // 10. Country outliers
  console.log("### Non-UK countries\n")
  const nonUk = rows.filter((r) => {
    const c = String(r.country).trim().toLowerCase()
    return c !== "united kingdom" && c !== "uk" && c !== "england" && c !== "scotland" && c !== "wales" && c !== "northern ireland"
  })
  console.log(`- Non-UK rows: ${nonUk.length} (${pct(nonUk.length, rows.length)})`)
  const countryCounts = new Map<string, number>()
  for (const row of nonUk) {
    const c = String(row.country).trim()
    countryCounts.set(c, (countryCounts.get(c) ?? 0) + 1)
  }
  console.log("| Country | Count |")
  console.log("|---------|-------|")
  for (const [c, n] of [...countryCounts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`| ${c} | ${n} |`)
  }
  console.log("")

  // 11. Name quality — special characters, leading/trailing whitespace, OCR artefacts
  console.log("### Name quality\n")
  const nameLeadTrail = rows.filter((r) => {
    const n = String(r.name)
    return n !== n.trim()
  })
  const nameHtml = rows.filter((r) => HTML_ENTITY.test(String(r.name)))
  const nameEncoding = rows.filter((r) => ENCODING_ARTEFACT.test(String(r.name)))
  const nameQuotes = rows.filter((r) => /['"']/.test(String(r.name)))
  const nameParens = rows.filter((r) => /[()]/.test(String(r.name)))
  console.log(`- Leading/trailing whitespace: ${nameLeadTrail.length}`)
  console.log(`- HTML entities: ${nameHtml.length}`)
  console.log(`- Encoding artefacts: ${nameEncoding.length}`)
  console.log(`- Contains quotes: ${nameQuotes.length}`)
  console.log(`- Contains parentheses: ${nameParens.length}`)
  if (nameHtml.length > 0) {
    console.log(`- HTML samples: ${nameHtml.slice(0, 5).map((r) => `\`${r.name}\``).join(", ")}`)
  }
  if (nameEncoding.length > 0) {
    console.log(`- Encoding samples: ${nameEncoding.slice(0, 5).map((r) => `\`${r.name}\``).join(", ")}`)
  }
  if (nameQuotes.length > 0) {
    console.log(`- Quote samples: ${nameQuotes.slice(0, 5).map((r) => `\`${r.name}\``).join(", ")}`)
  }
  console.log("")

  // 12. Address quality — embedded postcodes, multi-line, county names as city
  console.log("### Address quality\n")
  const addrWithPostcode = rows.filter((r) => {
    const a = String(r.address ?? "").trim()
    return a && UK_POSTCODE_LOOSE.test(a)
  })
  const addrMultiline = rows.filter((r) => {
    const a = String(r.address ?? "").trim()
    return a && /\n/.test(a)
  })
  console.log(`- Address contains postcode: ${addrWithPostcode.length}`)
  console.log(`- Multi-line addresses: ${addrMultiline.length}`)
  console.log("")

  // 13. Email domain distribution (top 20)
  console.log("### Email domain distribution (top 20)\n")
  const domainCounts = new Map<string, number>()
  for (const row of rows) {
    if (row.primary_email === null) continue
    const s = String(row.primary_email).trim()
    const atIdx = s.lastIndexOf("@")
    if (atIdx < 0) continue
    const domain = s.slice(atIdx + 1).toLowerCase()
    domainCounts.set(domain, (domainCounts.get(domain) ?? 0) + 1)
  }
  console.log("| Domain | Count |")
  console.log("|--------|-------|")
  for (const [d, c] of topN(domainCounts, 20)) {
    console.log(`| ${d} | ${c} |`)
  }
  console.log("")

  // 14. companies_all vs companies comparison
  console.log("## companies_all vs companies comparison\n")
  try {
    const allCount = (db.prepare("SELECT COUNT(*) as n FROM companies_all").get() as Row).n as number
    const allCols = db.prepare("PRAGMA table_info(companies_all)").all() as Row[]
    console.log(`**companies_all:** ${allCount} rows, ${allCols.length} columns`)
    console.log(`**companies:** ${rows.length} rows, ${colNames.length} columns\n`)
    console.log("companies_all columns:")
    for (const c of allCols) {
      console.log(`- \`${c.name}\` (${c.type})`)
    }
    console.log("")

    // Check columns only in companies_all
    const compColSet = new Set(colNames)
    const allColNames = allCols.map((c) => String(c.name))
    const onlyInAll = allColNames.filter((c) => !compColSet.has(c))
    const onlyInComp = colNames.filter((c) => !new Set(allColNames).has(c))
    if (onlyInAll.length > 0) console.log(`Columns only in companies_all: ${onlyInAll.join(", ")}`)
    if (onlyInComp.length > 0) console.log(`Columns only in companies: ${onlyInComp.join(", ")}`)
    console.log("")

    // Sample rows from companies_all to check original data quality
    const allRows = db.prepare("SELECT * FROM companies_all LIMIT 5").all() as Row[]
    console.log("Sample rows from companies_all (first 5):\n")
    for (const row of allRows) {
      const nonNull = Object.entries(row).filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== "")
      console.log(`- ID ${row.company_id}: ${nonNull.map(([k, v]) => `${k}=\`${String(v).slice(0, 50)}\``).join(", ")}`)
    }
    console.log("")

    // Analyse key companies_all fields
    const allDescRows = db.prepare("SELECT description FROM companies_all WHERE description IS NOT NULL AND description != ''").all() as Row[]
    console.log(`\ncompanies_all rows with description: ${allDescRows.length}`)
    const descLengths = allDescRows.map((r) => String(r.description).length)
    console.log(`Description length: min=${Math.min(...descLengths)}, avg=${Math.round(descLengths.reduce((a, b) => a + b, 0) / descLengths.length)}, max=${Math.max(...descLengths)}`)

    const allProdRows = db.prepare("SELECT products_services FROM companies_all WHERE products_services IS NOT NULL AND products_services != ''").all() as Row[]
    console.log(`companies_all rows with products_services: ${allProdRows.length}`)

    const allContactRows = db.prepare("SELECT contact_person FROM companies_all WHERE contact_person IS NOT NULL AND contact_person != ''").all() as Row[]
    console.log(`companies_all rows with contact_person: ${allContactRows.length}`)

    const allSocialRows = db.prepare("SELECT social_media FROM companies_all WHERE social_media IS NOT NULL AND social_media != ''").all() as Row[]
    console.log(`companies_all rows with social_media: ${allSocialRows.length}`)

    const allShowreelRows = db.prepare("SELECT showreel_url FROM companies_all WHERE showreel_url IS NOT NULL AND showreel_url != ''").all() as Row[]
    console.log(`companies_all rows with showreel_url: ${allShowreelRows.length}`)

    const allLogoRows = db.prepare("SELECT logo_url FROM companies_all WHERE logo_url IS NOT NULL AND logo_url != ''").all() as Row[]
    console.log(`companies_all rows with logo_url: ${allLogoRows.length}`)

    // Check for products_services format (appears to be JSON arrays)
    console.log(`\nproducts_services samples:`)
    for (const r of allProdRows.slice(0, 5)) {
      console.log(`- \`${String(r.products_services).slice(0, 150)}\``)
    }

    // Check description encoding
    const descWithEncoding = allDescRows.filter((r) => ENCODING_ARTEFACT.test(String(r.description)))
    const descWithHtml = allDescRows.filter((r) => HTML_ENTITY.test(String(r.description)))
    console.log(`\nDescriptions with encoding artefacts: ${descWithEncoding.length}`)
    console.log(`Descriptions with HTML entities: ${descWithHtml.length}`)
    if (descWithEncoding.length > 0) {
      console.log(`Encoding samples: ${descWithEncoding.slice(0, 3).map((r) => `\`${String(r.description).slice(0, 80)}\``).join(", ")}`)
    }
    if (descWithHtml.length > 0) {
      console.log(`HTML entity samples: ${descWithHtml.slice(0, 3).map((r) => `\`${String(r.description).slice(0, 80)}\``).join(", ")}`)
    }

    // Check original_ids mapping: can we join companies → companies_all?
    console.log(`\n### original_ids → companies_all.id join check`)
    const companyOrigIds = db.prepare("SELECT original_ids FROM companies").all() as Row[]
    let joinable = 0
    let notJoinable = 0
    for (const row of companyOrigIds.slice(0, 100)) {
      try {
        const ids = JSON.parse(String(row.original_ids)) as number[]
        const found = db.prepare(`SELECT id FROM companies_all WHERE id = ?`).get(ids[0]) as Row | undefined
        if (found) joinable++
        else notJoinable++
      } catch {
        notJoinable++
      }
    }
    console.log(`First 100 companies: ${joinable} joinable via original_ids[0] → companies_all.id, ${notJoinable} not joinable`)
  } catch (err) {
    console.log(`companies_all error: ${err}`)
  }
  console.log("")

  // 15. All tables in the database
  console.log("## All tables in database\n")
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as Row[]
  for (const t of tables) {
    const count = (db.prepare(`SELECT COUNT(*) as n FROM "${t.name}"`).get() as Row).n
    console.log(`- \`${t.name}\`: ${count} rows`)
  }
  console.log("")

  db.close()
}

main()
