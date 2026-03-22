# How Search Works

When a buyer searches, the system finds matching listings and ranks them. Better-quality profiles appear higher. Paid tiers get a boost, but a great free listing still beats a mediocre paid one.

```mermaid
flowchart TD
    classDef input fill:#e8daef,stroke:#6c3483,color:#1a1a1a
    classDef process fill:#d4efdf,stroke:#1e8449,color:#1a1a1a
    classDef formula fill:#fef9e7,stroke:#b7950b,color:#1a1a1a
    classDef fallback fill:#fadbd8,stroke:#922b21,color:#1a1a1a

    Q(["Buyer types a search"]):::input
    FILTERS["Narrow down by:<br/><i>industry, service type, company type,<br/>subscription tier, only show active listings</i>"]

    EMPTY_Q{"Did they type any words?"}

    EMPTY["No words: show all listings<br/>sorted by quality score"]:::fallback

    SYN["Expand the search<br/><i>e.g. 'DP' also finds 'Director of Photography'</i>"]:::process

    FTS["Find all matching listings"]:::process

    HAS_RESULTS{"Any results?"}

    RANK["Rank the results"]:::formula
    FORMULA["<b>Position</b> = how well it matches the search<br/> x quality bonus (better profile = higher)<br/> x paid tier bonus (small extra lift)"]:::formula

    TRI["Fuzzy name match<br/><i>catches typos and partial names</i>"]:::fallback

    RESULT(["Show ranked results to the buyer"])

    Q --> FILTERS --> EMPTY_Q
    EMPTY_Q -- "No" --> EMPTY
    EMPTY_Q -- "Yes" --> SYN --> FTS --> HAS_RESULTS
    HAS_RESULTS -- "Yes" --> RANK
    HAS_RESULTS -- "No" --> TRI --> RESULT
    RANK --- FORMULA
    RANK --> RESULT
```

> **Example:** A free listing with quality score 85 appears above a premium listing with quality score 30, even though premium gets a ranking boost. Quality wins.
