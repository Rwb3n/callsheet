---
triaged: true
status: active
---

# Retro: Demo Prep Session

**Date:** 2026-02-25
**Scope:** Local demo prep — login/signup pages, demo seed script, walkthrough verification. CH-CS-014 follow-on.

---

## 1 — Reflection

| Prompt | Notes |
|--------|-------|
| **What surprised you?** | Better Auth CSRF origin validation blocked login immediately. The dev server silently fell back to port 3001 (another Next.js project on 3000), but `BETTER_AUTH_URL` in `.env.local` still pointed to `:3000`. This was a known pattern from E2E testing (Origin header requirement) but not anticipated for local dev walkthrough. |
| **What went well?** | Login/signup pages were clean and fast to produce — shadcn Card + Input + Button, direct fetch to Better Auth endpoints. Demo seed script created 6 realistic listings with taxonomy, verification tiers, quality scores, and credits in one pass. Search API immediately returned all 6 listings ranked correctly with facets and sponsored results. All 353 unit + 591 integration tests stayed green throughout. |
| **Could have gone better?** | 1. Taxonomy seed ordering: first demo seed run created listings before taxonomy was seeded, so all taxonomy tags were silently skipped. Had to clean and re-run. `db:reset` pipeline order matters — taxonomy MUST precede demo. 2. `DATABASE_URL` not auto-loaded by `tsx` — seed scripts require explicit env var or a dotenv import. Taxonomy seed had the same issue but was always run via `db:reset` which chains from `supabase db reset`. 3. No automated smoke test for the CSRF/origin issue — only discovered by manual browser testing. |
| **Keep doing** | Idempotent seed scripts (ON CONFLICT DO NOTHING / existence checks). Using Better Auth's own `hashPassword` rather than reimplementing scrypt. Type-checking after every change. |
| **Stop doing** | Assuming port 3000 is available. Assuming `.env.local` is loaded by all runtimes. |
| **Start doing** | 1. Add `BETTER_AUTH_URL` port-mismatch guard or documentation. 2. Validate demo seed works end-to-end as part of the `db:reset` pipeline (not just individual scripts). 3. Consider a `dev:demo` script that seeds + starts dev server with correct env. |

---

## 2 — Classification

| # | Item | Bucket | Detail |
|---|------|--------|--------|
| 1 | Better Auth CSRF rejects login when `BETTER_AUTH_URL` port doesn't match dev server port | Bug | Dev server falls to :3001 when :3000 is occupied. `BETTER_AUTH_URL=http://localhost:3000` then mismatches. Login form gets 403 "Invalid origin". Fix: either document the port constraint, or make the login page / auth config resilient to port fallback. |
| 2 | Demo seed created listings without taxonomy tags on first run (taxonomy not yet seeded) | Bug | `db:seed-demo` silently logged warnings but created listings without tags. Re-running skipped existing listings. Required manual cleanup + re-seed. Fix: demo seed should verify taxonomy exists or fail fast. |
| 3 | `DATABASE_URL` not auto-loaded by `tsx` for seed scripts | Bug | `npm run db:seed-demo` fails with "DATABASE_URL is not set" unless explicitly provided. Other scripts (`db:custom-sql`) hardcode a fallback. Demo seed should match that pattern. |
| 4 | Search API returns all 6 listings correctly ranked with facets, sponsored, taxonomy | Feature | Protect — confirms S6 search router works end-to-end with real data. |
| 5 | Login/signup pages cleanly produced with shadcn primitives | Feature | Two pages, ~80 lines each, calling Better Auth directly. Redirect param support. Suspense boundary. |
| 6 | Sign-out button missing from dashboard (added during session) | Feature request | Was not in CH-CS-014 spec. Added to sidebar during demo prep. Should be documented. |
| 7 | No `dev:demo` convenience script | Feature request | A single command that resets DB, seeds everything, and starts dev server would eliminate the multi-step manual process and port/env issues. |
| 8 | `supabase` CLI not on PATH — `db:reset` script fails | Bug | `package.json` `db:reset` uses bare `supabase` command, which isn't on PATH. Works only via `npx supabase`. Had to run each step manually with `npx` prefix. |

---

## 3 — Action Register

| # | Item | Priority | Status | Owner | Definition of Done |
|---|------|----------|--------|-------|--------------------|
| 1 | ~~Fix Better Auth CSRF origin mismatch for dev~~ | now | done | Platform | **DONE.** `trustedOrigins` added to `src/lib/auth.ts` — accepts `:3000`, `:3001`, `:3002` in dev. |
| 2 | Add `DATABASE_URL` fallback to demo seed (match `custom-sql.ts` pattern) | next | open | Platform | `npm run db:seed-demo` succeeds without explicit `DATABASE_URL` env by falling back to local Supabase default. |
| 3 | Add taxonomy existence check to demo seed | next | open | Platform | Demo seed fails fast with clear error if `taxonomy_sectors` table is empty, instead of silently skipping tags. |
| 4 | Fix `db:reset` to use `npx supabase` instead of bare `supabase` | next | open | Platform | `npm run db:reset` succeeds without `supabase` on PATH. |
| 5 | Create `dev:demo` convenience script | later | open | Platform | Single `npm run dev:demo` command: resets DB, seeds taxonomy + demo, starts dev server. Documents expected port in output. |
