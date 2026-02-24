---
name: slice-drafter
description: Draft a CALLSHEET requirements slice using a multi-agent pipeline. Use when user says "draft S6", "write slice 7", "draft buyer experience slice", or wants to produce a slice v1 from a pre-draft checklist. Orchestrates 12 sub-agents across 4 phases.
---

# Slice Drafter

## Instructions

You are the **orchestrator** for drafting a CALLSHEET requirements slice. You do NOT draft the slice yourself — you dispatch sub-agents that each produce a portion of the slice, then assemble and validate the result. Your job is sequencing, context routing, and quality gating between phases.

**Why multi-agent:** A complete slice requires ~80K tokens of input context (5 interface specs, concept design, prior slices, checklist, output-style). No single agent can hold all of this and produce coherent output. Each sub-agent receives only the ~15K tokens it needs.

### Prerequisites

Before invoking this skill, the following must exist:
1. Pre-draft checklist at `3-requirements/stress-tests/s{N}-pre-draft-checklist.md` (produced by `slice-pre-draft-checklist` skill)
2. All interface specs listed in the checklist header
3. Concept design document(s) for the slice's primary domain

If the checklist does not exist, stop and tell the user to run the `slice-pre-draft-checklist` skill first.

---

## Phase 0: Skeleton (1 agent, sequential)

**Purpose:** Establish document structure before any content is written.

**Agent reads:**
- `0-strategic-frame/output-style.md`
- `3-requirements/stress-tests/s{N}-pre-draft-checklist.md` (§9 scope summary)
- The most recent same-domain slice for structural reference (e.g., S5 for S6)
- `references/slice-structure-template.md`

**Agent writes:** `3-requirements/stress-tests/s{N}-drafting/00-skeleton.md`

**Content:** Document header block (Status, Primary Owner, Dependencies, Inputs, Downstream), Summary placeholder, V1 Scope Boundary placeholder, numbered section list with titles (one per deliverable cluster), plus boilerplate tail sections (Event Consumers, Deferred Actions, Email Templates, Notification Types, Schema Additions, Upstream Flag Resolutions, Downstream Flags, Open Question Resolutions, Acceptance Criteria, Cross-References).

**Gate:** Orchestrator reads skeleton, confirms section list covers all checklist §9 deliverables. If missing, add sections before proceeding.

---

## Phase 1: Foundations (1 sequential + 2 parallel)

**Purpose:** Resolve shared dependencies that Phase 2 content agents need.

**Ordering:** Decisions agent runs FIRST (sequential). Schema and Router Plan agents run AFTER decisions complete (parallel). This prevents Phase 1 outputs from contradicting resolved decisions — the D2/displayStatus error in S6 is the canonical example. Cost: ~2 minutes added latency. Benefit: eliminates the most common validation failure class. [Source: learnings/s6-drafting-retro.md]

### Agent 1A — Decisions (runs FIRST, sequential)

**Reads:**
- Skeleton
- Checklist §1 (deferred actions — conditional items), §5 (schema decisions), §7 (open questions)
- Relevant interface spec sections for each decision
- Prior slice patterns for similar decisions

**Writes:** `3-requirements/stress-tests/s{N}-drafting/01-decisions.md`

**Content:**
- For each "Decision needed during drafting" in the checklist: state the decision, options, recommendation, rationale
- Format: `| Decision | Options | Recommendation | Rationale |`
- If a decision creates a new deferred action or schema change, note the exact entries to add

**Gate:** Orchestrator reads decisions file. Confirms all checklist conditionals are resolved. Then dispatches 1B + 1C in parallel.

### Agent 1B — Schema (parallel with 1C, after 1A)

**Reads:**
- Skeleton
- **Decisions file (01-decisions.md)** — for schema-impacting decisions
- Checklist §5 (Schema Amendments)
- S1 data model slice (schema sections only — §1, §2)
- Prior slice schema amendments (grep for "Schema Additions" in S2–S5)

**Writes:** `3-requirements/stress-tests/s{N}-drafting/01-schema.md`

**Content:**
- New table definitions (Drizzle syntax, exact column types, indexes, constraints)
- Amendments to existing tables (new columns with types, defaults, migration notes)
- pgEnum extractions (if any new enums needed)
- Cumulative schema snapshot

### Agent 1C — Router Plan (parallel with 1B, after 1A)

**Reads:**
- Skeleton
- **Decisions file (01-decisions.md)** — for routing-impacting decisions
- Checklist §9 (scope summary)
- Concept design §1.3 (URL structure) — extract only the routes relevant to this slice
- Most recent same-domain slice §1 (route structure pattern)

**Writes:** `3-requirements/stress-tests/s{N}-drafting/01-router-plan.md`

**Content:**
- File tree (`src/app/...` or `src/server/...`)
- tRPC router inventory: route name, public vs `protectedProcedure` vs `adminProcedure`, input schema, return type, brief description
- Which routes are SSR vs CSR vs SSG+ISR (per SI §7.1)

**Gate:** Orchestrator reads all three Phase 1 files. Confirms: schema covers all checklist §5 items, router covers all checklist §9 deliverables, decisions resolve all checklist conditionals. If gaps, amend before Phase 2.

**Checklist refresh + SI sync verification (mandatory):** After Phase 1 completes, the orchestrator performs two actions:

1. **Append new entries:** If Phase 1 decisions produce new deferred actions, notification types, or schema tables not in the pre-draft checklist, append them to the checklist's §1.1 (deferred actions), §2 (notifications), or §5 (schema).

2. **Verify SI entries for ALL deferred actions (not just new ones).** Read SI §2.1 `DeferredActionParamsMap` and SI §2.2 Registered Actions table. For every deferred action in the checklist §1.1 (including those present from the start, not just Phase 1 additions), verify a corresponding entry exists in SI. If any are missing, prepare the exact diff (params type + registered actions row) and include it in the Phase 2 context as a `## Required SI Amendments` section. Content agents must note these amendments in their output. The assembly agent must include them in the index.md sibling-spec-changes section.

**Why both steps:** The original instruction (step 1 only) prevented gaps for Phase-1-discovered actions but did not catch actions that were in the checklist from the start yet missing from SI. The stress test found this gap 8 consecutive times (S0–S7). Step 2 eliminates it at source by verifying the SI state, not trusting the drafter to have applied checklist §1.1.

---

## Phase 2: Content Sections (N agents, parallel)

**Purpose:** Draft each content section of the slice independently.

Each content agent receives a **focused context package**:
1. Skeleton (section numbers and structure)
2. Phase 1 outputs (schema, router plan, decisions) — all three
3. **Phase 1 decision summary** — extracted by the orchestrator from the decisions, schema, and router plan files (see below)
4. Checklist (for P1 compliance checks and event payload verification)
5. **Specific** concept design section(s) — NOT the full document
6. **Specific** interface spec section(s) — NOT the full documents
7. `0-strategic-frame/output-style.md`

**Phase 1 Decision Summary (MANDATORY).** Before dispatching Phase 2 agents, the orchestrator extracts a concise decision summary from Phase 1 outputs. This prevents content agents from contradicting schema or routing decisions made by Phase 1 agents. The summary includes:
- All resolved decisions from `01-decisions.md` (decision ID, choice, rationale — one line each)
- Schema model choices from `01-schema.md` (e.g., "shortlist lifecycle: consumer-written `shortlist_items.status`, NOT join-based" or "no new columns on X table — read via join")
- Routing choices from `01-router-plan.md` (e.g., "enquiry submission is a new router, not an amendment to listing router")

Format: bullet list, max 20 lines. Injected into every Phase 2 agent prompt as a `## Phase 1 Decisions (binding)` section. Content agents MUST NOT contradict these decisions — if a content agent's section requires a different approach, it flags the conflict rather than silently diverging.

**Why this exists:** S6-ST-1 (High) — the schema agent decided on consumer-written `shortlist_items.status`; the §4 content agent wrote join-based `listings.lifecycleStatus` because it never received the schema decision. Two files described mutually exclusive approaches. This summary eliminates that failure class.

**Each agent writes:** `3-requirements/stress-tests/s{N}-drafting/02-section-{name}.md`

**Content per agent:** The complete text for its assigned section(s), including:
- Prose description (conclusion first, per output-style)
- Typed pseudocode for all functions/handlers
- Mermaid diagrams where system has >3 interacting components
- Event emissions with exact payload (cross-checked against checklist §3)
- Cross-domain reads documented (which query interface, what fields)

**Section assignment is slice-specific.** The orchestrator partitions the skeleton's numbered sections into agent assignments based on:
1. **Dependency coupling** — sections that share schema or emit the same events go to one agent
2. **Context requirements** — sections needing the same concept design section go to one agent
3. **Target size** — each agent should produce 100–200 lines, not 500+

See `references/section-partition-guide.md` for partition templates by slice type (UI-heavy, domain-logic, integration).

**Important rules for content agents:**
- Reference, don't restate. If a type is authoritative in an interface spec, cite it: `[Source: shared-infrastructure.md §1.2]`. Do not reproduce the type.
- Import from upstream. If a prior slice defines a function signature, reference it: `S4 §5.1 applyDowngrade`. Do not redefine.
- Every `emit()` call must use the exact payload shape from `EventPayloadMap` (SI §1.2).
- Every cross-domain query call must cite the query interface it uses.
- Author prose and pseudocode together — never write prose describing behaviour, then pseudocode implementing different behaviour.
- Every decision type logged via SI §9.2 must have a corresponding AC verifying that every invocation of the decision function produces a log entry. S8 had 4 of 7 decision types with logging AC but missed 3 (refund_evaluation, feature_gate_friction, revenue_health). If a section contains `logDecision()`, it must have an AC for it.
- **Every consumer handler, deferred action handler, event emission, and `logDecision()` call must have a corresponding invocation-level AC.** Registration-level AC (e.g., "all N consumers registered in EVENT_CONSUMER_MATRIX") does not substitute for invocation-level AC that tests what the handler actually does. S9 validation found 7 of 15 consumer handlers had registration AC but no invocation AC — the event consumer content agent must produce an AC per consumer, not just a bulk registration check. [Source: S9 retro, 2026-02-15]

**Gate:** Orchestrator reads all content section files. Checks:
- Every section in the skeleton has a corresponding file
- No section file is empty or stub-only
- Event emission payloads across sections are consistent (no two sections emitting the same event with different fields)

---

## Phase 2.5: AC Extraction (1 agent, sequential)

**Purpose:** Extract acceptance criteria from all content files into a single consolidated file before assembly. This prevents the assembly agent from missing AC in sections it can't fully read (S7 missed §3/§9/§10 AC).

**Agent reads:** All `02-section-*.md` files in `stress-tests/s{N}-drafting/`

**Agent writes:** `3-requirements/stress-tests/s{N}-drafting/02-acceptance-criteria.md`

**Content:** For each content file that contains an "Acceptance Criteria" section, extract all AC into a consolidated table grouped by section number. Count total. Format:

```
### §{N} {Section Name} ({count} AC)
| # | Criterion |
|---|-----------|
| AC-{N}.1 | ... |
```

**Gate:** Orchestrator reads AC file. Two checks:
1. Verify every content section that should have AC is represented.
2. **Programmatic AC count:** Run `grep -c "^| AC-" {ac-file}` to get the actual row count. Compare against the header's stated total. If they disagree, the grep count is authoritative — fix the header before assembly. S8's extraction agent wrote "Total: 86" but grep found 81.

---

## Phase 2.9: Context Reset (orchestrator action, no agent)

**Purpose:** Prevent context blowout before assembly. After Phase 2 + 2.5 complete and all files are on disk, the orchestrator's context is heavy from dispatching 7+ agents. Assembly needs a clean context.

**Action:** `/clear` then re-read these key files. If running in a non-interactive context where `/clear` is unavailable (e.g., batch orchestration within a single conversation turn), achieve the same effect by dispatching the assembly agent as a fresh sub-agent with only the listed files — this gives it a clean context by construction.
1. `0-strategic-frame/output-style.md`
2. The skeleton (`00-skeleton.md`)
3. The decisions file (`01-decisions.md`) — for open question resolutions
4. The checklist — for upstream flag resolution table and downstream flags
5. The AC extraction file (`02-acceptance-criteria.md`)
6. Most recent same-domain slice `index.md` — for format reference

**Why `/clear` not `/compact`:** `/compact` is a black box — you can't verify what it kept or dropped. `/clear` + explicit reads is deterministic: you know exactly what's in context because you put it there.

**This step replaces the previous approach of carrying all Phase 1 + Phase 2 context through to assembly.**

**Context limit resilience (added S9 retro):** If main context approaches 70% capacity after dispatching Phase 2 agents (check via token count or `/compact` warning), immediately launch assembly (Phase 3) as a background sub-agent with an explicit file manifest — do not wait to regain context via `/clear`. Background agents write to disk; the assembly agent reads from disk. This prevents the S9 failure mode where the main context hit 100% after Phase 2, requiring a manual session handoff to continue. All Phase 2 agents write to `stress-tests/s{N}-drafting/` so assembly can find them regardless of main context state.

---

## Phase 3: Assembly (two-pass, orchestrator + 1 agent)

**Purpose:** Assemble the slice as a multi-file directory with an `index.md` for metadata and tail sections.

**Multi-file format (S6 forward).** A single monolithic file exceeds the 32K output token limit for assembly. Each slice is a directory:

```
slices/slice-{NN}-{name}/
├── index.md              ← header, summary, scope, file manifest, tail sections, cross-refs
├── 00-schema.md          ← from Phase 1 schema agent
├── 00-router-plan.md     ← from Phase 1 router agent
├── 01-{section}.md       ← from Phase 2 content agent
├── 02-{section}.md       ← from Phase 2 content agent
└── ...
```

S0–S5 remain single-file (stable at v2). This is documented in REQUIREMENTS-TRACKER.md.

### Pass 1: File copy + AC renumbering (orchestrator via Bash — no agent needed)

1. Create the slice directory: `3-requirements/slices/slice-{NN}-{name}/`
2. Copy Phase 1 outputs (schema → `00-schema.md`, router → `00-router-plan.md`) — strip Phase 2 headers
3. Copy Phase 2 section files (numbered `01-` through `0N-` matching skeleton section assignments) — strip Phase 2 headers
4. **Renumber AC placeholders in content files.** Phase 2 agents write AC tables with local numbering (AC-1, AC-{3.1}, AC-{N}, etc.). Phase 2.5 extraction produces the authoritative sequential mapping (AC-1 through AC-{total}). During Pass 1, replace all placeholder AC identifiers in each content file with their final sequential numbers using the extraction file as the mapping source. This is a mechanical sed-style replacement — no agent needed. Eliminates the recurring post-validation AC renumbering fix (observed in S7, S10).
5. Verify all files exist via `ls`

### Pass 2: Compose index.md (1 agent)

**Agent reads:**
- Skeleton
- Decisions file (for open question resolutions and spec change entries)
- AC extraction file (from Phase 2.5)
- Checklist (for upstream flag resolution table and downstream flag generation)
- Most recent same-domain slice `index.md` (for format reference)
- **NOT the full content files** — the agent only needs headers and AC, which are in the extraction file

**Agent writes:** `3-requirements/slices/slice-{NN}-{name}/index.md`

**Content — the assembler writes ONLY `index.md` containing:**
1. Header block (from skeleton)
2. Summary section (2-3 paragraphs covering scope, ownership, key constraints)
3. V1 Scope Boundary section (In scope / Deferred)
4. **File Manifest** — table mapping section numbers to files
5. Tail sections:
   - **Event Consumers:** Aggregate from decisions + checklist §3. Table format.
   - **Deferred Actions:** Aggregate from decisions + checklist §1.1. Table format.
   - **Email Templates:** List templates this slice triggers (not defines).
   - **Notification Types:** List types used.
   - **Schema Additions:** Summary table referencing `00-schema.md`.
   - **Upstream Flag Resolutions:** From checklist §6. Table: `| Flag | Resolution |`
   - **Downstream Flags:** Identify deferred items. Table: `| # | Flag | Target Slice | Source |`
   - **Open Question Resolutions:** From decisions agent. Table format.
   - **Acceptance Criteria:** Copied from Phase 2.5 AC extraction file. One consolidated table.
   - **Cross-References:** All upstream documents with section-level granularity.
6. Stress Test Resolution Log (empty in v1)

**The assembler does NOT copy content section text into index.md.** Content sections remain as separate files.

**Gate:** Orchestrator reads index.md. Checks:
- AC count is reasonable (40-100+ for a full slice — S7 had 100)
- Every deliverable from checklist §9 has at least 2 ACs
- Downstream flags section is non-empty
- Cross-references cite current spec versions (from checklist header)
- File manifest lists all content files in the directory

---

## Phase 4: Validation (2 agents, parallel — ALWAYS SPLIT)

**Purpose:** Pre-stress-test quality check. Catches issues before the formal stress test.

**Why two agents:** A single validation agent must read all interface specs (~40K tokens) plus all content files (~200K tokens). This exceeds context limits for multi-file slices. S9 validation confirmed: one agent fails, two parallel agents complete in ~3 minutes each. Always dispatch two agents from the start — do not attempt a single agent first.

**Agent A reads:**
- The assembled slice directory (index.md + content files 01–06)
- `interfaces/shared-infrastructure.md` (EventPayloadMap, DeferredActionParamsMap, templates)
- The domain interface spec(s) — event payload types only

**Agent A checks:** 1 (P1 payload compliance), 2 (three-part sync — deferred actions), 5 (consumer registration completeness), 9 (AuthSession property references)

**Agent A writes:** `3-requirements/stress-tests/s{N}-drafting/04-validation-part-A.md`

**Agent B reads:**
- The assembled slice directory (index.md + content files 01–06)
- `interfaces/commercial-and-revenue.md` §4 (TierLimits, computeFeatureAccess)
- `interfaces/shared-infrastructure.md` §9.2 (decision types)
- `interfaces/platform-and-product.md` §4 (email templates)

**Agent B checks:** 3 (prose-code consistency), 4 (N+1 query patterns), 6 (decision type registration), 7 (email template registration), 8 (feature access gating / P4), 10 (AC coverage)

**Agent B writes:** `3-requirements/stress-tests/s{N}-drafting/04-validation-part-B.md`

[Source: S9 retro, 2026-02-15 — unified validation agent hit context limits]

**Content — each agent writes a validation report covering its assigned checks (see `references/validation-checks.md` for check definitions).**

**Gate:** Orchestrator reads BOTH validation reports (Part A + Part B). If any Fail:
- For mechanical failures (wrong version number, missing AC): fix directly in the slice
- For structural failures (P1 violation, schema mismatch): dispatch a targeted fix agent
- Re-run validation on the fixed slice if >3 failures were structural

---

## Orchestrator Responsibilities

The orchestrator (main context) does the following and ONLY the following:

1. **Read the checklist** to determine slice scope and section partition
2. **Create the drafting directory:** `3-requirements/stress-tests/s{N}-drafting/`
3. **Dispatch Phase 0** and gate
4. **Dispatch Phase 1:** decisions agent first (sequential), then schema + router plan (parallel after decisions complete). Gate all three. **Refresh checklist** with any new deferred actions/types from Phase 1 decisions.
5. **Partition sections** for Phase 2 based on skeleton + checklist §9
6. **Dispatch Phase 2** (N parallel agents) and gate
7. **Dispatch Phase 2.5** (1 agent — AC extraction from all content files) and gate
8. **Context reset (Phase 2.9):** `/clear` then re-read key files (output-style, skeleton, decisions, checklist, AC extraction, reference slice index.md). Do NOT carry Phase 1/2 content in context.
9. **Phase 3 Pass 1:** Create slice directory, copy/rename files via Bash (strip Phase 2 headers, renumber AC placeholders to sequential using Phase 2.5 extraction)
10. **Phase 3 Pass 2:** Dispatch 1 agent to compose `index.md` from skeleton + decisions + AC extraction + checklist. Gate.
11. **Dispatch Phase 4** (2 agents in parallel — validation Part A + Part B) and gate both
12. **Report result** to user: slice directory, AC count, validation status

**The orchestrator does NOT:**
- Read concept design documents (agents do this)
- Read interface specs beyond the checklist (agents do this)
- Write slice content (agents do this)
- Make design decisions (decisions agent does this)
- Fix validation failures beyond mechanical issues (dispatch agents for structural fixes)

**Read strategy for agents:** Interface specs first, concept design only for implementation detail the interface specs don't cover. When routing context to content agents, send the relevant interface spec section(s) as the primary input and concept design section(s) only when the agent needs decision tree logic, ceremony definitions, or internal implementation detail not captured in the contract surface.

---

## Agent Prompt Template

All agents should be dispatched with this minimal pattern:

```
You are drafting section(s) of CALLSHEET requirements slice S{N}.

Read these files before producing output:
- {list of files this agent reads}

Follow the output style rules in `0-strategic-frame/output-style.md`.
Follow the slice drafting conventions in `.claude/skills/slice-drafter/references/{relevant-reference}.md`.

Write your output to: {output file path}

{Agent-specific instructions — what sections to write, what to check}
```

**Do NOT restate file contents in the agent prompt.** Agents read files themselves. The prompt specifies WHICH files to read and WHAT to produce — not the content of those files.

---

## Error Recovery

**Agent fails to write file:** Re-dispatch with same prompt. Check if the output path is correct.

**Agent produces empty or stub output:** Read the output, identify what's missing, re-dispatch with more specific instructions about what content is expected.

**Phase 2 agents produce conflicting content:** The assembler (Phase 3) is responsible for deduplication. If the conflict is substantive (different design decisions), the Phase 1 Decision Summary is authoritative — whichever agent followed it is correct. If neither agent followed it, the decisions file output takes precedence.

**Validation finds >5 structural failures:** The slice partition may be wrong. Review the section assignments and consider whether two sections that should have been co-drafted were split. Re-draft the affected sections with a single agent that holds both.

**Context window overflow in an agent:** The agent's input context is too large. Split the agent's assigned sections and dispatch two agents instead. Update the assembler's input list accordingly.
