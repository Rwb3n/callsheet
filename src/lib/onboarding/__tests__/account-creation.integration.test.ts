// CS-WORK-013: Account creation and onboarding integration tests
// AC-01, AC-03, AC-04, AC-05

import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest"
import { eq } from "drizzle-orm"
import { getTestDb, resetDb, closeTestDb } from "@/db/test-utils"
import { seedUsers, makeSession, ctx } from "@/db/test-fixtures"
import { accountProfiles, enquiryRecords } from "@/db/schema/accounts"
import { listings } from "@/db/schema/data-and-listings"
import { user } from "@/db/schema/auth"
import { createOnboardingRouter } from "@/server/routers/onboarding"
import { linkAnonymousEnquiries } from "@/lib/onboarding/link-anonymous-enquiries"
import { assertEmailVerified } from "@/lib/onboarding/verified-email-guard"
import { router, verifiedProcedure } from "@/server/trpc"
import { TRPCError } from "@trpc/server"

let db: ReturnType<typeof getTestDb>

const ACCOUNT_ID = "test-onboarding-001"
const ACCOUNT_EMAIL = "alice@example.com"

beforeAll(() => {
  db = getTestDb()
})

beforeEach(async () => {
  await resetDb()
})

afterAll(async () => {
  await closeTestDb()
})

describe("AC-01: signup creates account_profiles row with defaults", () => {
  it("creates account_profiles row with default email preferences", async () => {
    await seedUsers(db, [{ id: ACCOUNT_ID, name: "Alice Producer", email: ACCOUNT_EMAIL }])

    const router = createOnboardingRouter({ db })
    const session = makeSession({ accountId: ACCOUNT_ID, email: ACCOUNT_EMAIL })
    const caller = router.createCaller(ctx(session))

    await caller.ensureProfile()

    const [profile] = await db
      .select()
      .from(accountProfiles)
      .where(eq(accountProfiles.accountId, ACCOUNT_ID))

    expect(profile).toBeDefined()
    expect(profile.fullName).toBe("Alice Producer")
    expect(profile.emailPreferences).toEqual({
      enquiry_notification: true,
      listing_status: true,
      profile_nudge: true,
      conversion_marketing: true,
    })
    expect(profile.departments).toEqual([])
  })

  it("is idempotent — second call does not error or duplicate", async () => {
    await seedUsers(db, [{ id: ACCOUNT_ID, name: "Alice Producer", email: ACCOUNT_EMAIL }])

    const router = createOnboardingRouter({ db })
    const session = makeSession({ accountId: ACCOUNT_ID, email: ACCOUNT_EMAIL })
    const caller = router.createCaller(ctx(session))

    await caller.ensureProfile()
    await caller.ensureProfile()

    const profiles = await db
      .select()
      .from(accountProfiles)
      .where(eq(accountProfiles.accountId, ACCOUNT_ID))

    expect(profiles).toHaveLength(1)
  })
})

describe("AC-03: personalisation stores departments; skippable", () => {
  it("stores departments array on account profile", async () => {
    await seedUsers(db, [{ id: ACCOUNT_ID, name: "Alice Producer", email: ACCOUNT_EMAIL }])

    const router = createOnboardingRouter({ db })
    const session = makeSession({ accountId: ACCOUNT_ID, email: ACCOUNT_EMAIL })
    const caller = router.createCaller(ctx(session))

    await caller.ensureProfile()
    const result = await caller.completePersonalisation({
      departments: ["camera", "sound", "post-production"],
    })

    expect(result.departments).toEqual(["camera", "sound", "post-production"])

    const [profile] = await db
      .select()
      .from(accountProfiles)
      .where(eq(accountProfiles.accountId, ACCOUNT_ID))

    expect(profile.departments).toEqual(["camera", "sound", "post-production"])
  })

  it("skippable — omitting departments stores empty array", async () => {
    await seedUsers(db, [{ id: ACCOUNT_ID, name: "Alice Producer", email: ACCOUNT_EMAIL }])

    const router = createOnboardingRouter({ db })
    const session = makeSession({ accountId: ACCOUNT_ID, email: ACCOUNT_EMAIL })
    const caller = router.createCaller(ctx(session))

    await caller.ensureProfile()
    const result = await caller.completePersonalisation({})

    expect(result.departments).toEqual([])
  })

  it("rejects without profile — returns NOT_FOUND", async () => {
    await seedUsers(db, [{ id: ACCOUNT_ID, name: "Alice Producer", email: ACCOUNT_EMAIL }])

    const router = createOnboardingRouter({ db })
    const session = makeSession({ accountId: ACCOUNT_ID, email: ACCOUNT_EMAIL })
    const caller = router.createCaller(ctx(session))

    await expect(
      caller.completePersonalisation({ departments: ["camera"] }),
    ).rejects.toThrow(TRPCError)
  })
})

describe("AC-04: anonymous enquiry retroactive linking", () => {
  it("links anonymous enquiries by matching email", async () => {
    await seedUsers(db, [{ id: ACCOUNT_ID, name: "Alice Producer", email: ACCOUNT_EMAIL }])

    // Create a listing for the enquiry to reference
    const [listing] = await db.insert(listings).values({
      accountId: null,
      entityType: "company",
      name: "Test Company",
      slug: "test-company-anon",
    }).returning()

    // Insert anonymous enquiries with matching email
    await db.insert(enquiryRecords).values([
      {
        senderEmail: ACCOUNT_EMAIL,
        senderAccountId: null,
        listingId: listing.id,
        body: "Interested in your services",
      },
      {
        senderEmail: ACCOUNT_EMAIL,
        senderAccountId: null,
        listingId: listing.id,
        body: "Follow-up question",
      },
      {
        senderEmail: "other@example.com",
        senderAccountId: null,
        listingId: listing.id,
        body: "Different person",
      },
    ])

    const linked = await linkAnonymousEnquiries(db, ACCOUNT_ID, ACCOUNT_EMAIL)
    expect(linked).toBe(2)

    // Verify the records were updated
    const records = await db
      .select()
      .from(enquiryRecords)
      .where(eq(enquiryRecords.senderAccountId, ACCOUNT_ID))

    expect(records).toHaveLength(2)
  })

  it("does not re-link already linked enquiries", async () => {
    await seedUsers(db, [
      { id: ACCOUNT_ID, name: "Alice", email: ACCOUNT_EMAIL },
      { id: "other-account", name: "Bob", email: "bob@example.com" },
    ])

    const [listing] = await db.insert(listings).values({
      accountId: null,
      entityType: "company",
      name: "Test Company",
      slug: "test-company-nolink",
    }).returning()

    // Enquiry already linked to another account
    await db.insert(enquiryRecords).values({
      senderEmail: ACCOUNT_EMAIL,
      senderAccountId: "other-account",
      listingId: listing.id,
      body: "Already linked enquiry",
    })

    const linked = await linkAnonymousEnquiries(db, ACCOUNT_ID, ACCOUNT_EMAIL)
    expect(linked).toBe(0)
  })

  it("returns 0 when no anonymous enquiries match", async () => {
    await seedUsers(db, [{ id: ACCOUNT_ID, name: "Alice", email: ACCOUNT_EMAIL }])

    const linked = await linkAnonymousEnquiries(db, ACCOUNT_ID, ACCOUNT_EMAIL)
    expect(linked).toBe(0)
  })

  it("ensureProfile triggers anonymous enquiry linking", async () => {
    await seedUsers(db, [{ id: ACCOUNT_ID, name: "Alice Producer", email: ACCOUNT_EMAIL }])

    const [listing] = await db.insert(listings).values({
      accountId: null,
      entityType: "company",
      name: "Test Company",
      slug: "test-company-ensure",
    }).returning()

    await db.insert(enquiryRecords).values({
      senderEmail: ACCOUNT_EMAIL,
      senderAccountId: null,
      listingId: listing.id,
      body: "Anonymous enquiry",
    })

    const router = createOnboardingRouter({ db })
    const session = makeSession({ accountId: ACCOUNT_ID, email: ACCOUNT_EMAIL })
    const caller = router.createCaller(ctx(session))

    const result = await caller.ensureProfile()
    expect(result.linked).toBe(1)
  })
})

describe("AC-05: listing creation blocked for unverified email", () => {
  it("assertEmailVerified throws FORBIDDEN when email not verified", () => {
    const session = makeSession({
      accountId: ACCOUNT_ID,
      email: ACCOUNT_EMAIL,
      emailVerified: false,
    })

    expect(() => assertEmailVerified(session)).toThrow(TRPCError)

    try {
      assertEmailVerified(session)
    } catch (err) {
      expect((err as TRPCError).code).toBe("FORBIDDEN")
    }
  })

  it("assertEmailVerified passes when email is verified", () => {
    const session = makeSession({
      accountId: ACCOUNT_ID,
      email: ACCOUNT_EMAIL,
      emailVerified: true,
    })

    expect(() => assertEmailVerified(session)).not.toThrow()
  })

  it("verifiedProcedure rejects unverified email with FORBIDDEN", async () => {
    const testRouter = router({
      guarded: verifiedProcedure.mutation(() => "ok"),
    })
    const session = makeSession({
      accountId: ACCOUNT_ID,
      email: ACCOUNT_EMAIL,
      emailVerified: false,
    })
    const caller = testRouter.createCaller(ctx(session))

    await expect(caller.guarded()).rejects.toThrow(TRPCError)
    try {
      await caller.guarded()
    } catch (err) {
      expect((err as TRPCError).code).toBe("FORBIDDEN")
    }
  })

  it("verifiedProcedure passes when email is verified", async () => {
    const testRouter = router({
      guarded: verifiedProcedure.mutation(() => "ok"),
    })
    const session = makeSession({
      accountId: ACCOUNT_ID,
      email: ACCOUNT_EMAIL,
      emailVerified: true,
    })
    const caller = testRouter.createCaller(ctx(session))

    const result = await caller.guarded()
    expect(result).toBe("ok")
  })

  it("verifiedProcedure rejects unauthenticated with UNAUTHORIZED", async () => {
    const testRouter = router({
      guarded: verifiedProcedure.mutation(() => "ok"),
    })
    const caller = testRouter.createCaller(ctx(null))

    await expect(caller.guarded()).rejects.toThrow(TRPCError)
    try {
      await caller.guarded()
    } catch (err) {
      expect((err as TRPCError).code).toBe("UNAUTHORIZED")
    }
  })
})
