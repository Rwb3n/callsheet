// tRPC error handling — S0 §12.1, AC-50, AC-51
// Standard error shape + structured logging for INTERNAL_SERVER_ERROR

import type { TRPCError } from "@trpc/server"

export type FormattedError = {
  code: string
  message: string
  fieldErrors?: Record<string, string[]>
}

// Sanitise input — strip passwords, tokens, secrets
function sanitiseInput(input: unknown): unknown {
  if (!input || typeof input !== "object") return input
  const sanitised: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (/password|token|secret|apikey|authorization/i.test(key)) {
      sanitised[key] = "[REDACTED]"
    } else {
      sanitised[key] = value
    }
  }
  return sanitised
}

export function logServerError(error: TRPCError, path: string | undefined, input: unknown): void {
  if (error.code === "INTERNAL_SERVER_ERROR") {
    console.error(JSON.stringify({
      level: "error",
      code: error.code,
      message: error.message,
      path: path ?? "unknown",
      input: sanitiseInput(input),
      stack: error.stack,
      timestamp: new Date().toISOString(),
    }))
  }
}

export function formatZodFieldErrors(
  cause: unknown,
): Record<string, string[]> | undefined {
  if (!cause || typeof cause !== "object") return undefined
  // Zod v4 uses a different error shape — adapt as needed
  if ("issues" in cause && Array.isArray((cause as { issues: unknown[] }).issues)) {
    const errors: Record<string, string[]> = {}
    for (const issue of (cause as { issues: Array<{ path: (string | number)[]; message: string }> }).issues) {
      const field = issue.path.join(".")
      if (!errors[field]) errors[field] = []
      errors[field].push(issue.message)
    }
    return Object.keys(errors).length > 0 ? errors : undefined
  }
  return undefined
}
