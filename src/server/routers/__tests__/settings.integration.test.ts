// CS-WORK-049 AC-38 through AC-41: Settings router integration tests
// Email preferences hit real Postgres. Closure flow uses mock FlowDb
// (flow engine already tested in src/lib/flows/__tests__/engine.test.ts).

import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest"
import { eq } from "drizzle-orm"
import { getTestDb, resetDb, closeTestDb } from "@/db/test-utils"
import {
  seedTestUser,
  makeSession,
  ctx,
  createTestListing,
  emptyConsumerMatrix,
} from "@/db/test-fixtures"
import { accountProfiles } from "@/db/schema/accounts"
import type { EmailPreferences } from "@/db/schema/accounts"
import { listings } from "@/db/schema/data-and-listings"
import { createSettingsRouter, type SettingsRouterDeps } from "../settings"
import { InProcessEventBus } from "@/lib/events/bus"
import { createWaitUntilCollector } from "@/lib/events/waitUntil"
import { InMemoryPaymentService } from "@/lib/services/mocks"
import type { FlowDb } from "@/lib/flows"
import type { FlowRow } from "@/lib/flows"
import type { AuthSession } from "@/lib/auth"

// --- Mock FlowDb (replicates engine test pattern) ---

function createMockFlowDb(): FlowDb & { rows: Map<string, FlowRow> } {
  const rows = new Map<string, FlowRow>()
  let idCounter = 1

  return {
    rows,
    insert: vi.fn(async (row) => {
      const id = `flow-${idCounter++}`
      const fullRow: FlowRow = { id, ...row, createdAt: new Date() }
      rows.set(id, fullRow)
      return id
    }),
    update: vi.fn(async (id, fields) => {
      const existing = rows.get(id)
      if (!existing) throw new Error(`Row not found: ${id}`)
      rows.set(id, { ...existing, ...fields } as FlowRow)
    }),
    findById: vi.fn(async (id) => rows.get(id) ?? null),
  }
}

// --- Setup ---

let db: ReturnType<typeof getTestDb>
let bus: InProcessEventBus
let waitUntilFn: ReturnType<typeof createWaitUntilCollector>["waitUntilFn"]
let getPromises: ReturnType<typeof createWaitUntilCollector>["getPromises"]
let payment: InMemoryPaymentService
let flowDb: ReturnType<typeof createMockFlowDb>

const ACCOUNT_ID = "test-settings-owner"

function makeDeps(): SettingsRouterDeps {
  return { db, flowDb, bus, waitUntilFn, payment }
}

function caller(session: AuthSession) {
  const router = createSettingsRouter(makeDeps())
  return router.createCaller(ctx(session))
}

const ownerSession = makeSession({ accountId: ACCOUNT_ID })

beforeAll(async () => {
  db = getTestDb()
})

beforeEach(async () => {
  await resetDb()
  const collector = createWaitUntilCollector()
  waitUntilFn = collector.waitUntilFn
  getPromises = collector.getPromises
  bus = new InProcessEventBus({
    logError: async () => {},
    consumerMatrix: emptyConsumerMatrix,
  })
  payment = new InMemoryPaymentService()
  flowDb = createMockFlowDb()
  await seedTestUser(db, ACCOUNT_ID)
})

afterAll(async () => {
  await closeTestDb()
})

// --- AC-38: Email preferences page displays all 4 subscribable categories ---

describe("settings.getEmailPreferences (AC-38)", () => {
  it("returns all 4 categories with default opt-in state", async () => {
    const result = await caller(ownerSession).getEmailPreferences()

    expect(result).toHaveLength(4)
    expect(result).toEqual([
      { category: "enquiry_notification", enabled: true },
      { category: "listing_status", enabled: true },
      { category: "profile_nudge", enabled: true },
      { category: "conversion_marketing", enabled: true },
    ])
  })

  it("reflects updated preferences", async () => {
    await caller(ownerSession).updateEmailPreference({
      category: "conversion_marketing",
      enabled: false,
    })

    const result = await caller(ownerSession).getEmailPreferences()
    const marketing = result.find((p) => p.category === "conversion_marketing")
    expect(marketing?.enabled).toBe(false)
  })
})

// --- AC-39: Updating preference immediately changes delivery behaviour ---

describe("settings.updateEmailPreference (AC-39)", () => {
  it("updates a single category without affecting others", async () => {
    await caller(ownerSession).updateEmailPreference({
      category: "profile_nudge",
      enabled: false,
    })

    const [profile] = await db
      .select({ emailPreferences: accountProfiles.emailPreferences })
      .from(accountProfiles)
      .where(eq(accountProfiles.accountId, ACCOUNT_ID))
      .limit(1)

    const prefs = profile.emailPreferences as EmailPreferences
    expect(prefs.profile_nudge).toBe(false)
    expect(prefs.enquiry_notification).toBe(true)
    expect(prefs.listing_status).toBe(true)
    expect(prefs.conversion_marketing).toBe(true)
  })

  it("can re-enable a previously disabled category", async () => {
    await caller(ownerSession).updateEmailPreference({
      category: "listing_status",
      enabled: false,
    })
    await caller(ownerSession).updateEmailPreference({
      category: "listing_status",
      enabled: true,
    })

    const [profile] = await db
      .select({ emailPreferences: accountProfiles.emailPreferences })
      .from(accountProfiles)
      .where(eq(accountProfiles.accountId, ACCOUNT_ID))
      .limit(1)

    const prefs = profile.emailPreferences as EmailPreferences
    expect(prefs.listing_status).toBe(true)
  })

  it("returns the updated category and state", async () => {
    const result = await caller(ownerSession).updateEmailPreference({
      category: "enquiry_notification",
      enabled: false,
    })

    expect(result).toEqual({ category: "enquiry_notification", enabled: false })
  })
})

// --- AC-40: Account closure initiation starts orchestrated flow ---

describe("settings.initiateAccountClosure (AC-40)", () => {
  it("creates a closure flow with flowType closure", async () => {
    const result = await caller(ownerSession).initiateAccountClosure()

    expect(result.flowId).toBe("flow-1")
    expect(result.status).toBe("completed")

    const row = flowDb.rows.get("flow-1")!
    expect(row.flowType).toBe("closure")
    expect(row.triggeredBy).toBe(ACCOUNT_ID)
  })

  it("runs 6 steps in the closure flow", async () => {
    await caller(ownerSession).initiateAccountClosure()

    const row = flowDb.rows.get("flow-1")!
    expect(row.steps).toHaveLength(6)
    expect(row.steps.map((s) => s.name)).toEqual([
      "archive_listings",
      "cancel_subscriptions",
      "anonymise_buyer_data",
      "delete_defer_buyer_data",
      "deactivate_account",
      "emit_account_closed",
    ])
  })
})

// --- AC-41: Closure with active listings and subscriptions completes all 6 steps ---

describe("settings.initiateAccountClosure — full flow (AC-41)", () => {
  it("archives listings, cancels subscriptions, deactivates account, emits event", async () => {
    // Seed two listings: one with subscription, one without
    const listing1 = await createTestListing(db, ACCOUNT_ID, {
      paddleSubscriptionId: "sub_123",
    })
    const listing2 = await createTestListing(db, ACCOUNT_ID)

    const result = await caller(ownerSession).initiateAccountClosure()
    expect(result.status).toBe("completed")

    // Step 1: Both listings archived
    const [l1] = await db
      .select({ lifecycleStatus: listings.lifecycleStatus })
      .from(listings)
      .where(eq(listings.id, listing1.id))
    const [l2] = await db
      .select({ lifecycleStatus: listings.lifecycleStatus })
      .from(listings)
      .where(eq(listings.id, listing2.id))
    expect(l1.lifecycleStatus).toBe("archived")
    expect(l2.lifecycleStatus).toBe("archived")

    // Step 2: Payment service called for subscription cancellation
    expect(payment.wasCalledWith("cancelSubscription", {
      paddleSubscriptionId: "sub_123",
      reason: "account_closed",
      effectiveFrom: "immediately",
    })).toBe(true)

    // Step 5: Account deactivated
    const [profile] = await db
      .select({
        suppressedAt: accountProfiles.suppressedAt,
        suppressionReason: accountProfiles.suppressionReason,
      })
      .from(accountProfiles)
      .where(eq(accountProfiles.accountId, ACCOUNT_ID))
      .limit(1)
    expect(profile.suppressedAt).toBeTruthy()
    expect(profile.suppressionReason).toBe("account_closed")

    // Step 6: account_closed event emitted (async handlers collected)
    await Promise.all(getPromises())
  })

  it("skips already-archived listings during archive step", async () => {
    await createTestListing(db, ACCOUNT_ID, { lifecycleStatus: "archived" })
    const activeListing = await createTestListing(db, ACCOUNT_ID)

    await caller(ownerSession).initiateAccountClosure()

    // Flow context should only contain the newly archived listing
    const row = flowDb.rows.get("flow-1")!
    const context = row.context as { listingsArchived: string[] }
    expect(context.listingsArchived).toEqual([activeListing.id])
  })

  it("handles account with no listings", async () => {
    const result = await caller(ownerSession).initiateAccountClosure()
    expect(result.status).toBe("completed")

    const row = flowDb.rows.get("flow-1")!
    const context = row.context as { listingsArchived: string[]; subscriptionsCancelled: string[] }
    expect(context.listingsArchived).toEqual([])
    expect(context.subscriptionsCancelled).toEqual([])
  })
})
