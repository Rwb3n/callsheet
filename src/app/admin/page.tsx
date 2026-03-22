// Admin overview — S7 §1.4, CS-WORK-057 AC-1.6
// Server component shell with CSR data layer.

import { AdminOverviewContent } from "./overview-content"

export default function AdminOverview() {
  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold tracking-tight">Admin Dashboard</h1>
      <AdminOverviewContent />
    </div>
  )
}
