// Phase 5: Article 14 GDPR notices — S2 §6.5, §11, AC-27, AC-28
// Two paths: email for listings with contact email, on-page notice for those without.
// Compliance obligation — category "transactional", non-unsubscribable.

import { eq } from "drizzle-orm"
import type { Db } from "@/db/types"
import { listings } from "@/db/schema/data-and-listings"
import type { EmailService } from "@/lib/email/types"
import { registerTemplate, hasTemplate } from "@/lib/email/templates"
import { logDecision } from "@/lib/decisions"
import type { DecisionLogDb } from "@/lib/decisions"
import { scheduleDeferredAction } from "@/lib/scheduler/api"
import type { SchedulerDb } from "@/lib/scheduler/api"

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "https://callsheet.co.uk"
const SEND_DELAY_MS = 600 // ~100 emails/minute within daily batch [S2-ST-12]

export type Article14Result = {
  emailsSent: number
  emailsFailed: number
  onPageNotices: number
}

type ImportedListing = {
  id: string
  slug: string
  name: string
  contactEmail: string | null
}

// Article 14 notice template [S2 §6.5, X-15]
export function registerArticle14Template(): void {
  if (hasTemplate("article_14_notice")) return
  registerTemplate("article_14_notice", (data) => ({
    subject: `Important: Your listing on CALLSHEET — ${data.businessName}`,
    html: `
      <h2>Information about your listing on CALLSHEET</h2>
      <p>We have created a listing for <strong>${data.businessName}</strong> on CALLSHEET,
      a directory for UK broadcast, film, and TV production services.</p>

      <h3>Your data rights (UK GDPR Article 14)</h3>
      <p><strong>Data controller:</strong> CALLSHEET Ltd</p>
      <p><strong>Data source:</strong> Publicly available industry records</p>
      <p><strong>Lawful basis:</strong> Legitimate interest in providing a comprehensive industry directory</p>
      <p><strong>Data categories held:</strong> ${data.dataCategories}</p>
      <p><strong>Retention:</strong> Until you request removal or the listing is claimed and modified by you</p>
      <p><strong>Your rights:</strong> You have the right to access, rectify, erase, restrict processing of,
      or object to our processing of your data. You may also lodge a complaint with the ICO.</p>

      <h3>Claim your listing</h3>
      <p>Take control of your listing to update your details, add a profile photo, and appear higher in search results.</p>
      <p><a href="${data.claimUrl}">Claim your listing</a></p>

      <h3>Request removal</h3>
      <p>If you would like your listing removed, <a href="${data.removalUrl}">click here to request removal</a>.</p>
    `.trim(),
  }))
}

registerArticle14Template()

function summariseDataCategories(listing: ImportedListing): string {
  const categories = ["Business name", "Contact details"]
  if (listing.contactEmail) categories.push("Email address")
  return categories.join(", ")
}

export async function phase5Article14(
  db: Db,
  emailService: EmailService,
  decisionDb: DecisionLogDb,
  schedulerDb: SchedulerDb,
): Promise<Article14Result> {
  // Query all 4rfv seed listings
  const seedListings = await db
    .select({
      id: listings.id,
      slug: listings.slug,
      name: listings.name,
      contactEmail: listings.contactEmail,
    })
    .from(listings)
    .where(eq(listings.source, "4rfv_import"))

  const withEmail = seedListings.filter((l) => l.contactEmail !== null)
  const withoutEmail = seedListings.filter((l) => l.contactEmail === null)

  // AC-27: Send Article 14 email to listings with contact email
  let sent = 0
  let failed = 0
  for (const listing of withEmail) {
    const result = await emailService.send({
      to: listing.contactEmail!,
      template: "article_14_notice",
      data: {
        businessName: listing.name,
        listingUrl: `${BASE_URL}/listing/${listing.slug}`,
        claimUrl: `${BASE_URL}/listing/${listing.slug}/claim`,
        removalUrl: `${BASE_URL}/listing/${listing.slug}/remove`,
        dataCategories: summariseDataCategories(listing),
      },
      category: "transactional", // non-unsubscribable — compliance obligation
    })

    if (result.status === "sent") {
      sent++
    } else {
      failed++
    }

    if (sent + failed < withEmail.length) {
      await delay(SEND_DELAY_MS)
    }
  }

  // AC-28: On-page Article 14 notice for listings without email
  for (const listing of withoutEmail) {
    await db
      .update(listings)
      .set({ article14NoticeDisplayed: true })
      .where(eq(listings.id, listing.id))

    await logDecision(decisionDb, {
      domain: "operations",
      decisionType: "article_14_exemption",
      inputs: {
        listingId: listing.id,
        reason: "no_contact_email",
        exemption: "Art 14(5)(b)",
      },
      output: { remediation: "on_page_notice" },
      listingId: listing.id,
    })
  }

  // Schedule progress check deferred action [S2 §6.5, §12]
  const importDate = new Date().toISOString()
  await scheduleDeferredAction(schedulerDb, {
    action: "article_14_progress_check",
    params: {
      importBatchId: "4rfv_import",
      importDate,
    },
    executeAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // tomorrow
    retryPolicy: "once",
    onFailure: "alert_principal",
    createdBy: "import_pipeline",
  })

  return { emailsSent: sent, emailsFailed: failed, onPageNotices: withoutEmail.length }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
