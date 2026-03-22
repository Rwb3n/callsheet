# Deleting Someone's Data (GDPR)

When someone asks for their data to be erased, the system runs a carefully ordered sequence across all four departments. If anything fails 3 times, the founder gets alerted.

```mermaid
flowchart TD
    classDef startEnd fill:#e8daef,stroke:#6c3483,color:#1a1a1a
    classDef ops fill:#d6eaf8,stroke:#2e86c1,color:#1a1a1a
    classDef dl fill:#d4efdf,stroke:#1e8449,color:#1a1a1a
    classDef bus fill:#f9e79f,stroke:#b7950b,color:#333
    classDef async fill:#fadbd8,stroke:#922b21,color:#1a1a1a

    DS(["Person requests: 'delete my data'"]):::startEnd

    subgraph OPS ["Step 1: Operations"]
        direction TB
        O1["Confirm who they are"]
        O2["Save an anonymised record for audit"]
        O3["Close any open support tickets"]
        O1 --> O2 --> O3
    end

    FLOW(["Run the deletion workflow<br/><i>each step can retry; 3 failures = alert founder</i>"]):::bus

    subgraph DL_STEPS ["Step 2: Data & Listings"]
        direction TB
        D4["Resolve any ownership disputes"]
        D5["Company listings: remove personal info, keep the shell"]
        D6["Freelancer listings: delete entirely"]
        D7["Wipe the user account"]
        D4 --> D5 --> D6 --> D7
    end

    EVT(["Tell the rest of the system: 'erasure done'"]):::bus

    subgraph PP_STEPS ["Step 3a: Website"]
        P8["Remove from search results"]
        P9["Remove from other users' shortlists"]
    end

    subgraph CR_STEPS ["Step 3b: Commercial"]
        C11["Anonymise any churn records"]
        C12["Cancel any scheduled win-back emails"]
    end

    CORR["Also: erase personal info from email logs,<br/>but keep the skeleton for compliance"]

    DS --> OPS --> FLOW --> DL_STEPS --> EVT
    EVT --> PP_STEPS
    EVT --> CR_STEPS
    DL_STEPS -.-> CORR
```
