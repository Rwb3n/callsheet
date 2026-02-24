// CS-WORK-030: evaluateClaim decision engine integration tests
// 14 AC: AC-1 through AC-10, AC-42, AC-43, AC-45, AC-46

import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest"
import { eq } from "drizzle-orm"
import { getTestDb, resetDb, closeTestDb } from "@/db/test-utils"
import {
  seedUsers,
  makeSession,
  ctx,
  createSchedulerDb,
  createDecisionLogDb,
  createUnclaimedListing,
} from "@/db/test-fixtures"
import {
  listings,
  preClaimSnapshots,
} from "@/db/schema/data-and-listings"
import { deferredActions, decisionLogs } from "@/db/schema/shared"
import { accountProfiles } from "@/db/schema/accounts"
import { createClaimRouter } from "@/server/routers/claim"
import type { ClaimRouterDeps } from "@/server/routers/claim"
import { evaluateClaim, emailDomainMatches } from "@/domains/data-and-listings/claim/evaluate-claim"
import type { CompaniesHouseService } from "@/lib/services/types"
import { clearTemplates, hasTemplate, renderTemplate } from "@/lib/email/templates"
import { registerAllS3Templates } from "@/domains/data-and-listings/claim/email-templates"
import { registerEnquiryForwardedTemplate } from "@/lib/onboarding/email-templates"
import { InProcessEventBus, createWaitUntilCollector } from "@/lib/events"
import { InMemoryEmailService } from "@/lib/email"
import { InMemoryNotificationDb, emptyConsumerMatrix } from "@/db/test-fixtures"
import { TRPCError } from "@trpc/server"

let db: ReturnType<typeof getTestDb>

// Must be valid UUID — decision_logs.accountId is uuid type
const CLAIMER_ID = "00000000-0000-0000-0000-000000000010"
const CLAIMER_EMAIL = "claimer@seedco.com"
const OTHER_OWNER_ID = "00000000-0000-0000-0000-000000000020"

// --- Mock Companies House service ---

function mockCH(
  overrides?: Partial<CompaniesHouseService>,
): CompaniesHouseService {
  return {
    lookup: async () => ({ found: false }),
    ...overrides,
  }
}

function makeDeps(ch?: Partial<CompaniesHouseService>): ClaimRouterDeps {
  const { waitUntilFn } = createWaitUntilCollector()
  return {
    db,
    schedulerDb: createSchedulerDb(db),
    decisionLogDb: createDecisionLogDb(db),
    companiesHouse: mockCH(ch),
    eventBus: new InProcessEventBus({
      logError: async () => {},
      consumerMatrix: emptyConsumerMatrix,
    }),
    waitUntilFn,
    emailService: new InMemoryEmailService(),
    notificationDb: new InMemoryNotificationDb(),
  }
}

beforeAll(() => {
  db = getTestDb()
})

beforeEach(async () => {
  await resetDb()
  // Ensure claim + enquiry templates registered (auto-approve sends email)
  registerAllS3Templates()
  registerEnquiryForwardedTemplate()
  await seedUsers(db, [
    { id: CLAIMER_ID, name: "Claimer", email: CLAIMER_EMAIL },
    { id: OTHER_OWNER_ID, name: "Existing Owner", email: "owner@other.com" },
  ])
  await db.insert(accountProfiles).values([
    { accountId: CLAIMER_ID, fullName: "Claimer" },
    { accountId: OTHER_OWNER_ID, fullName: "Existing Owner" },
  ])
})

afterAll(async () => {
  await closeTestDb()
})

// ========== AC-1: auto-approve on email domain match (no CH) ==========

describe("AC-1: auto-approve when claimEmail domain matches websiteUrl domain", () => {
  it("auto-approves when email domain matches listing website (no CH number)", async () => {
    const listing = await createUnclaimedListing(db, {
      websiteUrl: "https://www.seedco.com",
    })

    const deps = makeDeps()
    const router = createClaimRouter(deps)
    const session = makeSession({ accountId: CLAIMER_ID, email: CLAIMER_EMAIL })
    const caller = router.createCaller(ctx(session))

    const result = await caller.submitClaim({
      listingId: listing.id,
      claimEmail: "admin@seedco.com",
    })

    expect(result.status).toBe("approved")
  })

  it("domain matching is case-insensitive and strips www", async () => {
    const listing = await createUnclaimedListing(db, {
      websiteUrl: "https://WWW.SeedCo.COM",
    })

    const deps = makeDeps()
    const router = createClaimRouter(deps)
    const session = makeSession({ accountId: CLAIMER_ID, email: CLAIMER_EMAIL })
    const caller = router.createCaller(ctx(session))

    const result = await caller.submitClaim({
      listingId: listing.id,
      claimEmail: "admin@SEEDCO.com",
    })

    expect(result.status).toBe("approved")
  })
})

// ========== AC-2: auto-reject on dissolved CH entity ==========

describe("AC-2: auto-reject when CH number maps to dissolved entity", () => {
  it("auto-rejects dissolved company even if email domain matches [S3-ST-1]", async () => {
    const listing = await createUnclaimedListing(db, {
      websiteUrl: "https://seedco.com",
    })

    const deps = makeDeps({
      lookup: async () => ({ found: true, status: "dissolved", name: "Seed Co Ltd" }),
    })
    const router = createClaimRouter(deps)
    const session = makeSession({ accountId: CLAIMER_ID, email: CLAIMER_EMAIL })
    const caller = router.createCaller(ctx(session))

    const result = await caller.submitClaim({
      listingId: listing.id,
      companiesHouseNumber: "12345678",
      claimEmail: "admin@seedco.com",
    })

    expect(result.status).toBe("rejected")
    expect((result as { reasons: string[] }).reasons).toContain(
      "entity dissolved per Companies House",
    )
  })
})

// ========== AC-3: manual review when CH active but no domain match ==========

describe("AC-3: routes to manual review when CH active but no domain match", () => {
  it("queues manual review with reason", async () => {
    const listing = await createUnclaimedListing(db, {
      websiteUrl: "https://differentdomain.com",
    })

    const deps = makeDeps({
      lookup: async () => ({ found: true, status: "active", name: "Seed Co Ltd" }),
    })
    const router = createClaimRouter(deps)
    const session = makeSession({ accountId: CLAIMER_ID, email: CLAIMER_EMAIL })
    const caller = router.createCaller(ctx(session))

    const result = await caller.submitClaim({
      listingId: listing.id,
      companiesHouseNumber: "12345678",
      claimEmail: "admin@seedco.com",
    })

    expect(result.status).toBe("pending_review")
  })
})

// ========== AC-4: manual review for freelancer without CH number ==========

describe("AC-4: routes to manual review for freelancer without CH number", () => {
  it("queues manual review for freelancer sole trader", async () => {
    const listing = await createUnclaimedListing(db, {
      entityType: "freelancer",
      websiteUrl: null,
    })

    const deps = makeDeps()
    const router = createClaimRouter(deps)
    const session = makeSession({ accountId: CLAIMER_ID, email: CLAIMER_EMAIL })
    const caller = router.createCaller(ctx(session))

    const result = await caller.submitClaim({
      listingId: listing.id,
    })

    expect(result.status).toBe("pending_review")

    // claimStatus should be pending_review
    const [updated] = await db
      .select()
      .from(listings)
      .where(eq(listings.id, listing.id))
    expect(updated.claimStatus).toBe("pending_review")
  })
})

// ========== AC-5: optimistic lock prevents concurrent claim evaluation ==========

describe("AC-5: optimistic lock prevents concurrent claim evaluation", () => {
  it("second concurrent claim gets CONFLICT", async () => {
    const listing = await createUnclaimedListing(db)

    // First claim succeeds (manual review path — no domain match, no CH)
    const deps1 = makeDeps()
    const router1 = createClaimRouter(deps1)
    const session1 = makeSession({ accountId: CLAIMER_ID, email: CLAIMER_EMAIL })
    const caller1 = router1.createCaller(ctx(session1))

    await caller1.submitClaim({
      listingId: listing.id,
      claimEmail: "different@domain.com",
    })

    // Listing is now pending_review
    const [afterFirst] = await db
      .select()
      .from(listings)
      .where(eq(listings.id, listing.id))
    expect(afterFirst.claimStatus).toBe("pending_review")

    // Second claim should get CONFLICT (pending_review blocks)
    const deps2 = makeDeps()
    const router2 = createClaimRouter(deps2)
    const caller2 = router2.createCaller(ctx(session1))

    await expect(
      caller2.submitClaim({
        listingId: listing.id,
        claimEmail: "another@domain.com",
      }),
    ).rejects.toThrow(TRPCError)
  })
})

// ========== AC-6: claim on pending_review listing returns CONFLICT ==========

describe("AC-6: claim on pending_review listing returns CONFLICT", () => {
  it("throws CONFLICT for pending_review listing", async () => {
    const listing = await createUnclaimedListing(db, {
      claimStatus: "pending_review",
      accountId: OTHER_OWNER_ID,
    })

    const deps = makeDeps()
    const router = createClaimRouter(deps)
    const session = makeSession({ accountId: CLAIMER_ID, email: CLAIMER_EMAIL })
    const caller = router.createCaller(ctx(session))

    await expect(
      caller.submitClaim({ listingId: listing.id }),
    ).rejects.toThrow(TRPCError)

    try {
      await caller.submitClaim({ listingId: listing.id })
    } catch (e) {
      expect((e as TRPCError).code).toBe("CONFLICT")
    }
  })
})

// ========== AC-7: claim on claimed listing transitions to disputed ==========

describe("AC-7: claim on claimed listing transitions to disputed with dispute", () => {
  it("sets claimStatus to disputed", async () => {
    const listing = await createUnclaimedListing(db, {
      claimStatus: "claimed",
      accountId: OTHER_OWNER_ID,
    })

    const deps = makeDeps()
    const router = createClaimRouter(deps)
    const session = makeSession({ accountId: CLAIMER_ID, email: CLAIMER_EMAIL })
    const caller = router.createCaller(ctx(session))

    const result = await caller.submitClaim({ listingId: listing.id })

    expect(result.status).toBe("disputed")

    const [updated] = await db
      .select()
      .from(listings)
      .where(eq(listings.id, listing.id))
    expect(updated.claimStatus).toBe("disputed")
  })
})

// ========== AC-8: claim on suspended listing is auto-rejected ==========

describe("AC-8: claim on suspended listing is auto-rejected", () => {
  it("auto-rejects with reason", async () => {
    const listing = await createUnclaimedListing(db, {
      lifecycleStatus: "suspended",
    })

    const deps = makeDeps()
    const router = createClaimRouter(deps)
    const session = makeSession({ accountId: CLAIMER_ID, email: CLAIMER_EMAIL })
    const caller = router.createCaller(ctx(session))

    const result = await caller.submitClaim({ listingId: listing.id })

    expect(result.status).toBe("rejected")
    expect((result as { reasons: string[] }).reasons).toContain(
      "listing is suspended — cannot be claimed",
    )
  })
})

// ========== AC-9: every evaluateClaim produces a decision_logs row ==========

describe("AC-9: decision_logs row created for every claim evaluation", () => {
  it("logs claim_evaluation decision on auto-approve", async () => {
    const listing = await createUnclaimedListing(db, {
      websiteUrl: "https://seedco.com",
    })

    const deps = makeDeps()
    const router = createClaimRouter(deps)
    const session = makeSession({ accountId: CLAIMER_ID, email: CLAIMER_EMAIL })
    const caller = router.createCaller(ctx(session))

    await caller.submitClaim({
      listingId: listing.id,
      claimEmail: "admin@seedco.com",
    })

    const logs = await db
      .select()
      .from(decisionLogs)
      .where(eq(decisionLogs.decisionType, "claim_evaluation"))

    expect(logs).toHaveLength(1)
    expect(logs[0].domain).toBe("data-and-listings")
    expect(logs[0].listingId).toBe(listing.id)
    expect(logs[0].accountId).toBe(CLAIMER_ID)

    const output = logs[0].output as { action: string; confidence: number }
    expect(output.action).toBe("auto_approve")
    expect(output.confidence).toBe(0.9)
  })

  it("logs claim_evaluation decision on auto-reject", async () => {
    const listing = await createUnclaimedListing(db, {
      lifecycleStatus: "suspended",
    })

    const deps = makeDeps()
    const router = createClaimRouter(deps)
    const session = makeSession({ accountId: CLAIMER_ID, email: CLAIMER_EMAIL })
    const caller = router.createCaller(ctx(session))

    await caller.submitClaim({ listingId: listing.id })

    const logs = await db
      .select()
      .from(decisionLogs)
      .where(eq(decisionLogs.decisionType, "claim_evaluation"))

    expect(logs).toHaveLength(1)
    const output = logs[0].output as { action: string }
    expect(output.action).toBe("auto_reject")
  })

  it("logs claim_evaluation decision on manual review", async () => {
    const listing = await createUnclaimedListing(db, { websiteUrl: null })

    const deps = makeDeps()
    const router = createClaimRouter(deps)
    const session = makeSession({ accountId: CLAIMER_ID, email: CLAIMER_EMAIL })
    const caller = router.createCaller(ctx(session))

    await caller.submitClaim({
      listingId: listing.id,
      claimEmail: "someone@different.com",
    })

    const logs = await db
      .select()
      .from(decisionLogs)
      .where(eq(decisionLogs.decisionType, "claim_evaluation"))

    expect(logs).toHaveLength(1)
    const output = logs[0].output as { action: string }
    expect(output.action).toBe("queue_manual_review")
  })
})

// ========== AC-10: evaluateClaim calls CompaniesHouseService.lookup ==========

describe("AC-10: evaluateClaim calls CompaniesHouseService.lookup via mock", () => {
  it("calls lookup when companiesHouseNumber is provided", async () => {
    let lookupCalled = false
    let lookupArg: string | null = null

    const listing = await createUnclaimedListing(db)

    const deps = makeDeps({
      lookup: async (companyNumber) => {
        lookupCalled = true
        lookupArg = companyNumber
        return { found: true, status: "active", name: "Test Co" }
      },
    })
    const router = createClaimRouter(deps)
    const session = makeSession({ accountId: CLAIMER_ID, email: CLAIMER_EMAIL })
    const caller = router.createCaller(ctx(session))

    await caller.submitClaim({
      listingId: listing.id,
      companiesHouseNumber: "99887766",
      claimEmail: "admin@seedco.com",
    })

    expect(lookupCalled).toBe(true)
    expect(lookupArg).toBe("99887766")
  })

  it("does NOT call lookup when no companiesHouseNumber", async () => {
    let lookupCalled = false

    const listing = await createUnclaimedListing(db)

    const deps = makeDeps({
      lookup: async () => {
        lookupCalled = true
        return { found: false }
      },
    })
    const router = createClaimRouter(deps)
    const session = makeSession({ accountId: CLAIMER_ID, email: CLAIMER_EMAIL })
    const caller = router.createCaller(ctx(session))

    await caller.submitClaim({
      listingId: listing.id,
      claimEmail: "someone@different.com",
    })

    expect(lookupCalled).toBe(false)
  })
})

// ========== AC-42: S3 registers 4 email templates ==========

describe("AC-42: S3 registers 4 email templates at module init", () => {
  beforeEach(() => {
    clearTemplates()
  })

  it("registers all 4 S3 templates", () => {
    registerAllS3Templates()

    expect(hasTemplate("claim_approved")).toBe(true)
    expect(hasTemplate("claim_rejected")).toBe(true)
    expect(hasTemplate("claim_pending_review")).toBe(true)
    expect(hasTemplate("claim_dispute_notification")).toBe(true)
  })

  it("registration is idempotent (no error on re-register)", () => {
    registerAllS3Templates()
    registerAllS3Templates()

    expect(hasTemplate("claim_approved")).toBe(true)
  })
})

// ========== AC-43: claim_approved and claim_rejected are transactional ==========

describe("AC-43: claim_approved and claim_rejected emails are transactional", () => {
  beforeEach(() => {
    clearTemplates()
    registerAllS3Templates()
  })

  it("claim_approved template renders with subject and html", () => {
    const result = renderTemplate("claim_approved", {
      listingName: "Test Co",
      listingId: "abc-123",
    })

    expect(result.subject).toContain("approved")
    expect(result.html).toContain("Test Co")
  })

  it("claim_rejected template renders with reason", () => {
    const result = renderTemplate("claim_rejected", {
      listingName: "Test Co",
      reason: "dissolved entity",
    })

    expect(result.subject).toContain("not approved")
    expect(result.html).toContain("dissolved entity")
  })
})

// ========== AC-45: CH dissolution check precedes email domain match ==========

describe("AC-45: CH dissolution check precedes email domain match", () => {
  it("dissolved company with matching domain is rejected, not approved", async () => {
    const listing = await createUnclaimedListing(db, {
      websiteUrl: "https://seedco.com",
    })

    // CH says dissolved, but email domain matches
    const deps = makeDeps({
      lookup: async () => ({ found: true, status: "dissolved", name: "Seed Co Ltd" }),
    })
    const router = createClaimRouter(deps)
    const session = makeSession({ accountId: CLAIMER_ID, email: CLAIMER_EMAIL })
    const caller = router.createCaller(ctx(session))

    const result = await caller.submitClaim({
      listingId: listing.id,
      companiesHouseNumber: "12345678",
      claimEmail: "admin@seedco.com", // domain matches!
    })

    expect(result.status).toBe("rejected")
    expect((result as { reasons: string[] }).reasons).toContain(
      "entity dissolved per Companies House",
    )
  })

  it("active company with matching domain is approved", async () => {
    const listing = await createUnclaimedListing(db, {
      websiteUrl: "https://seedco.com",
    })

    const deps = makeDeps({
      lookup: async () => ({ found: true, status: "active", name: "Seed Co Ltd" }),
    })
    const router = createClaimRouter(deps)
    const session = makeSession({ accountId: CLAIMER_ID, email: CLAIMER_EMAIL })
    const caller = router.createCaller(ctx(session))

    const result = await caller.submitClaim({
      listingId: listing.id,
      companiesHouseNumber: "12345678",
      claimEmail: "admin@seedco.com",
    })

    expect(result.status).toBe("approved")
  })
})

// ========== AC-46: snapshot stores claimantAccountId + cleanup cancellation ==========

describe("AC-46: submitClaim stores claimantAccountId in snapshot and cancels cleanup", () => {
  it("snapshot JSONB includes claimantAccountId [S3-ST-5]", async () => {
    // Use manual review path so snapshot persists (auto-approve deletes it)
    const listing = await createUnclaimedListing(db, { websiteUrl: null })

    const deps = makeDeps()
    const router = createClaimRouter(deps)
    const session = makeSession({ accountId: CLAIMER_ID, email: CLAIMER_EMAIL })
    const caller = router.createCaller(ctx(session))

    await caller.submitClaim({
      listingId: listing.id,
      claimEmail: "someone@different.com",
    })

    const [snapshot] = await db
      .select()
      .from(preClaimSnapshots)
      .where(eq(preClaimSnapshots.listingId, listing.id))

    expect(snapshot).toBeDefined()
    const data = snapshot.snapshot as { claimantAccountId: string }
    expect(data.claimantAccountId).toBe(CLAIMER_ID)
  })

  it("no pre_claim_snapshot_cleanup is pending after submission [S3-ST-20]", async () => {
    // Use manual review path to test cleanup cancellation without auto-approve deleting snapshot
    const listing = await createUnclaimedListing(db, { websiteUrl: null })

    const deps = makeDeps()
    const router = createClaimRouter(deps)
    const session = makeSession({ accountId: CLAIMER_ID, email: CLAIMER_EMAIL })
    const caller = router.createCaller(ctx(session))

    await caller.submitClaim({
      listingId: listing.id,
      claimEmail: "someone@different.com",
    })

    const cleanups = await db
      .select()
      .from(deferredActions)
      .where(eq(deferredActions.action, "pre_claim_snapshot_cleanup"))

    const pending = cleanups.filter(a => a.status === "pending")
    expect(pending).toHaveLength(0)
  })
})

// ========== emailDomainMatches unit tests ==========

describe("emailDomainMatches utility function", () => {
  it("matches email domain to website domain", () => {
    expect(emailDomainMatches("user@example.com", "https://example.com")).toBe(true)
  })

  it("strips www prefix from website", () => {
    expect(emailDomainMatches("user@example.com", "https://www.example.com")).toBe(true)
  })

  it("is case-insensitive", () => {
    expect(emailDomainMatches("user@Example.COM", "https://EXAMPLE.com")).toBe(true)
  })

  it("rejects non-matching domains", () => {
    expect(emailDomainMatches("user@other.com", "https://example.com")).toBe(false)
  })

  it("handles invalid URL gracefully", () => {
    expect(emailDomainMatches("user@example.com", "not-a-url")).toBe(false)
  })

  it("handles invalid email gracefully", () => {
    expect(emailDomainMatches("not-an-email", "https://example.com")).toBe(false)
  })
})
