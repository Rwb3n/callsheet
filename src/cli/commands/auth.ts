// CLI auth commands — CS-WORK-104
// login, logout, whoami, token

import { Command } from "commander"
import { readConfig, updateConfig } from "../config.js"
import { createCLIClient } from "../client.js"
import { formatOutput, type OutputFormat } from "../output.js"
import { handleError } from "../errors.js"

export function registerAuthCommands(program: Command): void {
  const auth = program
    .command("auth")
    .description("manage API key authentication")

  auth
    .command("login")
    .description("configure API URL and token")
    .argument("<token>", "API key token")
    .option("--api-url <url>", "API base URL")
    .action(async (token: string, opts: { apiUrl?: string }) => {
      try {
        const updates: Record<string, string> = { token }
        if (opts.apiUrl) {
          updates.apiUrl = opts.apiUrl
        }
        const config = updateConfig(updates)
        const format = program.opts().format as OutputFormat
        console.log(formatOutput({
          status: "authenticated",
          apiUrl: config.apiUrl,
          tokenPrefix: token.slice(0, 8) + "...",
        }, format))
      } catch (err) {
        handleError(err)
      }
    })

  auth
    .command("logout")
    .description("clear stored token")
    .action(() => {
      try {
        updateConfig({ token: null })
        const format = program.opts().format as OutputFormat
        console.log(formatOutput({ status: "logged out" }, format))
      } catch (err) {
        handleError(err)
      }
    })

  auth
    .command("whoami")
    .description("verify token and show account info")
    .action(async () => {
      try {
        const config = readConfig()
        if (!config.token) {
          console.error(JSON.stringify({ error: true, code: "NO_TOKEN", message: "Not authenticated. Run: callsheet auth login <token>" }, null, 2))
          process.exit(2)
        }
        const client = createCLIClient(config.apiUrl, config.token)
        const health = await client.admin.health.getStatus.query()
        const format = program.opts().format as OutputFormat
        console.log(formatOutput({
          status: "authenticated",
          apiUrl: config.apiUrl,
          tokenPrefix: config.token.slice(0, 8) + "...",
          server: health,
        }, format))
      } catch (err) {
        handleError(err)
      }
    })

  auth
    .command("token")
    .description("show current token (masked)")
    .action(() => {
      try {
        const config = readConfig()
        const format = program.opts().format as OutputFormat
        if (!config.token) {
          console.log(formatOutput({ token: null, status: "not set" }, format))
          return
        }
        console.log(formatOutput({
          tokenPrefix: config.token.slice(0, 8),
          tokenMasked: config.token.slice(0, 8) + "..." + config.token.slice(-4),
          apiUrl: config.apiUrl,
        }, format))
      } catch (err) {
        handleError(err)
      }
    })
}
