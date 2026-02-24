// Dashboard auth guard — S5 §1.2, CS-WORK-043 AC-1
// All /dashboard routes require authenticated session.

import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { getAuthInstance } from "@/lib/auth-instance"

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

  return <>{children}</>
}
