// API key validation integration tests — CS-WORK-099 AC-3, AC-4, AC-5, AC-6

import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { eq } from "drizzle-orm"
import { getTestDb, resetDb, closeTestDb } from "@/db/test-utils"
import { seedTestUser, makeUUID } from "@/db/test-fixtures"
import { apiKeys } from "@/db/schema/shared"
import { user } from "@/db/schema/auth"
import { generateApiKey, hashKey, validateApiKey } from "../index"

const db = getTestDb()
const testUserId = makeUUID("apiuser1")

beforeEach(async () => {
  await resetDb()
  await seedTestUser(db, testUserId, "apiuser@test.com")
  // Set user role to admin for testing
  await db.update(user).set({ role: "admin" }).where(eq(user.id, testUserId))
})

afterAll(async () => {
  await closeTestDb()
})

async function insertKey(accountId: string, overrides: Partial<{ revokedAt: Date }> = {}) {
  const { key, keyPrefix, keyHash } = generateApiKey()
  await db.insert(apiKeys).values({
    accountId,
    name: "Test key",
    keyHash,
    keyPrefix,
    revokedAt: overrides.revokedAt ?? null,
  })
  return { key, keyPrefix, keyHash }
}

describe("validateApiKey", () => {
  it("AC-3: returns AuthSession for valid key", async () => {
    const { key } = await insertKey(testUserId)

    const session = await validateApiKey(db, hashKey(key))

    expect(session).not.toBeNull()
    expect(session!.accountId).toBe(testUserId)
    expect(session!.email).toBe("apiuser@test.com")
    expect(session!.role).toBe("admin")
  })

  it("AC-3: returns null for unknown key", async () => {
    const session = await validateApiKey(db, hashKey("nonexistent-key"))
    expect(session).toBeNull()
  })

  it("AC-5: rejects revoked keys", async () => {
    const { key } = await insertKey(testUserId, { revokedAt: new Date() })

    const session = await validateApiKey(db, hashKey(key))
    expect(session).toBeNull()
  })

  it("AC-6: updates lastUsedAt on validation", async () => {
    const { key, keyHash } = await insertKey(testUserId)

    // Verify lastUsedAt is initially null
    const [before] = await db
      .select({ lastUsedAt: apiKeys.lastUsedAt })
      .from(apiKeys)
      .where(eq(apiKeys.keyHash, keyHash))
    expect(before.lastUsedAt).toBeNull()

    await validateApiKey(db, hashKey(key))

    const [after] = await db
      .select({ lastUsedAt: apiKeys.lastUsedAt })
      .from(apiKeys)
      .where(eq(apiKeys.keyHash, keyHash))
    expect(after.lastUsedAt).not.toBeNull()
  })

  it("AC-4: constructs AuthSession with correct fields", async () => {
    const { key } = await insertKey(testUserId)

    const session = await validateApiKey(db, hashKey(key))

    expect(session).toMatchObject({
      accountId: testUserId,
      email: "apiuser@test.com",
      emailVerified: expect.any(Boolean),
      role: "admin",
      createdAt: expect.any(String),
    })
  })
})

describe("AC-1: api_keys table", () => {
  it("stores key with all fields", async () => {
    const { keyPrefix, keyHash } = await insertKey(testUserId)

    const [row] = await db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.keyHash, keyHash))

    expect(row.accountId).toBe(testUserId)
    expect(row.name).toBe("Test key")
    expect(row.keyHash).toBe(keyHash)
    expect(row.keyPrefix).toBe(keyPrefix)
    expect(row.scopes).toEqual([])
    expect(row.lastUsedAt).toBeNull()
    expect(row.revokedAt).toBeNull()
    expect(row.createdAt).toBeInstanceOf(Date)
  })
})
