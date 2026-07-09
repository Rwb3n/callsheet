// Admin API keys router integration tests — CS-WORK-100

import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { getTestDb, resetDb, closeTestDb } from "@/db/test-utils"
import {
  makeUUID,
  makeAdminSession,
  makeSession,
  ctx,
  seedTestUser,
  expectTRPCError,
  createDecisionLogDb,
} from "@/db/test-fixtures"
import { createAdminApiKeysRouter } from "@/server/routers/admin/api-keys"

const db = getTestDb()
const decisionLogDb = createDecisionLogDb(db)
const adminId = makeUUID("admin001")
const targetUserId = makeUUID("target01")

const router = createAdminApiKeysRouter({ db, decisionLogDb })
const caller = router.createCaller(ctx(makeAdminSession(adminId)))
const userCaller = router.createCaller(ctx(makeSession({ accountId: makeUUID("user001") })))

beforeEach(async () => {
  await resetDb()
  await seedTestUser(db, adminId, "admin@test.com")
  await seedTestUser(db, targetUserId, "target@test.com")
})

afterAll(async () => {
  await closeTestDb()
})

describe("admin.apiKeys.create", () => {
  it("AC-1: generates key, returns plaintext and prefix", async () => {
    const result = await caller.create({
      accountId: targetUserId,
      name: "CLI access",
    })

    expect(result.id).toBeDefined()
    expect(result.key).toHaveLength(64)
    expect(result.keyPrefix).toBe(result.key.slice(0, 8))
  })

  it("AC-1: key appears in list after creation", async () => {
    const created = await caller.create({
      accountId: targetUserId,
      name: "Test key",
    })

    const keys = await caller.list({ accountId: targetUserId })
    expect(keys).toHaveLength(1)
    expect(keys[0].name).toBe("Test key")
    expect(keys[0].keyPrefix).toBe(created.keyPrefix)
    expect(keys[0].scopes).toEqual([]) // V2-reserved, always empty
  })
})

describe("admin.apiKeys.list", () => {
  it("AC-2: returns keys without full key, with prefix", async () => {
    await caller.create({ accountId: targetUserId, name: "Key 1" })
    await caller.create({ accountId: targetUserId, name: "Key 2" })
    await caller.create({ accountId: adminId, name: "Admin key" })

    const allKeys = await caller.list({ limit: 20 })
    expect(allKeys).toHaveLength(3)

    const targetKeys = await caller.list({ accountId: targetUserId })
    expect(targetKeys).toHaveLength(2)

    // Verify no full key is returned
    for (const k of allKeys) {
      expect(k.keyPrefix).toHaveLength(8)
      expect(k).not.toHaveProperty("key")
      expect(k).not.toHaveProperty("keyHash")
    }
  })
})

describe("admin.apiKeys.revoke", () => {
  it("AC-3: sets revokedAt on key", async () => {
    const created = await caller.create({ accountId: targetUserId, name: "To revoke" })

    await caller.revoke({ keyId: created.id })

    const keys = await caller.list({ accountId: targetUserId })
    expect(keys[0].revokedAt).not.toBeNull()
  })

  it("AC-3: rejects revoking already-revoked key", async () => {
    const created = await caller.create({ accountId: targetUserId, name: "To revoke" })
    await caller.revoke({ keyId: created.id })

    await expectTRPCError(
      caller.revoke({ keyId: created.id }),
      "CONFLICT",
      "already revoked",
    )
  })

  it("AC-3: throws NOT_FOUND for missing key", async () => {
    await expectTRPCError(
      caller.revoke({ keyId: makeUUID("nonexist") }),
      "NOT_FOUND",
    )
  })
})

describe("AC-4: admin auth enforcement", () => {
  it("create requires adminProcedure", async () => {
    await expect(userCaller.create({ accountId: targetUserId, name: "test" }))
      .rejects.toThrow("Admin access required")
  })

  it("list requires adminProcedure", async () => {
    await expect(userCaller.list({}))
      .rejects.toThrow("Admin access required")
  })

  it("revoke requires adminProcedure", async () => {
    await expect(userCaller.revoke({ keyId: makeUUID("any00001") }))
      .rejects.toThrow("Admin access required")
  })
})
