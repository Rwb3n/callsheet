# Requirements Phase — Evidence Record

**Status:** COMPLETE
**Last updated:** 2026-02-16
**Scope:** What the requirements phase proved about the entity architecture, the methodology, and the economics of agent-driven specification.

---

## What Was Built

The requirements phase ran from 2026-02-12 to 2026-02-16 (4 working days). It produced the complete specification for CALLSHEET's Layer 3 (Domain Instance) — every table, route, event, decision type, and acceptance criterion needed to implement the entity's four sub-entities.

| Artifact | Count | Status |
|----------|-------|--------|
| Interface specifications | 5 (SI v10, D&L v6, Ops v5, PP v8, CR v3) | Stress tested |
| Vertical slices | 11 (S0–S10, all at v2) | Stress tested |
| Acceptance criteria | 693 across all slices | Typed (Unit/Integration/E2E) |
| Database tables | 45 (Drizzle schema) | Cumulative snapshot in `references/cumulative-schema.md` |
| pgEnums | 36 | Fully specified |
| Domain events | 25 typed events | P1-P5 principles enforced |
| Deferred actions | 34 registered | DeferredActionParamsMap typed |
| Email templates | 30 registered | Category + unsubscribable flag |
| Notification types | 19 registered | SI §8.1 |
| Decision types | 27 (26 autonomous + 1 telemetry) | SI §9.2 |
| Stress test scenarios | 209 total (19-20 per slice) | All findings resolved |
| Fixes applied | ~130 across all slices | Tracked in resolution logs |

---

## What Was Proved About the Entity Architecture

### Sub-entity boundaries held under stress

341 concept design scenarios and 209 requirements stress test scenarios tested the four sub-entity boundaries. No scenario required merging domains, splitting a domain, or creating shared mutable state across boundaries. The contract surface (events + queries) was sufficient for every cross-domain flow, including the most complex: GDPR erasure (6 orchestrated steps across D&L, Ops, PP) and account closure (6 orchestrated steps across PP, Ops, D&L, CR).

### Composability is real, not aspirational

Every sub-entity's implementation could change without affecting siblings, provided its contract holds. This was tested empirically: interface specs were edited 26 times across the phase (SI alone went from v1 to v10), and each edit propagated cleanly through the dependency graph without requiring structural redesign of consuming slices.

### Autonomy graduation has concrete criteria

S10 resolved the three graduation flags (S9-1, S9-2, S9-3) with measurable thresholds: false positive rate <2% over 6 months for enrichment cadence adjustment, precedent count ≥50 for ceremony auto-apply, 4-week stability at 100% rollout for algorithm versioning. These are not placeholders — they are implementable acceptance criteria with defined evaluation logic.

### The event bus architecture scales to the full contract surface

51 consumer invocations across 25 event types. Only 3 are synchronous (search index consistency). The remainder are async via `waitUntil()`. The migration trigger (>30% request duration → Inngest) was never approached in the specification — the in-process TypeScript module handles the load.

### Orchestrated flows replace distributed transactions

Erasure and closure flows each have 6 steps, each individually retryable, with a skip constraint matrix enforced server-side. No saga pattern, no compensation logic, no two-phase commit. The admin gets 3 recovery actions (retry, skip, escalate) with hard constraints on what cannot be skipped (identity verification, processErasure, DSAR case closure, listing archival, account deactivation). This pattern is domain-independent — it transfers to any entity that needs multi-step cross-domain flows.

---

## What Was Proved About the Methodology

### Agent-driven specification is viable at production scale

A single human principal and an AI agent (Claude Opus) produced 693 acceptance criteria across 11 vertical slices in 4 days. The agent did not generate requirements from vague prompts — it operated within a structured pipeline that evolved from manual (S0) to fully parallel and self-correcting (S10).

### The pipeline self-improved through operation

| Phase | S0–S3 | S4–S5 | S6–S10 |
|-------|-------|-------|--------|
| Stress test | Single session, manual | Parallel 2-agent, manual merge | Parallel 2-agent, delegated merge + validation |
| Fix application | Manual edits | Manual edits | Parallel 2-agent + post-fix validation |
| Slice format | Single file | Single file | Multi-file (assembly agent hit 32K output limit) |
| Memory capture | Ad hoc | Structured 4-question template | Automated with skill amendment signals |
| Validation | None | Manual spot-check | 10-check automated validation (split across 2 parallel agents for multi-file slices) |

Every retro (S6–S10) produced concrete skill amendments. The pipeline's final form has 4 phases, 11–13 parallel agents, background execution with disk-based intermediates, and automated post-fix validation.

### Named failure patterns compress debugging

8 recurring patterns were identified, named, and documented:

| # | Pattern | Occurrences | Mitigation |
|---|---------|-------------|------------|
| — | Three-part sync gap | 11/11 slices | Pre-drafting checklist + fix-applier patches SI |
| #14 | Content agent divergence | 8 instances (S6–S10) | D5 authority split + Phase 1 Decision Summary |
| #15 | Runtime silent failure | 1 instance (S7) | Admin filter producibility check |
| — | P1 payload compliance | Most common High finding | Pre-drafting checklist item |
| — | Prose-code contradictions | S4, S5 | Author prose and pseudocode together |
| — | Schema amendment debt | S3, S4, S5 | Cumulative schema snapshot |
| — | `AuthSession` property references | S6 | Verify SI §4.1 before referencing session |
| — | Params mismatches | S7, S8, S9, S10 | Index.md table vs SI §2.1 cross-check |

Naming patterns allowed stress test agents to reference prior findings by number, reducing prompt size and improving detection accuracy. Pattern #14 alone was caught 8 times because agents knew to look for it.

### Context management is the binding constraint

The single most impactful pipeline improvement was context discipline. Lessons, in order of discovery:

1. **S7:** Assembly agent exceeded context. Solution: `/clear` between phases, re-read only key files.
2. **S8:** Main context read all content files (~150K tokens) that sub-agents re-read from disk. Solution: orchestrator reads only `index.md`.
3. **S9:** Main context hit 70% after Phase 2 dispatch. Solution: launch assembly as background sub-agent immediately, don't wait.
4. **S10:** Pipeline ran cleanly within context limits. No interventions needed.

The principle: **the orchestrator is a router, not a reader.** It dispatches agents with file paths, gates between phases, and reconciles outputs. It never holds full document content.

### The 4-question memory template eliminates memory drift

Every fix-applier run answers: (1) version bumps, (2) stress test pattern, (3) workflow lesson, (4) skill amendment signal. This structure prevents both under-recording (missing a pattern that recurs) and over-recording (logging slice-specific details that won't recur). Memory stays concise and actionable.

---

## What Was Proved About Economics

### Specification cost

4 days of human time (principal direction, review, approval) + AI compute. The human's role was architectural: deciding the slice sequence, approving stress test severity reclassifications, and providing strategic direction. The agent handled all document production, cross-referencing, and consistency verification.

### Specification completeness

693 acceptance criteria with test types. 45 tables with full column definitions. 34 deferred actions with typed params. 30 email templates. 27 decision types. Every cross-domain interaction specified as a typed contract. This is not a "rough spec that needs refinement" — it is an implementation-ready specification that an agent (or engineer) can execute against without asking clarifying questions.

### Infrastructure cost at V1

£36/month total: Vercel (free tier), Supabase (free tier → £25/month at scale), Resend (free tier → £20/month), Cloudflare R2 (free tier), Paddle (transaction percentage only). The entity's operating cost is negligible relative to even modest subscription revenue.

### Revenue model clarity

£199/£399/£699 annual tiers against ~4,700 seeded listings. The conversion funnel is fully specified: onboarding → claim → verification → subscription. Each step has acceptance criteria. The Commercial sub-entity's decision architectures (conversion triggers, churn intervention, win-back) are specified as implementable pseudocode, not marketing hypotheses.

---

## What Remains

### Phase 4: Work Management

The 693 AC need decomposition into implementable work items, dependency ordering, and sprint-level sequencing. The cumulative schema snapshot (`references/cumulative-schema.md`) and router plans provide the dependency graph inputs. HAIOS is the intended execution environment.

### Open questions

Two implementation-level questions remain open:
- **D&L-Q2:** Public API for external consumers (deferred to post-launch)
- **PP-Q1:** Implementation-level detail (deferred to Phase 4)

Neither blocks implementation of the core system.

### The experiment continues

The entity architecture frame (§Epistemic Status) states: "CALLSHEET's operation is the experiment that tests this model." The requirements phase tested the model at specification level — sub-entity boundaries, contract surfaces, orchestrated flows, autonomy graduation criteria. Implementation and operation will test it at runtime. The specification is the hypothesis. The running system is the evidence.

---

## Cross-References

| Document | Relationship |
|----------|-------------|
| `entity-architecture-frame.md` (v2) | Governing design frame. This document provides evidence for claims made there. |
| `strategic-positioning.md` | Product positioning (Layer 3). Unchanged by requirements phase. |
| `output-style.md` | Style rules applied throughout requirements phase. |
| `3-requirements/REQUIREMENTS-TRACKER.md` | Authoritative progress tracker with full changelog. |
| `3-requirements/references/cumulative-schema.md` | Complete schema snapshot after all 11 slices. |
| `2-concept-design/cross-domain-dependencies.md` (v3) | Sub-entity contract registry that requirements phase implements. |
