// tRPC API route handler — CH-CS-014 W2 AC-05–AC-09, CS-WORK-101 AC-1
// Bridges all 20 routers to HTTP at /api/trpc/*

import { fetchRequestHandler } from "@trpc/server/adapters/fetch"
import { createAppRouter } from "@/server/root"
import { createProductionAppServices } from "@/lib/services"
import { getAuthInstance } from "@/lib/auth-instance"
import { onTRPCError } from "@/server/trpc"
import type { TRPCContext } from "@/server/trpc"
import type { AuthSession } from "@/lib/auth"
import { hashKey, validateApiKey } from "@/lib/api-keys"
import { getDb } from "@/db"

const appServices = createProductionAppServices()
const appRouter = createAppRouter(appServices)

async function extractSession(req: Request): Promise<AuthSession | null> {
  // AC-1: check Bearer token first (API key auth for machine clients)
  const authHeader = req.headers.get("authorization")
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7)
    const session = await validateApiKey(getDb(), hashKey(token))
    if (session) return session
  }

  // Fall through to Better Auth session (cookie-based browser auth)
  const auth = getAuthInstance()
  const session = await auth.api.getSession({ headers: req.headers })
  if (!session) return null
  return {
    accountId: session.user.id,
    email: session.user.email,
    emailVerified: session.user.emailVerified,
    role: (session.user.role ?? "user") as AuthSession["role"],
    createdAt: session.user.createdAt.toISOString(),
  }
}

async function handler(req: Request) {
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: async ({ req }): Promise<TRPCContext> => ({
      session: await extractSession(req),
    }),
    onError: onTRPCError,
  })
}

export { handler as GET, handler as POST }
