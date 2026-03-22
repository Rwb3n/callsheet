# 5. Platform: Search & Ranking Equation

PostgreSQL full-text search with synonym expansion, trigram fallback, and a multiplicative ranking formula where quality amplifies relevance.

```mermaid
flowchart TD
    classDef input fill:#e8daef,stroke:#6c3483,color:#1a1a1a
    classDef process fill:#d4efdf,stroke:#1e8449,color:#1a1a1a
    classDef formula fill:#fef9e7,stroke:#b7950b,color:#1a1a1a
    classDef fallback fill:#fadbd8,stroke:#922b21,color:#1a1a1a

    Q(["SearchQuery"]):::input
    FILTERS["Apply Filters<br/><i>sector, serviceArea, specialisation,<br/>entityType, subscriptionTier<br/>+ lifecycleStatus = 'active'</i>"]

    EMPTY_Q{"Has text query?"}

    EMPTY["Empty Query Path<br/>All active listings<br/>ORDER BY composite DESC"]:::fallback

    SYN["Synonym Expansion<br/><i>expandQuery(db, query)<br/>Falls back to plainto_tsquery</i>"]:::process

    FTS["Full-Text Search<br/><i>search_vector @@ tsquery</i>"]:::process

    HAS_RESULTS{"Results > 0?"}

    RANK["Rank Calculation"]:::formula
    FORMULA["<b>RANK</b> = ts_rank_cd(search_vector, tsquery)<br/>&times; (1.0 + quality_boost + paid_boost)"]:::formula

    QB["quality_boost<br/>composite / 100 &times; 0.5<br/><i>Max: 0.5</i>"]:::formula
    PB["paid_boost<br/>Free: 0.00 | Std: 0.15<br/>Prem: 0.25 | Partner: 0.25"]:::formula

    TRI["Trigram Fallback<br/><i>similarity(name, query) > 0.3</i>"]:::fallback

    RESULT(["Ranked Results<br/><i>Multiplier: 1.0 to 1.75</i>"])

    Q --> FILTERS --> EMPTY_Q
    EMPTY_Q -- "No" --> EMPTY
    EMPTY_Q -- "Yes" --> SYN --> FTS --> HAS_RESULTS
    HAS_RESULTS -- "Yes" --> RANK
    HAS_RESULTS -- "No" --> TRI --> RESULT
    QB & PB --> RANK
    RANK --- FORMULA
    RANK --> RESULT
```

> **Example:** Listing A (ts_rank=0.30, quality=85, free) = 0.428 beats Listing B (ts_rank=0.30, quality=30, premium) = 0.420. High-quality free listing beats low-quality premium.
