// Dashboard auth guard + sidebar — S5 §1.2, CS-WORK-043 AC-1, CH-CS-014 W5 AC-17/18/19

import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { getAuthInstance } from "@/lib/auth-instance"
import { DashboardSidebar } from "@/components/layout/dashboard-sidebar"

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const auth = getAuthInstance()
  const session = await auth.api.getSession({ headers: await headers() })

  if (!session) {
    redirect("/login?redirect=/dashboard")
  }

  const isAdmin = !!session.user.role?.startsWith("admin")

  return (
    <div className="flex h-[calc(100vh-3.5rem)]">
      <DashboardSidebar isAdmin={isAdmin} />
      <div className="flex-1 overflow-y-auto p-page">{children}</div>
    </div>
  )
}
