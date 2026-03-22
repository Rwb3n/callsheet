// Intelligence ceremony email templates — S9 §4.4, §4.5
// SI §5.2: principal_briefing, credit_confirmation_outreach, decay_final_notice, enrichment_confirmation_request

import { registerTemplate, hasTemplate } from "@/lib/email/templates"

export function registerPrincipalBriefingTemplate(): void {
  if (hasTemplate("principal_briefing")) return
  registerTemplate("principal_briefing", (data) => ({
    subject: `CALLSHEET — Principal Operations Briefing: ${data.period ?? "Monthly"}`,
    html: `
      <h2>Principal Operations Briefing</h2>
      <p><strong>Period:</strong> ${data.period ?? "N/A"}</p>
      <p><strong>Active listings:</strong> ${data.activeListings ?? 0}</p>
      <p><strong>Escalations requiring attention:</strong> ${data.escalationCount ?? 0}</p>
      <p><strong>Pending approvals:</strong> ${data.pendingApprovals ?? 0}</p>
    `.trim(),
  }))
}

export function registerCreditConfirmationOutreachTemplate(): void {
  if (hasTemplate("credit_confirmation_outreach")) return
  registerTemplate("credit_confirmation_outreach", (data) => ({
    subject: `CALLSHEET — Please confirm your credit for ${data.providerName ?? "a listing"}`,
    html: `
      <h2>Annual Credit Confirmation</h2>
      <p>Hi${data.clientName ? ` ${data.clientName}` : ""},</p>
      <p>We're reaching out to confirm that the credit attributed to <strong>${data.providerName ?? "the provider"}</strong> is still accurate.</p>
      <p><strong>Credit:</strong> ${data.creditDescription ?? "N/A"}</p>
      ${data.confirmationLink ? `<p><a href="${data.confirmationLink}">Confirm this credit</a></p>` : ""}
    `.trim(),
  }))
}

export function registerDecayFinalNoticeTemplate(): void {
  if (hasTemplate("decay_final_notice")) return
  registerTemplate("decay_final_notice", (data) => ({
    subject: `CALLSHEET — Final notice: "${data.listingName}" may be archived`,
    html: `
      <h2>Final Notice — Listing at Risk</h2>
      <p>Your listing <strong>${data.listingName ?? "your listing"}</strong> has unresolved data quality issues.</p>
      <p>If these are not addressed, the listing may be automatically archived.</p>
      ${data.listingId ? `<p><a href="https://callsheet.co.uk/dashboard/listings/${data.listingId}">Update your listing</a></p>` : ""}
    `.trim(),
  }))
}

export function registerEnrichmentConfirmationRequestTemplate(): void {
  if (hasTemplate("enrichment_confirmation_request")) return
  registerTemplate("enrichment_confirmation_request", (data) => ({
    subject: `CALLSHEET — Is your listing "${data.providerName}" still up to date?`,
    html: `
      <h2>Annual Information Confirmation</h2>
      <p>It's been a while since your listing <strong>${data.providerName ?? "your listing"}</strong> was last updated (${data.lastUpdated ?? "over a year ago"}).</p>
      <p>Please review and confirm your details are still accurate.</p>
      ${data.dashboardLink ? `<p><a href="https://callsheet.co.uk${data.dashboardLink}">Review your listing</a></p>` : ""}
    `.trim(),
  }))
}

// Auto-register on import
registerPrincipalBriefingTemplate()
registerCreditConfirmationOutreachTemplate()
registerDecayFinalNoticeTemplate()
registerEnrichmentConfirmationRequestTemplate()
