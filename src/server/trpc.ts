// tRPC initialisation + auth middleware — SI §4.1, S0 §5, §12
// publicProcedure → protectedProcedure → adminProcedure chain

import { initTRPC, TRPCError } from "@trpc/server"
import type { AuthSession } from "@/lib/auth"
import { logServerError, formatZodFieldErrors } from "@/server/error-handler"

export type TRPCContext = {
  session: AuthSession | null
}

const t = initTRPC.context<TRPCContext>().create({
  errorFormatter({ shape, error }) {
    const fieldErrors = formatZodFieldErrors(error.cause)
    return {
      ...shape,
      data: {
        ...shape.data,
        ...(fieldErrors ? { fieldErrors } : {}),
      },
    }
  },
})

// Wire structured error logging for 500s
export const onTRPCError = ({
  error,
  path,
  input,
}: {
  error: TRPCError
  path: string | undefined
  input: unknown
}) => {
  logServerError(error, path, input)
}

export const router = t.router
export const publicProcedure = t.procedure

// Auth middleware — returns 401 UNAUTHORIZED when no session
const authMiddleware = t.middleware(({ ctx, next }) => {
  if (!ctx.session) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Authentication required" })
  }
  return next({ ctx: { session: ctx.session } })
})

// Admin middleware — returns 403 FORBIDDEN when role is not admin
// Uses prefix match for V2 scoped-role compatibility [SI §4.1]
const adminMiddleware = t.middleware(({ ctx, next }) => {
  if (!ctx.session) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Authentication required" })
  }
  if (!ctx.session.role.startsWith("admin")) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" })
  }
  return next({ ctx: { session: ctx.session } })
})

export const protectedProcedure = t.procedure.use(authMiddleware)
export const adminProcedure = t.procedure.use(authMiddleware).use(adminMiddleware)

// Verified email middleware — returns 403 FORBIDDEN when email not verified [S2 AC-05]
const verifiedEmailMiddleware = t.middleware(({ ctx, next }) => {
  if (!ctx.session) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Authentication required" })
  }
  if (!ctx.session.emailVerified) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Email verification required before creating a listing",
    })
  }
  return next({ ctx: { session: ctx.session } })
})

export const verifiedProcedure = t.procedure.use(authMiddleware).use(verifiedEmailMiddleware)
