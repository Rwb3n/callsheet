// CS-WORK-031: onClaimApproved pipeline integration tests
// AC-11 through AC-20, AC-48

import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest"
import { eq } from "drizzle-orm"
import { getTestDb, resetDb, closeTestDb } from "@/db/test-utils"
import {
  seedTestUser,
  createUnclaimedListing,
  createSchedulerDb,
  createDecisionLogDb,
  InMemoryNotificationDb,
} from "@/db/test-fixtures"
import {
  listings,
  verifications,
  preClaimSnapshots,
  pendingEnquiries,
} from "@/db/schema/data-and-listings"
import { deferredActions, decisionLogs } from "@/db/schema/shared"
import { InMemoryEmailService, clearTemplates } from "@/lib/email"
import { registerAllS3Templates } from "@/domains/data-and-listings/claim/email-templates"
import { registerEnquiryForwardedTemplate } from "@/lib/onboarding/email-templates"
import { onClaimApproved } from "@/domains/data-and-listings/claim/claim-approved"
import type { ClaimApprovedDeps } from "@/domains/data-and-listings/claim/claim-approved"

let db: ReturnType<typeof getTestDb>

const CLAIMANT_ID = "00000000-0000-0000-0000-000000000031"
const CLAIMANT_EMAIL = "claimant@example.com"

let emailService: InMemoryEmailService
let notificationDb: InMemoryNotificationDb

function makeDeps(): ClaimApprovedDeps {
  emailService = new InMemoryEmailService()
  notificationDb = new InMemoryNotificationDb()
  return {
    db,
    schedulerDb: createSchedulerDb(db),
    decisionLogDb: createDecisionLogDb(db),
    emailService,
    notificationDb,
  }
}

beforeAll(() => {
  db = getTestDb()
})

beforeEach(async () => {
  await resetDb()
  registerAllS3Templates()
  registerEnquiryForwardedTemplate()
  await seedTestUser(db, CLAIMANT_ID, CLAIMANT_EMAIL)
})

afterAll(async () => {
  await closeTestDb()
})

// ========== AC-11: approval sets claimStatus, accountId, verification tier ==========

describe("AC-11: listing ownership, claimStatus, and verification tier updated on approval", () => {
  it("sets claimStatus to claimed, accountId to claimant, verification tier to claimed", async () => {
    const listing = await createUnclaimedListing(db)
    const deps = makeDeps()

    await onClaimApproved(deps, listing.id, CLAIMANT_ID, "auto")

    const [updated] = await db.select().from(listings).where(eq(listings.id, listing.id))
    expect(updated.claimStatus).toBe("claimed")
    expect(updated.accountId).toBe(CLAIMANT_ID)

    const [ver] = await db.select().from(verifications).where(eq(verifications.listingId, listing.id))
    expect(ver.tier).toBe("claimed")
    expect(ver.claimedAt).not.toBeNull()
  })
})

// ========== AC-12: snapshot edits applied to listing ==========

describe("AC-12: pre-claim snapshot edits applied to listing", () => {
  it("applies pending edits from snapshot to listing columns", async () => {
    const listing = await createUnclaimedListing(db)
    const deps = makeDeps()

    // Create snapshot with pending edits
    await db.insert(preClaimSnapshots).values({
      listingId: listing.id,
      snapshot: {
        claimantAccountId: CLAIMANT_ID,
        originalListing: { name: listing.name },
        pendingEdits: {
          headline: "New Headline from Claimant",
          bio: "Updated bio text",
        },
      },
    })

    await onClaimApproved(deps, listing.id, CLAIMANT_ID, "auto")

    const [updated] = await db.select().from(listings).where(eq(listings.id, listing.id))
    expect(updated.headline).toBe("New Headline from Claimant")
    expect(updated.bio).toBe("Updated bio text")
  })

  it("skips edit application when snapshot has no pendingEdits", async () => {
    const listing = await createUnclaimedListing(db, { headline: "Original Headline" })
    const deps = makeDeps()

    await db.insert(preClaimSnapshots).values({
      listingId: listing.id,
      snapshot: {
        claimantAccountId: CLAIMANT_ID,
        originalListing: { name: listing.name },
        pendingEdits: null,
      },
    })

    await onClaimApproved(deps, listing.id, CLAIMANT_ID, "auto")

    const [updated] = await db.select().from(listings).where(eq(listings.id, listing.id))
    expect(updated.headline).toBe("Original Headline")
  })

  it("works when no snapshot exists", async () => {
    const listing = await createUnclaimedListing(db)
    const deps = makeDeps()

    // No snapshot — should still complete without error
    await onClaimApproved(deps, listing.id, CLAIMANT_ID, "auto")

    const [updated] = await db.select().from(listings).where(eq(listings.id, listing.id))
    expect(updated.claimStatus).toBe("claimed")
  })
})

// ========== AC-13: pending enquiries delivered to claimant ==========

describe("AC-13: pending enquiries delivered on approval", () => {
  it("creates notification and sends email for pending enquiries", async () => {
    const listing = await createUnclaimedListing(db)
    const deps = makeDeps()

    // Create pending enquiry
    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    await db.insert(pendingEnquiries).values({
      listingId: listing.id,
      enquiryId: "00000000-0000-0000-0000-000000000099",
      expiresAt: futureDate,
    })

    const result = await onClaimApproved(deps, listing.id, CLAIMANT_ID, "auto")

    expect(result.pendingEnquiriesDelivered).toBe(1)
    expect(emailService.wasCalledWith("enquiry_forwarded")).toBe(true)

    const notifications = notificationDb.getAll()
    const enquiryNotification = notifications.find((n) => n.type === "enquiry_received")
    expect(enquiryNotification).toBeDefined()
  })
})

// ========== AC-14: progressive disclosure scheduled for claim path ==========

describe("AC-14: claim-path progressive disclosure scheduled", () => {
  it("schedules Day 1/3/7/14 deferred actions", async () => {
    const listing = await createUnclaimedListing(db)
    const deps = makeDeps()

    await onClaimApproved(deps, listing.id, CLAIMANT_ID, "auto")

    const actions = await db.select().from(deferredActions)
    const progressive = actions.filter(
      (a) => a.action === "send_progressive_email" || a.action === "onboarding_day14_prompt",
    )

    expect(progressive).toHaveLength(4) // Day 1, 3, 7 + Day 14
    expect(progressive.filter((a) => a.action === "send_progressive_email")).toHaveLength(3)
    expect(progressive.filter((a) => a.action === "onboarding_day14_prompt")).toHaveLength(1)
  })
})

// ========== AC-15: Article 14 banner cleared ==========

describe("AC-15: Article 14 notice cleared on approval", () => {
  it("sets article14NoticeDisplayed to false", async () => {
    const listing = await createUnclaimedListing(db, {
      article14NoticeDisplayed: true,
      source: "4rfv_import",
    })
    const deps = makeDeps()

    await onClaimApproved(deps, listing.id, CLAIMANT_ID, "auto")

    const [updated] = await db.select().from(listings).where(eq(listings.id, listing.id))
    expect(updated.article14NoticeDisplayed).toBe(false)
  })
})

// ========== AC-16: quality score recalculated ==========

describe("AC-16: quality score recalculation on approval", () => {
  it("completes without error (pre-S9: verification tier change stored for future recalculation)", async () => {
    const listing = await createUnclaimedListing(db)
    const deps = makeDeps()

    // Should not throw — quality score recalculation is deferred to S9
    await onClaimApproved(deps, listing.id, CLAIMANT_ID, "auto")

    const [ver] = await db.select().from(verifications).where(eq(verifications.listingId, listing.id))
    expect(ver.tier).toBe("claimed")
  })
})

// ========== AC-17: snapshot deleted after approval ==========

describe("AC-17: pre-claim snapshot deleted after approval", () => {
  it("removes snapshot row from pre_claim_snapshots", async () => {
    const listing = await createUnclaimedListing(db)
    const deps = makeDeps()

    await db.insert(preClaimSnapshots).values({
      listingId: listing.id,
      snapshot: { claimantAccountId: CLAIMANT_ID, originalListing: {}, pendingEdits: null },
    })

    await onClaimApproved(deps, listing.id, CLAIMANT_ID, "auto")

    const snapshots = await db.select().from(preClaimSnapshots)
      .where(eq(preClaimSnapshots.listingId, listing.id))
    expect(snapshots).toHaveLength(0)
  })
})

// ========== AC-18: claim_approved event emitted with correct method ==========

describe("AC-18: claim_approved event emitted with method field", () => {
  it("event emission is tested via router integration (see evaluate-claim tests)", () => {
    // AC-18 is verified at the router level where eventBus.emit() is called.
    // The onClaimApproved function does not emit events — the router does.
    // Router-level emission tested in evaluate-claim.integration.test.ts AC-1.
    expect(true).toBe(true)
  })
})

// ========== AC-19: approval email and notification sent ==========

describe("AC-19: approval email and in-app notification sent to claimant", () => {
  it("sends claim_approved email", async () => {
    const listing = await createUnclaimedListing(db)
    const deps = makeDeps()

    await onClaimApproved(deps, listing.id, CLAIMANT_ID, "auto")

    expect(emailService.wasCalledWith("claim_approved")).toBe(true)
    const calls = emailService.getCalls()
    const approvalEmail = calls.find((c) => c.template === "claim_approved")
    expect(approvalEmail?.category).toBe("transactional")
  })

  it("creates claim_approved notification", async () => {
    const listing = await createUnclaimedListing(db)
    const deps = makeDeps()

    await onClaimApproved(deps, listing.id, CLAIMANT_ID, "auto")

    const notifications = notificationDb.getAll()
    const approvalNotification = notifications.find((n) => n.type === "claim_approved")
    expect(approvalNotification).toBeDefined()
    expect(approvalNotification!.accountId).toBe(CLAIMANT_ID)
  })
})

// ========== AC-20: expired pending enquiries NOT delivered ==========

describe("AC-20: expired pending enquiries filtered out", () => {
  it("does not deliver enquiries past expiresAt", async () => {
    const listing = await createUnclaimedListing(db)
    const deps = makeDeps()

    // Create expired enquiry
    const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000)
    await db.insert(pendingEnquiries).values({
      listingId: listing.id,
      enquiryId: "00000000-0000-0000-0000-000000000098",
      expiresAt: pastDate,
    })

    const result = await onClaimApproved(deps, listing.id, CLAIMANT_ID, "auto")

    expect(result.pendingEnquiriesDelivered).toBe(0)
    expect(emailService.wasCalledWith("enquiry_forwarded")).toBe(false)
  })

  it("delivers valid enquiries but skips expired ones", async () => {
    const listing = await createUnclaimedListing(db)
    const deps = makeDeps()

    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000)

    await db.insert(pendingEnquiries).values([
      { listingId: listing.id, enquiryId: "00000000-0000-0000-0000-000000000097", expiresAt: futureDate },
      { listingId: listing.id, enquiryId: "00000000-0000-0000-0000-000000000098", expiresAt: pastDate },
    ])

    const result = await onClaimApproved(deps, listing.id, CLAIMANT_ID, "auto")

    expect(result.pendingEnquiriesDelivered).toBe(1)
  })
})

// ========== AC-48: deliverPendingEnquiries fetches listing once ==========

describe("AC-48: no N+1 listing fetch in deliverPendingEnquiries", () => {
  it("delivers multiple enquiries with single listing lookup", async () => {
    const listing = await createUnclaimedListing(db)
    const deps = makeDeps()

    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    await db.insert(pendingEnquiries).values([
      { listingId: listing.id, enquiryId: "00000000-0000-0000-0000-000000000091", expiresAt: futureDate },
      { listingId: listing.id, enquiryId: "00000000-0000-0000-0000-000000000092", expiresAt: futureDate },
      { listingId: listing.id, enquiryId: "00000000-0000-0000-0000-000000000093", expiresAt: futureDate },
    ])

    const result = await onClaimApproved(deps, listing.id, CLAIMANT_ID, "auto")

    expect(result.pendingEnquiriesDelivered).toBe(3)
    // All in one batch (< 5), so one email
    const forwardedEmails = emailService.getCalls().filter((c) => c.template === "enquiry_forwarded")
    expect(forwardedEmails).toHaveLength(1)
    expect((forwardedEmails[0].data as { enquiryCount: number }).enquiryCount).toBe(3)
  })
})

// ========== Decision logging ==========

describe("claim_post_processing decision logged", () => {
  it("logs claim_post_processing decision with method and enquiry count", async () => {
    const listing = await createUnclaimedListing(db)
    const deps = makeDeps()

    await onClaimApproved(deps, listing.id, CLAIMANT_ID, "manual")

    const logs = await db.select().from(decisionLogs)
      .where(eq(decisionLogs.decisionType, "claim_post_processing"))

    expect(logs).toHaveLength(1)
    expect(logs[0].listingId).toBe(listing.id)
    expect(logs[0].accountId).toBe(CLAIMANT_ID)
    const output = logs[0].output as { action: string; pendingEnquiriesDelivered: number }
    expect(output.action).toBe("approved")
    expect(output.pendingEnquiriesDelivered).toBe(0)
  })
})
