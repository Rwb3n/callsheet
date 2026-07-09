# reference/ — Quarantined Data

**Status:** Active quarantine. This directory is gitignored — nothing in it enters the repository.

## Contents

| File | Origin | Quarantine reason |
|------|--------|-------------------|
| `4rfv_directory.db` | 4RFV directory scrape (pre-2026-02), ~4,657 company rows including emails/phones | UK sui generis database right prohibits systematic extraction/re-utilisation. Seed Source Register (venture spike 2026-07-09, deliverable 5) constrains 4RFV to **category counts only** — no record extraction. Records additionally contain personal data (emails) collected without an Article 14 notice path. |

## Non-use decision (recorded 2026-07-10)

The 4RFV records in `4rfv_directory.db` are NOT used for listing seeding. P1 seeding is Companies House-primary (OGL v3, corporate data) per the Seed Source Register. `src/scripts/import/extract-4rfv.ts` is retired as an extractor and retained only as a pipeline-shape reference for `extract-ch.ts`.

Permitted use of this file: aggregate category/subcategory counts for internal decision support (density mapping), nothing else. Any proposal to extract records must cite a lawful basis and update this file first.

The file was removed from git tracking on 2026-07-10 and purged from all git history the same day (`git filter-repo`, force-pushed; pre-purge backup bundle retained locally at `../callsheet-pre-purge-2026-07-10.bundle`). Old commit SHAs may remain resolvable on GitHub's servers until their garbage collection runs; contact GitHub support if immediate object removal is required.
