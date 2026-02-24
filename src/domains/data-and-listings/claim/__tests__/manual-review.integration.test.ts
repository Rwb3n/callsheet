// CS-WORK-032: manual review integration tests
// AC-26: TaskSpec checklist items
// AC-27: resolveManualReview(approve) triggers onClaimApproved pipeline
// AC-28: resolveManualReview(reject) triggers onClaimRejected pipeline
// AC-29: resolveManualReview on invalid claimStatus throws BAD_REQUEST
// AC-30: decision logged with reviewer's accountId

import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest"
import { eq } from "drizzle-orm"
import { getTestDb, resetDb, closeTestDb } from "@/db/test-utils"
import {
  seedTestUser,
  createUnclaimedListing,
  createSchedulerDb,
  createDecisionLogDb,
  InMemoryNotificationDb,
  emptyConsumerMatrix,
} from "@/db/test-fixtures"
import {
  listings,
  verifications,
  preClaimSnapshots,
} from "@/db/schema/data-and-listings"
import { decisionLogs } from "@/db/schema/shared"
import { InMemoryEmailService, clearTemplates } from "@/lib/email"
import { registerAllS3Templates } from "@/domains/data-and-listings/claim/email-templates"
import { registerEnquiryForwardedTemplate } from "@/lib/onboarding/email-templates"
import {
  buildManualReviewTaskSpec,
  buildDisputeTaskSpec,
  onManualReviewComplete,
} from "@/domains/data-and-listings/claim/manual-review"
import type { ManualReviewDeps } from "@/domains/data-and-listings/claim/manual-review"
import { InProcessEventBus, createWaitUntilCollector } from "@/lib/events"

let db: ReturnType<typeof getTestDb>

const CLAIMANT_ID = "00000000-0000-0000-0000-000000000040"
const CLAIMANT_EMAIL = "claimant@example.com"
const REVIEWER_ID = "00000000-0000-0000-0000-000000000041"
const EXISTING_OWNER_ID = "00000000-0000-0000-0000-000000000042"

let emailService: InMemoryEmailService
let notificationDb: InMemoryNotificationDb

function makeDeps(): ManualReviewDeps {
  emailService = new InMemoryEmailService()
  notificationDb = new InMemoryNotificationDb()
  const { waitUntilFn } = createWaitUntilCollector()
  return {
    db,
    schedulerDb: createSchedulerDb(db),
    decisionLogDb: createDecisionLogDb(db),
    emailService,
    notificationDb,
    eventBus: new InProcessEventBus({
      logError: async () => {},
      consumerMatrix: emptyConsumerMatrix,
    }),
    waitUntilFn,
  }
}

beforeAll(() => {
  db = getTestDb()
})

beforeEach(async () => {
  await resetDb()
  clearTemplates()
  registerAllS3Templates()
  registerEnquiryForwardedTemplate()
  await seedTestUser(db, CLAIMANT_ID, CLAIMANT_EMAIL)
  await seedTestUser(db, REVIEWER_ID)
  await seedTestUser(db, EXISTING_OWNER_ID)
})

afterAll(async () => {
  await closeTestDb()
})

// Helper: create listing with pending_review + snapshot
async function createPendingReviewListing() {
  const listing = await createUnclaimedListing(db, {
    claimStatus: "pending_review",
  })
  await db.insert(preClaimSnapshots).values({
    listingId: listing.id,
    snapshot: {
      claimantAccountId: CLAIMANT_ID,
      originalListing: { name: listing.name },
      pendingEdits: null,
    },
  })
  return listing
}

// Helper: create listing with disputed status + snapshot
async function createDisputedListing() {
  const listing = await createUnclaimedListing(db, {
    claimStatus: "disputed",
    accountId: EXISTING_OWNER_ID,
  })
  await db.insert(preClaimSnapshots).values({
    listingId: listing.id,
    snapshot: {
      claimantAccountId: CLAIMANT_ID,
      originalListing: { name: listing.name },
      pendingEdits: null,
    },
  })
  return listing
}

// ========== AC-26: manual review TaskSpec includes 5 checklist items ==========

describe("AC-26: manual review TaskSpec checklist", () => {
  it("buildManualReviewTaskSpec includes all 5 checklist items", () => {
    const spec = buildManualReviewTaskSpec(
      { id: "l1", name: "Test Co", entityType: "company", companiesHouseNumber: "12345678", accountId: null },
      { accountId: CLAIMANT_ID, claimEmail: "test@example.com", evidenceUrls: [] },
      "partial_match",
    )
    expect(spec.checklist).toHaveLength(5)
    expect(spec.checklist[0]).toContain("director, partner, or authorised representative")
    expect(spec.checklist[1]).toContain("CH director list")
    expect(spec.checklist[2]).toContain("sole trader")
    expect(spec.checklist[3]).toContain("domain ownership")
    expect(spec.checklist[4]).toContain("red flags")
  })

  it("buildDisputeTaskSpec has high priority and 5 checklist items", () => {
    const spec = buildDisputeTaskSpec(
      { id: "l1", name: "Test Co", entityType: "company", companiesHouseNumber: null, accountId: EXISTING_OWNER_ID },
      { accountId: CLAIMANT_ID, claimEmail: "test@example.com", evidenceUrls: [] },
    )
    expect(spec.priority).toBe("high")
    expect(spec.checklist).toHaveLength(5)
    expect(spec.context.existingClaimantAccountId).toBe(EXISTING_OWNER_ID)
    expect(spec.context.newClaimantAccountId).toBe(CLAIMANT_ID)
  })
})

// ========== AC-27: resolveManualReview(approve) triggers onClaimApproved ==========

describe("AC-27: resolveManualReview approve triggers full approval pipeline", () => {
  it("sets claimStatus to claimed and accountId to claimant", async () => {
    const listing = await createPendingReviewListing()
    const deps = makeDeps()

    await onManualReviewComplete(deps, listing.id, "approve", undefined, REVIEWER_ID)

    const [updated] = await db.select().from(listings).where(eq(listings.id, listing.id))
    expect(updated.claimStatus).toBe("claimed")
    expect(updated.accountId).toBe(CLAIMANT_ID)
  })

  it("updates verification tier to claimed", async () => {
    const listing = await createPendingReviewListing()
    const deps = makeDeps()

    await onManualReviewComplete(deps, listing.id, "approve", undefined, REVIEWER_ID)

    const [ver] = await db.select().from(verifications).where(eq(verifications.listingId, listing.id))
    expect(ver.tier).toBe("claimed")
  })

  it("sends claim_approved email", async () => {
    const listing = await createPendingReviewListing()
    const deps = makeDeps()

    await onManualReviewComplete(deps, listing.id, "approve", undefined, REVIEWER_ID)

    const sent = emailService.getCalls()
    const approvedEmails = sent.filter(e => e.template === "claim_approved")
    expect(approvedEmails.length).toBeGreaterThanOrEqual(1)
  })

  it("deletes the snapshot after approval", async () => {
    const listing = await createPendingReviewListing()
    const deps = makeDeps()

    await onManualReviewComplete(deps, listing.id, "approve", undefined, REVIEWER_ID)

    const snapshots = await db.select().from(preClaimSnapshots).where(eq(preClaimSnapshots.listingId, listing.id))
    expect(snapshots).toHaveLength(0)
  })
})

// ========== AC-28: resolveManualReview(reject) triggers onClaimRejected ==========

describe("AC-28: resolveManualReview reject triggers full rejection pipeline", () => {
  it("resets claimStatus to unclaimed for pending_review listing", async () => {
    const listing = await createPendingReviewListing()
    const deps = makeDeps()

    await onManualReviewComplete(deps, listing.id, "reject", "Insufficient evidence", REVIEWER_ID)

    const [updated] = await db.select().from(listings).where(eq(listings.id, listing.id))
    expect(updated.claimStatus).toBe("unclaimed")
  })

  it("resets claimStatus to claimed for disputed listing (existing claimant upheld)", async () => {
    const listing = await createDisputedListing()
    const deps = makeDeps()

    await onManualReviewComplete(deps, listing.id, "reject", "Existing claimant upheld", REVIEWER_ID)

    const [updated] = await db.select().from(listings).where(eq(listings.id, listing.id))
    expect(updated.claimStatus).toBe("claimed")
  })

  it("sends claim_rejected email", async () => {
    const listing = await createPendingReviewListing()
    const deps = makeDeps()

    await onManualReviewComplete(deps, listing.id, "reject", "Bad evidence", REVIEWER_ID)

    const sent = emailService.getCalls()
    const rejectedEmails = sent.filter(e => e.template === "claim_rejected")
    expect(rejectedEmails.length).toBeGreaterThanOrEqual(1)
  })

  it("deletes the snapshot after rejection", async () => {
    const listing = await createPendingReviewListing()
    const deps = makeDeps()

    await onManualReviewComplete(deps, listing.id, "reject", "Bad evidence", REVIEWER_ID)

    const snapshots = await db.select().from(preClaimSnapshots).where(eq(preClaimSnapshots.listingId, listing.id))
    expect(snapshots).toHaveLength(0)
  })
})

// ========== AC-29: resolveManualReview on invalid claimStatus ==========

describe("AC-29: resolveManualReview on invalid claimStatus throws", () => {
  it("throws for claimed listing", async () => {
    const listing = await createUnclaimedListing(db, {
      claimStatus: "claimed",
      accountId: EXISTING_OWNER_ID,
    })
    // No snapshot needed — should fail before reading it
    const deps = makeDeps()

    await expect(
      onManualReviewComplete(deps, listing.id, "approve", undefined, REVIEWER_ID),
    ).rejects.toThrow("claimStatus is claimed, expected pending_review or disputed")
  })

  it("throws for unclaimed listing", async () => {
    const listing = await createUnclaimedListing(db)
    const deps = makeDeps()

    await expect(
      onManualReviewComplete(deps, listing.id, "approve", undefined, REVIEWER_ID),
    ).rejects.toThrow("claimStatus is unclaimed, expected pending_review or disputed")
  })
})

// ========== AC-30: decision logged with reviewer's accountId ==========

describe("AC-30: manual review decision logged with reviewer accountId", () => {
  it("logs decision with reviewerAccountId in inputs", async () => {
    const listing = await createPendingReviewListing()
    const deps = makeDeps()

    await onManualReviewComplete(deps, listing.id, "approve", "Looks good", REVIEWER_ID)

    const logs = await db.select().from(decisionLogs)
    const reviewLog = logs.find(
      l => l.decisionType === "claim_evaluation" && (l.inputs as Record<string, unknown>).reviewerAccountId === REVIEWER_ID,
    )
    expect(reviewLog).toBeDefined()
    expect((reviewLog!.inputs as Record<string, unknown>).decision).toBe("approve")
    expect((reviewLog!.inputs as Record<string, unknown>).reviewNotes).toBe("Looks good")
  })

  it("logs rejection decision with reviewer accountId", async () => {
    const listing = await createPendingReviewListing()
    const deps = makeDeps()

    await onManualReviewComplete(deps, listing.id, "reject", "Not convincing", REVIEWER_ID)

    const logs = await db.select().from(decisionLogs)
    const reviewLog = logs.find(
      l => l.decisionType === "claim_evaluation" && (l.inputs as Record<string, unknown>).reviewerAccountId === REVIEWER_ID,
    )
    expect(reviewLog).toBeDefined()
    expect((reviewLog!.output as Record<string, unknown>).action).toBe("rejected")
  })
})
