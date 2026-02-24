# S6 Drafting Retro — Multi-Agent Pipeline + Multi-File Format

**Date:** 2026-02-14
**Scope:** S6 Buyer Experience drafting pipeline execution, assembly failure, multi-file format adoption
**Trigger:** Post-S6 v1 assembly + validation

---

## What Worked Well

**Multi-agent pipeline held up.** The 4-phase structure (skeleton → foundations → content → assembly) produced coherent output across 11 agents. No content section contradicted another except where the Phase 1 router plan was written before the decisions agent resolved D2 — which is exactly the kind of race the validation phase exists to catch.

**Phase 2 content quality was high.** All 5 content agents produced dense, well-referenced sections with pseudocode, diagrams, and P1-compliant event emissions. 8/10 validation checks passed on first assembly. The two failures were both stale references from Phase 1 outputs — not content errors.

**Pre-draft checklist eliminated three-part sync gap.** For the first time, no deferred action or template registration was missed by content agents. The `search_history_cleanup` action was correctly specified with all three parts (SI §2.1, §2.2, handler). The checklist's §8 "Drafting Reminders" worked.

**Decision agent was valuable.** D1–D4 resolved 4 ambiguities that would have caused contradictions across content sections. D2 (no displayStatus column) saved schema complexity and prevented 4 unnecessary event consumers.

---

## What Could Have Gone Better

**Assembly hit the 32K output token wall.** Two failed attempts before pivoting to multi-file. ~25 minutes burned on output token limit errors. The monolithic assembly was always going to fail for a UI-heavy slice — S5 was 1,249 lines and S6 would have been ~1,500+. Should have anticipated this from the S5 line count.

**Phase 1 outputs weren't updated after decisions resolved.** The router plan was written in parallel with the decisions agent. When D2 resolved "no displayStatus column," the router plan already had the column baked in. The current pipeline has no back-propagation step from decisions → schema/router. Validation caught it, but it's a systematic gap.

**Context window overflow in main context.** The previous session hit context limit during Phase 2. The `/clear` lost all task state. The orchestrator was doing too much inline reading — checking intermediate files, verifying content — instead of delegating.

---

## Keep Doing

- **Parallel Phase 2 agents.** 5 agents running concurrently is the right granularity for S6. Each got ~15K tokens of focused context and produced 300–600 line sections.
- **Validation as a separate phase.** Caught 2 real issues. The validation agent's thoroughness (reading all content files + interface specs + decisions) is worth the cost.
- **Pre-draft checklist before drafting.** The checklist caught the displayStatus question, the stale enquiry timing ambiguity, and the template/deferred action inventory. All were resolved cleanly.
- **Decisions agent as Phase 1.** Resolving ambiguities before content agents run prevents contradictions.

---

## Stop Doing

- **Attempting monolithic assembly.** The single-file format is dead for slices with >5 content sections. Don't try workarounds (split writes, concatenation) — the multi-file format is the correct structural answer.
- **Main context reading intermediate files during Phase 2.** The orchestrator was reading content agent outputs to "verify" them. This wastes context window. Trust the validation agent.

---

## Start Doing

- **Phase 1 dependency ordering.** Run the decisions agent *before* schema and router plan agents, not in parallel. Decisions agent output is fast (~100 lines, 4 decisions) and takes <2 minutes. Schema and router plan agents should read the decisions file. This eliminates the D2/displayStatus class of errors entirely.
- **Multi-file as default from S7 forward.** Already documented in the drafter skill. No decision point needed — just use it.
- **Update stress-test and fix-applier skills** for multi-file format before running the S6 stress test. The stress test agent needs to know it's reading a directory, not a single file. Do this proactively, not mid-stress-test.
- **Orchestrator context budget.** The orchestrator should read: checklist (for scope), skeleton (for structure), validation report (for fixes). Nothing else. Everything else is delegated.

---

## Structural Change: Phase 1 Reordering

Phase 1 should be **2 sequential + 1 parallel**, not **3 parallel**:

```
Phase 1A: Decisions (sequential, first)
Phase 1B: Schema + Router Plan (parallel, after decisions complete)
```

**Cost:** ~2 minutes added latency.
**Benefit:** Eliminates the most common validation failure class (stale Phase 1 references contradicting resolved decisions). The D2/displayStatus error in S6 is the canonical example — router plan defined a column that the decisions agent decided against, because both ran simultaneously.

---

## Multi-File Format Decision

**Problem:** Assembly agent hit 32K output token limit twice. UI-heavy slices (S5: 1,249 lines, S6: estimated ~1,500+) exceed the limit when assembled as a single Write call.

**Solution adopted:** Each slice from S6 forward is a directory:

```
slices/slice-{NN}-{name}/
├── index.md              ← header, summary, scope, file manifest, tail sections (§10–§19), cross-refs
├── 00-schema.md          ← from Phase 1 schema agent
├── 00-router-plan.md     ← from Phase 1 router agent
├── 01-{section}.md       ← from Phase 2 content agent
├── 02-{section}.md       ← from Phase 2 content agent
└── ...
```

**Why this is correct, not just a workaround:**
1. Aligns document architecture with agent architecture — each content agent already writes a self-contained file.
2. Assembly agent writes only `index.md` (~289 lines) — well within token limits.
3. Content sections retain provenance metadata (which agent wrote them, what inputs they read).
4. Stress test and fix-applier agents can target individual files rather than parsing a monolith.
5. No retroactive migration needed — S0–S5 remain single-file (stable at v2).

**Downstream impact:** Stress-test and fix-applier skills need updating to read the directory format. Drafter skill already updated.

---

## S6 By The Numbers

| Metric | Value |
|--------|-------|
| Phases completed | 4 (skeleton → foundations → content → assembly+validation) |
| Total agents dispatched | 13 (1 skeleton + 3 Phase 1 + 5 Phase 2 + 1 failed assembly + 1 successful assembly + 1 validation + 1 failed assembly retry) |
| Content section files | 5 (search, profile, enquiry, shortlist-dashboard, crossrole-gating) |
| Lines across all files | ~2,500 (content) + 289 (index) = ~2,800 total |
| Acceptance criteria | 52 |
| Events emitted | 5 |
| New deferred actions | 1 (`search_history_cleanup`) |
| New email templates | 0 |
| Upstream flags resolved | 4 (S1-6, S1-10, S2-2, S5-8) |
| Downstream flags created | 5 (→ S8, S9) |
| Validation: pass/fail | 8/2 (both fixed) |
| Time to first failed assembly | ~14 minutes |
| Time from pivot to multi-file completion | ~15 minutes |
