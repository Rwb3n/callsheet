# 7. Domain Event Consumer Matrix

25 typed cross-domain events across 4 emitter domains. The matrix below shows which consumer domains subscribe to each event.

### 7a. Data & Listings Events (9 events)

```mermaid
flowchart LR
    classDef dl fill:#d4efdf,stroke:#1e8449,color:#1a1a1a
    classDef consumer fill:#d6eaf8,stroke:#2e86c1,color:#1a1a1a

    subgraph DL ["Data & Listings (Emitter)"]
        CA["claim_approved"]:::dl
        CRJ["claim_rejected"]:::dl
        LA["listing_archived"]:::dl
        LS["listing_suspended"]:::dl
        LR["listing_reactivated"]:::dl
        VTC["verification_tier_changed"]:::dl
        DSD["decay_signal_detected"]:::dl
        QSC["quality_score_changed"]:::dl
        EC["erasure_completed"]:::dl
    end

    OPS_C["Ops"]:::consumer
    PP_C["PP"]:::consumer
    CR_C["CR"]:::consumer

    CA & CRJ & LA & LS & LR --> OPS_C
    CA & CRJ & LA & LS & LR & VTC & DSD & QSC & EC --> PP_C
    CA & LA & QSC & EC --> CR_C
    DSD & EC --> OPS_C
```

### 7b. Operations Events (3 events)

```mermaid
flowchart LR
    classDef ops fill:#d6eaf8,stroke:#2e86c1,color:#1a1a1a
    classDef consumer fill:#d4efdf,stroke:#1e8449,color:#1a1a1a

    subgraph OPS ["Operations (Emitter)"]
        STC["subscription_tier_changed"]:::ops
        SE["subscription_ended"]:::ops
        WDR["winback_delivery_result"]:::ops
    end

    DL_C["D&L"]:::consumer
    PP_C["PP"]:::consumer
    CR_C["CR"]:::consumer

    STC --> DL_C & PP_C & CR_C
    SE --> PP_C & CR_C
    WDR --> CR_C
```

### 7c. Platform & Product Events (9 events)

```mermaid
flowchart LR
    classDef pp fill:#e8daef,stroke:#6c3483,color:#1a1a1a
    classDef consumer fill:#d4efdf,stroke:#1e8449,color:#1a1a1a
    classDef wired fill:#d4efdf,stroke:#1e8449,stroke-width:3px,color:#1a1a1a

    subgraph PP ["Platform & Product (Emitter)"]
        SP["search_performed"]:::pp
        PV["profile_viewed"]:::pp
        ES["enquiry_submitted"]:::pp
        ER["enquiry_responded"]:::pp
        SA["shortlist_added"]:::pp
        LC["listing_created"]:::pp
        PE["profile_edited"]:::pp
        CAT["contact_attempt"]:::pp
        AC["account_closed"]:::pp
    end

    DL_C["D&L (9 wired)"]:::wired
    OPS_C["Ops"]:::consumer
    CR_C["CR"]:::consumer

    SP & PV & ES & ER & LC & PE & CAT & AC --> DL_C
    LC & CAT --> OPS_C
    ES & SA & LC & AC --> CR_C
```

### 7d. Commercial & Revenue Events (4 events)

```mermaid
flowchart LR
    classDef cr fill:#fce4ec,stroke:#c0392b,color:#1a1a1a
    classDef consumer fill:#d4efdf,stroke:#1e8449,color:#1a1a1a

    subgraph CR ["Commercial & Revenue (Emitter)"]
        CM["conversion_milestone"]:::cr
        CRD["churn_risk_detected"]:::cr
        WE["winback_eligible"]:::cr
        PCC["pending_cancellation_created"]:::cr
    end

    OPS_C["Ops"]:::consumer
    PP_C["PP"]:::consumer

    CM & CRD --> OPS_C & PP_C
    WE & PCC --> OPS_C
```
