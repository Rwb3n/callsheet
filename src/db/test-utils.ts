// Integration test utilities — provides a real Drizzle client against local Supabase Postgres.
// Usage: import { testDb, resetDb, closeTestDb } from "@/db/test-utils"

import { drizzle } from "drizzle-orm/node-postgres"
import { sql } from "drizzle-orm"
import pg from "pg"

let _pool: pg.Pool | null = null
let _db: ReturnType<typeof drizzle> | null = null

function getTestUrl(): string {
  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Start Supabase: npx supabase start",
    )
  }
  return url
}

/** Lazy singleton — one Pool per test process. */
export function getTestDb() {
  if (!_db) {
    _pool = new pg.Pool({ connectionString: getTestUrl(), max: 3 })
    _db = drizzle({ client: _pool })
  }
  return _db
}

/** Truncate SQL shared between test resetDb() and /api/test/reset endpoint. */
export const TRUNCATE_ALL_TABLES_SQL = sql`
  TRUNCATE TABLE
    grace_periods,
    pending_cancellations,
    processed_paddle_events,
    suppressed_emails,
    correspondence_log,
    shortlist_items,
    shortlists,
    enquiry_records,
    saved_searches,
    account_profiles,
    listing_taxonomy_tags,
    credits,
    media_items,
    social_profiles,
    accreditations,
    pending_enquiries,
    pre_claim_snapshots,
    additional_locations,
    quality_score_explanations,
    quality_scores,
    engagements,
    verifications,
    zero_result_queries,
    controlled_vocabulary,
    search_synonyms,
    listings,
    taxonomy_specialisations,
    taxonomy_service_areas,
    taxonomy_sectors,
    deferred_actions,
    orchestrated_flows,
    decision_logs,
    event_consumer_errors,
    verification,
    session,
    account,
    "user"
  CASCADE
`

/** Truncate all application tables. Call in beforeEach/afterEach. */
export async function resetDb() {
  const db = getTestDb()
  await db.execute(TRUNCATE_ALL_TABLES_SQL)
}

/** Close the pool. Call in afterAll. */
export async function closeTestDb() {
  if (_pool) {
    await _pool.end()
    _pool = null
    _db = null
  }
}
