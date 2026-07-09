// CLI error handling — CS-WORK-103 AC-5
// Maps tRPC errors to exit codes: 0 success, 1 error, 2 auth failure

import { TRPCClientError } from "@trpc/client"

export const EXIT_SUCCESS = 0
export const EXIT_ERROR = 1
export const EXIT_AUTH_FAILURE = 2

type CLIError = {
  code: string
  message: string
  exitCode: number
}

export function mapError(err: unknown): CLIError {
  if (err instanceof TRPCClientError) {
    const code = err.data?.code ?? "INTERNAL_SERVER_ERROR"
    const exitCode = code === "UNAUTHORIZED" || code === "FORBIDDEN"
      ? EXIT_AUTH_FAILURE
      : EXIT_ERROR
    return {
      code,
      message: err.message,
      exitCode,
    }
  }
  if (err instanceof Error) {
    return {
      code: "CLI_ERROR",
      message: err.message,
      exitCode: EXIT_ERROR,
    }
  }
  return {
    code: "UNKNOWN_ERROR",
    message: String(err),
    exitCode: EXIT_ERROR,
  }
}

export function handleError(err: unknown): never {
  const mapped = mapError(err)
  const output = JSON.stringify({
    error: true,
    code: mapped.code,
    message: mapped.message,
  }, null, 2)
  process.stderr.write(output + "\n")
  process.exit(mapped.exitCode)
}
