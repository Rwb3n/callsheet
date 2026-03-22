# The Big Picture

CALLSHEET has four departments that each own a clear job. They talk to each other through a central message board, and they all share a set of common tools. Paddle (a third-party payment provider) handles all billing.

```mermaid
graph TB
    classDef external fill:#e8d5b7,stroke:#8b6914,color:#333
    classDef domain fill:#d4e6f1,stroke:#2471a3,color:#1a1a1a
    classDef bus fill:#f9e79f,stroke:#b7950b,color:#333
    classDef infra fill:#d5f5e3,stroke:#1e8449,color:#1a1a1a

    PADDLE["Paddle<br/><i>Handles all payments, invoices, and tax</i>"]:::external

    subgraph PP ["Website & Search"]
        direction TB
        PP_TOP["What buyers and providers see:<br/>search, profiles, dashboard, sign-up"]
    end
    class PP domain

    subgraph OPS ["Operations"]
        direction TB
        OPS_TOP["Keeps things running:<br/>payment processing, compliance,<br/>hiring humans when needed"]
    end
    class OPS domain

    subgraph DL ["Data & Listings"]
        direction TB
        DL_TOP["Owns the directory:<br/>company records, quality scores,<br/>who's verified, what's stale"]
    end
    class DL domain

    subgraph CR ["Commercial & Revenue"]
        direction TB
        CR_TOP["Grows the business:<br/>pricing tiers, conversion nudges,<br/>churn prevention, win-back"]
    end
    class CR domain

    EB(["Message Board<br/><i>25 different notifications departments send each other</i>"]):::bus
    INFRA["Shared Tools<br/><i>Message board, task scheduler, decision log,<br/>multi-step workflows, email, file storage</i>"]:::infra

    PP -- "sends checkout /<br/>cancellation requests" --> PADDLE
    PADDLE -- "sends payment<br/>updates back" --> OPS

    PP <-..-> EB
    OPS <-..-> EB
    DL <-..-> EB
    CR <-..-> EB

    PP ~~~ DL
    OPS ~~~ CR

    DL & CR & PP & OPS --> INFRA
```
