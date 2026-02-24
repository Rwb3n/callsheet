// Correspondence DSAR queries — Communications Phase 1
// Standalone functions for DSAR extract and erasure. Not wired into the erasure flow (S10).

import { eq, or } from "drizzle-orm"
import type { Db } from "@/db/types"
import { correspondenceLog } from "@/db/schema/correspondence"

export async function getCorrespondenceForAccount(
  db: Db,
  params: { accountId?: string; email?: string },
): Promise<(typeof correspondenceLog.$inferSelect)[]> {
  const conditions = []

  if (params.accountId) {
    conditions.push(eq(correspondenceLog.accountId, params.accountId))
  }
  if (params.email) {
    conditions.push(eq(correspondenceLog.externalEmail, params.email))
  }

  if (conditions.length === 0) return []

  return db
    .select()
    .from(correspondenceLog)
    .where(conditions.length === 1 ? conditions[0] : or(...conditions))
}

export async function anonymiseCorrespondence(
  db: Db,
  params: { accountId?: string; email?: string },
): Promise<number> {
  const conditions = []

  if (params.accountId) {
    conditions.push(eq(correspondenceLog.accountId, params.accountId))
  }
  if (params.email) {
    conditions.push(eq(correspondenceLog.externalEmail, params.email))
  }

  if (conditions.length === 0) return 0

  const updated = await db
    .update(correspondenceLog)
    .set({
      externalEmail: "[erased]",
      subject: "[erased]",
      bodyText: "[erased]",
      mergeFieldsHash: null,
      attachmentMeta: null,
      accountId: null,
    })
    .where(conditions.length === 1 ? conditions[0] : or(...conditions))
    .returning({ id: correspondenceLog.id })

  return updated.length
}
