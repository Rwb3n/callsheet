import { drizzle } from "drizzle-orm/node-postgres"
import * as authSchema from "./schema/auth"
import * as sharedSchema from "./schema/shared"
import * as dalSchema from "./schema/data-and-listings"
import * as accountsSchema from "./schema/accounts"
import * as correspondenceSchema from "./schema/correspondence"

const schema = { ...authSchema, ...sharedSchema, ...dalSchema, ...accountsSchema, ...correspondenceSchema }

// Lazy singleton — no connection attempt until first query
let _db: ReturnType<typeof drizzle> | null = null

export function getDb() {
  if (!_db) {
    const url = process.env.DATABASE_URL
    if (!url) throw new Error("DATABASE_URL is not set")
    _db = drizzle({ connection: url, schema })
  }
  return _db
}

export { schema }
