// Custom Drizzle column types — S1 §1.2 [S1-ST-15]
// Drizzle has no built-in tsvector type; this factory creates one.

import { customType } from "drizzle-orm/pg-core"
import type { NodePgDatabase } from "drizzle-orm/node-postgres"

export const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector"
  },
})

// Schema-agnostic DB type for domain modules.
// getTestDb() returns Record<string, unknown>, typed getDb() returns a concrete schema.
// This alias accepts both without per-file eslint-disable.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Db = NodePgDatabase<any>
