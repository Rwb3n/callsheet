# CALLSHEET — System Architecture Diagrams

Two versions of the same 19 architecture diagrams, rendered as Mermaid (viewable directly on GitHub).

## Technical Version

For engineers and architects. Uses domain terminology, function names, event types, and schema details.

| # | Diagram | File |
|---|---------|------|
| 1 | Macro Topology & Cross-Domain Dependencies | [technical/01-macro-topology.md](technical/01-macro-topology.md) |
| 2 | Entity Relationship Model | [technical/02-entity-relationship.md](technical/02-entity-relationship.md) |
| 3 | Task Specification & Procurement Engine | [technical/03-procurement-engine.md](technical/03-procurement-engine.md) |
| 4 | Paddle Webhook Routing | [technical/04-paddle-webhook-routing.md](technical/04-paddle-webhook-routing.md) |
| 5 | Search & Ranking Equation | [technical/05-search-ranking.md](technical/05-search-ranking.md) |
| 6 | GDPR Erasure Orchestration | [technical/06-gdpr-erasure.md](technical/06-gdpr-erasure.md) |
| 7 | Domain Event Consumer Matrix (4 sub-diagrams) | [technical/07-event-consumer-matrix.md](technical/07-event-consumer-matrix.md) |
| 8 | Verification Tier Escalation | [technical/08-verification-escalation.md](technical/08-verification-escalation.md) |
| 9 | Data Quality & Decay Loop | [technical/09-data-decay-loop.md](technical/09-data-decay-loop.md) |
| 10 | Deferred Action Scheduler (35 actions) | [technical/10-deferred-action-scheduler.md](technical/10-deferred-action-scheduler.md) |
| 11 | Support Triage Decision Tree | [technical/11-support-triage.md](technical/11-support-triage.md) |
| 12 | Claim Volume Projection | [technical/12-claim-volume.md](technical/12-claim-volume.md) |
| 13 | Onboarding Paths (A, B, C) | [technical/13-onboarding-paths.md](technical/13-onboarding-paths.md) |
| 14 | Conversion Optimisation Funnel | [technical/14-conversion-funnel.md](technical/14-conversion-funnel.md) |
| 15 | Cancellation & Churn Intervention | [technical/15-churn-winback.md](technical/15-churn-winback.md) |
| 16 | S0 Infrastructure Layer | [technical/16-s0-infrastructure.md](technical/16-s0-infrastructure.md) |
| 17 | Communications Pipeline | [technical/17-communications-pipeline.md](technical/17-communications-pipeline.md) |
| 18 | Integrity Pipeline & Taxonomy | [technical/18-integrity-taxonomy.md](technical/18-integrity-taxonomy.md) |
| 19 | Search Infrastructure | [technical/19-search-infrastructure.md](technical/19-search-infrastructure.md) |

## Plain English Version

For non-technical stakeholders, new team members, investors, and partners. Same diagrams, same structure, no jargon.

| # | Diagram | File |
|---|---------|------|
| 1 | The Big Picture | [plain-english/01-big-picture.md](plain-english/01-big-picture.md) |
| 2 | Users and Listings | [plain-english/02-users-and-listings.md](plain-english/02-users-and-listings.md) |
| 3 | How the System Hires Humans | [plain-english/03-hiring-humans.md](plain-english/03-hiring-humans.md) |
| 4 | What Happens When Someone Pays | [plain-english/04-payments.md](plain-english/04-payments.md) |
| 5 | How Search Works | [plain-english/05-how-search-works.md](plain-english/05-how-search-works.md) |
| 6 | Deleting Someone's Data | [plain-english/06-deleting-data.md](plain-english/06-deleting-data.md) |
| 7 | How Departments Notify Each Other (4 sub-diagrams) | [plain-english/07-department-notifications.md](plain-english/07-department-notifications.md) |
| 8 | How Trust Builds Over Time | [plain-english/08-trust-badges.md](plain-english/08-trust-badges.md) |
| 9 | Keeping Data Fresh | [plain-english/09-keeping-data-fresh.md](plain-english/09-keeping-data-fresh.md) |
| 10 | The Task Scheduler | [plain-english/10-task-scheduler.md](plain-english/10-task-scheduler.md) |
| 11 | How Support Requests Are Handled | [plain-english/11-support-requests.md](plain-english/11-support-requests.md) |
| 12 | How Many Claims Can We Handle? | [plain-english/12-claim-capacity.md](plain-english/12-claim-capacity.md) |
| 13 | Three Ways to Get a Listing | [plain-english/13-three-paths-to-listing.md](plain-english/13-three-paths-to-listing.md) |
| 14 | Converting Free Users to Paid | [plain-english/14-converting-free-to-paid.md](plain-english/14-converting-free-to-paid.md) |
| 15 | When Someone Cancels | [plain-english/15-cancellation.md](plain-english/15-cancellation.md) |
| 16 | The Six Shared Tools | [plain-english/16-shared-tools.md](plain-english/16-shared-tools.md) |
| 17 | How Email Works End to End | [plain-english/17-email-lifecycle.md](plain-english/17-email-lifecycle.md) |
| 18 | Checking Listing Quality | [plain-english/18-listing-quality-checks.md](plain-english/18-listing-quality-checks.md) |
| 19 | How Search Works Under the Hood | [plain-english/19-search-under-the-hood.md](plain-english/19-search-under-the-hood.md) |

## Source

Both versions are derived from [`SYSTEM-ARCHITECTURE-ASCII.md`](../SYSTEM-ARCHITECTURE-ASCII.md) (the original ASCII block diagrams). The combined single-file versions are also available:

- [`SYSTEM-ARCHITECTURE-MERMAID.md`](../SYSTEM-ARCHITECTURE-MERMAID.md) (technical, all 19 in one file)
- [`SYSTEM-ARCHITECTURE-PLAIN.md`](../SYSTEM-ARCHITECTURE-PLAIN.md) (plain English, all 19 in one file)
