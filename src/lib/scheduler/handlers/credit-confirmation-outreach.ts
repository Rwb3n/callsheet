// credit_confirmation_outreach — S9 §4.5, AC-66
// Annual credit confirmation outreach for client-confirmed credits.
// Utility function (not a registered handler) — called from enrichment_full_cycle
// or as a standalone batch operation.

import "@/domains/intelligence/ceremony/email-templates"

import { eq, and } from "drizzle-orm"
import { credits, listings } from "@/db/schema/data-and-listings"
import type { Db } from "@/db/types"
import type { EmailService } from "@/lib/email/types"

const SPEC = {
  CREDIT_CONFIRMATION_START_DAYS: 330,
  CREDIT_CONFIRMATION_END_DAYS: 365,
}

const DAY_MS = 24 * 60 * 60 * 1000

export type CreditConfirmationDeps = {
  db: Db
  emailService: EmailService
}

export async function runCreditConfirmationOutreach(
  deps: CreditConfirmationDeps,
  listingId: string,
): Promise<number> {
  const now = new Date()

  // 1. Query credits WHERE listing_id = listingId AND sourcing_method = 'client_confirmed'
  const clientCredits = await deps.db
    .select({
      id: credits.id,
      projectName: credits.projectName,
      clientCommissioner: credits.clientCommissioner,
      roleProvided: credits.roleProvided,
      verificationDate: credits.verificationDate,
    })
    .from(credits)
    .where(
      and(
        eq(credits.listingId, listingId),
        eq(credits.sourcingMethod, "client_confirmed"),
      ),
    )

  if (clientCredits.length === 0) return 0

  // 2. Load listing for contact info
  const [listing] = await deps.db
    .select({
      name: listings.name,
      contactEmail: listings.contactEmail,
    })
    .from(listings)
    .where(eq(listings.id, listingId))
    .limit(1)

  if (!listing?.contactEmail) return 0

  // 3. AC-66: For each credit, check if verification is within confirmation window
  let emailsSent = 0

  for (const credit of clientCredits) {
    if (!credit.verificationDate) continue

    const daysSinceVerification = Math.floor(
      (now.getTime() - credit.verificationDate.getTime()) / DAY_MS,
    )

    if (
      daysSinceVerification >= SPEC.CREDIT_CONFIRMATION_START_DAYS &&
      daysSinceVerification < SPEC.CREDIT_CONFIRMATION_END_DAYS
    ) {
      const creditDescription = credit.roleProvided
        ? `${credit.projectName} \u2014 ${credit.roleProvided}`
        : credit.projectName

      await deps.emailService.send({
        to: listing.contactEmail,
        template: "credit_confirmation_outreach",
        data: {
          clientName: credit.clientCommissioner ?? "",
          providerName: listing.name,
          creditDescription,
        },
        category: "listing_status",
        listingId,
      })

      emailsSent += 1
    }
  }

  return emailsSent
}
