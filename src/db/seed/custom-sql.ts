// Applies custom SQL that drizzle-kit push does not handle: extensions, triggers, indexes.
// Run after drizzle-kit push in db:reset. Idempotent (IF NOT EXISTS / OR REPLACE).

import pg from "pg"

const url = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres"

async function applyCustomSql() {
  const pool = new pg.Pool({ connectionString: url, max: 1 })

  await pool.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`)

  await pool.query(`
    CREATE OR REPLACE FUNCTION update_listing_search_vector()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.search_vector :=
        setweight(to_tsvector('english', COALESCE(NEW.name, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(NEW.headline, '')), 'B') ||
        setweight(to_tsvector('english', COALESCE(NEW.bio, '')), 'C') ||
        setweight(to_tsvector('english', COALESCE(NEW.base_region, '')), 'D');
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `)

  await pool.query(`
    CREATE OR REPLACE TRIGGER listing_search_vector_update
      BEFORE INSERT OR UPDATE OF name, headline, bio, base_region
      ON listings
      FOR EACH ROW
      EXECUTE FUNCTION update_listing_search_vector()
  `)

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_listings_search_vector ON listings USING GIN (search_vector)`)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_listings_name_trgm ON listings USING GIST (name gist_trgm_ops)`)

  // S9: Seed learning_hypotheses L1-L7 (idempotent)
  await pool.query(`
    INSERT INTO learning_hypotheses (id, hypothesis, measurement_query, updated_at)
    VALUES
      ('L1', 'Claim rejection rate inversely correlated with onboarding funnel friction', 'claim_evaluation decision logs: (rejections / total) vs onboarding_friction decision logs', NOW()),
      ('L2', 'Claim approval rate positively correlated with onboarding taxonomy suggestion quality', 'claim_evaluation AUTO_APPROVE vs onboarding_taxonomy_suggestion decision logs', NOW()),
      ('L3', 'Verification upgrade rate increases when client-confirmed credits > 2', 'verification_upgrade decision logs: upgrade rate WHERE credits.sourcingMethod = ''client_confirmed'' > 2', NOW()),
      ('L4', 'Support ticket category ''feature_gating_confusion'' declines when in-product education appears', 'support_tickets WHERE category = ''feature_gating_confusion'' count over time vs feature_gate_nudge_delivered count', NOW()),
      ('L5', 'Conversion rate from free to standard tier increases when analytics tease fires before 50 views', 'conversion_milestone events WHERE trigger = ''analytics_tease'' AND views < 50 vs views >= 50', NOW()),
      ('L6', 'Churn rate for claimed but unverified listings 2x higher than verified', 'churn_analysis_log WHERE verification_tier = ''claimed'' vs ''verified''', NOW()),
      ('L7', 'Human procurement task completion time inversely correlated with task spec clarity score', 'task_specs completion time vs clarity score (computed from checklist length, acceptance_criteria word count)', NOW())
    ON CONFLICT (id) DO NOTHING
  `)

  await pool.end()
  console.log("[custom-sql] pg_trgm extension, search vector trigger, indexes, and learning hypotheses applied")
}

applyCustomSql().catch((err) => {
  console.error("[custom-sql] Failed:", err)
  process.exit(1)
})
