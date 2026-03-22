// Dashboard overview — S5 §2.1, CS-WORK-043 AC-2/AC-3, CH-CS-014 W8 AC-30/AC-32/AC-33
// Server component shell with client data layer.

import { DashboardOverviewContent } from "./overview-content"

export default function DashboardOverview() {
  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold tracking-tight">Dashboard</h1>
      <DashboardOverviewContent />
    </div>
  )
}
