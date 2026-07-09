// Admin users router integration tests — CS-WORK-096

import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { eq } from "drizzle-orm"
import { getTestDb, resetDb, closeTestDb } from "@/db/test-utils"
import {
  makeUUID,
  makeAdminSession,
  makeSession,
  ctx,
  seedTestUser,
  expectTRPCError,
} from "@/db/test-fixtures"
import { createAdminUsersRouter } from "@/server/routers/admin/users"
import { user } from "@/db/schema/auth"

const db = getTestDb()
const adminId = makeUUID("admin001")

const router = createAdminUsersRouter({ db })
const caller = router.createCaller(ctx(makeAdminSession(adminId)))
const userCaller = router.createCaller(ctx(makeSession({ accountId: makeUUID("user001") })))

beforeEach(async () => {
  await resetDb()
  await seedTestUser(db, adminId, "admin@test.com")
})

afterAll(async () => {
  await closeTestDb()
})

describe("admin.users.list", () => {
  it("AC-1: returns paginated user list", async () => {
    await seedTestUser(db, makeUUID("user001a"), "alice@test.com")
    await seedTestUser(db, makeUUID("user002a"), "bob@test.com")

    const result = await caller.list({ limit: 20 })
    // 3 users: admin + alice + bob
    expect(result.items.length).toBeGreaterThanOrEqual(3)
  })

  it("AC-1: filters by role", async () => {
    // admin user has role "admin" (set by seedTestUser with makeAdminSession)
    // Actually, seedTestUser sets role to "user" by default. Let me update admin role.
    await db.update(user).set({ role: "admin" }).where(eq(user.id, adminId))
    await seedTestUser(db, makeUUID("user001a"), "alice@test.com")

    const admins = await caller.list({ role: "admin", limit: 20 })
    expect(admins.items.every((u) => u.role === "admin")).toBe(true)

    const users = await caller.list({ role: "user", limit: 20 })
    expect(users.items.every((u) => u.role === "user")).toBe(true)
  })

  it("AC-1: search by name or email", async () => {
    await seedTestUser(db, makeUUID("user001a"), "alice@test.com")

    const byEmail = await caller.list({ search: "alice", limit: 20 })
    expect(byEmail.items.some((u) => u.email === "alice@test.com")).toBe(true)
  })

  it("AC-1: cursor-based pagination", async () => {
    await seedTestUser(db, makeUUID("user001a"), "a@test.com")
    await seedTestUser(db, makeUUID("user002a"), "b@test.com")
    await seedTestUser(db, makeUUID("user003a"), "c@test.com")

    const page1 = await caller.list({ limit: 2 })
    expect(page1.items).toHaveLength(2)
    expect(page1.nextCursor).toBeDefined()
  })
})

describe("admin.users.getDetail", () => {
  it("AC-2: returns user detail with profile", async () => {
    const detail = await caller.getDetail({ userId: adminId })

    expect(detail.id).toBe(adminId)
    expect(detail.email).toBe("admin@test.com")
    expect(detail.profile).not.toBeNull()
  })

  it("AC-2: throws NOT_FOUND for missing user", async () => {
    await expectTRPCError(
      caller.getDetail({ userId: "nonexistent-id" }),
      "NOT_FOUND",
    )
  })
})

describe("admin.users.updateRole", () => {
  it("AC-3: updates user role", async () => {
    await seedTestUser(db, makeUUID("user001a"), "target@test.com")

    const result = await caller.updateRole({ userId: makeUUID("user001a"), role: "admin" })
    expect(result.role).toBe("admin")

    const detail = await caller.getDetail({ userId: makeUUID("user001a") })
    expect(detail.role).toBe("admin")
  })

  it("AC-3: throws NOT_FOUND for missing user", async () => {
    await expectTRPCError(
      caller.updateRole({ userId: "nonexistent-id", role: "admin" }),
      "NOT_FOUND",
    )
  })
})

describe("AC-5: admin auth enforcement", () => {
  it("list requires adminProcedure", async () => {
    await expect(userCaller.list({ limit: 20 }))
      .rejects.toThrow("Admin access required")
  })

  it("getDetail requires adminProcedure", async () => {
    await expect(userCaller.getDetail({ userId: adminId }))
      .rejects.toThrow("Admin access required")
  })

  it("updateRole requires adminProcedure", async () => {
    await expect(userCaller.updateRole({ userId: adminId, role: "admin" }))
      .rejects.toThrow("Admin access required")
  })
})
