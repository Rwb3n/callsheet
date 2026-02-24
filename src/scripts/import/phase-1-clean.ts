// Phase 1: Automated cleaning — S2 §6.2, AC-22
// Normalises postcodes, emails, URLs, phones. Flags invalid records.

import type { ImportRecord, CleanedRecord, FlaggedRecord, Phase1Result } from "./types"

// UK postcode: A9 9AA, A99 9AA, A9A 9AA, AA9 9AA, AA99 9AA, AA9A 9AA
const UK_POSTCODE_RE = /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i

const COMMON_POSTCODE_FIXES: Record<string, string> = {
  O: "0", o: "0", l: "1", I: "1",
}

// UK outward formats: A9, A9A, A99, AA9, AA9A, AA99
// Pattern: 1-2 leading alpha + 1-2 "digit" chars + 0-1 trailing alpha
const OUTWARD_RE = /^([A-Za-z]{1,2})([A-Za-z0-9]{1,2})([A-Za-z]?)$/

export function normalisePostcode(raw: string): string | null {
  let pc = raw.trim().replace(/\s+/g, "")
  if (pc.length < 5) return null
  const ocrDigit = (ch: string): string => ({ O: "0", o: "0", I: "1", l: "1" })[ch] ?? ch
  const ocrLetter = (ch: string): string => ({ "0": "O", "1": "I" })[ch] ?? ch
  // Split: outward (all but last 3) + inward (last 3: digit + 2 alpha)
  let outward = pc.slice(0, -3)
  let inward = pc.slice(-3)
  // Inward: first char must be digit, last 2 must be alpha
  inward = ocrDigit(inward[0]) + ocrLetter(inward[1]) + ocrLetter(inward[2])
  // Outward: apply structural fix
  const m = outward.match(OUTWARD_RE)
  if (m) {
    const [, area, district, sector] = m
    // district chars should be digits
    const fixedDistrict = district.split("").map(ocrDigit).join("")
    // sector char (if present) should be alpha
    const fixedSector = sector ? ocrLetter(sector) : ""
    outward = area + fixedDistrict + fixedSector
  }
  pc = `${outward} ${inward}`.toUpperCase()
  return UK_POSTCODE_RE.test(pc) ? pc : null
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function normaliseEmail(raw: string): string | null {
  const email = raw.trim().toLowerCase()
  return EMAIL_RE.test(email) ? email : null
}

export function normaliseUrl(raw: string): string | null {
  let url = raw.trim()
  if (!url) return null
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`
  url = url.replace(/\/+$/, "")
  try {
    new URL(url)
    return url
  } catch {
    return null
  }
}

const UK_PHONE_RE = /^(?:\+44|0)\d{9,10}$/

export function normalisePhone(raw: string): string | null {
  let phone = raw.trim().replace(/[\s\-().]/g, "")
  // Convert +44 prefix to 0 for consistency, then back to +44
  if (phone.startsWith("0")) phone = `+44${phone.slice(1)}`
  if (!phone.startsWith("+44")) phone = `+44${phone}`
  return UK_PHONE_RE.test(phone) ? phone : null
}

export function titleCase(s: string): string {
  return s
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\w\S*/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase())
}

export function phase1AutomatedCleaning(records: ImportRecord[]): Phase1Result {
  const cleaned: CleanedRecord[] = []
  const flagged: FlaggedRecord[] = []

  for (const record of records) {
    const flags: { field: string; reason: string; originalValue: string }[] = []
    const r = { ...record }

    // Name: trim + title case
    r.name = titleCase(r.name)

    // Postcode
    if (r.basePostcode) {
      const norm = normalisePostcode(r.basePostcode)
      if (norm) {
        r.basePostcode = norm
      } else {
        flags.push({ field: "basePostcode", reason: "invalid_postcode", originalValue: r.basePostcode })
      }
    }

    // Email
    if (r.contactEmail) {
      const norm = normaliseEmail(r.contactEmail)
      if (norm) {
        r.contactEmail = norm
      } else {
        flags.push({ field: "contactEmail", reason: "invalid_email", originalValue: r.contactEmail })
      }
    }

    // URL
    if (r.websiteUrl) {
      const norm = normaliseUrl(r.websiteUrl)
      if (norm) {
        r.websiteUrl = norm
      } else {
        flags.push({ field: "websiteUrl", reason: "invalid_url", originalValue: r.websiteUrl })
      }
    }

    // Phone
    if (r.contactPhone) {
      const norm = normalisePhone(r.contactPhone)
      if (norm) {
        r.contactPhone = norm
      } else {
        flags.push({ field: "contactPhone", reason: "invalid_phone", originalValue: r.contactPhone })
      }
    }

    // Flag if critical fields are invalid (invalid postcode with no region, invalid email)
    const hasCriticalFlag = flags.some(
      (f) => f.reason === "invalid_email" || (f.reason === "invalid_postcode" && !r.baseRegion),
    )

    if (hasCriticalFlag) {
      flagged.push({ ...r, flags, flagReason: "invalid_data" })
    } else {
      cleaned.push({ ...r, flags })
    }
  }

  return {
    cleaned,
    flagged,
    stats: { total: records.length, cleaned: cleaned.length, flagged: flagged.length },
  }
}
