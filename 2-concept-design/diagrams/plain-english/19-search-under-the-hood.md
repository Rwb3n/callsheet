# How Search Works Under the Hood

The buyer types a query. The system expands it (e.g. abbreviations), searches the database, and ranks results. If nothing matches, it falls back to fuzzy name matching.

```mermaid
flowchart TD
    classDef input fill:#e8daef,stroke:#6c3483,color:#1a1a1a
    classDef process fill:#d6eaf8,stroke:#2e86c1,color:#1a1a1a
    classDef decision fill:#fdebd0,stroke:#ca6f1e,color:#1a1a1a
    classDef fallback fill:#fadbd8,stroke:#922b21,color:#1a1a1a
    classDef result fill:#d4efdf,stroke:#1e8449,color:#1a1a1a
    classDef infra fill:#fef9e7,stroke:#b7950b,color:#333

    SP(["Buyer enters a search"]):::input

    IDX["Pre-built search index<br/><i>Business names weighted highest,<br/>then service tags, then descriptions.<br/>Includes abbreviation/synonym lookups.</i>"]:::infra

    FILTERS["Narrow down by:<br/><i>industry, service type, company type,<br/>pricing tier, only active listings</i>"]:::process

    E1{"Did they type any words?"}:::decision

    EMPTY["No words typed:<br/>show all listings ranked by quality"]:::fallback

    EXPAND["Expand the query<br/><i>'DP' also matches 'Director of Photography'</i>"]:::process

    FTS["Search the index for matches"]:::process

    HAS{"Any results?"}:::decision

    TRI["Try fuzzy matching<br/><i>catches typos and partial names</i>"]:::fallback

    RESULT(["Show the results, best first"]):::result

    SP --> FILTERS --> E1
    E1 -- "No" --> EMPTY --> RESULT
    E1 -- "Yes" --> EXPAND --> FTS --> HAS
    HAS -- "Yes" --> RESULT
    HAS -- "No" --> TRI --> RESULT

    IDX -.-> FTS
    IDX -.-> TRI
```
