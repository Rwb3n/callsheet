// Error handling tests — CS-WORK-103 AC-5

import { describe, it, expect } from "vitest"
import { TRPCClientError } from "@trpc/client"
import { mapError, EXIT_SUCCESS, EXIT_ERROR, EXIT_AUTH_FAILURE } from "../errors"

describe("mapError", () => {
  it("maps UNAUTHORIZED tRPC error to exit code 2", () => {
    const err = new TRPCClientError("Authentication required", {
      result: { error: { data: { code: "UNAUTHORIZED" } } },
    } as never)
    // TRPCClientError stores data on .data
    // We need to construct it properly
    const result = mapError(err)
    expect(result.exitCode).toBe(EXIT_AUTH_FAILURE)
    expect(result.message).toBe("Authentication required")
  })

  it("maps FORBIDDEN tRPC error to exit code 2", () => {
    const err = new TRPCClientError("Admin access required", {
      result: { error: { data: { code: "FORBIDDEN" } } },
    } as never)
    const result = mapError(err)
    expect(result.exitCode).toBe(EXIT_AUTH_FAILURE)
  })

  it("maps other tRPC errors to exit code 1", () => {
    const err = new TRPCClientError("Not found", {
      result: { error: { data: { code: "NOT_FOUND" } } },
    } as never)
    const result = mapError(err)
    expect(result.exitCode).toBe(EXIT_ERROR)
    expect(result.code).toBe("NOT_FOUND")
  })

  it("maps generic Error to exit code 1", () => {
    const err = new Error("Connection refused")
    const result = mapError(err)
    expect(result.exitCode).toBe(EXIT_ERROR)
    expect(result.code).toBe("CLI_ERROR")
    expect(result.message).toBe("Connection refused")
  })

  it("maps unknown values to exit code 1", () => {
    const result = mapError("string error")
    expect(result.exitCode).toBe(EXIT_ERROR)
    expect(result.code).toBe("UNKNOWN_ERROR")
    expect(result.message).toBe("string error")
  })

  it("exit code constants are correct", () => {
    expect(EXIT_SUCCESS).toBe(0)
    expect(EXIT_ERROR).toBe(1)
    expect(EXIT_AUTH_FAILURE).toBe(2)
  })
})
