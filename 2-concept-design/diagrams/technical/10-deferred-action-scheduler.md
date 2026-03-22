# 10. Shared Infrastructure: Deferred Action Scheduler

The DAS merges operations from all 4 domains into a single timeline execution engine. 35 action types registered.

```mermaid
flowchart TD
    classDef domain fill:#d6eaf8,stroke:#2e86c1,color:#1a1a1a
    classDef db fill:#fef9e7,stroke:#b7950b,color:#333
    classDef worker fill:#d4efdf,stroke:#1e8449,color:#1a1a1a

    CR_D["CR Domain<br/><i>win_back_evaluation (60d)</i>"]:::domain
    OPS_D["Ops Domain<br/><i>billing_reconciliation (daily)</i>"]:::domain
    PP_D["PP Domain<br/><i>compliance_hold_recheck (7d)</i>"]:::domain
    DL_D["D&L Domain<br/><i>expire_enquiry_queue (30d)</i>"]:::domain

    subgraph DAS_DB ["deferred_actions table"]
        direction LR
        SCHEMA["id: UUID | action: DeferredActionType<br/>executeAt: ISO8601 | params: JSONB<br/>retryPolicy: once | retry_3<br/>onFailure: log | alert_principal<br/>status: pending | executing | completed | failed | exhausted | cancelled"]:::db
    end

    SWEEP(["Scheduler Sweep<br/><i>pg_cron / node scheduler</i>"])

    subgraph WORKER ["DAS Worker Executor"]
        direction TB
        W1["win_back_evaluation &rarr; Commercial"]:::worker
        W2["compliance_hold_recheck &rarr; Platform"]:::worker
        W3["retry_bounced_email &rarr; Email"]:::worker
        W4["article_14_progress_check &rarr; Ops"]:::worker
    end

    CR_D & OPS_D & PP_D & DL_D --> DAS_DB
    DAS_DB --> SWEEP --> WORKER
```

**Full Action Registry (35 actions):**

| Cross-Domain / Infrastructure | Domain-Specific |
|-------------------------------|-----------------|
| expire_enquiry_queue | decay_liveness_check |
| compliance_schedule_check | enrichment_full_cycle |
| billing_reconciliation | claim_abandonment_check |
| compliance_hold_recheck | taxonomy_review_preparation |
| win_back_evaluation | data_health_review |
| auto_escalation_check | verification_calibration_review |
| notification_cleanup | provider_outreach_ranking |
| grace_period_expiry | conversion_funnel_analysis |
| checkout_precondition_retry | revenue_health_extended |
| listing_update_reminder | multi_listing_pricing_evaluation |
| enquiry_response_reminder | sponsored_placement_learning |
| search_history_cleanup | operational_health_review |
| sla_breach_warning | contractor_performance_review |
| task_timeout_check | principal_briefing_generation |
| billing_hold_expiry | proactive_churn_detection |
| compliance_self_audit | learning_hypothesis_analysis |
| check_quality_improvement | article_14_progress_check |
| quality_score_recalculation | retry_bounced_email |
