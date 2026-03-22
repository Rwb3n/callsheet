// Operations email templates — winback + listing_decay_warning
// SI §5.2, CS-WORK-063

import { registerTemplate, hasTemplate } from "@/lib/email/templates"

export function registerWinbackTemplate(): void {
  if (hasTemplate("winback")) return
  registerTemplate("winback", (data) => ({
    subject: `${data.subject ?? "Come back to CALLSHEET"}`,
    html: `
      <h2>We'd love to have you back</h2>
      ${data.body ? `<p>${data.body}</p>` : ""}
      <p>Your listing <strong>${data.listingName ?? "your listing"}</strong> was getting noticed.</p>
      ${data.viewCount ? `<p>${data.viewCount} profile views</p>` : ""}
      ${data.enquiryCount ? `<p>${data.enquiryCount} enquiries received</p>` : ""}
      <p><a href="https://callsheet.co.uk/signup">Reactivate your listing</a></p>
    `.trim(),
  }))
}

export function registerListingDecayWarningTemplate(): void {
  if (hasTemplate("listing_decay_warning")) return
  registerTemplate("listing_decay_warning", (data) => ({
    subject: `CALLSHEET — Your listing "${data.listingName}" needs attention`,
    html: `
      <h2>Your listing needs updating</h2>
      <p>We've detected that your listing <strong>${data.listingName}</strong> may have outdated information.</p>
      <p><strong>Signal:</strong> ${data.signalType} (${data.signalSeverity} severity)</p>
      <p>Keeping your listing up to date helps buyers find you and improves your quality score.</p>
      <p><a href="https://callsheet.co.uk/dashboard/listings/${data.listingId}">Update your listing</a></p>
    `.trim(),
  }))
}

registerWinbackTemplate()
registerListingDecayWarningTemplate()
