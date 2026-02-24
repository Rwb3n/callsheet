// tRPC error handling tests — AC-50, AC-51

import { describe, it, expect, vi } from "vitest"
import { TRPCError } from "@trpc/server"
import { logServerError, formatZodFieldErrors } from "../error-handler"

describe("tRPC Error Handling", () => {
  // AC-50: INTERNAL_SERVER_ERROR logged with structured error
  it("logs INTERNAL_SERVER_ERROR with structured data", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})

    const error = new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Something went wrong",
    })

    logServerError(error, "listings.getById", { listingId: "123" })

    expect(consoleSpy).toHaveBeenCalledOnce()
    const logged = JSON.parse(consoleSpy.mock.calls[0][0] as string)
    expect(logged.level).toBe("error")
    expect(logged.code).toBe("INTERNAL_SERVER_ERROR")
    expect(logged.message).toBe("Something went wrong")
    expect(logged.path).toBe("listings.getById")
    expect(logged.input).toEqual({ listingId: "123" })
    expect(logged.stack).toBeDefined()
    expect(logged.timestamp).toBeDefined()

    consoleSpy.mockRestore()
  })

  it("sanitises sensitive input fields", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})

    const error = new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "DB error",
    })

    logServerError(error, "auth.signup", {
      email: "user@test.com",
      password: "secret123",
      apiKey: "sk-123",
    })

    const logged = JSON.parse(consoleSpy.mock.calls[0][0] as string)
    expect(logged.input.email).toBe("user@test.com")
    expect(logged.input.password).toBe("[REDACTED]")
    expect(logged.input.apiKey).toBe("[REDACTED]")

    consoleSpy.mockRestore()
  })

  it("does not log non-INTERNAL_SERVER_ERROR", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})

    const error = new TRPCError({ code: "BAD_REQUEST", message: "Validation failed" })
    logServerError(error, "listings.create", {})

    expect(consoleSpy).not.toHaveBeenCalled()

    consoleSpy.mockRestore()
  })

  // AC-51: Zod validation failure returns fieldErrors keyed by field name
  it("formats Zod issues into fieldErrors map", () => {
    const zodError = {
      issues: [
        { path: ["email"], message: "Invalid email" },
        { path: ["name"], message: "Required" },
        { path: ["name"], message: "Too short" },
      ],
    }

    const result = formatZodFieldErrors(zodError)
    expect(result).toEqual({
      email: ["Invalid email"],
      name: ["Required", "Too short"],
    })
  })

  it("returns undefined for non-Zod errors", () => {
    expect(formatZodFieldErrors(null)).toBeUndefined()
    expect(formatZodFieldErrors("string error")).toBeUndefined()
    expect(formatZodFieldErrors({})).toBeUndefined()
  })
})
