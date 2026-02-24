// Correspondence log writer — Communications Phase 1
// Writes rows to correspondence_log table. Used by LoggingEmailService decorator.

import { createHash } from "crypto"
import type { Db } from "@/db/types"
import { correspondenceLog } from "@/db/schema/correspondence"

export type CorrespondenceRow = typeof correspondenceLog.$inferInsert

export interface CorrespondenceWriter {
  writeRow(row: CorrespondenceRow): Promise<string>
}

export class DbCorrespondenceWriter implements CorrespondenceWriter {
  constructor(private db: Db) {}

  async writeRow(row: CorrespondenceRow): Promise<string> {
    const [inserted] = await this.db
      .insert(correspondenceLog)
      .values(row)
      .returning({ id: correspondenceLog.id })

    return inserted.id
  }
}

// Test implementation — stores rows in memory for assertions
export class InMemoryCorrespondenceWriter implements CorrespondenceWriter {
  private rows: (CorrespondenceRow & { id: string })[] = []
  private counter = 0

  async writeRow(row: CorrespondenceRow): Promise<string> {
    const id = row.id ?? `test-corr-${++this.counter}`
    this.rows.push({ ...row, id })
    return id
  }

  getRows(): (CorrespondenceRow & { id: string })[] {
    return [...this.rows]
  }

  clear(): void {
    this.rows = []
    this.counter = 0
  }
}

/**
 * SHA-256 hex digest of merge fields with keys sorted alphabetically.
 * Deterministic: same input → same hash. Merge field content NOT stored.
 */
export function computeMergeFieldsHash(data: Record<string, unknown>): string {
  const sorted = JSON.stringify(data, Object.keys(data).sort())
  return createHash("sha256").update(sorted).digest("hex")
}
