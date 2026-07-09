// Route protection middleware — CS-WORK-122
// Lightweight path-based redirect for unauthenticated users.
// Session validation is handled by layout-level auth guards (dashboard/admin layouts).
// This middleware only checks for session cookie presence as a fast-path redirect.

import { NextResponse, type NextRequest } from "next/server"

const PROTECTED_PREFIXES = ["/dashboard", "/admin"]

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Only check protected paths
  const isProtected = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p))
  if (!isProtected) return NextResponse.next()

  // Fast-path: check for Better Auth session cookie presence
  // The actual session validation happens in the layout auth guard
  const hasSession = request.cookies.has("better-auth.session_token") ||
    request.cookies.has("__Secure-better-auth.session_token")

  if (!hasSession) {
    const loginUrl = new URL("/login", request.url)
    loginUrl.searchParams.set("redirect", pathname)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/dashboard/:path*", "/admin/:path*"],
}
