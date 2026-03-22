# How Support Requests Are Handled

Most support requests are resolved automatically. Humans are only brought in for things the system can't handle.

```mermaid
flowchart TD
    classDef startEnd fill:#e8daef,stroke:#6c3483,color:#1a1a1a
    classDef decision fill:#fdebd0,stroke:#ca6f1e,color:#1a1a1a
    classDef auto fill:#d4efdf,stroke:#1e8449,color:#1a1a1a
    classDef human fill:#fadbd8,stroke:#922b21,color:#1a1a1a
    classDef escalate fill:#f5b7b1,stroke:#922b21,color:#1a1a1a,font-weight:bold

    IN(["Someone asks for help"]):::startEnd
    CLASSIFY["System figures out what kind of problem it is"]

    PWD["Password reset"]
    BILL["Billing question"]
    PROF["Profile editing help"]
    RANK["'Why am I ranked low?'"]
    LEGAL["Legal threat or<br/>something sensitive"]

    AUTO_LINK["Send automated reset link"]:::auto

    PADDLE_Q{"Can Paddle's portal<br/>answer this?"}:::decision
    PADDLE_YES["Send them to Paddle"]:::auto
    PADDLE_NO["Send to a human"]:::human

    KB_Q{"Is there a help<br/>article for this?"}:::decision
    KB_YES["Show the article"]:::auto
    KB_NO["Send to a human"]:::human
    KB_RES{"Did that solve it?"}:::decision
    KB_CLOSE["Done"]:::auto
    KB_ROUTE["Send to a human"]:::human

    SCORE["Look up their quality score"]
    EXPLAIN["Explain why their score is what it is<br/>and how to improve it"]:::auto
    SAT{"Are they satisfied?"}:::decision
    SAT_CLOSE["Done"]:::auto
    SAT_ROUTE["Send to a human<br/>for a manual review"]:::human

    ESCALATE["Send directly to the founder"]:::escalate

    IN --> CLASSIFY
    CLASSIFY --> PWD & BILL & PROF & RANK & LEGAL

    PWD --> AUTO_LINK
    BILL --> PADDLE_Q
    PADDLE_Q -- "Yes" --> PADDLE_YES
    PADDLE_Q -- "No" --> PADDLE_NO

    PROF --> KB_Q
    KB_Q -- "Yes" --> KB_YES --> KB_RES
    KB_Q -- "No" --> KB_NO
    KB_RES -- "Yes" --> KB_CLOSE
    KB_RES -- "No" --> KB_ROUTE

    RANK --> SCORE --> EXPLAIN --> SAT
    SAT -- "Yes" --> SAT_CLOSE
    SAT -- "No" --> SAT_ROUTE

    LEGAL --> ESCALATE
```

*If the person asking for help is flagged as a churn risk, their request gets priority.*
