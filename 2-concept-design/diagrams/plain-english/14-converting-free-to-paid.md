# How We Convert Free Users to Paid

A timed sequence of nudges based on actual engagement data. If nothing works, we back off. Real events (like receiving an enquiry) can shortcut the whole funnel.

```mermaid
flowchart TD
    classDef start fill:#e8daef,stroke:#6c3483,color:#1a1a1a
    classDef decision fill:#fdebd0,stroke:#ca6f1e,color:#1a1a1a
    classDef action fill:#d6eaf8,stroke:#2e86c1,color:#1a1a1a
    classDef checkout fill:#d4efdf,stroke:#1e8449,color:#1a1a1a,font-weight:bold
    classDef cold fill:#fadbd8,stroke:#922b21,color:#1a1a1a
    classDef event fill:#fef9e7,stroke:#b7950b,color:#333

    FREE(["Free listing goes live"]):::start
    D7Q{"After 7 days:<br/>has anyone viewed<br/>their profile?"}:::decision

    COLD["Nobody's looking yet. Send encouragement:<br/><i>'Buyers searched your area X times'</i>"]:::cold

    TEASER["Show an analytics teaser:<br/><i>'See who viewed your profile'</i>"]:::action

    CLICK1{"Do they click?"}:::decision
    BLUR["Show blurred premium data:<br/><i>'3 companies viewed you<br/>- upgrade to see who'</i>"]:::action

    EMAIL14["Day 14: email an engagement summary"]:::action
    OPEN{"Do they open it?"}:::decision
    LOW["They're not engaging.<br/>Reduce contact frequency."]:::cold
    VIEW_T["Show a preview of premium features"]:::action

    CLICK2{"Do they upgrade?"}:::decision
    D30["Day 30: social proof email<br/><i>'47 providers in your area upgraded'</i>"]:::action
    CLICK3{"Do they upgrade?"}:::decision

    CHECKOUT(["THEY UPGRADE"]):::checkout

    EVENTS["Real-time triggers can shortcut the funnel:<br/><i>First enquiry received<br/>Profile view milestone (50/100/200)<br/>Found via multiple search terms</i>"]:::event

    FREE --> D7Q
    D7Q -- "Yes" --> TEASER
    D7Q -- "No" --> COLD --> TEASER

    TEASER --> CLICK1
    CLICK1 -- "Yes" --> BLUR --> CLICK3
    CLICK1 -- "No" --> EMAIL14 --> OPEN

    OPEN -- "Yes" --> VIEW_T --> CLICK2
    OPEN -- "No" --> LOW

    CLICK2 -- "Yes" --> CHECKOUT
    CLICK2 -- "No" --> D30

    CLICK3 -- "Yes" --> CHECKOUT

    EVENTS -. "shortcut" .-> CHECKOUT
```
