---
name: work-item-decomposer
description: Decompose a CALLSHEET requirements slice into work items for Phase 4 (Work Management). Use when user says "decompose S1", "work items for S3", "break down slice 5", or wants to produce implementable work items from a completed v2 slice. Creates work item directories with WORK.md files, updates chapter and arc metadata.
---

# Work Item Decomposer

## Instructions

You are decomposing a stress-tested CALLSHEET requirements slice (v2) into implementable work items. Each work item maps to a coherent unit of implementation — a feature, module, or integration — with explicit acceptance criteria traced back to the slice.

**This skill is the bridge between requirements (Phase 3) and implementation (Phase 4).** The requirements corpus is the input; work items are the output. No design decisions happen here — the slice already made them. Your job is decomposition, dependency mapping, and traceability.

### Prerequisites

Before invoking this skill:
1. The slice must be at v2 (stress tested). Check `3-requirements/REQUIREMENTS-TRACKER.md`.
2. The chapter file for this slice must exist in `4-work-management/chapters/`. If not, create the skeleton first (see `references/chapter-template.md`).
3. The arc and epoch files must exist. Verify frontmatter chain: work item → chapter → arc → epoch.

If the slice is not at v2, stop and tell the user.

---

## Step 1: Read Inputs

**Read order matters. Slice first, then scaffolding.**

1. **Slice AC list.** Read the slice's acceptance criteria section:
   - Single-file slices (S0–S5): `3-requirements/slices/slice-{NN}-{name}.md` — find the "Acceptance Criteria" heading
   - Multi-file slices (S6+): `3-requirements/slices/slice-{NN}-{name}/index.md` — the consolidated AC table is in the tail sections
2. **Slice structure.** For multi-file slices, read `index.md` only (file manifest, scope, schema summary, downstream flags). Do NOT read content files — you need AC groupings, not implementation prose.
3. **Existing work items.** Read the chapter file (`4-work-management/chapters/CH-CS-{NNN}-*.md`) to find any pre-existing work items and the current `work_items:` list.
4. **Next work item ID.** Check the highest existing CS-WORK-{NNN} in `4-work-management/work/` and increment.
5. **Work item template.** Read `references/work-item-template.md` for the WORK.md format.
6. **Dependency context.** Read the arc file to understand cross-chapter dependencies. Read prior chapters' work items if the current slice depends on infrastructure from earlier slices.
7. **Type alignment check.** Grep the codebase for type definitions that the new slice will consume or extend (e.g., `PaymentService`, `SubscriptionTier`, `EventPayloadMap`, `DeferredActionParamsMap`). Compare the existing type's shape/values against the slice's expectations. If there is a misalignment (placeholder values, missing fields, wrong union members), note it in the relevant work item's Context section so the implementer resolves it deliberately rather than discovering it mid-coding.

### What NOT to read

- Concept design documents (the slice already distilled them)
- Interface specs (the slice already implements them)
- Content files for multi-file slices (you need AC, not pseudocode)

---

## Step 2: Identify Work Item Boundaries

Group acceptance criteria into work items. Each work item should be:

1. **Independently implementable** — can be built and tested without other work items from the same slice being complete (except explicit blockers)
2. **Cohesive** — all AC in a work item belong to the same module, feature, or integration surface
3. **Right-sized** — 4–16 AC per work item. <4 is too granular (merge with a neighbour). >16 should split unless the AC are tightly coupled.

### Grouping heuristics

1. **Schema cluster** — AC that share the same table(s) often belong together
2. **Route cluster** — AC that share the same tRPC router namespace belong together
3. **Event cluster** — AC for emitting an event + its consumers belong together IF they're in the same domain. Cross-domain consumers are separate work items.
4. **Infrastructure dependency** — AC that depend on a shared module (event bus, scheduler, flow engine) group by the module they extend, not the module they depend on.
5. **UI surface** — AC for a single page or component group together. Server + client for the same feature are one work item, not two.

### Anti-patterns

- **One AC per work item** — too granular. Merge unless the AC is genuinely a standalone feature.
- **One work item per slice** — too coarse. The whole point is parallelisable implementation.
- **Splitting by layer** (all schema in one, all routes in another) — work items are vertical slices through the stack, not horizontal layers.
- **Splitting event emission from the handler that emits it** — keep producer-side logic together.

---

## Step 3: Map Dependencies

For each work item, determine:

1. **blocked_by** — work items (from this slice or prior slices) that must be complete before this one can start. Use CS-WORK-{NNN} IDs.
2. **blocks** — work items that cannot start until this one completes. (Symmetric with blocked_by — if A blocks B, B is blocked_by A.)
3. **enables** — work items that become easier or more valuable after this one, but aren't strictly blocked. Softer than blocks.

### Dependency rules

- Infrastructure work items (event bus, scheduler, auth) from S0 are implicit dependencies for all feature work items — do NOT list them as `blocked_by` unless the dependency is direct and specific (e.g., "this work item registers a deferred action, so it needs the scheduler").
- Schema migrations within the same slice are NOT dependencies — they're part of the same deployment. Only cross-slice schema dependencies count.
- If a work item emits an event that another work item in the same slice consumes, the emitter blocks the consumer.

---

## Step 4: Write Work Items

For each work item, create:

1. **Directory:** `4-work-management/work/CS-WORK-{NNN}/`
2. **Subdirectories:** `plans/`, `investigations/`, `reports/`
3. **WORK.md:** Following `references/work-item-template.md` format

### WORK.md content

The WORK.md has two parts:

**Part 1: YAML frontmatter** — structured metadata for tooling and queries. Every field from the template must be present. Key fields:
- `acceptance_criteria:` — list every AC by number and one-line description. These are the contract — the work item is done when all listed AC pass.
- `traces_to:` — REQ-CS-{DOMAIN}-{NNN} IDs. Generate these from the slice section the AC comes from.
- `source_files:` — absolute paths to the slice file(s) and interface spec(s) that define the requirement.
- `extensions.slice:` — the source slice ID (e.g., S0, S5, S7).
- `extensions.spec_sections:` — the interface spec section(s) this work item implements.

**Part 2: Prose body** — human-readable context for the implementer. Three sections:
- **Context** — what this module does, where it fits, key constraints. 2-4 sentences. Reference specs by section number.
- **Deliverables** — checklist of files to create/modify. Be specific about paths (`src/lib/events/bus.ts`, not "the event bus file"). **Path convention: check where prior work items placed stubs, helpers, or related modules before suggesting a path.** The slice's pseudocode module layout (e.g., `src/domains/platform/...`) is a suggestion, not a mandate — if an earlier work item already created a stub at `src/lib/onboarding/deliver-pending-enquiries.ts`, the deliverable path should match that location, not the slice pseudocode. Grep the codebase for existing files when the work item completes or extends a stub from a prior slice.
- **References** — links to slice section(s) and interface spec section(s).

### REQ-CS ID generation

Generate requirement IDs from the slice's domain and section structure:
- `REQ-CS-INFRA-{NNN}` for S0 (infrastructure)
- `REQ-CS-DATA-{NNN}` for S1 (data model)
- `REQ-CS-ONBOARD-{NNN}` for S2 (onboarding)
- `REQ-CS-CLAIM-{NNN}` for S3 (claim/verify)
- `REQ-CS-SUBS-{NNN}` for S4 (subscriptions)
- `REQ-CS-PROV-{NNN}` for S5 (provider experience)
- `REQ-CS-BUYER-{NNN}` for S6 (buyer experience)
- `REQ-CS-OPS-{NNN}` for S7 (operations)
- `REQ-CS-COMM-{NNN}` for S8 (commercial)
- `REQ-CS-INTEL-{NNN}` for S9 (entity intelligence)
- `REQ-CS-HARDEN-{NNN}` for S10 (hardening)

One REQ-CS ID per work item. Sequential within the domain.

---

## Step 5: Update Chapter and Arc

After all work items are written:

1. **Update the chapter file** — add all new CS-WORK-{NNN} IDs to the `work_items:` list in frontmatter. Update the Requirements section if it was a skeleton (add section-level detail now that work items exist).
2. **Update the arc file** — if the arc's exit criteria were generic, update with specific counts: "All {N} work items complete, all {M} AC pass."
3. **Do NOT update the epoch file** — it already lists arcs and chapters. Work item granularity is too fine for epoch-level tracking.

---

## Step 5.5: Update IMPLEMENTATION-TRACKER.md

After updating the chapter and arc, update `4-work-management/IMPLEMENTATION-TRACKER.md`:

In the **S1–S10: Pending Decomposition** table, find the row for the slice just decomposed and update it:

- `Work Items` column: `**{N} work items** (CS-WORK-{first} through CS-WORK-{last}, {total} AC)`
- `Status` column: `decomposed`

Example — after decomposing S3 into 4 work items (CS-WORK-030 through CS-WORK-033, 48 AC):

```
| S3: Claim & Verify | CH-CS-005 | onboarding-and-claims | **4 work items** (CS-WORK-030 through CS-WORK-033, 48 AC) | decomposed |
```

Do NOT update any other section of the tracker. Work item completion rows are added only when implementation is done, not at decomposition time.

---

## Step 6: Verify

Run these checks before declaring the decomposition complete:

1. **AC coverage** — every AC in the slice is assigned to exactly one work item. No gaps, no duplicates. Count: `sum(work_item.acceptance_criteria.length) == slice.total_ac`.
2. **Dependency symmetry** — if work item A lists `blocks: [B]`, then B lists `blocked_by: [A]`.
3. **Chapter consistency** — the chapter's `work_items:` list matches the work items that reference it.
4. **No orphan work items** — every work item has a `chapter:` pointing to an existing chapter file.
5. **ID sequence** — work item IDs are sequential with no gaps from the starting ID. Exception: multi-chapter decompositions may have gaps caused by interleaving IDs across chapters (e.g., chapter A gets 013–020, chapter B gets 021–022, then chapter A gets 023 for a cross-chapter dependency). Gaps from interleaving are acceptable; gaps within a single chapter's range are not.

Report the verification results to the user: work item count, total AC covered, dependency graph shape (how many independent entry points, longest chain length).

---

## Important Rules

- **Do not redesign.** The slice is the design. Work items are a decomposition of what's already decided.
- **Do not add AC.** If the slice has 52 AC, the work items collectively have 52 AC. Not 53.
- **Do not merge slices.** Each invocation decomposes one slice. Cross-slice work items don't exist.
- **Multi-chapter slices.** Some slices span two chapters (e.g., S2 produces CH-CS-003 for seed pipeline + CH-CS-004 for onboarding). When this occurs: (1) the orchestrator decides the AC split before invoking the skill — which ACs go to which chapter; (2) dispatch two agents in parallel, one per chapter; (3) pre-agree non-overlapping ID ranges to prevent collisions (e.g., 013–020 for chapter A, 021–022 for chapter B); (4) cross-chapter dependencies use the standard `blocked_by`/`blocks` fields with symmetric entries in both work items. The ID sequence may have gaps — this is acceptable when caused by multi-chapter interleaving.
- **Preserve AC numbers.** Use the exact AC-{NN} identifiers from the slice. Don't renumber.
- **Write to disk.** All WORK.md files are written via the Write tool. The files on disk are the deliverables.
- **Work items from prior slices are immutable.** Don't modify CS-WORK-001 when decomposing S1. If S1 depends on S0 infrastructure, reference it via `blocked_by`, don't edit it.
- **AC numbering quirks.** Some slices have non-contiguous AC numbers (e.g., S0 jumps from AC-42 to AC-45). This is intentional — stress test ACs were appended at the end. Map them as-is. The count that matters is the number of AC rows, not the highest AC number.
