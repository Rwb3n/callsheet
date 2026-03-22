// Enquiry email templates — S5 §5.4, S6 §3.7
// new_enquiry: sent to provider on Branch A (direct delivery to claimed listing)
// enquiry_response: transactional, sent to enquirer when provider responds
// enquiry_reminder: sent to provider after 7 days unresponded

import { registerTemplate, hasTemplate } from "@/lib/email/templates"

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "https://callsheet.co.uk"

export function registerNewEnquiryTemplate(): void {
  if (hasTemplate("new_enquiry")) return
  registerTemplate("new_enquiry", (data) => ({
    subject: `New enquiry for ${data.listingName} on CALLSHEET`,
    html: `
      <h2>You have a new enquiry</h2>
      <p><strong>${data.senderName}</strong> has sent an enquiry about <strong>${data.listingName}</strong>:</p>
      <blockquote>${data.messagePreview}</blockquote>
      <p><a href="${BASE_URL}/dashboard/enquiries">View and respond</a></p>
    `.trim(),
  }))
}

export function registerEnquiryResponseTemplate(): void {
  if (hasTemplate("enquiry_response")) return
  registerTemplate("enquiry_response", (data) => ({
    subject: `Response from ${data.providerName} on CALLSHEET`,
    html: `
      <h2>You have a response</h2>
      <p><strong>${data.providerName}</strong> has responded to your enquiry about <strong>${data.listingName}</strong>:</p>
      <blockquote>${data.responseMessage}</blockquote>
      <p><a href="${BASE_URL}">Visit CALLSHEET</a></p>
    `.trim(),
  }))
}

export function registerEnquiryReminderTemplate(): void {
  if (hasTemplate("enquiry_reminder")) return
  registerTemplate("enquiry_reminder", (data) => ({
    subject: `Unanswered enquiry on CALLSHEET`,
    html: `
      <h2>You have an unanswered enquiry</h2>
      <p>An enquiry for <strong>${data.listingName}</strong> has been waiting ${data.daysSinceEnquiry} days without a response.</p>
      <p>Responding quickly improves your listing's quality score and builds trust with potential clients.</p>
      <p><a href="${BASE_URL}/dashboard/enquiries">Respond now</a></p>
    `.trim(),
  }))
}

registerNewEnquiryTemplate()
registerEnquiryResponseTemplate()
registerEnquiryReminderTemplate()
