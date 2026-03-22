// Site header — CH-CS-014 W5 AC-16, AC-19
// Auth-conditional: shows Sign In when no session, Dashboard when authenticated.
// Mobile: hamburger menu on < 768px.

import Link from "next/link"
import { headers } from "next/headers"
import { getAuthInstance } from "@/lib/auth-instance"
import { MobileMenuToggle } from "./mobile-menu-toggle"

const NAV_LINKS = [
  { href: "/search", label: "Search" },
  { href: "/pricing", label: "Pricing" },
] as const

export async function SiteHeader() {
  const auth = getAuthInstance()
  const session = await auth.api.getSession({ headers: await headers() })

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-14 max-w-7xl items-center px-page">
        {/* Branding */}
        <Link href="/" className="mr-6 flex items-center gap-2 font-semibold text-primary">
          CALLSHEET
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-6 text-sm font-medium md:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex flex-1 items-center justify-end gap-4">
          {/* Desktop auth link */}
          <div className="hidden md:block">
            {session ? (
              <Link
                href="/dashboard"
                className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Dashboard
              </Link>
            ) : (
              <Link
                href="/login"
                className="inline-flex h-9 items-center rounded-md border border-border px-4 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                Sign In
              </Link>
            )}
          </div>

          {/* Mobile hamburger */}
          <MobileMenuToggle isAuthenticated={!!session} />
        </div>
      </div>
    </header>
  )
}
