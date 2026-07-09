# MEMORY

Recreated 2026-07-10 — the prior MEMORY.md was lost with the local workspace history (repo had drifted ~40 uncommitted work items from 2026-03-28..30; committed and pushed 2026-07-10).

## Next Session Handoff

**Date:** 2026-07-10
**Test health:** 850 unit + 1215 integration = 2,065 pass, 0 type errors, 0 failures. (First integration run failed on a cold Docker DB — re-run before diagnosing "failures" if Supabase containers just started.)

**What happened this session:**

- **Venture model adopted as deployment authority.** External spike (SOVEREIGN_PROJECT, 2026-07-09, at `D:\PROJECTS\SOVEREIGN_PROJECT\docs\research\callsheet-venture-2026-07-09\callsheet\`) proposed a signal-gated phase model (P1 Inert Directory → P5 Autonomy). Adopted with two pre-registered amendments: P1/P2 decoupling (claim invites at week 4–6, not after the SEO gate) and a P2 deliverability validity condition (bounce <10%, ≥85% delivered, read via correspondence_log). Governing artifact: `0-strategic-frame/phase-gate-model.md`. Entity frame got a Deployment Posture addendum (design authority retained, deployment authority ceded).
- **Work management restructured:** deployment-e2 arc + CH-CS-026/027 superseded (CS-WORK-123–128 retired unused). New arc `venture-p1` with CH-CS-028 (Inertness & Takedown, active, 5 parallel items), CH-CS-029 (CH Seed Pipeline), CH-CS-030 (P1 Deploy), CH-CS-031 (P2 Prep build-ahead). 58 AC total, CS-WORK-129–141.
- **4RFV database quarantined AND purged from history:** removed from git tracking, moved to gitignored `reference/` with recorded non-use decision (sui generis DB right + scraped personal data). Principal approved history purge — executed via `git filter-repo` + force push. **All commit hashes changed** (HEAD now a1f0143); any external clone (including the lab's spike clone) must re-clone. Pre-purge backup: `../callsheet-pre-purge-2026-07-10.bundle`.
- March working tree committed as 4 logical commits and pushed.

**Next work:** CH-CS-028 items CS-WORK-129–133 — all independent, no principal gates. Start with `/impl 129` (env gates + inertness verification; it defines the P1 allowlist the other items reference). Local-repo facts already verified: Resend webhook fail-open at `src/app/api/webhooks/email/events/route.ts:17`; scheduler has no production caller (ghost — Article 14 phase-5 depends on it, hence CS-WORK-132); auth email fix pre-satisfied (CS-WORK-101).

**Blockers / principal actions:** P0 items in `open-actions.md` (domain ownership is scope-changing and first; GSC; CH API key; Vercel/Supabase; enrichment acceleration). History purge decision.

**Spike staleness caution:** the spike audited the GitHub clone at 2026-03-22 — it predates S10 implementation and all of CS-E2. Its findings were re-verified locally this session; do not re-import its stale claims (e.g. "auth email broken", "S10 unbuilt").
