// Full analytics view — S5 §3, CS-WORK-044 AC-6 through AC-11
// Tier-gated: free = totals, standard = 30d trends, premium = 90d + demographics.
// Full UI wiring deferred to E2E Phase 2 (PP-Q1 component library).

export default function AnalyticsPage() {
  return (
    <div>
      <h1>Analytics</h1>
      <p>Full tier-gated analytics view. Locked sections show upgrade CTA.</p>
      <p>
        Data served by tRPC <code>dashboard.getListingDashboard</code> query.
        Period selector clamps to tier maximum.
      </p>
    </div>
  )
}
