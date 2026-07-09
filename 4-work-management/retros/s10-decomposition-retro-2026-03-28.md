---
triaged: true
status: active
---

# Retro: S10 Decomposition

**Date:** 2026-03-28
**Scope:** S10 (Hardening) decomposition into 8 work items (CS-WORK-083 through CS-WORK-090, 72 AC). Includes session init, action register triage, action register audit/closure, decomposition, and post-decomposition audit.

---

## 1 — Reflection

| Prompt | Notes |
|--------|-------|
| **What surprised you?** | The SKIP_CONSTRAINTS step name mismatches — 3 keys in `admin/flows.ts` don't match the spec step names. This is a latent correctness bug planted in S7 that would only surface when S10 wires real flow definitions. The `?? true` fallback in `isStepSkippable()` silently makes non-skippable steps skippable. Without the audit pass, this would have been discovered mid-implementation. |
| **What went well?** | Post-decomposition audit caught 3 concrete issues (SKIP_CONSTRAINTS mismatches, AccountClosedEvent incomplete payload, Domain union gap) before any implementation started. The audit read all 4 content files and cross-referenced codebase types — exactly the right level of verification. Also: 3 stale open actions closed during register review (createTestBus duplicate, decay warning scoping, endowment CTA heuristic). |
| **Could have gone better?** | The decomposer skill doesn't include a "verify existing code references against spec step names" check. The SKIP_CONSTRAINTS mismatch was caught by the manual audit, not by the decomposer's type alignment check (Step 1 item 7). The type alignment check focuses on TypeScript types/unions/maps but not on string literal keys in runtime data structures. |
| **Keep doing** | Running a full audit pass after decomposition for any slice that wires into existing infrastructure (orchestrated flows, event consumers, skip constraints). The decomposer's type alignment check catches type-level mismatches; the audit catches runtime-data-level mismatches. |
| **Stop doing** | N/A |
| **Start doing** | For slices that wire into existing orchestrated flows or consume existing constraint matrices, grep the codebase for string literal keys that must match the new step/action names. Add to decomposer type alignment check. |
| **Skill amendment?** | `/work-item-decomposer` Step 1 item 7 (type alignment check) should include: "For slices that define `FlowStepDefinition` arrays, grep `SKIP_CONSTRAINTS` in `admin/flows.ts` and verify all step name keys match the new step definitions exactly. Mismatched keys fall through to defaults." |

---

## 2 — Classification

| # | Item | Bucket | Detail |
|---|------|--------|--------|
| 1 | SKIP_CONSTRAINTS step name mismatches (3 keys) in `admin/flows.ts` | Bug | Latent since S7 — `close_support_tickets` vs `close_active_tickets`, `cancel_subscriptions` vs `cancel_paddle_subscriptions`, `anonymise_buyer_data` vs `anonymise_enquiry_data`. Harmless pre-S10 (no real flows exist) but would cause silent skip-constraint bypass once S10 flow definitions are wired. Flagged in CS-WORK-083 and CS-WORK-085 deliverables. |
| 2 | `AccountClosedEvent` missing 3 payload fields | Bug | Missing `buyerDataDeleted`, `paddleCancellationsPending`, `timestamp`; `complianceHoldActive` optional instead of required. Flagged in CS-WORK-085 deliverables. |
| 3 | Post-decomposition audit catches runtime-data-level issues | Feature | The manual audit step caught issues the decomposer's type alignment check missed. Worth protecting by formalising. |
| 4 | Decomposer type alignment check doesn't cover string literal keys in runtime data structures | Upgrade | Step 1 item 7 checks TypeScript types, unions, maps — but not runtime `Record<string, ...>` objects where keys must match spec step names. |
| 5 | 3 stale open actions closed during register review | Feature | Routine register hygiene — identified trigger conditions met by S9 completion. |

---

## 3 — Action Register

| # | Item | Priority | Status | Owner | Definition of Done |
|---|------|----------|--------|-------|--------------------|
| 1 | Add "verify FlowStepDefinition names against SKIP_CONSTRAINTS keys" to `/work-item-decomposer` Step 1 item 7 | later | open | Skill | Decomposer skill Step 1 item 7 includes: "For slices defining FlowStepDefinition arrays, grep SKIP_CONSTRAINTS in admin/flows.ts and verify step name keys match new definitions. Mismatched keys fall through to `?? true` default." |
