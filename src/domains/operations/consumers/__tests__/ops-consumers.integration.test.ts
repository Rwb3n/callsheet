// CS-WORK-063: Operations event consumer integration tests
// Tests consumer handlers for claim volume, listing lifecycle, listing created,
// contact attempt, churn risk, and account closed.

import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { getTestDb, resetDb, closeTestDb } from "@/db/test-utils"
import { seedTestUser, createTestListing, makeUUID, createDecisionLogDb, createSchedulerDb, InMemoryNotificationDb } from "@/db/test-fixtures"
import { decisionLogs } from "@/db/schema/shared"
import { supportTickets, churnRiskRegistry, complianceRegister } from "@/db/schema/operations"
import { eq, and } from "drizzle-orm"
import { claimApprovedVolumeHandler, claimRejectedVolumeHandler } from "../claim-volume"
import { listingArchivedHandler, listingSuspendedHandler, listingReactivatedHandler } from "../listing-lifecycle"
import { listingCreatedTrackingHandler } from "../listing-created"
import { contactAttemptHandler } from "../contact-attempt"
import { churnRiskDetectedHandler } from "../churn-risk"
import { accountClosedHandler } from "../account-closed"
import type { ClaimApprovedEvent, ClaimRejectedEvent, ListingArchivedEvent, ListingSuspendedEvent, ListingReactivatedEvent, ListingCreatedEvent, ContactAttemptEvent, ChurnRiskDetectedEvent, AccountClosedEvent } from "@/lib/events/types"

const USER_ID = "user-ops-cons-1"
const ADMIN_ID = "admin-ops-cons-1"

beforeEach(async () => { await resetDb() })
afterAll(async () => { await closeTestDb() })

describe("claim volume tracking", () => {
  it("logs approved claim volume (§9.2)", async () => {
    const db = getTestDb()
    const decisionLogDb = createDecisionLogDb(db)
    const handler = claimApprovedVolumeHandler({ decisionLogDb })

    await handler.handler({
      _brand: "ClaimApprovedEvent" as const,
      listingId: makeUUID("lst001"),
      accountId: makeUUID("acc001"),
      method: "auto",
      timestamp: new Date().toISOString(),
    } as ClaimApprovedEvent)

    const logs = await decisionLogDb.findByDomainAndType("operations", "claim_volume_tracking")
    expect(logs).toHaveLength(1)
  })

  it("logs rejected claim volume (§9.3)", async () => {
    const db = getTestDb()
    const decisionLogDb = createDecisionLogDb(db)
    const handler = claimRejectedVolumeHandler({ decisionLogDb })

    await handler.handler({
      _brand: "ClaimRejectedEvent" as const,
      listingId: makeUUID("lst001"),
      claimantAccountId: makeUUID("acc001"),
      reason: "no_match",
      timestamp: new Date().toISOString(),
    } as ClaimRejectedEvent)

    const logs = await decisionLogDb.findByDomainAndType("operations", "claim_volume_tracking")
    expect(logs).toHaveLength(1)
  })
})

describe("listing lifecycle", () => {
  it("closes active tickets on listing_archived (§9.4)", async () => {
    const db = getTestDb()
    await seedTestUser(db, USER_ID)
    const listing = await createTestListing(db, USER_ID)
    const decisionLogDb = createDecisionLogDb(db)
    const schedulerDb = createSchedulerDb(db)

    // Create an open ticket
    await db.insert(supportTickets).values({
      accountId: USER_ID,
      listingId: listing.id,
      category: "billing_support",
      priority: "normal",
      status: "open",
      subject: "Test ticket",
    })

    const handler = listingArchivedHandler({ db, decisionLogDb, schedulerDb })
    await handler.handler({
      _brand: "ListingArchivedEvent" as const,
      listingId: listing.id,
      accountId: USER_ID,
      subscriptionTier: "free",
      entityType: "company",
      slug: listing.slug,
    } as ListingArchivedEvent)

    const [ticket] = await db.select().from(supportTickets).where(eq(supportTickets.listingId, listing.id))
    expect(ticket.status).toBe("closed")
    expect(ticket.closedAt).toBeTruthy()
  })

  it("closes active tickets on listing_suspended (§9.5)", async () => {
    const db = getTestDb()
    await seedTestUser(db, USER_ID)
    const listing = await createTestListing(db, USER_ID)
    const decisionLogDb = createDecisionLogDb(db)
    const schedulerDb = createSchedulerDb(db)

    await db.insert(supportTickets).values({
      accountId: USER_ID,
      listingId: listing.id,
      category: "profile_support",
      priority: "high",
      status: "assigned",
      subject: "Assigned ticket",
    })

    const handler = listingSuspendedHandler({ db, decisionLogDb, schedulerDb })
    await handler.handler({
      _brand: "ListingSuspendedEvent" as const,
      listingId: listing.id,
      reason: "compliance",
      previousStatus: "active",
    } as ListingSuspendedEvent)

    const [ticket] = await db.select().from(supportTickets).where(eq(supportTickets.listingId, listing.id))
    expect(ticket.status).toBe("closed")
  })

  it("logs reactivation outreach signal (§9.6)", async () => {
    const db = getTestDb()
    const decisionLogDb = createDecisionLogDb(db)
    const schedulerDb = createSchedulerDb(db)

    const handler = listingReactivatedHandler({ db, decisionLogDb, schedulerDb })
    await handler.handler({
      _brand: "ListingReactivatedEvent" as const,
      listingId: makeUUID("lst001"),
      accountId: makeUUID("acc001"),
      entityType: "company",
      slug: "test-slug",
    } as ListingReactivatedEvent)

    const logs = await decisionLogDb.findByDomainAndType("operations", "support_triage")
    expect(logs).toHaveLength(1)
  })

  it("is idempotent — already closed tickets are skipped", async () => {
    const db = getTestDb()
    await seedTestUser(db, USER_ID)
    const listing = await createTestListing(db, USER_ID)
    const decisionLogDb = createDecisionLogDb(db)
    const schedulerDb = createSchedulerDb(db)

    // Create a closed ticket
    await db.insert(supportTickets).values({
      accountId: USER_ID,
      listingId: listing.id,
      category: "billing_support",
      priority: "normal",
      status: "closed",
      subject: "Already closed",
      closedAt: new Date(),
    })

    const handler = listingArchivedHandler({ db, decisionLogDb, schedulerDb })
    await handler.handler({
      _brand: "ListingArchivedEvent" as const,
      listingId: listing.id,
      accountId: USER_ID,
      subscriptionTier: "free",
      entityType: "company",
      slug: listing.slug,
    } as ListingArchivedEvent)

    // Decision log should show 0 tickets closed
    const logs = await decisionLogDb.findByDomainAndType("operations", "support_triage")
    expect(logs).toHaveLength(1)
  })
})

describe("listing created tracking", () => {
  it("logs onboarding event (§9.10)", async () => {
    const db = getTestDb()
    const decisionLogDb = createDecisionLogDb(db)
    const handler = listingCreatedTrackingHandler({ decisionLogDb })

    await handler.handler({
      _brand: "ListingCreatedEvent" as const,
      listingId: makeUUID("lst001"),
      accountId: makeUUID("acc001"),
      entityType: "freelancer",
      slug: "test-slug",
    } as ListingCreatedEvent)

    const logs = await decisionLogDb.findByDomainAndType("operations", "onboarding_tracking")
    expect(logs).toHaveLength(1)
  })
})

describe("contact attempt", () => {
  it("logs unreachable contact for outreach prioritisation (§9.11)", async () => {
    const db = getTestDb()
    const decisionLogDb = createDecisionLogDb(db)
    const handler = contactAttemptHandler({ decisionLogDb })

    await handler.handler({
      _brand: "ContactAttemptEvent" as const,
      listingId: makeUUID("lst001"),
      result: "unreachable",
      reporterAccountId: null,
      timestamp: new Date().toISOString(),
    } as ContactAttemptEvent)

    const logs = await decisionLogDb.findByDomainAndType("operations", "support_triage")
    expect(logs).toHaveLength(1)
  })

  it("ignores reached contacts", async () => {
    const db = getTestDb()
    const decisionLogDb = createDecisionLogDb(db)
    const handler = contactAttemptHandler({ decisionLogDb })

    await handler.handler({
      _brand: "ContactAttemptEvent" as const,
      listingId: makeUUID("lst001"),
      result: "reached",
      reporterAccountId: null,
      timestamp: new Date().toISOString(),
    } as ContactAttemptEvent)

    const logs = await decisionLogDb.findByDomainAndType("operations", "support_triage")
    expect(logs).toHaveLength(0)
  })
})

describe("churn risk detected", () => {
  it("upserts churn_risk_registry with at_risk level (§9.12)", async () => {
    const db = getTestDb()
    await seedTestUser(db, USER_ID)
    const listing = await createTestListing(db, USER_ID)
    const decisionLogDb = createDecisionLogDb(db)
    const handler = churnRiskDetectedHandler({ db, decisionLogDb })

    await handler.handler({
      _brand: "ChurnRiskDetectedEvent" as const,
      listingId: listing.id,
      accountId: USER_ID,
      riskFactors: ["quality_declining"],
      timestamp: new Date().toISOString(),
    } as ChurnRiskDetectedEvent)

    const [entry] = await db.select().from(churnRiskRegistry).where(eq(churnRiskRegistry.listingId, listing.id))
    expect(entry.riskLevel).toBe("at_risk")
    expect(entry.expiresAt).toBeTruthy()
  })

  it("maps payment_at_risk to high_risk level", async () => {
    const db = getTestDb()
    await seedTestUser(db, USER_ID)
    const listing = await createTestListing(db, USER_ID)
    const decisionLogDb = createDecisionLogDb(db)
    const handler = churnRiskDetectedHandler({ db, decisionLogDb })

    await handler.handler({
      _brand: "ChurnRiskDetectedEvent" as const,
      listingId: listing.id,
      accountId: USER_ID,
      riskFactors: ["payment_at_risk", "quality_declining"],
      timestamp: new Date().toISOString(),
    } as ChurnRiskDetectedEvent)

    const [entry] = await db.select().from(churnRiskRegistry).where(eq(churnRiskRegistry.listingId, listing.id))
    expect(entry.riskLevel).toBe("high_risk")
  })

  it("elevates priority of open tickets on churn risk", async () => {
    const db = getTestDb()
    await seedTestUser(db, USER_ID)
    const listing = await createTestListing(db, USER_ID)
    const decisionLogDb = createDecisionLogDb(db)

    await db.insert(supportTickets).values({
      accountId: USER_ID,
      listingId: listing.id,
      category: "billing_support",
      priority: "normal",
      status: "open",
      subject: "Test",
    })

    const handler = churnRiskDetectedHandler({ db, decisionLogDb })
    await handler.handler({
      _brand: "ChurnRiskDetectedEvent" as const,
      listingId: listing.id,
      accountId: USER_ID,
      riskFactors: ["quality_declining"],
      timestamp: new Date().toISOString(),
    } as ChurnRiskDetectedEvent)

    const [ticket] = await db.select().from(supportTickets).where(eq(supportTickets.accountId, USER_ID))
    expect(ticket.priority).toBe("high")
  })

  it("does not downgrade critical/high priority tickets", async () => {
    const db = getTestDb()
    await seedTestUser(db, USER_ID)
    const listing = await createTestListing(db, USER_ID)
    const decisionLogDb = createDecisionLogDb(db)

    await db.insert(supportTickets).values({
      accountId: USER_ID,
      listingId: listing.id,
      category: "billing_support",
      priority: "critical",
      status: "open",
      subject: "Critical ticket",
    })

    const handler = churnRiskDetectedHandler({ db, decisionLogDb })
    await handler.handler({
      _brand: "ChurnRiskDetectedEvent" as const,
      listingId: listing.id,
      accountId: USER_ID,
      riskFactors: ["quality_declining"],
      timestamp: new Date().toISOString(),
    } as ChurnRiskDetectedEvent)

    const [ticket] = await db.select().from(supportTickets).where(eq(supportTickets.accountId, USER_ID))
    expect(ticket.priority).toBe("critical")
  })

  it("upserts on second detection for same listing", async () => {
    const db = getTestDb()
    await seedTestUser(db, USER_ID)
    const listing = await createTestListing(db, USER_ID)
    const decisionLogDb = createDecisionLogDb(db)
    const handler = churnRiskDetectedHandler({ db, decisionLogDb })

    await handler.handler({
      _brand: "ChurnRiskDetectedEvent" as const,
      listingId: listing.id,
      accountId: USER_ID,
      riskFactors: ["quality_declining"],
      timestamp: new Date().toISOString(),
    } as ChurnRiskDetectedEvent)

    await handler.handler({
      _brand: "ChurnRiskDetectedEvent" as const,
      listingId: listing.id,
      accountId: USER_ID,
      riskFactors: ["payment_at_risk"],
      timestamp: new Date().toISOString(),
    } as ChurnRiskDetectedEvent)

    const entries = await db.select().from(churnRiskRegistry).where(eq(churnRiskRegistry.listingId, listing.id))
    expect(entries).toHaveLength(1)
    expect(entries[0].riskLevel).toBe("high_risk")
  })
})

describe("account closed", () => {
  it("closes active tickets and updates compliance register (§9.9)", async () => {
    const db = getTestDb()
    await seedTestUser(db, USER_ID)
    await seedTestUser(db, ADMIN_ID)
    const listing = await createTestListing(db, USER_ID)
    const decisionLogDb = createDecisionLogDb(db)
    const schedulerDb = createSchedulerDb(db)
    const notificationDb = new InMemoryNotificationDb()

    await db.insert(supportTickets).values({
      accountId: USER_ID,
      listingId: listing.id,
      category: "billing_support",
      priority: "normal",
      status: "open",
      subject: "Test",
    })

    await db.insert(complianceRegister).values({
      type: "obligation",
      accountId: USER_ID,
      status: "open",
    })

    const handler = accountClosedHandler({
      db, decisionLogDb, schedulerDb, notificationDb, adminAccountId: ADMIN_ID,
    })
    await handler.handler({
      _brand: "AccountClosedEvent" as const,
      accountId: USER_ID,
      listingsArchived: [listing.id],
      buyerDataDeleted: false,
      complianceHoldActive: false,
      paddleCancellationsPending: false,
      timestamp: new Date().toISOString(),
    })

    const [ticket] = await db.select().from(supportTickets).where(eq(supportTickets.accountId, USER_ID))
    expect(ticket.status).toBe("closed")

    const [compliance] = await db.select().from(complianceRegister)
      .where(and(eq(complianceRegister.accountId, USER_ID), eq(complianceRegister.type, "obligation")))
    expect(compliance.status).toBe("completed")
  })

  it("creates compliance monitor note when complianceHoldActive (§9.9)", async () => {
    const db = getTestDb()
    await seedTestUser(db, USER_ID)
    await seedTestUser(db, ADMIN_ID)
    const decisionLogDb = createDecisionLogDb(db)
    const schedulerDb = createSchedulerDb(db)
    const notificationDb = new InMemoryNotificationDb()

    const handler = accountClosedHandler({
      db, decisionLogDb, schedulerDb, notificationDb, adminAccountId: ADMIN_ID,
    })
    await handler.handler({
      _brand: "AccountClosedEvent" as const,
      accountId: USER_ID,
      listingsArchived: [],
      buyerDataDeleted: false,
      complianceHoldActive: true,
      paddleCancellationsPending: false,
      timestamp: new Date().toISOString(),
    })

    // Compliance monitor note created
    const entries = await db.select().from(complianceRegister)
      .where(eq(complianceRegister.type, "obligation"))
    const holdMonitor = entries.find((e) =>
      (e.details as Record<string, unknown>)?.note === "Compliance hold active at account closure. Monitor until resolved.",
    )
    expect(holdMonitor).toBeTruthy()
    expect(holdMonitor!.status).toBe("open")

    // Admin notification created
    const notifications = notificationDb.getAll()
    expect(notifications).toHaveLength(1)
    expect(notifications[0].type).toBe("compliance_deadline")
  })
})
