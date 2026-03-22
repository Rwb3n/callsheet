// Dashboard sidebar — CH-CS-014 W5 AC-17, AC-18, AC-19
// Sidebar navigation for /dashboard routes. Highlights current route.
// Mobile: drawer that slides in from left on < 768px.

"use client"

import { useState, useEffect } from "react"
import { usePathname } from "next/navigation"
import Link from "next/link"
import { cn } from "@/lib/utils"

const SIDEBAR_SECTIONS = [
  {
    label: "General",
    items: [
      { href: "/dashboard", label: "Overview", exact: true },
    ],
  },
  {
    label: "Provider",
    items: [
      { href: "/dashboard/listings", label: "Listings" },
    ],
  },
  {
    label: "Buyer",
    items: [
      { href: "/dashboard/enquiries-sent", label: "Enquiries Sent" },
      { href: "/dashboard/shortlists", label: "Shortlists" },
      { href: "/dashboard/searches", label: "Searches" },
    ],
  },
  {
    label: "Account",
    items: [
      { href: "/dashboard/notifications", label: "Notifications" },
      { href: "/dashboard/settings", label: "Settings" },
    ],
  },
] as const

type SidebarItem = { href: string; label: string; exact?: boolean }

function isActive(pathname: string, item: SidebarItem): boolean {
  if (item.exact) return pathname === item.href
  return pathname === item.href || pathname.startsWith(item.href + "/")
}

function SignOutButton() {
  const [loading, setLoading] = useState(false)

  async function handleSignOut() {
    setLoading(true)
    await fetch("/api/auth/sign-out", { method: "POST" })
    // Full reload to clear RSC cache — ensures header shows "Sign In"
    window.location.replace("/")
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

function SidebarNav({ pathname, onNavigate, isAdmin }: { pathname: string; onNavigate?: () => void; isAdmin: boolean }) {
  return (
    <nav className="flex flex-col gap-6 p-4">
      {SIDEBAR_SECTIONS.map((section) => (
        <div key={section.label}>
          <h3 className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {section.label}
          </h3>
          <ul className="flex flex-col gap-0.5">
            {section.items.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={onNavigate}
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
        </div>
      ))}
      {isAdmin && (
        <div className="border-t border-sidebar-border pt-4">
          <Link
            href="/admin"
            onClick={onNavigate}
            className="flex items-center rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
          >
            Admin Panel
          </Link>
        </div>
      )}
      <div className="border-t border-sidebar-border pt-4">
        <SignOutButton />
      </div>
    </nav>
  )
}

export function DashboardSidebar({ isAdmin = false }: { isAdmin?: boolean }) {
  const pathname = usePathname()
  const [drawerOpen, setDrawerOpen] = useState(false)

  // Close drawer on navigation
  useEffect(() => { setDrawerOpen(false) }, [pathname])

  return (
    <>
      {/* Mobile drawer trigger */}
      <button
        type="button"
        onClick={() => setDrawerOpen(true)}
        className="fixed bottom-4 left-4 z-40 inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg md:hidden"
        aria-label="Open sidebar"
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
        </svg>
      </button>

      {/* Mobile drawer overlay */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setDrawerOpen(false)}
            aria-hidden="true"
          />
          <aside className="absolute inset-y-0 left-0 w-64 border-r border-sidebar-border bg-sidebar shadow-xl">
            <div className="flex h-14 items-center justify-between border-b border-sidebar-border px-4">
              <span className="text-sm font-semibold text-sidebar-foreground">Dashboard</span>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-sidebar-foreground/70 hover:bg-sidebar-accent"
                aria-label="Close sidebar"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <SidebarNav pathname={pathname} onNavigate={() => setDrawerOpen(false)} isAdmin={isAdmin} />
          </aside>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="hidden w-56 shrink-0 border-r border-sidebar-border bg-sidebar md:block">
        <SidebarNav pathname={pathname} isAdmin={isAdmin} />
      </aside>
    </>
  )
}
