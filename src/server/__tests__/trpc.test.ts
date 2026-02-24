// tRPC auth middleware tests — AC-21 through AC-25
// AC-21, AC-22, AC-25 are E2E tests (Better Auth integration). Covered here as middleware unit tests.
// AC-23: protectedProcedure returns 401 unauthenticated
// AC-24: adminProcedure returns 403 non-admin

import { describe, it, expect } from "vitest"
import { router, publicProcedure, protectedProcedure, adminProcedure } from "../trpc"
import type { TRPCContext } from "../trpc"
import type { AuthSession } from "@/lib/auth"

// Helper: create a caller with a given context
function createTestRouter() {
  return router({
    publicHello: publicProcedure.query(() => "hello"),
    protectedHello: protectedProcedure.query(({ ctx }) => `hello ${ctx.session.email}`),
    adminHello: adminProcedure.query(({ ctx }) => `admin ${ctx.session.email}`),
  })
}

type TestRouter = ReturnType<typeof createTestRouter>

async function callProcedure(
  appRouter: TestRouter,
  procedure: "publicHello" | "protectedHello" | "adminHello",
  ctx: TRPCContext,
) {
  const caller = appRouter.createCaller(ctx)
  return caller[procedure]()
}

const userSession: AuthSession = {
  accountId: "user-1",
  email: "user@example.com",
  emailVerified: true,
  role: "user",
  createdAt: new Date().toISOString(),
}

const adminSession: AuthSession = {
  accountId: "admin-1",
  email: "admin@example.com",
  emailVerified: true,
  role: "admin",
  createdAt: new Date().toISOString(),
}

describe("tRPC Auth Middleware", () => {
  const appRouter = createTestRouter()

  // AC-23: protectedProcedure returns 401 unauthenticated
  it("protectedProcedure throws UNAUTHORIZED when no session", async () => {
    await expect(
      callProcedure(appRouter, "protectedHello", { session: null }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" })
  })

  // AC-23 inverse: protectedProcedure works with valid session
  it("protectedProcedure succeeds with valid session", async () => {
    const result = await callProcedure(appRouter, "protectedHello", { session: userSession })
    expect(result).toBe("hello user@example.com")
  })

  // AC-24: adminProcedure returns 403 non-admin
  it("adminProcedure throws FORBIDDEN for non-admin user", async () => {
    await expect(
      callProcedure(appRouter, "adminHello", { session: userSession }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
  })

  // AC-24 inverse: adminProcedure works with admin session
  it("adminProcedure succeeds with admin session", async () => {
    const result = await callProcedure(appRouter, "adminHello", { session: adminSession })
    expect(result).toBe("admin admin@example.com")
  })

  // Supporting: publicProcedure works without session
  it("publicProcedure works without session", async () => {
    const result = await callProcedure(appRouter, "publicHello", { session: null })
    expect(result).toBe("hello")
  })

  // Supporting: admin prefix match for V2 scoped roles [SI §4.1]
  it("adminProcedure accepts scoped admin role (prefix match)", async () => {
    const scopedAdminSession: AuthSession = {
      ...adminSession,
      role: "admin:ops" as AuthSession["role"],
    }
    const result = await callProcedure(appRouter, "adminHello", { session: scopedAdminSession })
    expect(result).toBe("admin admin@example.com")
  })

  // AC-23: adminProcedure also returns UNAUTHORIZED when no session
  it("adminProcedure throws UNAUTHORIZED when no session", async () => {
    await expect(
      callProcedure(appRouter, "adminHello", { session: null }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" })
  })
})
