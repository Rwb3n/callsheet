---
id: CS-E3
name: Runtime Intelligence
status: Planned
prior: CS-E2
next: null
started: null
---

# Epoch CS-E3: Runtime Intelligence

## Definition

The entity layer. CS-E1 built the platform — the domain instances (Layer 3) and shared infrastructure (Layer 2 scaffolding). CS-E2 made it deployable and operable by humans and agents. CS-E3 builds the cognitive substrate that operates the platform without a human in the loop for routine decisions.

CS-E3 transforms CALLSHEET from a platform that principals and agents operate into an entity that operates itself, with the principal receiving briefings and governing through constraints.

## Prerequisites

- CS-E2 complete (platform deployed, agent-operable, user-accessible)
- Operational data flowing (4rfv import complete, real traffic generating perception signals)
- At least one ceremony cycle producing real signals (monthly ceremonies need 1+ month of data)

Production data is a hard prerequisite. Every feedback loop in CS-E3 requires signal to close against. The entity cannot learn from an empty system.

## Scope

Four capabilities, ordered by dependency:

### 1. Escalation & Principal Channel

The entity can communicate with the principal. Threshold-triggered alerts, principal briefing delivery, operational anomaly notification. Without this, the principal is polling the admin dashboard manually — the entity has no voice.

**Depends on:** S9 ceremony outputs (principal briefing generation), S7 operations (admin health signals), CS-E2 agent CLI (programmatic alerting).

### 2. Closed-Loop Enrichment

The entity adjusts its own enrichment behaviour based on observed outcomes. Decay check types that consistently return clean get wider intervals. Types that detect problems get tighter intervals. S9-1 (enrichment cadence auto-adjustment) made operational.

**Depends on:** S9 enrichment scheduling, S9 decay detection, production decay signal data.

### 3. Closed-Loop Quality

The entity calibrates its own quality scoring. Measures whether dimension weights correlate with engagement outcomes (L1 hypothesis). Proposes weight adjustments — principal approves until graduation criteria are met.

**Depends on:** S9 quality scoring, S9 analytics pipeline (engagement data), sufficient listing volume for statistical signal.

### 4. Operational Autonomy

The entity acts on its own recommendations. Ceremony auto-apply for low-risk decisions (taxonomy suggestions below confidence threshold). Algorithm versioning with A/B testing. Autonomy graduation from "propose and wait" to "act and report."

**Depends on:** S10 autonomy graduation infrastructure (CS-E1, complete), CS-E3 chapters 1-3 (escalation channel + at least one closed loop proven).

## What CS-E3 Is Not

- **Not a rewrite.** CS-E3 builds on top of CS-E1 infrastructure and CS-E2 operational layer. Event bus, decision logging, ceremony handlers, deferred actions, agent CLI — all exist. CS-E3 adds the closed loops and autonomous action that make those components intelligent.
- **Not HAIOS-as-monolith.** There is no single "orchestrator" to build. Each closed loop is independent. The orchestration pattern emerges from the loops operating concurrently, not from a central controller.
- **Not speculative.** Every capability in CS-E3 has a concrete foundation in CS-E1 code. Enrichment scheduling exists — CS-E3 makes it adaptive. Quality scoring exists — CS-E3 makes it self-calibrating. Ceremonies exist — CS-E3 makes them self-applying.

## Exit Criteria

- [ ] Principal receives automated operational briefings without polling
- [ ] At least one sub-entity feedback loop operates autonomously (enrichment or quality)
- [ ] Autonomy graduation criteria defined and measurable for all four sub-entities
- [ ] Entity makes at least one class of decision without human approval
- [ ] Decision outcomes are tracked and feed back into the learning system

## References

- `0-strategic-frame/entity-architecture-frame.md` — Layer 2 (Cognitive Substrate), Design Principle 5 (Autonomy Graduated)
- `3-requirements/slices/slice-10-hardening/07-autonomy-graduation.md` — S10 graduation infrastructure (CS-E1)
- `3-requirements/slices/slice-09-entity-intelligence/05-entity-learning.md` — L1-L7 hypotheses
