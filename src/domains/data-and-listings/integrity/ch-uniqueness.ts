// Rule 3: CH uniqueness — S1 §6, AC-29
// Same CH number on a different account → flag_co_director

import { eq, and, ne } from "drizzle-orm"
import type { Db } from "@/db/types"
import { listings } from "@/db/schema/data-and-listings"
import type { IntegrityResult } from "./types"

export async function checkCHUniqueness(
  input: { companiesHouseNumber: string | null; accountId: string },
  db: Db,
): Promise<IntegrityResult> {
  if (!input.companiesHouseNumber) return { action: "allow" }

  const existing = await db
    .select({ id: listings.id, accountId: listings.accountId })
    .from(listings)
    .where(
      and(
        eq(listings.companiesHouseNumber, input.companiesHouseNumber),
        ne(listings.accountId, input.accountId),
      ),
    )
    .limit(1)

  if (existing.length > 0) {
    return {
      action: "flag_co_director",
      reasons: [
        `CH number ${input.companiesHouseNumber} already used by listing ${existing[0].id} (account: ${existing[0].accountId ?? "unclaimed"})`,
      ],
      existingListingId: existing[0].id,
      existingAccountId: existing[0].accountId,
    }
  }

  return { action: "allow" }
}
