# Section Partition Guide

How to assign slice sections to Phase 2 content agents. The goal: each agent receives ~15K tokens of input context and produces 100-200 lines of output.

## Partition Principles

1. **Dependency coupling:** Sections that share schema tables, emit the same events, or read the same query interfaces go to one agent.
2. **Context locality:** Sections that need the same concept design section go to one agent (avoids redundant context).
3. **Size balance:** No agent should produce >250 lines. If a section is large, split it into sub-sections assigned to separate agents.
4. **Independence:** Two agents should never need to coordinate on a design decision. All decisions are resolved in Phase 1.

## Partition Templates by Slice Type

### UI-Heavy Slice (S5, S6, S8)

Characteristics: Many routes, few new domain events, reads existing data, feature-gated display.

**Typical partition (5-7 agents):**

| Agent | Sections | Context Needed | Concept Design §§ |
|-------|----------|----------------|-------------------|
| Search/Discovery | Search implementation, ranking display, facets, zero-result | PP §2 (Search), D&L §3.2 (ranking) | PP concept §2 |
| Content Display | Listing profile page, badge display, JSON-LD, SEO | PP §3 (Profile), SI §7 (rendering) | PP concept §3 |
| Interaction | Enquiry form, submission flow, anonymous handling, spam | PP §5 (Enquiry), D&L pending_enquiries | PP concept §5 |
| Buyer Data | Shortlists, saved searches, search history, buyer dashboard | PP §7 (Buyer features), S1 §2.2 (buyer tables) | PP concept §7 |
| Cross-Role | Cross-role nudge, contact attempt feedback | PP §7.3 (nudge), PP §5.3 (contact attempt) | PP concept §7.3 |
| Feature Gating | Tier-gated display, upgrade prompts, contact visibility | CR §4 (TIER_LIMITS, computeFeatureAccess) | CR concept §4.2 |

### Domain-Logic Slice (S7, S9)

Characteristics: Decision architectures, entity operations, new events, few routes.

**Typical partition (6-8 agents):**

| Agent | Sections | Context Needed |
|-------|----------|----------------|
| Core Logic A | Primary decision architecture + handlers | Domain concept design §relevant |
| Core Logic B | Secondary decision architecture + handlers | Domain concept design §relevant |
| Event Wiring | Consumer registration, emission logic, matrix updates | All interface specs (consumer tables) |
| Admin UI | Admin dashboard sections, task management | PP concept §8, Ops concept §relevant |
| Data Pipeline | Query interface implementation, data aggregation | Domain interface spec (query sections) |
| Monitoring | Health checks, error surfaces, escalation logic | SI §3 (orchestrated flows), Ops concept §6 |

### Integration Slice (S10)

Characteristics: Orchestrated flows, cross-domain steps, failure modes, testing.

**Typical partition (4-6 agents):**

| Agent | Sections | Context Needed |
|-------|----------|----------------|
| Flow A | GDPR erasure — all steps | SI §3.5 (skip matrix), D&L erasure spec |
| Flow B | Account closure — all steps | SI §3.5, PP §5 (closure orchestration) |
| Failure Modes | Per-step failure, retry, escalation | SI §3.3-3.4, SQ-2 |
| Test Strategy | E2E validation, failure injection | R12, all domain specs |

## Context Package per Agent

Every Phase 2 agent receives exactly:

```
1. 00-skeleton.md                          (~50 lines)
2. 01-schema.md                            (~80 lines)
3. 01-router-plan.md                       (~60 lines)
4. 01-decisions.md                         (~40 lines)
5. s{N}-pre-draft-checklist.md             (~220 lines)
6. output-style.md                         (~210 lines)
7. Concept design excerpt                  (~200-400 lines — ONLY the relevant section)
8. Interface spec excerpt                  (~100-200 lines — ONLY the relevant tables/types)
```

**Total: ~960-1260 lines ≈ 12-16K tokens.** Well within budget.

## How to Extract Context Excerpts

The orchestrator should NOT pass full documents to agents. Instead:

1. **Concept design:** Read the full document. Identify the section(s) relevant to each agent. Pass only those section(s), with a note: "This is an excerpt from `{filename}` §{X}. The full document is available but only this section is relevant to your task."

2. **Interface specs:** Pass only the event payload types, consumer tables, and query interfaces the agent needs. Not the full spec.

3. **Prior slices:** Pass only the structural pattern (route structure, AC format) — not the full content.

**Exception:** The assembler (Phase 3) reads ALL section files + ALL Phase 1 outputs. It needs the full picture for deduplication and AC generation. The assembler does NOT read concept design or interface specs — if content is wrong, validation catches it.

## Anti-Patterns

**Too many agents:** >8 content agents creates merge complexity. Prefer 5-7.

**Too few agents:** <3 content agents means each holds too much context. The whole point is context reduction.

**Splitting tightly coupled sections:** If section A emits an event that section B's handler consumes, they MUST be in the same agent. The assembler cannot resolve design conflicts between agents.

**Giving every agent the full interface spec:** Defeats the purpose. Each agent gets only the types and tables it needs.

**Orchestrator making content decisions:** If the orchestrator finds itself deciding "should the enquiry form require authentication?" — that's a Phase 1 decisions agent question. Re-dispatch, don't decide.
