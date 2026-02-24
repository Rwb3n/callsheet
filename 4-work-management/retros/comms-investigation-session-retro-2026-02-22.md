# Retro: Communications Investigation Session

**Date:** 2026-02-22
**Scope:** General session — planning, drafting, and completing `1-investigation/communications-infrastructure.md`

---

## 1 — Reflection

| Prompt | Notes |
|--------|-------|
| **What surprised you?** | The existing email implementation (`src/lib/email/`) is well-structured enough that the investigation could propose extending it rather than replacing it. The `EmailService` abstraction, preference enforcement pattern, and template registry all survived scrutiny — the gap is purely at the recording/inbound layer, not the transport layer. Also: all 30 templates had already been inventoried in SI §5.2, so the classification exercise was a categorisation task, not a discovery task. |
| **What went well?** | Single sub-agent gathered all context (SI §5, concept design email sections, existing implementation, erasure flows, enquiry patterns, support triage) in one pass. Main context didn't read content files directly — delegated exploration, then wrote the document from the summary. Total: 1 sub-agent call + 1 document write. Clean separation between research and authoring. The plan-then-execute pattern (plan mode → implementation) produced a well-scoped deliverable with no false starts. |
| **Could have gone better?** | The Explore sub-agent took ~3.5 minutes and consumed significant tokens reading 38 files. A more targeted approach — reading SI §5 + `src/lib/email/` + the 3-4 most relevant concept design sections — would have been faster. The sub-agent read full concept design documents when section-level reads would have sufficed. The investigation document itself is long (~450 lines). Some sections (§4 provider evaluation) could be tighter — Cloudflare Email Workers was obviously not viable and didn't warrant a full row in the comparison table. |
| **Keep doing** | Delegating broad codebase exploration to a sub-agent rather than reading files serially in main context. Writing the full document in a single `Write` call rather than building it incrementally. Using plan mode for non-trivial planning documents — the plan was precise enough that execution required no course corrections. |
| **Stop doing** | Including obviously-eliminated options at full detail in evaluation tables. Cloudflare Email Workers (no outbound) could have been a 1-line dismissal, not a full comparison row. |
| **Start doing** | For investigation briefs, scope the sub-agent's reads more tightly — provide specific section numbers rather than "look for email-related things in all concept design docs." Also: when the investigation has open questions that affect schema design (OQ-1: merge field retention, OQ-5: reply content storage), flag them prominently at the top of the schema section rather than only in §8. |

---

## 2 — Classification

| # | Item | Bucket | Detail |
|---|------|--------|--------|
| 1 | Sub-agent gathered comprehensive context in one pass — no follow-up reads needed | Feature | Research delegation pattern works well for cross-cutting investigations that span multiple specs |
| 2 | Plan mode → execution produced a clean deliverable with no rework | Feature | Plan was specific enough (section list, file targets, verification criteria) that execution was mechanical |
| 3 | Existing email abstraction (`EmailService` interface, `InMemoryEmailService`) supports extension without rewrite | Feature | Constructor injection and interface pattern from CS-WORK-001 pays forward — correspondence log is additive, not disruptive |
| 4 | Sub-agent read 38 files (~150K tokens) when ~10 targeted reads would have sufficed | Refactor | Sub-agent prompt should specify section numbers for known documents rather than open-ended "search for email things" |
| 5 | Provider evaluation included full comparison for an obviously unviable option (Cloudflare outbound) | Bug | Wastes reader attention. Eliminate early, explain in 1 line, don't give a full table row |
| 6 | Open questions that affect schema design (OQ-1, OQ-5) are buried in §8, not flagged at schema definition site | Feature request | Reader encountering the schema in §3 should see "[depends on OQ-1]" annotation inline, not discover it 5 sections later |
| 7 | Investigation brief format not previously used in this project for cross-domain infrastructure topics | Feature request | The `1-investigation/` directory has domain-specific subdirectories. Cross-domain briefs like this one sit at the root. May need a `cross-domain/` subdirectory if more are written. |
| 8 | Memory updated with investigation findings in a single edit | Feature | Clean memory update pattern — one append to the "Repository State" section, no duplication |

---

## 3 — Action Register

| # | Item | Priority | Owner | Definition of Done |
|---|------|----------|-------|--------------------|
| 1 | Scope sub-agent reads by section number for known documents | next | Agent (workflow) | Next investigation brief's sub-agent prompt includes specific section references (e.g., "read SI §5, not the full file") and total files read is <15 |
| 2 | Eliminate unviable options early in evaluation tables | now | Agent (output style) | No evaluation table row for an option dismissed in the first criterion check. Use a 1-line "Eliminated:" note before the table instead |
| 3 | Annotate schema fields that depend on unresolved open questions | next | Agent (output style) | Schema pseudocode includes inline `// [OQ-N]` annotations on fields whose type, presence, or behaviour depends on an open question |
| 4 | Consider `1-investigation/cross-domain/` subdirectory | later | Principal | If a second cross-domain investigation brief is written, create the subdirectory and move `communications-infrastructure.md` into it |
