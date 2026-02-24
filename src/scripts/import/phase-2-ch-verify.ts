// Phase 2: Companies House batch verification — S2 §6.3, AC-23
// Checks CH status for records with a company number. 500ms rate-limit delay.

import type { CompaniesHouseService } from "@/lib/services/types"
import type { CleanedRecord, FlaggedRecord, Phase2Result } from "./types"

const CH_RATE_LIMIT_MS = 500

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function phase2CHVerification(
  records: CleanedRecord[],
  companiesHouse: CompaniesHouseService,
  rateLimitMs = CH_RATE_LIMIT_MS,
): Promise<Phase2Result> {
  const verified: CleanedRecord[] = []
  const dissolved: FlaggedRecord[] = []
  let skipped = 0

  for (const record of records) {
    if (!record.companiesHouseNumber) {
      verified.push(record)
      skipped++
      continue
    }

    const result = await companiesHouse.lookup(record.companiesHouseNumber)

    if (result.found && result.status === "dissolved") {
      dissolved.push({ ...record, flagReason: "dissolved_company" })
    } else {
      verified.push(record)
    }

    await sleep(rateLimitMs)
  }

  return {
    verified,
    dissolved,
    stats: {
      total: records.length,
      verified: verified.length,
      dissolved: dissolved.length,
      skipped,
    },
  }
}
