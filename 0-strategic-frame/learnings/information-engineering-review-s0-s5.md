# Information Engineering Review — S0–S5

**Date:** 2026-02-14
**Scope:** Requirements phase information architecture, stress test pipeline, document structure
**Trigger:** Post-S5 stress test retrospective

---

## What Went Well

**Single-emitter rule + typed event contracts.** The decision to make every event type owned by exactly one domain, with `EventPayloadMap` as the compilation boundary, has been the single highest-value architectural choice. Every P1 violation found (S5-ST-13, S4-ST-7, S3-ST-4) was caught mechanically by asking "does this payload match the authoritative type?" — no judgment required.

**Vertical slices as integration tests for interface specs.** The slices are doing exactly what Option C (Interfaces + Vertical Slices) promised: each slice stress-tests the interface specs against concrete implementation scenarios. S5 found 6 High issues — all of which were latent in the interface specs or S0/S1 schemas but invisible until someone tried to write code against them. The specs alone couldn't find these; the slices forced the question.

**Sub-agent partition strategy.** Splitting stress tests by interface boundary (Agent A: CR+Ops+SI, Agent B: D&L+PP) produces genuine coverage diversity. Both agents found S4-ST-7 independently (archival double-emission) — that's a signal the partition creates useful redundancy on the highest-risk boundaries. The merge+validate pipeline catches deduplication and severity misclassification reliably.

**"Reference, don't restate" principle.** Added after early slices were reproducing upstream types. The output-style.md amendment has visibly reduced cross-document drift. S5 is leaner than S2 or S3 — it cites interface specs rather than reproducing `FeatureAccess` or `EventPayloadMap`.

---

## What Could Have Gone Better

**Three-part sync gap is a tooling problem, not a discipline problem.** `DeferredActionParamsMap` + registered actions table + template inventory — the same class of bug has appeared in every slice from S0 through S5 (seven consecutive occurrences). The stress test catches it every time, but we're spending High-severity findings on a mechanical consistency check. This should be a checklist, not a discovery. The information architecture created three separate registries that must stay in sync, with no structural coupling between them. That's a design flaw in the spec structure.

**S0/S1 schemas are accruing amendment debt.** S5-ST-5 (notification schema) and S5-ST-14 (enquiry_records status) both required retroactive amendments to S0 and S1. These are downstream schemas being shaped by upstream slices — the dependency direction is inverted. S0's `notifications` table was designed with `read: boolean` because S5's requirements hadn't been articulated yet. This is inevitable in a sequential drafting process, but the amendment trail is getting long. S0 now has amendments from S4 and S5; S1 has amendments from S3, S4, and S5.

**Prose-code contradictions in slices.** S5-ST-16 found that §2.1 prose said "single query joins" while §2.2 code used `Promise.all` with per-listing calls. S4 had a similar issue (reason mapping catch-all inverted). When a slice contains both prose descriptions and pseudocode, they can diverge silently. The stress test catches it, but the root cause is authoring the prose and code in separate passes without cross-checking.

**Pass rate variance signals spec maturity, not slice quality.** S5 had 8/20 Pass (40%) — the highest so far. S2 and S3 were ~20% Pass. This correlates with S5 being a UI-surfacing slice rather than a domain-logic slice. The stress test methodology is tuned for cross-domain contract boundaries; slices that primarily render data from existing contracts generate fewer findings. The 20-scenario budget is slightly wasteful on UI slices — 12–15 targeted scenarios would yield the same finding density.

---

## Keep Doing

- **Parallel partition stress tests.** The Agent A/B split with merge+validate produces the best coverage-to-context ratio. Don't collapse back to single-agent.
- **Severity classification (High/Medium/Low/Pass).** Consistently applied. High = compiler will reject or runtime crash. Medium = ambiguity or correctness risk. Low = edge case. This calibration has been stable since S3.
- **Stress test → apply fixes → update tracker → update memory pipeline.** The four-step cycle is now mechanical. The fix-applier skill makes step 3-4 parallelisable.
- **Downstream flags.** These are the most effective forward-reference mechanism. Every slice that resolves upstream flags documents it; every slice that creates new ones assigns targets. The flag graph is the real dependency tracker.

---

## Stop Doing

- **Treating DeferredActionParamsMap/template sync as stress test findings.** After seven consecutive occurrences, promote this to a **drafting checklist item**: "If your slice adds deferred actions or email templates, update SI §2.1, §2.2, and §5.2 in the same commit." Don't spend stress test budget discovering it again.
- **Retroactive schema amendments via prose notes.** "S5 adds a `status` column to S1's `enquiry_records`" as a note in S1 is fragile. The note is a patch on a patch. When S6 reads S1, it has to mentally compose S1 + S3 amendments + S4 amendments + S5 amendments to understand the actual schema. This will compound through S6–S10.

---

## Start Doing

- **Schema snapshot per slice.** At the end of each slice's §16 (Schema Additions), include a cumulative table: "After S5, the `enquiry_records` table has columns: [full list]." This eliminates the mental composition problem. The authoritative source is still S1, but each slice provides the reader with the current state after its amendments. One table, not a trail of amendment notes.
- **Pre-drafting checklist for new slices.** Before writing S6 v1, run through: (1) Does this slice add deferred actions? → Pre-populate SI §2.1/§2.2 entries. (2) Does it add email templates? → Pre-populate SI §5.2 + PP §4. (3) Does it add schema columns to existing tables? → Document as migration in §16 with cumulative snapshot. (4) Does it emit events? → Verify payload against `EventPayloadMap`. This converts four categories of recurring stress test findings into drafting discipline.
- **Reducing stress test scenario count for UI-heavy slices.** S6 (Buyer Experience) and S8 (Commercial) are likely to be similar to S5 — primarily surfacing existing domain contracts. Consider 15 scenarios instead of 20, with the saved budget redirected to S7 (Operations) and S10 (Hardening) which have the highest cross-domain density.
