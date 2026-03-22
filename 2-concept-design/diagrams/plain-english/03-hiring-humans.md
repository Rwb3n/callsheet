# How the System Hires Humans

CALLSHEET runs itself automatically. But some tasks need human judgment (e.g. resolving disputes, reviewing showreels). When that happens, the system writes a clear brief and hires someone.

```mermaid
flowchart TD
    classDef startEnd fill:#e8daef,stroke:#6c3483,color:#1a1a1a
    classDef decision fill:#fdebd0,stroke:#ca6f1e,color:#1a1a1a
    classDef escalate fill:#f5b7b1,stroke:#922b21,color:#1a1a1a
    classDef action fill:#d4efdf,stroke:#1e8449,color:#1a1a1a

    A(["Something needs a human eye"]):::startEnd
    B["Write a clear brief:<br/><i>what to do, what to look at,<br/>how to judge, deadline</i>"]

    C{"Does the worker<br/>need to see<br/>personal data?"}:::decision
    D["Only send to vetted,<br/>data-agreement workers"]:::escalate

    E{"High volume of<br/>these tasks?"}:::decision
    F["Hire a dedicated contractor<br/><i>needs founder approval</i>"]

    G{"Is this sensitive?<br/><i>compliance, verification</i>"}:::decision
    H["Give them a test task first"]
    I{"Did they pass?"}:::decision
    J["Assign the work"]:::action

    K["Worker does the task"]:::action
    L{"Finished on time?"}:::decision
    M{"Attempts left?"}:::decision
    N["Try a different worker"]
    O["Escalate to the founder"]:::escalate
    P(["Done. Learn from the result."]):::startEnd

    A --> B --> C
    C -- "Yes" --> D
    C -- "No / cleared" --> E
    E -- "Yes" --> F --> J
    E -- "No" --> G
    G -- "Yes" --> H --> I
    I -- "Yes" --> J
    G -- "No" --> J
    J --> K --> L
    L -- "Yes" --> P
    L -- "No" --> M
    M -- "Yes" --> N --> K
    M -- "No" --> O
```
