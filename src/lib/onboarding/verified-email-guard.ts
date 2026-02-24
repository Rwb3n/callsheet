// Verified email guard — S2 §2.1, AC-05
// Standalone function for non-tRPC contexts (e.g. direct calls, scripts).
// tRPC routes should use `verifiedProcedure` from `@/server/trpc` instead.

import { TRPCError } from "@trpc/server"
import type { AuthSession } from "@/lib/auth"

export function assertEmailVerified(session: AuthSession): void {
  if (!session.emailVerified) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Email verification required before creating a listing",
    })
  }
}
