# 11. Support Triage Decision Tree

Operations reframes support as an entity decision architecture. Most tickets are deflected or auto-resolved; humans are procured only for judgment tasks.

```mermaid
flowchart TD
    classDef startEnd fill:#e8daef,stroke:#6c3483,color:#1a1a1a
    classDef decision fill:#fdebd0,stroke:#ca6f1e,color:#1a1a1a
    classDef auto fill:#d4efdf,stroke:#1e8449,color:#1a1a1a
    classDef human fill:#fadbd8,stroke:#922b21,color:#1a1a1a
    classDef escalate fill:#f5b7b1,stroke:#922b21,color:#1a1a1a,font-weight:bold

    IN(["Inbound Support Request"]):::startEnd
    CLASSIFY["Entity Classify"]

    PWD["Password Reset"]
    BILL["Billing / Payment"]
    PROF["Profile Editing"]
    RANK["Search Ranking"]
    LEGAL["Legal Threat /<br/>Sensitive"]

    AUTO_LINK["Automated Link"]:::auto

    PADDLE_Q{"Paddle portal?"}:::decision
    PADDLE_YES["Redirect to Paddle"]:::auto
    PADDLE_NO["Route to Support"]:::human

    KB_Q{"KB Match?"}:::decision
    KB_YES["Auto-Suggest"]:::auto
    KB_NO["Route to Support"]:::human
    KB_RES{"Resolved?"}:::decision
    KB_CLOSE["Close"]:::auto
    KB_ROUTE["Route to Support"]:::human

    SCORE["Check Quality Score"]
    EXPLAIN["Auto-Explain<br/><i>'Score is 45/100, improve by X'</i>"]:::auto
    SAT{"Satisfied?"}:::decision
    SAT_CLOSE["Close"]:::auto
    SAT_ROUTE["Route to Support<br/><i>TaskSpec: ranking_review</i>"]:::human

    ESCALATE["IMMEDIATE<br/>PRINCIPAL ESCALATE"]:::escalate

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

*High Churn Risk subscribers get elevated priority. Unreachable Claimed Profile: Entity auto-responds with alternative active providers.*
