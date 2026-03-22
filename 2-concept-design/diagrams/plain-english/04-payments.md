# What Happens When Someone Pays (or Stops Paying)

Paddle sends us a notification whenever a subscription changes. Operations checks it's genuine, then tells the rest of the system what happened.

```mermaid
flowchart TD
    classDef external fill:#e8d5b7,stroke:#8b6914,color:#333

    PADDLE(["Paddle sends a payment update"]):::external

    subgraph OPS ["Operations (receives all payment notifications)"]
        direction TB
        O1["Confirm it's real (check signature)"]
        O2["Make sure we haven't processed it already"]
        O3["Translate into our internal language"]
        O1 --> O2 --> O3
        O3 --> STC["Someone upgraded or downgraded"]
        O3 --> SE["Someone's subscription ended"]
    end

    subgraph CONSUMERS ["When someone changes tier"]
        direction LR
        C1["Data: adjust how often we check their info"]
        C2["Website: update what features they can see"]
        C3["Commercial: update revenue tracking"]
    end

    subgraph COMMERCIAL ["When a subscription ends"]
        direction TB
        ECI["Figure out why they left"]
        VOL{"Did they choose to leave?"}
        SHOW["Show them what they'll miss<br/><i>'You got 12 enquiries last month'</i>"]
        GRACE["Give them 14 days to fix payment"]

        ECI --> VOL
        VOL -- "Yes" --> SHOW
        VOL -- "Card declined" --> GRACE

        EWB["After 60 days, check if they're missing out"] --> CHECK["Are people still viewing their profile?"] --> EMIT["If yes, send them an email about it"]
    end

    PADDLE --> OPS
    STC --> CONSUMERS
    SE --> COMMERCIAL
```
