// Typed wrapper for db.execute() raw SQL queries.
// Eliminates `as unknown as` / `as T[]` casts at each callsite.

import type { Db } from "./types"
import type { SQL } from "drizzle-orm"

export async function rawQuery<T>(db: Db, query: SQL): Promise<T[]> {
  const result = await db.execute(query)
  return result.rows as T[]
}
