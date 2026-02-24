// S3 email templates — S3 §9, AC-42, AC-43
// 4 templates: claim_approved, claim_rejected, claim_pending_review, claim_dispute_notification
// All transactional (not unsubscribable)

import { registerTemplate, hasTemplate } from "@/lib/email/templates"

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "https://callsheet.co.uk"

export function registerClaimApprovedTemplate(): void {
  if (hasTemplate("claim_approved")) return
  registerTemplate("claim_approved", (data) => ({
    subject: "Your CALLSHEET claim has been approved",
    html: `
      <h2>Claim approved</h2>
      <p>Your claim for <strong>${data.listingName}</strong> has been approved. You can now manage your listing.</p>
      <p><a href="${BASE_URL}/dashboard/listings/${data.listingId}">Manage your listing</a></p>
    `.trim(),
  }))
}

export function registerClaimRejectedTemplate(): void {
  if (hasTemplate("claim_rejected")) return
  registerTemplate("claim_rejected", (data) => ({
    subject: "Your CALLSHEET claim was not approved",
    html: `
      <h2>Claim not approved</h2>
      <p>Your claim for <strong>${data.listingName}</strong> was not approved.</p>
      <p><strong>Reason:</strong> ${data.reason ?? "Unable to verify your authority over this business"}</p>
      <p>You may resubmit with additional evidence.</p>
    `.trim(),
  }))
}

export function registerClaimPendingReviewTemplate(): void {
  if (hasTemplate("claim_pending_review")) return
  registerTemplate("claim_pending_review", (data) => ({
    subject: "Your CALLSHEET claim is under review",
    html: `
      <h2>Claim under review</h2>
      <p>We're verifying your claim for <strong>${data.listingName}</strong>. You'll hear back within 48 hours.</p>
    `.trim(),
  }))
}

export function registerClaimDisputeNotificationTemplate(): void {
  if (hasTemplate("claim_dispute_notification")) return
  registerTemplate("claim_dispute_notification", (data) => ({
    subject: "Your CALLSHEET listing claim is being reviewed",
    html: `
      <h2>Claim under review</h2>
      <p>Another party has submitted a claim for <strong>${data.listingName}</strong>.</p>
      <p>${data.disputeContext ?? "We're investigating and will be in touch."}</p>
    `.trim(),
  }))
}

// Convenience: register all 4 S3 templates
export function registerAllS3Templates(): void {
  registerClaimApprovedTemplate()
  registerClaimRejectedTemplate()
  registerClaimPendingReviewTemplate()
  registerClaimDisputeNotificationTemplate()
}

// Module-level registration for production startup
registerAllS3Templates()
