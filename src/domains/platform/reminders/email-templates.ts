// listing_update_reminder email template — S5 §9.1

import { registerTemplate, hasTemplate } from "@/lib/email/templates"

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "https://callsheet.co.uk"

export function registerListingUpdateReminderTemplate(): void {
  if (hasTemplate("listing_update_reminder")) return
  registerTemplate("listing_update_reminder", (data) => ({
    subject: "Time to update your CALLSHEET listing",
    html: `
      <h2>Keep your listing fresh</h2>
      <p>It's been 90 days since you last updated <strong>${data.listingName}</strong>.</p>
      <p>Up-to-date listings rank higher in search results and build trust with potential clients.</p>
      <p><a href="${BASE_URL}/dashboard/listings/${data.listingId}/edit">Update your listing</a></p>
    `.trim(),
  }))
}

registerListingUpdateReminderTemplate()
