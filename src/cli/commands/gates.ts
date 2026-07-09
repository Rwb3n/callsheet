// CLI gate commands — CS-WORK-112
// smoke: infrastructure smoke tests (Gate 2)
// data validate: data integrity checks (Gate 3)
// See 0-strategic-frame/deployment-gates.md for gate definitions.

import { Command } from "commander"
import { readConfig } from "../config.js"
import { createCLIClient } from "../client.js"
import { formatOutput, type OutputFormat } from "../output.js"
import { handleError } from "../errors.js"

type CheckResult = {
  check: string
  status: "pass" | "fail" | "skip"
  message: string
  durationMs: number
}

async function runCheck(name: string, fn: () => Promise<string>): Promise<CheckResult> {
  const start = Date.now()
  try {
    const message = await fn()
    return { check: name, status: "pass", message, durationMs: Date.now() - start }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { check: name, status: "fail", message, durationMs: Date.now() - start }
  }
}

export function registerGateCommands(program: Command): void {
  program
    .command("smoke")
    .description("run infrastructure smoke tests (Gate 2)")
    .option("--env <env>", "target environment (preview, production)", "preview")
    .option("--check <check>", "run specific check only")
    .action(async (opts: { env: string; check?: string }) => {
      try {
        const config = readConfig()
        const format = program.opts().format as OutputFormat
        const apiUrl = config.apiUrl

        const allChecks: Array<{ name: string; fn: () => Promise<string> }> = [
          {
            name: "tRPC reachable",
            fn: async () => {
              const response = await fetch(`${apiUrl}/api/trpc/admin.health.getStatus`, {
                headers: config.token ? { authorization: `Bearer ${config.token}` } : {},
              })
              if (!response.ok) throw new Error(`HTTP ${response.status}`)
              return `HTTP ${response.status}`
            },
          },
          {
            name: "auth endpoint",
            fn: async () => {
              const response = await fetch(`${apiUrl}/api/auth/ok`)
              if (!response.ok) throw new Error(`HTTP ${response.status}`)
              return `HTTP ${response.status}`
            },
          },
          {
            name: "public search",
            fn: async () => {
              const response = await fetch(
                `${apiUrl}/api/trpc/search.query?input=${encodeURIComponent(JSON.stringify({ query: "test", limit: 1 }))}`
              )
              if (!response.ok) throw new Error(`HTTP ${response.status}`)
              return `HTTP ${response.status}`
            },
          },
          {
            name: "admin health",
            fn: async () => {
              const client = createCLIClient(apiUrl, config.token)
              const health = await client.admin.health.getStatus.query()
              return JSON.stringify(health)
            },
          },
        ]

        const checks = opts.check
          ? allChecks.filter((c) => c.name === opts.check)
          : allChecks

        if (checks.length === 0) {
          console.error(JSON.stringify({ error: true, message: `Unknown check: ${opts.check}` }, null, 2))
          process.exit(1)
        }

        const results: CheckResult[] = []
        for (const check of checks) {
          results.push(await runCheck(check.name, check.fn))
        }

        const passed = results.every((r) => r.status === "pass")
        const output = {
          env: opts.env,
          apiUrl,
          passed,
          checks: results,
          summary: `${results.filter((r) => r.status === "pass").length}/${results.length} passed`,
        }

        console.log(formatOutput(output, format))
        process.exit(passed ? 0 : 1)
      } catch (err) {
        handleError(err)
      }
    })

  program
    .command("data")
    .description("data validation commands (Gate 3)")
    .command("validate")
    .description("run data integrity checks")
    .option("--check <check>", "run specific check only")
    .action(async (opts: { check?: string }) => {
      try {
        const config = readConfig()
        const format = program.opts().format as OutputFormat
        const client = createCLIClient(config.apiUrl, config.token)

        // Data validation uses tRPC admin queries to verify data integrity
        // The actual SQL checks run server-side; the CLI queries existing admin endpoints
        const allChecks: Array<{ name: string; fn: () => Promise<string> }> = [
          {
            name: "search functional",
            fn: async () => {
              const testQueries = ["camera", "lighting", "sound", "production", "post"]
              let passed = 0
              for (const query of testQueries) {
                const result = await client.search.query.query({ query, limit: 1 })
                if (result.results && result.results.length > 0) passed++
              }
              return `${passed}/${testQueries.length} queries returned results`
            },
          },
          {
            name: "health status",
            fn: async () => {
              const health = await client.admin.health.getStatus.query()
              return JSON.stringify(health)
            },
          },
          {
            name: "quality distribution",
            fn: async () => {
              const dist = await client.admin.intelligence.qualityDistribution.query()
              return JSON.stringify(dist)
            },
          },
          {
            name: "enrichment status",
            fn: async () => {
              const status = await client.admin.intelligence.enrichmentStatus.query({})
              return JSON.stringify(status)
            },
          },
        ]

        const checks = opts.check
          ? allChecks.filter((c) => c.name === opts.check)
          : allChecks

        if (checks.length === 0) {
          console.error(JSON.stringify({ error: true, message: `Unknown check: ${opts.check}` }, null, 2))
          process.exit(1)
        }

        const results: CheckResult[] = []
        for (const check of checks) {
          results.push(await runCheck(check.name, check.fn))
        }

        const passed = results.every((r) => r.status === "pass")
        const output = {
          passed,
          checks: results,
          summary: `${results.filter((r) => r.status === "pass").length}/${results.length} passed`,
        }

        console.log(formatOutput(output, format))
        process.exit(passed ? 0 : 1)
      } catch (err) {
        handleError(err)
      }
    })
}
