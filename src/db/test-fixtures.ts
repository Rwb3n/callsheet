// Shared integration test fixtures — eliminates duplication across test files.
// All helpers take `db` as first arg (no module-level state).

import { user } from "@/db/schema/auth"
import {
  listings,
  verifications,
  qualityScores,
  qualityScoreExplanations,
  engagements,
  listingTaxonomyTags,
  taxonomySectors,
  taxonomyServiceAreas,
  taxonomySpecialisations,
  mediaItems,
  credits,
} from "@/db/schema/data-and-listings"
import type { AuthSession } from "@/lib/auth"
import type { TRPCContext } from "@/server/trpc"
import type { Db } from "@/db/types"
import type { ConsumerEntry, EventType } from "@/lib/events/types"
import { InProcessEventBus } from "@/lib/events/bus"
import { accountProfiles } from "@/db/schema/accounts"
import type { NotificationDb } from "@/lib/notifications"
import type { Notification } from "@/lib/notifications"

// --- UUID helper (prevents recurring non-UUID accountId bugs in tests) ---

export function makeUUID(suffix: string): string {
  const hex = suffix.replace(/[^0-9a-f]/gi, "").padStart(12, "0").slice(0, 12)
  // version=4, variant=8 so Zod .uuid() accepts the result
  return `00000000-0000-4000-8000-${hex}`
}

// --- Session factories ---

export function makeSession(overrides: Partial<AuthSession> & { accountId: string }): AuthSession {
  return {
    email: `${overrides.accountId}@example.com`,
    emailVerified: true,
    role: "user",
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

export function makeAdminSession(accountId: string): AuthSession {
  return makeSession({ accountId, role: "admin", email: `${accountId}@example.com` })
}

export function ctx(session: AuthSession | null): TRPCContext {
  return { session }
}

// --- User seeding ---

type UserSeed = {
  id: string
  name: string
  email: string
}

export async function seedUsers(db: Db, users: UserSeed[]) {
  await db.insert(user).values(
    users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    })),
  )
}

// --- Single-call user + profile seeding ---

export async function seedTestUser(
  db: Db,
  id: string,
  email?: string,
) {
  const resolvedEmail = email ?? `${id}@example.com`
  await db.insert(user).values({
    id,
    name: resolvedEmail.split("@")[0],
    email: resolvedEmail,
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  })
  await db.insert(accountProfiles).values({
    accountId: id,
    fullName: resolvedEmail.split("@")[0],
  })
}

// --- Listing creation ---

export async function createTestListing(
  db: Db,
  accountId: string | null,
  overrides: Record<string, unknown> = {},
) {
  const slug = `test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const [created] = await db.insert(listings).values({
    accountId,
    entityType: "company",
    name: "Test Company",
    slug,
    ...overrides,
  }).returning()

  await db.insert(verifications).values({ listingId: created.id })
  await db.insert(qualityScores).values({
    listingId: created.id,
    ...((overrides.qualityComposite != null) ? { composite: overrides.qualityComposite as number } : {}),
  })
  await db.insert(qualityScoreExplanations).values({
    listingId: created.id,
    explanation: { composite: 0, dimensions: [], topImprovements: [] },
  })
  await db.insert(engagements).values({ listingId: created.id })

  return created
}

// Unclaimed seed listing — for claim path, S3, and competing claim tests
export async function createUnclaimedListing(
  db: Db,
  overrides: Record<string, unknown> = {},
) {
  return createTestListing(db, null, {
    claimStatus: "unclaimed",
    source: "4rfv_import",
    headline: "Seed Company Headline",
    bio: "Imported bio text",
    contactEmail: "contact@seedco.com",
    websiteUrl: "https://seedco.com",
    baseRegion: "London",
    ...overrides,
  })
}

// --- Quality score helper ---

import { eq } from "drizzle-orm"

export async function setQuality(db: Db, listingId: string, composite: number) {
  await db.update(qualityScores).set({ composite }).where(eq(qualityScores.listingId, listingId))
}

// --- Media item creation ---

export async function createTestMedia(
  db: Db,
  listingId: string,
  overrides: Record<string, unknown> = {},
) {
  const [created] = await db.insert(mediaItems).values({
    listingId,
    type: "portfolio",
    url: `https://r2.callsheet.co.uk/test-${Date.now()}.jpg`,
    sortOrder: 0,
    ...overrides,
  }).returning()
  return created
}

// --- Credit creation ---

export async function createTestCredit(
  db: Db,
  listingId: string,
  overrides: Record<string, unknown> = {},
) {
  const [created] = await db.insert(credits).values({
    listingId,
    projectName: "Test Production",
    roleProvided: "Camera Operator",
    year: 2025,
    format: "feature",
    ...overrides,
  }).returning()
  return created
}

// --- Taxonomy seeding ---

export async function seedTaxonomy(db: Db) {
  const [camera] = await db.insert(taxonomySectors).values(
    { name: "Camera", slug: "camera", sortOrder: 1 },
  ).returning()
  const [cinematography] = await db.insert(taxonomyServiceAreas).values(
    { sectorId: camera.id, name: "Cinematography", slug: "cinematography", sortOrder: 1 },
  ).returning()
  const [cameraOp] = await db.insert(taxonomyServiceAreas).values(
    { sectorId: camera.id, name: "Camera Operation", slug: "camera-op", sortOrder: 2 },
  ).returning()
  const [steadicam] = await db.insert(taxonomySpecialisations).values(
    { serviceAreaId: cinematography.id, name: "Steadicam", slug: "steadicam", sortOrder: 1 },
  ).returning()
  const [sound] = await db.insert(taxonomySectors).values(
    { name: "Sound", slug: "sound", sortOrder: 2 },
  ).returning()
  const [soundRecording] = await db.insert(taxonomyServiceAreas).values(
    { sectorId: sound.id, name: "Sound Recording", slug: "sound-recording", sortOrder: 1 },
  ).returning()
  return { camera, cinematography, cameraOp, steadicam, sound, soundRecording }
}

// --- DB adapters (re-exported from production module) ---

export { createSchedulerDb, createDecisionLogDb, createNotificationDb, createFlowDb } from "@/db/adapters"

// --- In-memory NotificationDb for tests ---

export class InMemoryNotificationDb implements NotificationDb {
  private store = new Map<string, Notification>()

  async insert(notification: Omit<Notification, "readAt" | "dismissedAt">): Promise<string> {
    const full: Notification = { ...notification, readAt: undefined, dismissedAt: undefined }
    this.store.set(notification.id, full)
    return notification.id
  }

  async countUnread(accountId: string): Promise<number> {
    let count = 0
    for (const n of this.store.values()) {
      if (n.accountId === accountId && !n.readAt && !n.dismissed) count++
    }
    return count
  }

  async list(accountId: string, options?: { limit?: number; offset?: number }): Promise<Notification[]> {
    const all = [...this.store.values()]
      .filter((n) => n.accountId === accountId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    const offset = options?.offset ?? 0
    const limit = options?.limit ?? 50
    return all.slice(offset, offset + limit)
  }

  async markRead(notificationId: string): Promise<void> {
    const n = this.store.get(notificationId)
    if (n) n.readAt = new Date().toISOString()
  }

  async markAllRead(accountId: string): Promise<void> {
    for (const n of this.store.values()) {
      if (n.accountId === accountId && !n.readAt) n.readAt = new Date().toISOString()
    }
  }

  async deleteOlderThan(date: Date): Promise<number> {
    let deleted = 0
    for (const [id, n] of this.store.entries()) {
      if (new Date(n.createdAt) < date) { this.store.delete(id); deleted++ }
    }
    return deleted
  }

  getAll(): Notification[] {
    return [...this.store.values()]
  }

  clear(): void {
    this.store.clear()
  }
}

// --- TRPCError assertion helper ---

import type { TRPC_ERROR_CODE_KEY } from "@trpc/server/rpc"
import { expect } from "vitest"

/**
 * Assert that a promise rejects with a TRPCError having the expected code.
 * Optionally asserts the error message contains `messageSubstring`.
 *
 *   await expectTRPCError(caller.getOverview(), "UNAUTHORIZED")
 *   await expectTRPCError(caller.archive({ id }), "NOT_FOUND", "Listing not found")
 */
export async function expectTRPCError(
  promise: Promise<unknown>,
  code: TRPC_ERROR_CODE_KEY,
  messageSubstring?: string,
) {
  let caught: unknown
  try {
    await promise
  } catch (err) {
    caught = err
  }
  expect(caught).toBeDefined()
  expect(caught).toMatchObject({ code })
  if (messageSubstring != null) {
    expect(caught).toMatchObject({ message: expect.stringContaining(messageSubstring) })
  }
}

// --- Chainable mock Db for unit tests that mock Drizzle queries ---
// Each query call produces a thenable chain. Results consumed in order: first query → results[0], etc.

export function createChainableMockDb(results: unknown[][]) {
  let queryIndex = 0

  function makeChain(): Record<string, unknown> {
    const chain: Record<string, unknown> = {}
    const methods = ["from", "where", "orderBy", "limit"]

    for (const method of methods) {
      chain[method] = () => chain
    }

    // Thenable so `await db.select().from().where()` resolves at any chain position
    chain.then = (resolve: (val: unknown) => void, reject: (err: unknown) => void) => {
      const result = results[queryIndex] ?? []
      queryIndex++
      return Promise.resolve(result).then(resolve, reject)
    }

    return chain
  }

  return {
    select: () => makeChain(),
  }
}

// --- Mock DecisionLogDb for tests that don't write to a real DB ---

import type { DecisionLogDb } from "@/lib/decisions/logger"

export function createMockDecisionLogDb(): { db: DecisionLogDb; getDecisions: () => Array<Record<string, unknown>> } {
  const decisions: Array<Record<string, unknown>> = []
  return {
    db: {
      insert: async (row: Record<string, unknown>) => {
        decisions.push(row)
        return "decision-id"
      },
      findByDomainAndType: async () => [],
    },
    getDecisions: () => decisions,
  }
}

// --- Test event bus helper ---

/** Creates an InProcessEventBus with no-op error logging and empty consumer matrix. */
export function createTestBus() {
  return new InProcessEventBus({ logError: async () => {}, consumerMatrix: emptyConsumerMatrix })
}

// --- Empty consumer matrix for tests that don't need event handlers ---

export const emptyConsumerMatrix: Record<EventType, ConsumerEntry[]> = {
  listing_created: [], claim_approved: [], claim_rejected: [], listing_archived: [],
  listing_suspended: [], listing_reactivated: [], verification_tier_changed: [],
  decay_signal_detected: [], quality_score_changed: [], erasure_completed: [],
  subscription_tier_changed: [], subscription_ended: [], winback_delivery_result: [],
  search_performed: [], profile_viewed: [], enquiry_submitted: [],
  enquiry_responded: [], shortlist_added: [], profile_edited: [],
  contact_attempt: [], account_closed: [], conversion_milestone: [],
  churn_risk_detected: [], winback_eligible: [], pending_cancellation_created: [],
}
