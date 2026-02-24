---
name: slice-stress-test
description: Run a stress test on a CALLSHEET requirements slice. Use when user asks to "stress test slice", "run stress test on S4", "test slice boundaries", or "find gaps in slice". Produces 20 scenarios targeting interface boundaries between the slice and upstream specs.
---

# Slice Stress Test

## Instructions

You are stress-testing a CALLSHEET requirements slice against its upstream interface specifications. Your goal is to find structural gaps, ambiguities, and correctness risks at the boundary between the slice and the interface specs it implements.

### Step 1: Understand Context (Orchestrator)

**Main context reads only:** `index.md` (metadata, ACs, flags, file manifest, cross-refs) + `references/scenario-format.md` + `references/boundary-checks.md` + `references/prior-findings.md`. Do NOT read content files (`01-*.md` through `0N-*.md`), schema (`00-schema.md`), or router plan (`00-router-plan.md`) in main context — sub-agents read these from disk. This prevents context blowout in the orchestrator (S8 retro: reading all content files consumed ~150K tokens that sub-agents re-read anyway).

**Sub-agents read:** interface specs + slice content files from disk. Each sub-agent prompt should list the file paths to read, not paste content.

**Read order (for sub-agents): interface specs first, concept design only for implementation detail the interface specs don't cover.** The interface spec is the contract surface — stress test against it. Concept design is the implementation reference — use it to verify the slice's decision logic, not to re-derive the contract.

### Step 1b: Dispatch Pipeline (Orchestrator)

All three phases (parallel stress test, merge, validation) should use `run_in_background: true`. Main context dispatches, waits for completion notification, then dispatches the next phase. Main context does NOT read partition files or the merged file — it reads only the sub-agent return summaries and the final validation result.

### Step 2: Generate 20 Scenarios

Each scenario tests a specific boundary condition. Target distribution:
- **3-5 scenarios per major interface boundary** (the domain specs the slice touches)
- **2-3 scenarios on internal consistency** (acceptance criteria vs pseudocode, schema vs handler logic)
- **2-3 scenarios on downstream flag accuracy** (are all flags from prior slices resolved? are new flags complete?)

Severity classification:
- **High** — structural gap that blocks implementation OR renders a feature non-functional at runtime with no compiler/test signal. Missing type, broken contract, impossible state, admin view that always returns zero results because the filter value is never produced.
- **Medium** — ambiguity or correctness risk. Unclear ownership, contradictory statements, missing edge case.
- **Low** — edge case, quality-of-life improvement, documentation nit.
- **Pass** — scenario tested, no issue found. Include 3-6 passes to show coverage.

### Step 3: Write Fix Instructions

For every non-Pass finding, write explicit fix instructions:
- **Section**: exact section number in the slice (e.g., "§2.7")
- **Old**: what currently exists (quote or describe)
- **New**: what it should say (exact replacement text or description of change)
- **Sibling changes**: if the fix requires changes to interface specs or other docs, specify which doc and section

### Step 4: Output Format

**CRITICAL: Write the stress test file DIRECTLY TO DISK** at the path specified by the user (typically `3-requirements/stress-tests/s{N}-stress-test.md`). Use the Write tool. Do NOT return results as text in your response — the orchestrator may not have enough context to receive them. The file on disk is the deliverable.

If you are a partitioned agent (testing a subset of boundaries), write to a partition file: `3-requirements/stress-tests/s{N}-stress-test-part-{A|B}.md`. The orchestrator merges partition files.

Follow the format in `references/scenario-format.md` exactly.

### Important Rules

- Do NOT edit the slice itself. This is analysis only. Fixes are applied in a separate session.
- Every scenario must reference a specific section in the slice AND a specific section in an interface spec (or prior slice).
- Do not restate settled decisions. Reference them.
- Follow output-style.md: dense prose, conclusion first, no hedging, no filler.
- If a scenario appears High but analysis shows it's actually fine, reclassify and explain (see S3-ST-4 pattern).
- **ALWAYS write output to a file. Never rely on the orchestrator reading your return text.**
