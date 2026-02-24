// CS-WORK-032: competing claims integration tests
// AC-31: competing claim sets disputed + creates dispute TaskSpec
// AC-32: existing claimant receives dispute notification
// AC-33: dispute_escalation_check no-ops if dispute resolved
// AC-34: unresolved dispute after 14 days suspends listing + creates principal escalation TaskSpec
// AC-35: dispute resolved for new claimant → full onClaimApproved pipeline
// AC-36: dispute resolved for existing claimant → restores claimed, notifies new claimant
// AC-44: S3 registers dispute_escalation_check handler
// AC-47: dispute_escalation_check reads actual lifecycleStatus

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
import { InMemoryEmailService, clearTemplates } from "@/lib/email"
import { registerAllS3Templates } from "@/domains/data-and-listings/claim/email-templates"
import { registerEnquiryForwardedTemplate } from "@/lib/onboarding/email-templates"
import { buildDisputeTaskSpec } from "@/domains/data-and-listings/claim/manual-review"
import {
  registerDisputeEscalationHandler,
} from "@/domains/data-and-listings/claim/competing-claim"
import type { DisputeEscalationDeps } from "@/domains/data-and-listings/claim/competing-claim"
import { onManualReviewComplete } from "@/domains/data-and-listings/claim/manual-review"
import type { ManualReviewDeps } from "@/domains/data-and-listings/claim/manual-review"
import { ActionHandlerRegistry } from "@/lib/scheduler"
import { InProcessEventBus, createWaitUntilCollector } from "@/lib/events"

let db: ReturnType<typeof getTestDb>

const EXISTING_OWNER_ID = "00000000-0000-0000-0000-000000000050"
const NEW_CLAIMANT_ID = "00000000-0000-0000-0000-000000000051"
const REVIEWER_ID = "00000000-0000-0000-0000-000000000052"

let emailService: InMemoryEmailService
let notificationDb: InMemoryNotificationDb

function makeReviewDeps(): ManualReviewDeps {
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

function makeEscalationDeps(): DisputeEscalationDeps {
  const { waitUntilFn } = createWaitUntilCollector()
  return {
    db,
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
  await seedTestUser(db, EXISTING_OWNER_ID)
  await seedTestUser(db, NEW_CLAIMANT_ID)
  await seedTestUser(db, REVIEWER_ID)
})

afterAll(async () => {
  await closeTestDb()
})

// Helper: create a claimed listing with an existing owner
async function createClaimedListing() {
  return createUnclaimedListing(db, {
    claimStatus: "claimed",
    accountId: EXISTING_OWNER_ID,
  })
}

// Helper: create disputed listing with snapshot for new claimant
async function createDisputedListing() {
  const listing = await createUnclaimedListing(db, {
    claimStatus: "disputed",
    accountId: EXISTING_OWNER_ID,
  })
  await db.insert(preClaimSnapshots).values({
    listingId: listing.id,
    snapshot: {
      claimantAccountId: NEW_CLAIMANT_ID,
      originalListing: { name: listing.name },
      pendingEdits: null,
    },
  })
  return listing
}

// ========== AC-31: competing claim sets disputed + creates dispute TaskSpec ==========

describe("AC-31: competing claim creates dispute TaskSpec", () => {
  it("buildDisputeTaskSpec has high priority and includes both claimant IDs", () => {
    const spec = buildDisputeTaskSpec(
      { id: "l1", name: "Test Co", entityType: "company", companiesHouseNumber: null, accountId: EXISTING_OWNER_ID },
      { accountId: NEW_CLAIMANT_ID, claimEmail: "new@example.com", evidenceUrls: [] },
    )
    expect(spec.priority).toBe("high")
    expect(spec.domain).toBe("verification")
    expect(spec.context.existingClaimantAccountId).toBe(EXISTING_OWNER_ID)
    expect(spec.context.newClaimantAccountId).toBe(NEW_CLAIMANT_ID)
    expect(spec.checklist.length).toBeGreaterThanOrEqual(5)
  })
})

// ========== AC-32: existing claimant receives dispute notification ==========
// Note: notification sending is tested via the submitClaim route (CS-WORK-030 tests).
// Here we verify the dispute template is registered and usable.

describe("AC-32: dispute notification template available", () => {
  it("claim_dispute_notification template is registered", () => {
    const sent: Array<Record<string, unknown>> = []
    const service = new InMemoryEmailService()
    // Template registered in beforeEach via registerAllS3Templates
    // Verify by sending through the service (templates are module-level)
    expect(() => {
      service.send({
        to: "test@example.com",
        template: "claim_dispute_notification",
        data: { listingName: "Test Co", disputeContext: "Another party submitted a claim" },
        category: "transactional",
        accountId: EXISTING_OWNER_ID,
        listingId: "l1",
      })
    }).not.toThrow()
  })
})

// ========== AC-33: dispute_escalation_check no-ops if resolved ==========

describe("AC-33: dispute_escalation_check no-ops when dispute already resolved", () => {
  it("does not suspend listing when claimStatus is claimed (already resolved)", async () => {
    const listing = await createClaimedListing()
    const registry = new ActionHandlerRegistry()
    const deps = makeEscalationDeps()
    registerDisputeEscalationHandler(registry, deps)

    const handler = registry.get("dispute_escalation_check")!
    await (handler as (p: Record<string, unknown>) => Promise<void>)({
      listingId: listing.id,
      disputeTaskSpecId: "irrelevant",
    })

    const [updated] = await db.select().from(listings).where(eq(listings.id, listing.id))
    expect(updated.lifecycleStatus).toBe("active")
  })
})

// ========== AC-34: unresolved dispute suspends listing ==========

describe("AC-34: unresolved dispute after 14 days suspends listing", () => {
  it("suspends listing when claimStatus is still disputed", async () => {
    const listing = await createDisputedListing()
    const registry = new ActionHandlerRegistry()
    const deps = makeEscalationDeps()
    registerDisputeEscalationHandler(registry, deps)

    const handler = registry.get("dispute_escalation_check")!
    await (handler as (p: Record<string, unknown>) => Promise<void>)({
      listingId: listing.id,
      disputeTaskSpecId: crypto.randomUUID(),
    })

    const [updated] = await db.select().from(listings).where(eq(listings.id, listing.id))
    expect(updated.lifecycleStatus).toBe("suspended")
  })
})

// ========== AC-44: S3 registers 1 deferred action handler ==========

describe("AC-44: dispute_escalation_check handler registered", () => {
  it("registers handler successfully", () => {
    const registry = new ActionHandlerRegistry()
    const deps = makeEscalationDeps()
    registerDisputeEscalationHandler(registry, deps)
    expect(registry.has("dispute_escalation_check")).toBe(true)
  })
})

// ========== AC-47: handler reads actual lifecycleStatus ==========

describe("AC-47: dispute_escalation_check reads actual lifecycleStatus", () => {
  it("emits listing_suspended with non-active previousStatus if already inactive", async () => {
    const listing = await createUnclaimedListing(db, {
      claimStatus: "disputed",
      accountId: EXISTING_OWNER_ID,
      lifecycleStatus: "inactive",
    })
    await db.insert(preClaimSnapshots).values({
      listingId: listing.id,
      snapshot: {
        claimantAccountId: NEW_CLAIMANT_ID,
        originalListing: {},
        pendingEdits: null,
      },
    })

    let emittedPayload: Record<string, unknown> | null = null
    const { waitUntilFn } = createWaitUntilCollector()
    const eventBus = new InProcessEventBus({
      logError: async () => {},
      consumerMatrix: emptyConsumerMatrix,
    })

    // Capture the emitted event
    const originalEmit = eventBus.emit.bind(eventBus)
    eventBus.emit = async (type: string, payload: unknown, wuf: unknown) => {
      if (type === "listing_suspended") {
        emittedPayload = payload as Record<string, unknown>
      }
      return originalEmit(type as Parameters<typeof originalEmit>[0], payload as Parameters<typeof originalEmit>[1], wuf as Parameters<typeof originalEmit>[2])
    }

    const registry = new ActionHandlerRegistry()
    registerDisputeEscalationHandler(registry, { db, eventBus, waitUntilFn })

    const handler = registry.get("dispute_escalation_check")!
    await (handler as (p: Record<string, unknown>) => Promise<void>)({
      listingId: listing.id,
      disputeTaskSpecId: crypto.randomUUID(),
    })

    expect(emittedPayload).not.toBeNull()
    expect(emittedPayload!.previousStatus).toBe("inactive")
    expect(emittedPayload!.reason).toContain("unresolved competing claim")
  })
})

// ========== AC-35: dispute resolved for new claimant → full approval pipeline ==========

describe("AC-35: dispute resolved for new claimant transfers ownership", () => {
  it("transfers listing to new claimant via onClaimApproved", async () => {
    const listing = await createDisputedListing()
    const deps = makeReviewDeps()

    await onManualReviewComplete(deps, listing.id, "approve", "New claimant verified", REVIEWER_ID)

    const [updated] = await db.select().from(listings).where(eq(listings.id, listing.id))
    expect(updated.claimStatus).toBe("claimed")
    expect(updated.accountId).toBe(NEW_CLAIMANT_ID)
  })

  it("sets verification tier to claimed for new claimant", async () => {
    const listing = await createDisputedListing()
    const deps = makeReviewDeps()

    await onManualReviewComplete(deps, listing.id, "approve", undefined, REVIEWER_ID)

    const [ver] = await db.select().from(verifications).where(eq(verifications.listingId, listing.id))
    expect(ver.tier).toBe("claimed")
  })

  it("sends claim_approved email", async () => {
    const listing = await createDisputedListing()
    const deps = makeReviewDeps()

    await onManualReviewComplete(deps, listing.id, "approve", undefined, REVIEWER_ID)

    const sent = emailService.getCalls()
    expect(sent.some(e => e.template === "claim_approved")).toBe(true)
  })
})

// ========== AC-36: dispute resolved for existing claimant ==========

describe("AC-36: dispute resolved for existing claimant restores claimed", () => {
  it("restores claimStatus to claimed and notifies new claimant of rejection", async () => {
    const listing = await createDisputedListing()
    const deps = makeReviewDeps()

    await onManualReviewComplete(deps, listing.id, "reject", "Existing claimant upheld", REVIEWER_ID)

    const [updated] = await db.select().from(listings).where(eq(listings.id, listing.id))
    expect(updated.claimStatus).toBe("claimed")
    // accountId unchanged — still the existing owner
    expect(updated.accountId).toBe(EXISTING_OWNER_ID)
  })

  it("sends rejection email to new claimant", async () => {
    const listing = await createDisputedListing()
    const deps = makeReviewDeps()

    await onManualReviewComplete(deps, listing.id, "reject", "Existing claimant upheld", REVIEWER_ID)

    const sent = emailService.getCalls()
    const rejectedEmails = sent.filter(e => e.template === "claim_rejected")
    expect(rejectedEmails.length).toBeGreaterThanOrEqual(1)
  })

  it("deletes snapshot after rejection", async () => {
    const listing = await createDisputedListing()
    const deps = makeReviewDeps()

    await onManualReviewComplete(deps, listing.id, "reject", "Existing upheld", REVIEWER_ID)

    const snapshots = await db.select().from(preClaimSnapshots).where(eq(preClaimSnapshots.listingId, listing.id))
    expect(snapshots).toHaveLength(0)
  })
})
