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

/** TRUNCATE for E2E reset endpoint (runs once per suite, not per test). */
export const TRUNCATE_ALL_TABLES_SQL = sql`
  TRUNCATE TABLE
    principal_briefings,
    ceremony_runs,
    perception_aggregates,
    decay_signals,
    enrichment_schedules,
    learning_hypotheses,
    sponsored_impressions,
    churn_analysis_log,
    commercial_state,
    billing_reconciliation_status,
    billing_holds,
    churn_risk_registry,
    compliance_register,
    task_specs,
    support_tickets,
    notifications,
    grace_periods,
    pending_cancellations,
    processed_paddle_events,
    suppressed_emails,
    correspondence_log,
    shortlist_items,
    shortlists,
    enquiry_records,
    search_history,
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

// DELETE in reverse-FK order — no ACCESS EXCLUSIVE locks, ~2ms on empty tables
// vs ~9.5s for TRUNCATE CASCADE. Same correctness for beforeEach.
const DELETE_ALL_TABLES_SQL = sql`
  DELETE FROM principal_briefings;
  DELETE FROM ceremony_runs;
  DELETE FROM perception_aggregates;
  DELETE FROM decay_signals;
  DELETE FROM enrichment_schedules;
  DELETE FROM learning_hypotheses;
  DELETE FROM sponsored_impressions;
  DELETE FROM churn_analysis_log;
  DELETE FROM commercial_state;
  DELETE FROM billing_reconciliation_status;
  DELETE FROM billing_holds;
  DELETE FROM churn_risk_registry;
  DELETE FROM compliance_register;
  DELETE FROM task_specs;
  DELETE FROM support_tickets;
  DELETE FROM notifications;
  DELETE FROM grace_periods;
  DELETE FROM pending_cancellations;
  DELETE FROM processed_paddle_events;
  DELETE FROM suppressed_emails;
  DELETE FROM correspondence_log;
  DELETE FROM shortlist_items;
  DELETE FROM shortlists;
  DELETE FROM enquiry_records;
  DELETE FROM search_history;
  DELETE FROM saved_searches;
  DELETE FROM account_profiles;
  DELETE FROM listing_taxonomy_tags;
  DELETE FROM credits;
  DELETE FROM media_items;
  DELETE FROM social_profiles;
  DELETE FROM accreditations;
  DELETE FROM pending_enquiries;
  DELETE FROM pre_claim_snapshots;
  DELETE FROM additional_locations;
  DELETE FROM quality_score_explanations;
  DELETE FROM quality_scores;
  DELETE FROM engagements;
  DELETE FROM verifications;
  DELETE FROM zero_result_queries;
  DELETE FROM controlled_vocabulary;
  DELETE FROM search_synonyms;
  DELETE FROM listings;
  DELETE FROM taxonomy_specialisations;
  DELETE FROM taxonomy_service_areas;
  DELETE FROM taxonomy_sectors;
  DELETE FROM deferred_actions;
  DELETE FROM orchestrated_flows;
  DELETE FROM decision_logs;
  DELETE FROM event_consumer_errors;
  DELETE FROM verification;
  DELETE FROM session;
  DELETE FROM account;
  DELETE FROM "user"
`

/** Delete all rows from application tables. Call in beforeEach/afterEach. */
export async function resetDb() {
  const db = getTestDb()
  await db.execute(DELETE_ALL_TABLES_SQL)
}

/** Close the pool. Call in afterAll. */
export async function closeTestDb() {
  if (_pool) {
    await _pool.end()
    _pool = null
    _db = null
  }
}
