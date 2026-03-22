# 18. Data & Listings: Integrity Pipeline & Taxonomy

Listing integrity enforced by a sequential rule pipeline with short-circuit evaluation. Taxonomy overlap uses Jaccard similarity at service-area level.

```mermaid
flowchart TD
    classDef input fill:#e8daef,stroke:#6c3483,color:#1a1a1a
    classDef rule fill:#d6eaf8,stroke:#2e86c1,color:#1a1a1a
    classDef taxonomy fill:#d4efdf,stroke:#1e8449,color:#1a1a1a
    classDef import fill:#fef9e7,stroke:#b7950b,color:#333

    INPUT(["Listing Create / Update"]):::input

    subgraph PIPELINE ["Sequential Integrity Pipeline (short-circuits on first fail)"]
        direction LR
        R1["<b>Rule 1: Duplicate Detection</b><br/><i>Sorted-neighbour (window 10)<br/>pg_trgm similarity > 0.9<br/>CH number clustering<br/>Union-find merge</i>"]:::rule
        R2["<b>Rule 2: Identity Verification</b><br/><i>Name vs Companies House<br/>Entity type match</i>"]:::rule
        R3["<b>Rule 3: CH Uniqueness</b><br/><i>No shared CH numbers<br/>Pipeline-level (not DB)</i>"]:::rule
        R1 -- "pass" --> R2 -- "pass" --> R3
    end

    TAX["<b>Taxonomy Overlap</b><br/><i>computeTaxonomyOverlap(tagsA, tagsB)<br/>Jaccard similarity at service-area level<br/>7 sectors &rarr; 64 service areas &rarr; 269 specialisations</i>"]:::taxonomy

    subgraph IMPORT ["4RFV Import Pipeline (CS-WORK-021/022)"]
        direction TB
        I1["5-phase CLI<br/><i>normalise &rarr; CH verify &rarr; dedup &rarr; commit &rarr; Article 14</i>"]:::import
        I2["~4,657 companies from SQLite"]:::import
        I3["No listing_created events (by design)"]:::import
        I4["Article 14 GDPR: email or on-page flag"]:::import
    end

    INPUT --> PIPELINE
    R1 -.-> TAX
    IMPORT -.-> PIPELINE
```
