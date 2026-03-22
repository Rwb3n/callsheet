# 1. Macro Topology & Cross-Domain Dependencies

The entity operates across four distinct domains. Coordination happens via the Event Bus (25 typed events) and 6 explicit query interfaces. Infrastructure services are shared across all domains.

```mermaid
graph TB
    classDef external fill:#e8d5b7,stroke:#8b6914,color:#333
    classDef domain fill:#d4e6f1,stroke:#2471a3,color:#1a1a1a
    classDef bus fill:#f9e79f,stroke:#b7950b,color:#333
    classDef infra fill:#d5f5e3,stroke:#1e8449,color:#1a1a1a

    PADDLE["Paddle API<br/><i>Billing, Invoicing, Taxes</i>"]:::external

    subgraph PP ["Platform & Product"]
        direction TB
        PP_TOP["Search Engine &bull; Onboarding & UI &bull; Dashboard"]
        PP_Q["Query: Analytics / DSAR status"]
        PP_E["Emits: search_performed, profile_viewed,<br/>enquiry_submitted, account_closed"]
    end
    class PP domain

    subgraph OPS ["Operations"]
        direction TB
        OPS_TOP["Webhook Handler &bull; Human Procurement Engine"]
        OPS_Q["Query: Feature friction / Tickets"]
        OPS_E["Emits: subscription_tier_changed,<br/>subscription_ended, winback_delivery"]
    end
    class OPS domain

    subgraph DL ["Data & Listings"]
        direction TB
        DL_TOP["Listing Integrity &bull; Quality / Decay"]
        DL_Q["Canonical Data: Listing, Account, Taxonomy"]
        DL_E["Emits: claim_approved, quality_score_changed,<br/>decay_signal_detected, listing_archived"]
    end
    class DL domain

    subgraph CR ["Commercial & Revenue"]
        direction TB
        CR_TOP["Feature Gating &bull; Conversion & Churn"]
        CR_Q["Config: Platform imports TierLimits"]
        CR_E["Emits: conversion_milestone,<br/>churn_risk_detected, pending_cancellation_created"]
    end
    class CR domain

    EB(["Event Bus &mdash; 25 Typed Cross-Domain Events"]):::bus
    INFRA["Shared Infrastructure (S0)<br/><i>Event Bus | DAS (35 actions) | Flow Engine<br/>Decision Logger | Email | Storage</i>"]:::infra

    PP -- "checkout JS /<br/>cancel via API" --> PADDLE
    PADDLE -- "webhooks<br/>subscription.*" --> OPS

    PP <-..-> EB
    OPS <-..-> EB
    DL <-..-> EB
    CR <-..-> EB

    PP ~~~ DL
    OPS ~~~ CR

    DL & CR & PP & OPS --> INFRA
```
