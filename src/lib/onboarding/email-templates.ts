// Onboarding email templates — S2 §10, AC-10
// listing_live: sent after user-created listing goes live (not seed imports)
// welcome: sent after email verification (registered here, sent by auth flow)

import { registerTemplate, hasTemplate } from "@/lib/email/templates"

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "https://callsheet.co.uk"

export function registerListingLiveTemplate(): void {
  if (hasTemplate("listing_live")) return
  registerTemplate("listing_live", (data) => ({
    subject: `Your listing is live on CALLSHEET`,
    html: `
      <h2>Your listing is live!</h2>
      <p>Your listing <strong>${data.name}</strong> is now visible on CALLSHEET.</p>
      <p><a href="${BASE_URL}/listing/${data.slug}">View your listing</a></p>
      <p>Complete your profile to appear higher in search results — add a bio, showreel, and credits.</p>
    `.trim(),
  }))
}

export function registerWelcomeTemplate(): void {
  if (hasTemplate("welcome")) return
  registerTemplate("welcome", (data) => ({
    subject: `Welcome to CALLSHEET`,
    html: `
      <h2>Welcome to CALLSHEET</h2>
      <p>Hi ${data.name ?? "there"},</p>
      <p>Your account has been created. You can now create a listing, search for production services, and send enquiries.</p>
      <p><a href="${BASE_URL}/dashboard">Go to your dashboard</a></p>
    `.trim(),
  }))
}

// --- Progressive disclosure templates — S2 §7, CS-WORK-018 ---

export function registerProfileDay1Template(): void {
  if (hasTemplate("profile_day1")) return
  registerTemplate("profile_day1", (data) => ({
    subject: "Make your listing stand out on CALLSHEET",
    html: `
      <h2>Complete your profile</h2>
      <p>Hi ${data.name ?? "there"},</p>
      <p>Listings with a headline and bio get 3x more views. Add yours now to stand out in search results.</p>
      <p><a href="${BASE_URL}/dashboard/listing/edit">Complete your profile</a></p>
    `.trim(),
  }))
}

export function registerProfileDay3Template(): void {
  if (hasTemplate("profile_day3")) return
  registerTemplate("profile_day3", (data) => ({
    subject: "Add a photo and website to your CALLSHEET listing",
    html: `
      <h2>Add your visual identity</h2>
      <p>Hi ${data.name ?? "there"},</p>
      <p>Listings with a photo and website link appear more credible to buyers. Upload yours in under 2 minutes.</p>
      <p><a href="${BASE_URL}/dashboard/listing/edit">Update your listing</a></p>
    `.trim(),
  }))
}

export function registerProfileDay7Template(): void {
  if (hasTemplate("profile_day7")) return
  registerTemplate("profile_day7", (data) => ({
    subject: "One more step to a complete CALLSHEET profile",
    html: `
      <h2>Almost there</h2>
      <p>Hi ${data.name ?? "there"},</p>
      <p>Add a contact email so potential clients can reach you directly. Listings with contact details receive more enquiries.</p>
      <p><a href="${BASE_URL}/dashboard/listing/edit">Add contact details</a></p>
    `.trim(),
  }))
}

// --- Enquiry forwarded template — S2 §5.3, S3 §3.2 ---

export function registerEnquiryForwardedTemplate(): void {
  if (hasTemplate("enquiry_forwarded")) return
  registerTemplate("enquiry_forwarded", (data) => ({
    subject: `You have ${data.enquiryCount === 1 ? "a new enquiry" : `${data.enquiryCount} new enquiries`} on CALLSHEET`,
    html: `
      <h2>Enquiries waiting for you</h2>
      <p>You have <strong>${data.enquiryCount}</strong> ${data.enquiryCount === 1 ? "enquiry" : "enquiries"} for <strong>${data.listingName}</strong>.</p>
      <p><a href="${BASE_URL}/dashboard/enquiries">View your enquiries</a></p>
    `.trim(),
  }))
}

// Module-level registration for production startup
registerListingLiveTemplate()
registerWelcomeTemplate()
registerProfileDay1Template()
registerProfileDay3Template()
registerProfileDay7Template()
registerEnquiryForwardedTemplate()
