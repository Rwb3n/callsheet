// Mobile menu toggle — CH-CS-014 W5 AC-19
// Client component: toggles hamburger menu on screens < 768px.

"use client"

import { useState, useEffect } from "react"
import { usePathname } from "next/navigation"
import Link from "next/link"

const NAV_LINKS = [
  { href: "/search", label: "Search" },
  { href: "/pricing", label: "Pricing" },
] as const

export function MobileMenuToggle({ isAuthenticated }: { isAuthenticated: boolean }) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()

  // Close menu on navigation
  useEffect(() => { setOpen(false) }, [pathname])

  return (
    <div className="md:hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
      >
        {open ? (
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
          </svg>
        )}
      </button>

      {open && (
        <div className="fixed inset-x-0 top-14 z-50 border-b border-border bg-background p-4 shadow-lg">
          <nav className="flex flex-col gap-3">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                {link.label}
              </Link>
            ))}
            {isAuthenticated ? (
              <Link
                href="/dashboard"
                className="rounded-md bg-primary px-3 py-2 text-center text-sm font-medium text-primary-foreground"
              >
                Dashboard
              </Link>
            ) : (
              <Link
                href="/login"
                className="rounded-md border border-border px-3 py-2 text-center text-sm font-medium hover:bg-accent"
              >
                Sign In
              </Link>
            )}
          </nav>
        </div>
      )}
    </div>
  )
}
