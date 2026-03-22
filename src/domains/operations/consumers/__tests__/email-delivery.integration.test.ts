// CS-WORK-063: Email delivery integration tests — AC-11.1 through AC-11.10
// Tests winback delivery and decay warning email handlers.

import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { getTestDb, resetDb, closeTestDb } from "@/db/test-utils"
import { seedTestUser, createTestListing, createDecisionLogDb, makeUUID } from "@/db/test-fixtures"
import { InMemoryEmailService } from "@/lib/email/transport"
import { decisionLogs } from "@/db/schema/shared"
import { eq } from "drizzle-orm"
import { winbackDeliveryHandler } from "../winback-delivery"
import { decayOutreachHandler } from "../decay-outreach"
import type { WinbackEligibleEvent, DecaySignalDetectedEvent, WinbackDeliveryResultEvent } from "@/lib/events/types"
import type { EmailPreferences } from "@/lib/email/types"

// Import templates so they're registered
import "@/domains/operations/email-templates"

const USER_ID = "user-email-del-1"
const USER_EMAIL = "provider@example.com"
const LISTING_ID = makeUUID("lst001")

beforeEach(async () => { await resetDb() })
afterAll(async () => { await closeTestDb() })

describe("winback delivery (AC-11.1 through AC-11.3, AC-11.9, AC-11.10)", () => {
  function makeEmit() {
    const emitted: Array<{ eventType: string; payload: WinbackDeliveryResultEvent }> = []
    const emit = async (eventType: "winback_delivery_result", payload: WinbackDeliveryResultEvent) => {
      emitted.push({ eventType, payload })
    }
    return { emit, emitted }
  }

  it("AC-11.1: resolves email and sends winback template with mergeFields", async () => {
    const db = getTestDb()
    await seedTestUser(db, USER_ID, USER_EMAIL)
    const decisionLogDb = createDecisionLogDb(db)
    const emailService = new InMemoryEmailService()
    const { emit, emitted } = makeEmit()

    const handler = winbackDeliveryHandler({ db, decisionLogDb, emailService, emit })
    await handler.handler({
      _brand: "WinbackEligibleEvent" as const,
      listingId: LISTING_ID,
      cancelledAccountId: USER_ID,
      mergeFields: { subject: "Come back!", body: "We miss you", listingName: "Test Co" },
    } as WinbackEligibleEvent)

    const calls = emailService.getCalls()
    expect(calls).toHaveLength(1)
    expect(calls[0].template).toBe("winback")
    expect(calls[0].to).toBe(USER_EMAIL)
    expect(calls[0].data).toEqual({ subject: "Come back!", body: "We miss you", listingName: "Test Co" })
  })

  it("AC-11.2: emits winback_delivery_result with status delivered on success", async () => {
    const db = getTestDb()
    await seedTestUser(db, USER_ID, USER_EMAIL)
    const decisionLogDb = createDecisionLogDb(db)
    const emailService = new InMemoryEmailService()
    const { emit, emitted } = makeEmit()

    const handler = winbackDeliveryHandler({ db, decisionLogDb, emailService, emit })
    await handler.handler({
      _brand: "WinbackEligibleEvent" as const,
      listingId: LISTING_ID,
      cancelledAccountId: USER_ID,
      mergeFields: { subject: "Come back!" },
    } as WinbackEligibleEvent)

    expect(emitted).toHaveLength(1)
    expect(emitted[0].eventType).toBe("winback_delivery_result")
    expect(emitted[0].payload.status).toBe("delivered")
  })

  it("AC-11.2: emits winback_delivery_result with status failed when account missing", async () => {
    const db = getTestDb()
    const decisionLogDb = createDecisionLogDb(db)
    const emailService = new InMemoryEmailService()
    const { emit, emitted } = makeEmit()

    const handler = winbackDeliveryHandler({ db, decisionLogDb, emailService, emit })
    await handler.handler({
      _brand: "WinbackEligibleEvent" as const,
      listingId: LISTING_ID,
      cancelledAccountId: "nonexistent-user",
      mergeFields: {},
    } as WinbackEligibleEvent)

    expect(emitted).toHaveLength(1)
    expect(emitted[0].payload.status).toBe("failed")
    expect(emailService.getCalls()).toHaveLength(0)
  })

  it("AC-11.3: winback_delivery_result.accountId carries through cancelledAccountId", async () => {
    const db = getTestDb()
    await seedTestUser(db, USER_ID, USER_EMAIL)
    const decisionLogDb = createDecisionLogDb(db)
    const emailService = new InMemoryEmailService()
    const { emit, emitted } = makeEmit()

    const handler = winbackDeliveryHandler({ db, decisionLogDb, emailService, emit })
    await handler.handler({
      _brand: "WinbackEligibleEvent" as const,
      listingId: LISTING_ID,
      cancelledAccountId: USER_ID,
      mergeFields: {},
    } as WinbackEligibleEvent)

    expect(emitted[0].payload.accountId).toBe(USER_ID)
  })

  it("AC-11.9: uses category conversion_marketing", async () => {
    const db = getTestDb()
    await seedTestUser(db, USER_ID, USER_EMAIL)
    const decisionLogDb = createDecisionLogDb(db)
    const emailService = new InMemoryEmailService()
    const { emit } = makeEmit()

    const handler = winbackDeliveryHandler({ db, decisionLogDb, emailService, emit })
    await handler.handler({
      _brand: "WinbackEligibleEvent" as const,
      listingId: LISTING_ID,
      cancelledAccountId: USER_ID,
      mergeFields: { subject: "Test" },
    } as WinbackEligibleEvent)

    expect(emailService.getCalls()[0].category).toBe("conversion_marketing")
  })

  it("AC-11.10: suppressed winback still emits winback_delivery_result with status failed", async () => {
    const db = getTestDb()
    await seedTestUser(db, USER_ID, USER_EMAIL)
    const decisionLogDb = createDecisionLogDb(db)

    // Create email service with unsubscribed preferences
    const prefs = new Map<string, EmailPreferences>()
    prefs.set(USER_ID, {
      enquiry_notification: true,
      listing_status: true,
      profile_nudge: true,
      conversion_marketing: false, // unsubscribed
    })
    const emailService = new InMemoryEmailService(prefs)
    const { emit, emitted } = makeEmit()

    const handler = winbackDeliveryHandler({ db, decisionLogDb, emailService, emit })
    await handler.handler({
      _brand: "WinbackEligibleEvent" as const,
      listingId: LISTING_ID,
      cancelledAccountId: USER_ID,
      mergeFields: { subject: "Test" },
    } as WinbackEligibleEvent)

    // Email was attempted (service handles suppression)
    expect(emailService.getCalls()).toHaveLength(1)
    // Result emitted as failed
    expect(emitted).toHaveLength(1)
    expect(emitted[0].payload.status).toBe("failed")
  })

  it("AC-11.8: email send failure caught and does NOT propagate", async () => {
    const db = getTestDb()
    await seedTestUser(db, USER_ID, USER_EMAIL)
    const decisionLogDb = createDecisionLogDb(db)
    const emailService = new InMemoryEmailService()
    emailService.setResponse({ messageId: null, status: "failed", threadId: "t1" })
    const { emit, emitted } = makeEmit()

    const handler = winbackDeliveryHandler({ db, decisionLogDb, emailService, emit })

    // Should not throw
    await handler.handler({
      _brand: "WinbackEligibleEvent" as const,
      listingId: LISTING_ID,
      cancelledAccountId: USER_ID,
      mergeFields: { subject: "Test" },
    } as WinbackEligibleEvent)

    expect(emitted).toHaveLength(1)
    expect(emitted[0].payload.status).toBe("failed")
  })
})

describe("decay warning delivery (AC-11.4 through AC-11.8)", () => {
  it("AC-11.4: skips email when activeSupportTicket present", async () => {
    const db = getTestDb()
    await seedTestUser(db, USER_ID, USER_EMAIL)
    const listing = await createTestListing(db, USER_ID)
    const decisionLogDb = createDecisionLogDb(db)
    const emailService = new InMemoryEmailService()

    const handler = decayOutreachHandler({ db, decisionLogDb, emailService })
    await handler.handler({
      _brand: "DecaySignalDetectedEvent" as const,
      listingId: listing.id,
      signal: { type: "stale_content", severity: "medium" },
      activeSupportTicket: makeUUID("ticket01"),
    } as DecaySignalDetectedEvent)

    expect(emailService.getCalls()).toHaveLength(0)
  })

  it("AC-11.5: suppressed decay warnings produce decision log with action decay_warning_suppressed", async () => {
    const db = getTestDb()
    await seedTestUser(db, USER_ID, USER_EMAIL)
    const listing = await createTestListing(db, USER_ID)
    const decisionLogDb = createDecisionLogDb(db)
    const emailService = new InMemoryEmailService()

    const handler = decayOutreachHandler({ db, decisionLogDb, emailService })
    await handler.handler({
      _brand: "DecaySignalDetectedEvent" as const,
      listingId: listing.id,
      signal: { type: "stale_content", severity: "high" },
      activeSupportTicket: makeUUID("ticket01"),
    } as DecaySignalDetectedEvent)

    const logs = await decisionLogDb.findByDomainAndType("operations", "decay_response")
    expect(logs).toHaveLength(1)

    // Read full log to verify action field
    const [fullLog] = await db.select().from(decisionLogs).where(eq(decisionLogs.id, logs[0].id))
    expect((fullLog.output as Record<string, unknown>).action).toBe("decay_warning_suppressed")
  })

  it("AC-11.6: skips email for unclaimed listings", async () => {
    const db = getTestDb()
    const listing = await createTestListing(db, null) // unclaimed
    const decisionLogDb = createDecisionLogDb(db)
    const emailService = new InMemoryEmailService()

    const handler = decayOutreachHandler({ db, decisionLogDb, emailService })
    await handler.handler({
      _brand: "DecaySignalDetectedEvent" as const,
      listingId: listing.id,
      signal: { type: "stale_content", severity: "low" },
    } as DecaySignalDetectedEvent)

    expect(emailService.getCalls()).toHaveLength(0)
    const logs = await decisionLogDb.findByDomainAndType("operations", "decay_response")
    expect(logs).toHaveLength(1)
  })

  it("AC-11.7: decay warning email includes signalType, signalSeverity, listingName", async () => {
    const db = getTestDb()
    await seedTestUser(db, USER_ID, USER_EMAIL)
    const listing = await createTestListing(db, USER_ID, { name: "My Film Company" })
    const decisionLogDb = createDecisionLogDb(db)
    const emailService = new InMemoryEmailService()

    const handler = decayOutreachHandler({ db, decisionLogDb, emailService })
    await handler.handler({
      _brand: "DecaySignalDetectedEvent" as const,
      listingId: listing.id,
      signal: { type: "stale_content", severity: "high" },
    } as DecaySignalDetectedEvent)

    const calls = emailService.getCalls()
    expect(calls).toHaveLength(1)
    expect(calls[0].template).toBe("listing_decay_warning")
    expect(calls[0].data).toEqual(expect.objectContaining({
      signalType: "stale_content",
      signalSeverity: "high",
      listingName: "My Film Company",
    }))
  })

  it("AC-11.7a: uses category listing_status", async () => {
    const db = getTestDb()
    await seedTestUser(db, USER_ID, USER_EMAIL)
    const listing = await createTestListing(db, USER_ID)
    const decisionLogDb = createDecisionLogDb(db)
    const emailService = new InMemoryEmailService()

    const handler = decayOutreachHandler({ db, decisionLogDb, emailService })
    await handler.handler({
      _brand: "DecaySignalDetectedEvent" as const,
      listingId: listing.id,
      signal: { type: "stale_content", severity: "medium" },
    } as DecaySignalDetectedEvent)

    expect(emailService.getCalls()[0].category).toBe("listing_status")
  })

  it("AC-11.7a: suppressed when account unsubscribed from listing_status", async () => {
    const db = getTestDb()
    await seedTestUser(db, USER_ID, USER_EMAIL)
    const listing = await createTestListing(db, USER_ID)
    const decisionLogDb = createDecisionLogDb(db)

    const prefs = new Map<string, EmailPreferences>()
    prefs.set(USER_ID, {
      enquiry_notification: true,
      listing_status: false, // unsubscribed
      profile_nudge: true,
      conversion_marketing: true,
    })
    const emailService = new InMemoryEmailService(prefs)

    const handler = decayOutreachHandler({ db, decisionLogDb, emailService })
    await handler.handler({
      _brand: "DecaySignalDetectedEvent" as const,
      listingId: listing.id,
      signal: { type: "stale_content", severity: "medium" },
    } as DecaySignalDetectedEvent)

    // Email service returns suppressed but the send was called
    expect(emailService.getCalls()).toHaveLength(1)
    expect(emailService.getCalls()[0].category).toBe("listing_status")
  })

  it("AC-11.8: email send failure does not propagate", async () => {
    const db = getTestDb()
    await seedTestUser(db, USER_ID, USER_EMAIL)
    const listing = await createTestListing(db, USER_ID)
    const decisionLogDb = createDecisionLogDb(db)

    // Create a service that throws
    const throwingService = {
      async send() {
        throw new Error("Resend API down")
      },
    }

    const handler = decayOutreachHandler({ db, decisionLogDb, emailService: throwingService })

    // Should NOT throw
    await handler.handler({
      _brand: "DecaySignalDetectedEvent" as const,
      listingId: listing.id,
      signal: { type: "stale_content", severity: "critical" },
    } as DecaySignalDetectedEvent)

    // Decision log still written
    const logs = await decisionLogDb.findByDomainAndType("operations", "decay_response")
    expect(logs).toHaveLength(1)
  })
})
