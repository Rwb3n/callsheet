# Platform & Product — Investigation Brief

**Domain:** Platform & Product  
**Status:** Not started  
**Priority:** High — blocked by Data & Listings taxonomy and data model  
**Dependency:** Taxonomy Analysis, Data Model Proposal

---

## Objective

Determine the technical architecture for CALLSHEET V1. Resolve the build-vs-buy tradeoff. Define what "search-first, matching-enabled" means in practice.

## Investigation Questions

1. **Build vs buy vs hybrid?**
   - Full custom (Next.js/Rails/Django + PostgreSQL + search engine)
   - Headless CMS + marketplace layer (Strapi/Sanity + custom frontend)
   - Directory SaaS (Jetstyle, Jetstyle, Brilliant Directories, eDirectory)
   - WordPress + directory plugins (ListingPro, GeoDirectory)
   - What are the tradeoffs for each at V1 scale (~500-5,000 listings)?

2. **What does matching actually mean?**
   - Attribute-based filtering (location + service type + budget range)?
   - Algorithmic recommendation ("providers like X also work with Y")?
   - AI-assisted matching (natural language brief → suggested providers)?
   - What's feasible for V1 vs aspirational?

3. **Search architecture?**
   - Full-text search (Elasticsearch/Meilisearch/Typesense)?
   - Faceted search with taxonomy-derived filters?
   - Geo-spatial search (find providers near X)?
   - What's the minimum viable search experience?

4. **Provider experience?**
   - Self-service profile management?
   - Dashboard with analytics (views, enquiries, search appearances)?
   - Claim-and-verify flow for enriched listings?

5. **Buyer experience?**
   - Anonymous browsing or registration required?
   - Save/shortlist providers?
   - Send enquiry/brief directly through platform?
   - How much friction between "found a provider" and "made contact"?

## Key Tradeoff: Control vs Speed

| Approach | Time to V1 | Matching Flexibility | Long-term Scalability | Cost |
|---|---|---|---|---|
| Custom build | 3-6 months | Full control | High | High (dev time) |
| Headless CMS + custom | 2-4 months | Good | High | Medium |
| Directory SaaS | 2-4 weeks | Limited | Low | Low (subscription) |
| WordPress + plugins | 1-2 weeks | Very limited | Low | Very low |

## Deliverable

- Architecture decision record (ADR)
- Technology stack recommendation with rationale
- V1 feature scope (MVP feature list)
- Matching logic specification (even if basic)

## Open Questions

- What's the target launch timeline? This constrains the build-vs-buy decision heavily.
- Is there dev resource beyond yourself + AI-assisted development?
- What's the hosting/infrastructure budget?
- Does the platform need to support the vertical-extensible architecture from day one, or can V1 be broadcast-specific with refactoring later?

## Cross-Domain Impact

| Domain | How platform decisions affect it |
|---|---|
| Data & Listings | Tech stack determines what enrichment automation is feasible |
| Commercial & Revenue | Platform capabilities define what's sellable |
| Operations | Hosting, deployment, monitoring — all platform-dependent |
