# Operations — Investigation Brief

**Domain:** Operations  
**Status:** Not started  
**Priority:** Medium — downstream of all other domains  
**Dependency:** All other domains (operations serves the business, not the other way around)

---

## Objective

Define the minimum viable operating model for CALLSHEET V1. Determine what must be manual, what can be automated, and what tooling is needed for a solo/small-team operation.

## Investigation Questions

1. **What are the recurring operational activities?**
   - Data maintenance (enrichment, decay checks, deduplication)
   - Provider support (onboarding, profile issues, billing queries)
   - Platform monitoring (uptime, performance, security)
   - Financial operations (invoicing, reconciliation, reporting)
   - Content/taxonomy maintenance

2. **What's the automation boundary at V1 scale?**
   - What must be automated from day one? (Billing, basic monitoring, decay detection)
   - What can stay manual until scale demands automation? (Provider onboarding, support)
   - What's the trigger point for automation investment?

3. **What tooling stack supports a lean operation?**
   - Monitoring: Uptime Robot / Better Stack?
   - Support: Email-based or ticketing (Linear, Freshdesk)?
   - Billing: Stripe + manual reconciliation?
   - CRM: Lightweight or just a spreadsheet at V1?
   - Analytics: Plausible / PostHog?

4. **What's the time budget?**
   - If this is a side project alongside day job, how many hours/week can realistically go to ops?
   - Which activities are time-sensitive (support, outages) vs batchable (data maintenance)?

5. **What's the compliance surface?**
   - GDPR: B2B listings under legitimate interest, but what about unclaimed profiles?
   - Companies House data usage terms
   - ICO registration
   - Terms of service / privacy policy

## Proposed Ops Cadence (V1 Hypothesis)

| Frequency | Activity |
|---|---|
| Daily | Platform health check, support inbox triage |
| Weekly | Data quality sweep, revenue/pipeline review |
| Monthly | Taxonomy review, enrichment batch, financial reconciliation |
| Quarterly | Pricing review, competitor analysis, roadmap check |

## Key Tradeoff: Documentation vs Speed

Documenting everything from day one is overhead. But undocumented manual processes become a nightmare to automate or delegate later. The principle from our framework — "documented from day one" — is the hedge. Doesn't need to be polished; needs to exist.

## Deliverable

- V1 operating model (activities, ownership, cadence)
- Tooling stack recommendation
- Automation roadmap (what now, what later, what triggers investment)
- Compliance checklist
- Runbook templates for critical processes

## Open Questions

- Is there a target for when this transitions from side project to primary focus?
- What's the acceptable response time for provider support at V1?
- Is there a budget ceiling for operational tooling?

## Cross-Domain Impact

| Domain | How ops decisions affect it |
|---|---|
| Data & Listings | Ops cadence determines data freshness ceiling |
| Platform & Product | Monitoring and deployment practices affect reliability |
| Commercial & Revenue | Support quality affects churn; billing ops affects cash flow |
