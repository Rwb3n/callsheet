// Compliance email templates — SI §5.2
// dsar_acknowledgment: sent on DSAR entry creation
// dsar_completion: sent when DSAR transitions to completed

import { registerTemplate, hasTemplate } from "@/lib/email/templates"

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "https://callsheet.co.uk"

export function registerDsarAcknowledgmentTemplate(): void {
  if (hasTemplate("dsar_acknowledgment")) return
  registerTemplate("dsar_acknowledgment", (data) => ({
    subject: "CALLSHEET — Your data subject access request has been received",
    html: `
      <h2>Data Subject Access Request — Acknowledgment</h2>
      <p>We have received your data subject access request (ref: ${data.dsarId}).</p>
      <p>Under UK GDPR, we have 30 calendar days from ${data.receivedAt} to respond to your request.</p>
      <p><strong>Deadline:</strong> ${data.deadline}</p>
      <p><strong>Next steps:</strong> We may need to verify your identity before processing your request. If additional information is required, we will contact you at this email address.</p>
      <p>If you have any questions, please reply to this email.</p>
    `.trim(),
  }))
}

export function registerDsarCompletionTemplate(): void {
  if (hasTemplate("dsar_completion")) return
  registerTemplate("dsar_completion", (data) => ({
    subject: "CALLSHEET — Your data subject access request has been completed",
    html: `
      <h2>Data Subject Access Request — Complete</h2>
      <p>Your data subject access request (ref: ${data.dsarId}) has been fulfilled.</p>
      <p>If you believe we have not fully addressed your request, you have the right to lodge a complaint with the ICO at <a href="https://ico.org.uk">ico.org.uk</a>.</p>
    `.trim(),
  }))
}

registerDsarAcknowledgmentTemplate()
registerDsarCompletionTemplate()
