# How Departments Notify Each Other

When something important happens (e.g. a listing is claimed, someone cancels), the department where it happened sends a notification. Other departments listen for the ones they care about.

### 7a. Data & Listings says...

```mermaid
flowchart LR
    classDef dl fill:#d4efdf,stroke:#1e8449,color:#1a1a1a
    classDef consumer fill:#d6eaf8,stroke:#2e86c1,color:#1a1a1a

    subgraph DL ["Data & Listings sends these notifications"]
        CA["Claim approved"]:::dl
        CRJ["Claim rejected"]:::dl
        LA["Listing taken offline"]:::dl
        LS["Listing suspended"]:::dl
        LR["Listing brought back"]:::dl
        VTC["Trust badge upgraded"]:::dl
        DSD["Stale data detected"]:::dl
        QSC["Quality score changed"]:::dl
        EC["Data erasure finished"]:::dl
    end

    OPS_C["Operations listens"]:::consumer
    PP_C["Website listens"]:::consumer
    CR_C["Commercial listens"]:::consumer

    CA & CRJ & LA & LS & LR --> OPS_C
    CA & CRJ & LA & LS & LR & VTC & DSD & QSC & EC --> PP_C
    CA & LA & QSC & EC --> CR_C
    DSD & EC --> OPS_C
```

### 7b. Operations says...

```mermaid
flowchart LR
    classDef ops fill:#d6eaf8,stroke:#2e86c1,color:#1a1a1a
    classDef consumer fill:#d4efdf,stroke:#1e8449,color:#1a1a1a

    subgraph OPS ["Operations sends these notifications"]
        STC["Subscription tier changed"]:::ops
        SE["Subscription ended"]:::ops
        WDR["Win-back email result"]:::ops
    end

    DL_C["Data listens"]:::consumer
    PP_C["Website listens"]:::consumer
    CR_C["Commercial listens"]:::consumer

    STC --> DL_C & PP_C & CR_C
    SE --> PP_C & CR_C
    WDR --> CR_C
```

### 7c. Website says...

```mermaid
flowchart LR
    classDef pp fill:#e8daef,stroke:#6c3483,color:#1a1a1a
    classDef consumer fill:#d4efdf,stroke:#1e8449,color:#1a1a1a

    subgraph PP ["Website sends these notifications"]
        SP["Someone searched"]:::pp
        PV["Someone viewed a profile"]:::pp
        ES["Someone sent an enquiry"]:::pp
        ER["Someone replied to an enquiry"]:::pp
        SA["Someone shortlisted a listing"]:::pp
        LC["New listing created"]:::pp
        PE["Profile was edited"]:::pp
        CAT["Someone tried to make contact"]:::pp
        AC["Account was closed"]:::pp
    end

    DL_C["Data listens"]:::consumer
    OPS_C["Operations listens"]:::consumer
    CR_C["Commercial listens"]:::consumer

    SP & PV & ES & ER & LC & PE & CAT & AC --> DL_C
    LC & CAT --> OPS_C
    ES & SA & LC & AC --> CR_C
```

### 7d. Commercial says...

```mermaid
flowchart LR
    classDef cr fill:#fce4ec,stroke:#c0392b,color:#1a1a1a
    classDef consumer fill:#d4efdf,stroke:#1e8449,color:#1a1a1a

    subgraph CR ["Commercial sends these notifications"]
        CM["Conversion milestone reached"]:::cr
        CRD["This subscriber might leave"]:::cr
        WE["Former subscriber is worth contacting"]:::cr
        PCC["Cancellation is being processed"]:::cr
    end

    OPS_C["Operations listens"]:::consumer
    PP_C["Website listens"]:::consumer

    CM & CRD --> OPS_C & PP_C
    WE & PCC --> OPS_C
```
