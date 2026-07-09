#!/usr/bin/env node
// CLI entry point — CS-WORK-103 AC-1
// Commander.js program with subcommand structure and global options

import { Command } from "commander"
import { readConfig } from "./config.js"
import { createCLIClient } from "./client.js"
import { handleError } from "./errors.js"
import { registerAuthCommands } from "./commands/auth.js"
import { registerConfigCommands } from "./commands/config.js"
import { registerFlowCommands } from "./commands/flows.js"
import { registerComplianceCommands } from "./commands/compliance.js"
import { registerBillingCommands } from "./commands/billing.js"
import { registerSchedulerCommands } from "./commands/scheduler.js"
import { registerIntelligenceCommands } from "./commands/intelligence.js"
import { registerGraduationCommands } from "./commands/graduation.js"
import { registerGateCommands } from "./commands/gates.js"
import type { OutputFormat } from "./output.js"
import type { CLIClient } from "./client.js"

export type GlobalOptions = {
  format: OutputFormat
  apiUrl?: string
  token?: string
}

export type CommandContext = {
  client: CLIClient
  format: OutputFormat
}

function buildContext(opts: GlobalOptions): CommandContext {
  const config = readConfig()
  const apiUrl = opts.apiUrl ?? config.apiUrl
  const token = opts.token ?? config.token
  const client = createCLIClient(apiUrl, token)
  return { client, format: opts.format }
}

const program = new Command()

program
  .name("callsheet")
  .description("CALLSHEET operational CLI — headless agent interface")
  .version("0.1.0")
  .option("--format <type>", "output format (json or table)", "json")
  .option("--api-url <url>", "API base URL (overrides config)")
  .option("--token <token>", "API key (overrides config)")

// Register command groups
registerAuthCommands(program)
registerConfigCommands(program)
registerFlowCommands(program)
registerComplianceCommands(program)
registerBillingCommands(program)
registerSchedulerCommands(program)
registerIntelligenceCommands(program)
registerGraduationCommands(program)
registerGateCommands(program)

// Export for use by command modules
export { program, buildContext }

// Parse when invoked directly (not imported as a module by tests/other commands)
// tsx resolves argv[1] to absolute path; normalize with forward slashes
const normalizedArgv1 = process.argv[1]?.replace(/\\/g, "/") ?? ""
const isDirectRun = normalizedArgv1.includes("cli/index")

if (isDirectRun) {
  try {
    program.parse(process.argv)
  } catch (err) {
    handleError(err)
  }
}
