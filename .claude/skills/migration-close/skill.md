---
name: migration-close
description: Run the post-migration checklist after drizzle-kit generate or push. Use when user says "migration done", "after drizzle generate", "migration close", "post-migration", or after creating a new Drizzle migration. Diffs new tables against truncation lists, runs db:custom-sql, and optionally verifies tables exist.
---

# Migration Close

## Instructions

Execute the post-migration checklist. This catches the three recurring failure modes: (1) new tables missing from truncation lists in `test-utils.ts`, (2) `db:custom-sql` not run after `drizzle-kit push`, (3) new tables not actually created in the database.

**Input:** Either:
- A migration file path (e.g., `drizzle/0013_blushing_mimic.sql`)
- "latest" — find the most recent migration file by glob
- Nothing — find the most recent migration file by glob

---

### Step 1: Identify New Tables

1. **Find the migration file.** If not specified, glob `drizzle/*.sql` and pick the most recently modified file.

2. **Read the migration file.** Extract all `CREATE TABLE` statements. Collect the table names (unquoted, e.g., `commercial_state` not `"commercial_state"`).

3. **If no CREATE TABLE statements exist** (migration is ALTER only or index only), report "No new tables — truncation list update not needed" and skip to Step 3.

---

### Step 2: Diff Against Truncation Lists

1. **Read `src/db/test-utils.ts`.**

2. **Extract table names from `TRUNCATE_ALL_TABLES_SQL`** (the TRUNCATE TABLE comma-separated list).

3. **Extract table names from `DELETE_ALL_TABLES_SQL`** (the DELETE FROM statement list).

4. **Diff:** For each new table from Step 1, check:
   - Present in TRUNCATE list? (yes/no)
   - Present in DELETE list? (yes/no)

5. **Report the diff:**

```
## Truncation List Check

| Table | TRUNCATE list | DELETE list |
|-------|:---:|:---:|
| {table_name} | {present or MISSING} | {present or MISSING} |

{If any MISSING: "Add the following tables to both lists in `src/db/test-utils.ts`. Insert in reverse-FK order (new tables before their FK targets)."}
{If all present: "All new tables already in both truncation lists."}
```

6. **If tables are MISSING**, show the user the exact edit needed — which line to insert at, maintaining reverse-FK order. **Reverse-FK ordering rule:** In the DELETE list, leaf tables (those with FK references to other tables) go FIRST — delete rows from the referencing table before the referenced table. To determine order: read the new table's column definitions for `references(...)` — any referenced table must appear AFTER the referencing table in DELETE. In the TRUNCATE list with CASCADE, order matters less but follow the same convention for consistency. Do NOT auto-edit — present the edit and ask the user to confirm.

---

### Step 3: Run db:custom-sql

If `drizzle-kit push` was run (not just `generate`), remind the user:

```
Run `npm run db:custom-sql` to apply custom SQL (extensions, triggers, functions, custom indexes).
`drizzle-kit push` does NOT execute custom SQL from migrations.
```

If the user confirms push was run, execute `npm run db:custom-sql`.

If only `drizzle-kit generate` was run (no push yet), skip this step — the user will push later.

---

### Step 4: Verify Tables Exist (optional)

**Only if `drizzle-kit push` was run**, offer to verify new tables exist:

```
Verify new tables exist in the database? (y/n)
```

If yes, for each new table from Step 1, run:

```sql
SELECT 1 FROM {table_name} LIMIT 0
```

via the test database connection. Report results:

```
## Table Verification

| Table | Exists |
|-------|:---:|
| {table_name} | {yes or FAILED} |
```

This catches the edge case where `drizzle-kit push` silently fails to create a table (has happened with schema-only work items that have no integration tests exercising the new tables).

---

### Step 5: Summary

Output a concise summary:

```
## Migration Close — {migration_file}

**New tables:** {count} ({comma-separated names}, or "none")
**Truncation lists:** {all present / N tables added}
**db:custom-sql:** {ran / skipped (generate only) / user to run}
**Table verification:** {all exist / N failed / skipped}
```

---

## What This Skill Does NOT Do

- Does not run `drizzle-kit generate` or `drizzle-kit push` — those happen before this skill.
- Does not modify schema files — the migration is already generated.
- Does not update IMPLEMENTATION-TRACKER — that's session-close's job.
- Does not auto-edit `test-utils.ts` without user confirmation — the reverse-FK ordering is critical and the user should verify.

---

## When to Use

- After running `drizzle-kit generate` to create a new migration file.
- After running `drizzle-kit push` to apply schema changes.
- User says "migration done", "after drizzle generate", "migration close", "post-migration", "check truncation lists".

---

## Why This Exists

Three post-migration checklist items are easy to forget and have caused test failures:
1. **Truncation list miss** — new tables not added to `TRUNCATE_ALL_TABLES_SQL` or `DELETE_ALL_TABLES_SQL`, causing `resetDb()` to leave stale data. Has bitten us twice.
2. **db:custom-sql not run** — `drizzle-kit push` doesn't execute custom SQL (pg_trgm extension, search vector triggers, GIN/GiST indexes). Tests pass but search doesn't work.
3. **Table not created** — schema-only work items (no routes/consumers) don't exercise new tables through integration tests. The truncation list pass only confirms the name is valid SQL, not that the table was created.
