// Rule 2: Identity verification — S1 §6, AC-28, AC-30
// CH number check: director match + dissolved rejection

import type { CompaniesHouseService } from "@/lib/services/types"
import type { IntegrityResult } from "./types"

export async function verifyIdentity(
  input: { companiesHouseNumber: string | null; accountHolderName: string },
  companiesHouse: CompaniesHouseService,
): Promise<IntegrityResult> {
  if (!input.companiesHouseNumber) return { action: "allow" }

  const result = await companiesHouse.lookup(input.companiesHouseNumber)

  if (!result.found) {
    return {
      action: "flag_for_review",
      reasons: [`Companies House number ${input.companiesHouseNumber} not found`],
    }
  }

  if (result.status === "dissolved") {
    return {
      action: "reject",
      reasons: [`Companies House number ${input.companiesHouseNumber} is dissolved`],
    }
  }

  if (result.name) {
    const similarity = nameSimilarity(input.accountHolderName, result.name)
    if (similarity < 0.3) {
      return {
        action: "flag_for_review",
        reasons: [
          `Account holder "${input.accountHolderName}" does not match CH company "${result.name}" (similarity: ${(similarity * 100).toFixed(0)}%)`,
        ],
      }
    }
  }

  return { action: "allow" }
}

function nameSimilarity(a: string, b: string): number {
  const normalise = (s: string) =>
    s.toLowerCase().replace(/\b(ltd|limited|plc|llp|inc)\b/g, "").trim()
  const na = normalise(a)
  const nb = normalise(b)
  if (na === nb) return 1
  const wordsA = new Set(na.split(/\s+/).filter(Boolean))
  const wordsB = new Set(nb.split(/\s+/).filter(Boolean))
  const union = new Set([...wordsA, ...wordsB])
  if (union.size === 0) return 0
  let intersection = 0
  for (const w of wordsA) {
    if (wordsB.has(w)) intersection++
  }
  return intersection / union.size
}
