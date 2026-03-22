---
id: CS-E2
name: Runtime Intelligence
status: Planned
prior: CS-E1
next: null
started: null
---

# Epoch CS-E2: Runtime Intelligence

## Definition

The entity layer. CS-E1 builds the platform — the domain instance (Layer 3) and shared infrastructure (Layer 2 scaffolding). CS-E2 builds the cognitive substrate that operates the platform without a human in the loop for routine decisions.

CS-E2 transforms CALLSHEET from a platform the principal operates into an entity that operates itself, with the principal receiving briefings and governing through constraints.

## Prerequisites

- CS-E1 complete (all slices S0–S10 implemented)
- Platform deployed to production (deployment arc)
- Operational data flowing (4rfv import complete, real traffic generating perception signals)

Production data is a hard prerequisite. Every feedback loop in CS-E2 requires signal to close against. The entity cannot learn from an empty system.

## Scope

Four capabilities, ordered by dependency:

### 1. Escalation & Principal Channel

The entity can communicate with the principal. Threshold-triggered alerts, principal briefing delivery, operational anomaly notification. Without this, the principal is polling the admin dashboard manually — the entity has no voice.

**Depends on:** S9 ceremony outputs (principal briefing generation), S7 operations (admin health signals).

### 2. Closed-Loop Enrichment

The entity adjusts its own enrichment behaviour based on observed outcomes. Decay check types that consistently return clean get wider intervals. Types that detect problems get tighter intervals. S9-1 (enrichment cadence auto-adjustment) made operational.

**Depends on:** S9 enrichment scheduling, S9 decay detection, production decay signal data.

### 3. Closed-Loop Quality

The entity calibrates its own quality scoring. Measures whether dimension weights correlate with engagement outcomes (L1 hypothesis). Proposes weight adjustments — principal approves until graduation criteria are met.

**Depends on:** S9 quality scoring, S9 analytics pipeline (engagement data), sufficient listing volume for statistical signal.

### 4. Operational Autonomy

The entity acts on its own recommendations. Ceremony auto-apply for low-risk decisions (taxonomy suggestions below confidence threshold). Algorithm versioning with A/B testing. Autonomy graduation from "propose and wait" to "act and report."

**Depends on:** S10 autonomy graduation infrastructure (§7–§8), CS-E2 chapters 1–3 (escalation channel + at least one closed loop proven).

## What CS-E2 Is Not

- **Not a rewrite.** CS-E2 builds on top of CS-E1 infrastructure. Event bus, decision logging, ceremony handlers, deferred actions — all exist. CS-E2 adds the closed loops and autonomous action that make those components intelligent.
- **Not HAIOS-as-monolith.** There is no single "orchestrator" to build. Each closed loop is independent. The orchestration pattern emerges from the loops operating concurrently, not from a central controller.
- **Not speculative.** Every capability in CS-E2 has a concrete foundation in CS-E1 code. Enrichment scheduling exists — CS-E2 makes it adaptive. Quality scoring exists — CS-E2 makes it self-calibrating. Ceremonies exist — CS-E2 makes them self-applying.

## Design Approach

CS-E2 gets the same rigour as CS-E1: investigation → concept design → requirements (slices with AC) → stress test → decompose → implement. The scope above defines the *what*. The investigation phase defines the *how* — what signals close each loop, what thresholds trigger action, what graduation criteria gate autonomy expansion.

## Exit Criteria

- [ ] Principal receives automated operational briefings without polling
- [ ] At least one sub-entity feedback loop operates autonomously (enrichment or quality)
- [ ] Autonomy graduation criteria defined and measurable for all four sub-entities
- [ ] Entity makes at least one class of decision without human approval
- [ ] Decision outcomes are tracked and feed back into the learning system

## References

- `0-strategic-frame/entity-architecture-frame.md` — Layer 2 (Cognitive Substrate), §Design Principle 5 (Autonomy Graduated)
- `3-requirements/slices/slice-10-hardening/07-autonomy-graduation.md` — S10 §7–§8 graduation infrastructure
- `3-requirements/slices/slice-09-entity-intelligence/05-entity-learning.md` — L1–L7 hypotheses
