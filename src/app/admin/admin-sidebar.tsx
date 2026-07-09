// Admin sidebar — S7 §1.2, CS-WORK-057 AC-1.4, AC-1.5
// 8 navigation items. Badge counts sourced from AdminOverview (no independent fetches).

"use client"

import { useState } from "react"
import { usePathname } from "next/navigation"
import Link from "next/link"
import { cn } from "@/lib/utils"

// AC-1.4: 8 navigation items
const ADMIN_NAV_ITEMS = [
  { href: "/admin", label: "Overview", exact: true },
  { href: "/admin/tasks", label: "Tasks" },
  { href: "/admin/support", label: "Support" },
  { href: "/admin/billing", label: "Billing" },
  { href: "/admin/compliance", label: "Compliance" },
  { href: "/admin/flows", label: "Flows" },
  { href: "/admin/events", label: "Events" },
  { href: "/admin/scheduler", label: "Scheduler" },
  { href: "/admin/decisions", label: "Decisions" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/health", label: "Health" },
] as const

type NavItem = { href: string; label: string; exact?: boolean }

function isActive(pathname: string, item: NavItem): boolean {
  if (item.exact) return pathname === item.href
  return pathname === item.href || pathname.startsWith(item.href + "/")
}

function AdminSignOutButton() {
  const [loading, setLoading] = useState(false)

  async function handleSignOut() {
    setLoading(true)
    await fetch("/api/auth/sign-out", { method: "POST", credentials: "include" })
    document.cookie = "better-auth.session_token=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT"
    document.cookie = "__Secure-better-auth.session_token=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Secure"
    window.location.href = "/"
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      disabled={loading}
      className="flex w-full items-center rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent/50 hover:text-sidebar-foreground disabled:opacity-50"
    >
      {loading ? "Signing out..." : "Sign out"}
    </button>
  )
}

export function AdminSidebar() {
  const pathname = usePathname()

  return (
    <aside className="hidden w-56 shrink-0 border-r border-sidebar-border bg-sidebar md:block">
      <nav className="flex flex-col gap-1 p-4">
        <h3 className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Admin
        </h3>
        <ul className="flex flex-col gap-0.5">
          {ADMIN_NAV_ITEMS.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className={cn(
                  "flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  isActive(pathname, item)
                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-semibold"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
                )}
                aria-current={isActive(pathname, item) ? "page" : undefined}
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
        <div className="mt-4 border-t border-sidebar-border pt-4">
          <Link
            href="/dashboard"
            className="flex items-center rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
          >
            Dashboard
          </Link>
          <AdminSignOutButton />
        </div>
      </nav>
    </aside>
  )
}
