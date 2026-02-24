// Integrity pipeline — S1 §6.2, AC-31
// Sequential, short-circuits on first non-allow result

import type { Db } from "@/db/types"
import type { CompaniesHouseService } from "@/lib/services/types"
import type { IntegrityResult, TaxonomyTag } from "./types"
import { checkDuplicate } from "./duplicate-detection"
import { verifyIdentity } from "./identity-verification"
import { checkCHUniqueness } from "./ch-uniqueness"

export type NewListingInput = {
  accountId: string
  accountHolderName: string
  companiesHouseNumber: string | null
  tags: TaxonomyTag[]
  excludeListingId?: string
}

export async function runIntegrityChecks(
  input: NewListingInput,
  db: Db,
  companiesHouse: CompaniesHouseService,
): Promise<IntegrityResult> {
  const dupeResult = await checkDuplicate(
    { accountId: input.accountId, tags: input.tags, excludeListingId: input.excludeListingId },
    db,
  )
  if (dupeResult.action !== "allow") return dupeResult

  const identityResult = await verifyIdentity(
    { companiesHouseNumber: input.companiesHouseNumber, accountHolderName: input.accountHolderName },
    companiesHouse,
  )
  if (identityResult.action !== "allow") return identityResult

  const chResult = await checkCHUniqueness(
    { companiesHouseNumber: input.companiesHouseNumber, accountId: input.accountId },
    db,
  )
  if (chResult.action !== "allow") return chResult

  return { action: "allow" }
}

export type { IntegrityResult, TaxonomyTag } from "./types"
