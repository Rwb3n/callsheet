// support_acknowledgment email template — SI §5.2, CS-WORK-058 AC-2.7

import { registerTemplate, hasTemplate } from "@/lib/email/templates"

export function registerSupportAcknowledgmentTemplate(): void {
  if (hasTemplate("support_acknowledgment")) return
  registerTemplate("support_acknowledgment", (data) => ({
    subject: `CALLSHEET Support — Ticket received: ${data.subject}`,
    html: `
      <h2>We've received your request</h2>
      <p>Your support ticket has been created. Our team will review it shortly.</p>
      <p><strong>Subject:</strong> ${data.subject}</p>
      ${data.deflectionArticle ? `<p>In the meantime, this article may help: <a href="${data.deflectionArticle}">${data.deflectionArticle}</a></p>` : ""}
      <p>Ticket reference: ${data.ticketId}</p>
    `.trim(),
  }))
}

registerSupportAcknowledgmentTemplate()
