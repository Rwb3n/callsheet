// Admin API keys router — CS-WORK-100
// 3 routes: create, list, revoke
// All adminProcedure.

import { z } from "zod"
import { eq, desc } from "drizzle-orm"
import { TRPCError } from "@trpc/server"
import { router, adminProcedure } from "@/server/trpc"
import type { Db } from "@/db/types"
import { apiKeys } from "@/db/schema/shared"
import { generateApiKey } from "@/lib/api-keys"
import type { DecisionLogDb } from "@/lib/decisions/logger"
import { logDecision } from "@/lib/decisions/logger"

export type AdminApiKeysRouterDeps = {
  db: Db
  decisionLogDb: DecisionLogDb
}

export function createAdminApiKeysRouter(deps: AdminApiKeysRouterDeps) {
  return router({
    // AC-1: generate key, store hash, return plaintext once
    create: adminProcedure
      .input(z.object({
        accountId: z.string().min(1),
        name: z.string().min(1),
        // scopes: V2-reserved. Always empty at creation. Scope enforcement deferred.
      }))
      .mutation(async ({ input, ctx }) => {
        const { key, keyPrefix, keyHash } = generateApiKey()

        const [row] = await deps.db
          .insert(apiKeys)
          .values({
            accountId: input.accountId,
            name: input.name,
            keyHash,
            keyPrefix,
          })
          .returning({ id: apiKeys.id })

        await logDecision(deps.decisionLogDb, {
          domain: "operations",
          decisionType: "api_key_created",
          inputs: { targetAccountId: input.accountId, keyName: input.name, keyPrefix },
          output: { keyId: row.id },
          accountId: ctx.session!.accountId,
        })

        // Return the plaintext key — this is the only time it's visible
        return { id: row.id, key, keyPrefix }
      }),

    // AC-2: list keys (never shows full key, shows prefix)
    list: adminProcedure
      .input(z.object({
        accountId: z.string().optional(),
        limit: z.number().int().min(1).max(50).default(20),
      }))
      .query(async ({ input }) => {
        const conditions = input.accountId ? eq(apiKeys.accountId, input.accountId) : undefined

        const rows = await deps.db
          .select({
            id: apiKeys.id,
            accountId: apiKeys.accountId,
            name: apiKeys.name,
            keyPrefix: apiKeys.keyPrefix,
            scopes: apiKeys.scopes,
            lastUsedAt: apiKeys.lastUsedAt,
            revokedAt: apiKeys.revokedAt,
            createdAt: apiKeys.createdAt,
          })
          .from(apiKeys)
          .where(conditions)
          .orderBy(desc(apiKeys.createdAt))
          .limit(input.limit)

        return rows.map((r) => ({
          id: r.id,
          accountId: r.accountId,
          name: r.name,
          keyPrefix: r.keyPrefix,
          scopes: r.scopes,
          lastUsedAt: r.lastUsedAt?.toISOString() ?? null,
          revokedAt: r.revokedAt?.toISOString() ?? null,
          createdAt: r.createdAt.toISOString(),
        }))
      }),

    // AC-3: revoke a key
    revoke: adminProcedure
      .input(z.object({ keyId: z.string().uuid() }))
      .mutation(async ({ input, ctx }) => {
        const [row] = await deps.db
          .select({ id: apiKeys.id, revokedAt: apiKeys.revokedAt })
          .from(apiKeys)
          .where(eq(apiKeys.id, input.keyId))
          .limit(1)

        if (!row) {
          throw new TRPCError({ code: "NOT_FOUND", message: "API key not found" })
        }
        if (row.revokedAt) {
          throw new TRPCError({ code: "CONFLICT", message: "API key is already revoked" })
        }

        await deps.db
          .update(apiKeys)
          .set({ revokedAt: new Date() })
          .where(eq(apiKeys.id, input.keyId))

        await logDecision(deps.decisionLogDb, {
          domain: "operations",
          decisionType: "api_key_revoked",
          inputs: { keyId: input.keyId },
          output: { action: "revoked" },
          accountId: ctx.session!.accountId,
        })
      }),
  })
}
