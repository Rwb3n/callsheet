# 6. GDPR Erasure Orchestration Protocol

The most complex cross-domain transaction. Implemented as an Orchestrated Flow with step-level retry, skip, and auto-escalation after 3 consecutive failures.

```mermaid
flowchart TD
    classDef startEnd fill:#e8daef,stroke:#6c3483,color:#1a1a1a
    classDef ops fill:#d6eaf8,stroke:#2e86c1,color:#1a1a1a
    classDef dl fill:#d4efdf,stroke:#1e8449,color:#1a1a1a
    classDef bus fill:#f9e79f,stroke:#b7950b,color:#333
    classDef async fill:#fadbd8,stroke:#922b21,color:#1a1a1a

    DS(["Data Subject<br/><i>Art. 17 Erasure Request</i>"]):::startEnd

    subgraph OPS ["1. Operations (Orchestrator)"]
        direction TB
        O1["Identify user, verify timelines (30d SLA)"]
        O2["Extract data for anonymised audit log"]
        O3["Close active support tickets"]
        O1 --> O2 --> O3
    end
    class OPS ops

    FLOW(["Orchestrated Flow<br/><i>type: 'erasure'<br/>auto-escalation: 3 failures &rarr; Principal</i>"]):::bus

    subgraph DL_STEPS ["2. Data & Listings (Synchronous Steps)"]
        direction TB
        D4["Resolve active claim disputes"]
        D5["Company listings: wipe PII, unlink, revert to 'unclaimed'"]
        D6["Freelancer listings: hard delete"]
        D7["Wipe Account auth + facet data"]
        D4 --> D5 --> D6 --> D7
    end
    class DL_STEPS dl

    EVT(["Emit erasure_completed"]):::bus

    subgraph PP_STEPS ["3a. Platform & Product (Async)"]
        P8["Purge search indexes"]
        P9["Clear cache"]
        P10["Scrub from Shortlists"]
    end
    class PP_STEPS async

    subgraph CR_STEPS ["3b. Commercial & Revenue (Async)"]
        C11["Anonymise churn logs"]
        C12["Cancel win-back crons"]
    end
    class CR_STEPS async

    DSAR["DSAR Correspondence<br/><i>anonymiseCorrespondence(accountId)<br/>getCorrespondenceForAccount(accountId | email)</i>"]

    DS --> OPS --> FLOW --> DL_STEPS --> EVT
    EVT --> PP_STEPS
    EVT --> CR_STEPS
    DL_STEPS -.-> DSAR
```
