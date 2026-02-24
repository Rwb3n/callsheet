// Retroactive anonymous enquiry linking — S2 §2.3, S1-ST-20
// On signup, links any anonymous enquiries sent from the same email address.

import { eq, and, isNull, sql } from "drizzle-orm"
import { enquiryRecords } from "@/db/schema/accounts"
import type { Db } from "@/db/types"

export async function linkAnonymousEnquiries(
  db: Db,
  accountId: string,
  email: string,
): Promise<number> {
  const result = await db
    .update(enquiryRecords)
    .set({ senderAccountId: accountId })
    .where(
      and(
        eq(enquiryRecords.senderEmail, email),
        isNull(enquiryRecords.senderAccountId),
      ),
    )
    .returning({ id: enquiryRecords.id })

  return result.length
}
