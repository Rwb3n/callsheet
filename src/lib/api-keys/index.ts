// API key infrastructure — CS-WORK-099
// Key generation (crypto-random), hashing (SHA-256), validation (DB lookup)

import { createHash, randomBytes } from "crypto"
import { eq, and, isNull } from "drizzle-orm"
import type { Db } from "@/db/types"
import { apiKeys } from "@/db/schema/shared"
import { user } from "@/db/schema/auth"
import type { AuthSession } from "@/lib/auth"

export type GeneratedKey = {
  key: string      // plaintext — show once, never store
  keyPrefix: string // first 8 chars for identification
  keyHash: string   // SHA-256 hex — stored in DB
}

export function generateApiKey(): GeneratedKey {
  const key = randomBytes(32).toString("hex") // 64 hex chars
  const keyPrefix = key.slice(0, 8)
  const keyHash = hashKey(key)
  return { key, keyPrefix, keyHash }
}

export function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex")
}

export async function validateApiKey(
  db: Db,
  keyHash: string,
): Promise<AuthSession | null> {
  // Look up the key — must exist and not be revoked
  const [keyRow] = await db
    .select({
      id: apiKeys.id,
      accountId: apiKeys.accountId,
      revokedAt: apiKeys.revokedAt,
    })
    .from(apiKeys)
    .where(and(eq(apiKeys.keyHash, keyHash), isNull(apiKeys.revokedAt)))
    .limit(1)

  if (!keyRow) return null

  // Look up the user to build AuthSession
  const [userRow] = await db
    .select({
      id: user.id,
      email: user.email,
      emailVerified: user.emailVerified,
      role: user.role,
      createdAt: user.createdAt,
    })
    .from(user)
    .where(eq(user.id, keyRow.accountId))
    .limit(1)

  if (!userRow) return null

  // Update lastUsedAt — awaited for audit trail reliability
  await db.update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.id, keyRow.id))

  return {
    accountId: userRow.id,
    email: userRow.email,
    emailVerified: userRow.emailVerified,
    role: (userRow.role ?? "user") as "user" | "admin",
    createdAt: userRow.createdAt.toISOString(),
  }
}
