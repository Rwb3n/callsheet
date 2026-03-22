// Admin auth guard + layout — S7 §1.1, CS-WORK-057 AC-1.1, AC-1.2
// CSR shell: redirects non-admin users, renders sidebar + content pane.

import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { getAuthInstance } from "@/lib/auth-instance"
import { AdminSidebar } from "./admin-sidebar"

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const auth = getAuthInstance()
  const session = await auth.api.getSession({ headers: await headers() })

  // AC-1.1: unauthenticated → /login?redirect=/admin
  if (!session) {
    redirect("/login?redirect=/admin")
  }

  // AC-1.2: non-admin → /dashboard
  if (!session.user.role?.startsWith("admin")) {
    redirect("/dashboard")
  }

  return (
    <div className="flex h-[calc(100vh-3.5rem)]">
      <AdminSidebar />
      <div className="flex-1 overflow-y-auto p-page">{children}</div>
    </div>
  )
}
