# §12 Feature Gate Friction Tracking

`getFeatureGateFrictionSummary` aggregates support tickets tagged with `feature_gating_confusion` by gate name, computing friction ratios that surface which tier-gated features cause the most user confusion. Resolves S4-7 (feature gate friction tracking). [Source: operations.md — §3.4]

---

## Data Source

`support_tickets` WHERE `category = 'feature_gating_confusion'`. The ticket's `details` JSONB (not part of the base schema columns — stored as an additional field on the support ticket or derived from the category-specific workflow) is not a column on `support_tickets`. Instead, the gate name is extracted from the ticket `subject` field convention or from a dedicated workflow.

**Correction — schema alignment:** The `support_tickets` table (S7 schema §2.1) does not have a `details` JSONB column. Gate identification uses a separate mechanism: when a ticket is categorized as `feature_gating_confusion` during triage, the admin selects the specific gate from a dropdown matching `TIER_LIMITS` keys. This is stored as a tag in the ticket subject or resolved at query time.

**Simpler implementation:** Add a `details` JSONB column to `support_tickets` for category-specific metadata. This column is nullable (most ticket categories do not need structured metadata) and indexed for the friction tracking query path.

```typescript
// Amendment to support_tickets schema (§18)
details: jsonb("details"),
  // Category-specific structured data. Used by:
  // - "feature_gating_confusion": { gate: string }  — which TIER_LIMITS key caused confusion
  // - Other categories: optional, unstructured
```

**Index for friction tracking:**

```
// Existing from schema §2.1:
// Index: (category) WHERE category = 'feature_gating_confusion'
```

---

## Query Implementation

Route: `admin.friction.getSummary` [Source: router plan §3.9].

```typescript
// Input
const frictionInput = z.object({
  period: z.enum(["30d", "90d", "365d"]),
})
```

**Note on period format:** The Ops interface spec §3.4 defines `period` as `YearMonth` (format `"YYYY-MM"`), matching the monthly ceremony cadence. The admin UI route uses `"30d" | "90d" | "365d"` for dashboard convenience. The admin route converts the relative period to an absolute date range before querying. The `getFeatureGateFrictionSummary` query interface itself accepts `YearMonth` per spec — the admin friction route wraps it with the relative period conversion.

```
admin.friction.getSummary({ period }):
  periodStart = now() - parsePeriod(period)   // "30d" → 30 days, etc.

  gateTickets = SELECT details->>'gate' as gateName, COUNT(*) as ticketCount
                FROM support_tickets
                WHERE category = 'feature_gating_confusion'
                AND details->>'gate' IS NOT NULL
                AND created_at > periodStart
                GROUP BY details->>'gate'

  totalTickets = SELECT COUNT(*)
                 FROM support_tickets
                 WHERE created_at > periodStart

  return {
    period,
    gates: gateTickets.map(t => ({
      gateName: t.gateName,
      ticketCount: t.ticketCount,
      totalTickets,
      frictionRatio: t.ticketCount / totalTickets,
    }))
  }
```

Return type aligns with `FeatureGateFrictionSummary`. [Source: operations.md — §3.4]

```typescript
type FeatureGateFrictionSummary = {
  period: string
  gates: {
    gateName: string
    ticketCount: number
    totalTickets: number
    frictionRatio: number
  }[]
}
```

Target: <500ms p95. [Source: operations.md — §6]

---

## Gate Name Values

Gate names correspond to `TIER_LIMITS` keys from CR §4.1. At V1, the feature gates that can trigger friction are:

- `"trendAnalytics"` — engagement trend charts (Professional/Premium only)
- `"topSearchTerms"` — search term analytics (Premium only)
- `"demographicBreakdown"` — buyer demographic data (Premium only)
- `"sponsoredPlacement"` — promoted positioning (Premium only)
- `"maxPhotos"` — photo upload limits (tier-graduated)
- `"maxCredits"` — credit display limits (tier-graduated)

When a support ticket is created with `category = 'feature_gating_confusion'`, the admin sets `details.gate` to one of these values during triage. Invalid gate names (not matching `TIER_LIMITS` keys) are permitted in the JSONB — the friction summary displays whatever gate names appear, even unrecognized ones. This surfaces miscategorisation for admin review.

---

## Escalation Threshold

Friction ratio >5:1 (complaints:conversions) triggers escalation to principal. [Source: CR-X-6]

The friction summary UI highlights rows where `frictionRatio` exceeds the threshold. The display uses red text or background for ratios exceeding 5:1. No automated escalation — the admin reviews the highlighted ratios and escalates manually. Automated escalation logic (e.g., creating a notification or TaskSpec when the threshold is crossed) is deferred to S9 (Entity Intelligence).

**Note on ratio interpretation:** The `frictionRatio` computed here is `ticketCount / totalTickets` (proportion of all tickets that are friction tickets for a specific gate). The CR-X-6 escalation threshold of 5:1 is `complaints:conversions` — a different denominator (conversions, not total tickets). The admin friction page provides the per-gate ticket count and total ticket count. The conversions denominator comes from CR data (S8). At V1, the admin mentally cross-references friction counts against conversion data from the CR dashboard. Automated ratio computation against conversions is an S9 ceremony input.

---

## UI Surface

Displayed as a sub-section on `/admin/health` page (§8). No dedicated friction page — the data volume at V1 (~50 tickets/month total, a fraction tagged `feature_gating_confusion`) does not warrant a standalone view. [Source: router plan §3.9]

Table format:

| Gate Name | Ticket Count | Total Tickets | Friction Ratio |
|-----------|-------------|---------------|----------------|
| `trendAnalytics` | 4 | 47 | 0.085 |
| `topSearchTerms` | 2 | 47 | 0.043 |

Rows with `frictionRatio` exceeding the escalation threshold (5:1 complaints:conversions, approximated here as a configurable percentage) are highlighted in red.

---

## Schema Amendment

`support_tickets` requires a `details` JSONB column for gate identification. This is a schema amendment beyond what the Phase 1 schema output specified.

```typescript
// Add to support_tickets (S7 schema §2.1)
details: jsonb("details"),
```

This column is nullable and unindexed beyond the existing category partial index. The friction tracking query uses `details->>'gate'` with the category filter, which the `(category) WHERE category = 'feature_gating_confusion'` partial index supports.

---

## Upstream Flag Resolution

| Flag | Resolution |
|------|-----------|
| S4-7 | Feature gate friction tracking implemented: `getFeatureGateFrictionSummary` query aggregates `support_tickets` by `details->>'gate'`, displayed on `/admin/health` page with escalation threshold highlighting. |

---

## Acceptance Criteria

| # | Criterion |
|---|-----------|
| AC-12.1 | `admin.friction.getSummary` returns friction ratios grouped by gate name for the specified period |
| AC-12.2 | Query aggregates `support_tickets` WHERE `category = 'feature_gating_confusion'` grouped by `details->>'gate'` |
| AC-12.3 | Return type matches `FeatureGateFrictionSummary` [Source: operations.md — §3.4] |
| AC-12.4 | Response time <500ms p95 |
| AC-12.5 | Friction summary displayed as sub-section on `/admin/health` page in table format |
| AC-12.6 | Rows exceeding escalation threshold (friction ratio >5:1) are visually highlighted in red |
| AC-12.7 | Gate names correspond to `TIER_LIMITS` keys from CR §4.1 |
| AC-12.8 | `support_tickets` table includes `details` JSONB column for category-specific metadata including gate identification |
