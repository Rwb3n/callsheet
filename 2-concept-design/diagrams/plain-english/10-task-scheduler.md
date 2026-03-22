# The Task Scheduler

Every department can schedule tasks for the future. All these scheduled tasks go into one shared queue. A timer checks the queue regularly and runs whatever is due.

```mermaid
flowchart TD
    classDef domain fill:#d6eaf8,stroke:#2e86c1,color:#1a1a1a
    classDef db fill:#fef9e7,stroke:#b7950b,color:#333
    classDef worker fill:#d4efdf,stroke:#1e8449,color:#1a1a1a

    CR_D["Commercial<br/><i>e.g. check win-back in 60 days</i>"]:::domain
    OPS_D["Operations<br/><i>e.g. reconcile billing daily</i>"]:::domain
    PP_D["Website<br/><i>e.g. recheck compliance in 7 days</i>"]:::domain
    DL_D["Data<br/><i>e.g. expire old enquiries in 30 days</i>"]:::domain

    subgraph QUEUE ["Shared Task Queue"]
        direction LR
        SCHEMA["What to do | When to do it | What info is needed<br/>How many retries | What to do if it fails<br/>Current status: waiting, running, done, or failed"]:::db
    end

    TIMER(["Timer checks the queue regularly"])

    subgraph WORKER ["Runs the task"]
        direction TB
        W1["Win-back check: ask Commercial to evaluate"]:::worker
        W2["Compliance recheck: ask Website to evaluate"]:::worker
        W3["Bounced email retry: ask Email to resend"]:::worker
        W4["Privacy notice check: ask Operations to evaluate"]:::worker
    end

    CR_D & OPS_D & PP_D & DL_D --> QUEUE
    QUEUE --> TIMER --> WORKER
```

**35 different task types** are registered across the four departments — from daily billing checks to 60-day win-back evaluations.
