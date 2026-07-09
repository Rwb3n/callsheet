// CLI flow management commands — CS-WORK-106
// flows list, get, retry, skip, escalate, initiate-erasure, initiate-closure

import { Command } from "commander"
import { readConfig } from "../config.js"
import { createCLIClient } from "../client.js"
import { formatOutput, type OutputFormat } from "../output.js"
import { handleError } from "../errors.js"

export function registerFlowCommands(program: Command): void {
  const flows = program
    .command("flows")
    .description("manage orchestrated flows (erasure, closure)")

  flows
    .command("list")
    .description("list flows with optional filters")
    .option("--status <status>", "filter by status (in_progress, completed, failed, cancelled)")
    .option("--type <type>", "filter by flow type (erasure, closure)")
    .option("--cursor <cursor>", "pagination cursor")
    .option("--limit <limit>", "results per page", "20")
    .action(async (opts) => {
      try {
        const config = readConfig()
        const client = createCLIClient(config.apiUrl, config.token)
        const format = program.opts().format as OutputFormat
        const result = await client.admin.flows.list.query({
          status: opts.status,
          flowType: opts.type,
          cursor: opts.cursor,
          limit: parseInt(opts.limit, 10),
        })
        console.log(formatOutput(result, format))
      } catch (err) {
        handleError(err)
      }
    })

  flows
    .command("get")
    .description("get flow detail by ID")
    .argument("<flowId>", "flow ID")
    .action(async (flowId: string) => {
      try {
        const config = readConfig()
        const client = createCLIClient(config.apiUrl, config.token)
        const format = program.opts().format as OutputFormat
        const result = await client.admin.flows.getDetail.query({ flowId })
        console.log(formatOutput(result, format))
      } catch (err) {
        handleError(err)
      }
    })

  flows
    .command("retry")
    .description("retry a failed flow step")
    .argument("<flowId>", "flow ID")
    .action(async (flowId: string) => {
      try {
        const config = readConfig()
        const client = createCLIClient(config.apiUrl, config.token)
        const format = program.opts().format as OutputFormat
        const result = await client.admin.flows.retryStep.mutate({ flowId })
        console.log(formatOutput(result, format))
      } catch (err) {
        handleError(err)
      }
    })

  flows
    .command("skip")
    .description("skip a failed flow step")
    .argument("<flowId>", "flow ID")
    .argument("<reason>", "reason for skipping")
    .action(async (flowId: string, reason: string) => {
      try {
        const config = readConfig()
        const client = createCLIClient(config.apiUrl, config.token)
        const format = program.opts().format as OutputFormat
        const result = await client.admin.flows.skipStep.mutate({ flowId, reason })
        console.log(formatOutput(result, format))
      } catch (err) {
        handleError(err)
      }
    })

  flows
    .command("escalate")
    .description("escalate a flow to principal")
    .argument("<flowId>", "flow ID")
    .argument("<reason>", "escalation reason")
    .action(async (flowId: string, reason: string) => {
      try {
        const config = readConfig()
        const client = createCLIClient(config.apiUrl, config.token)
        const format = program.opts().format as OutputFormat
        const result = await client.admin.flows.escalate.mutate({ flowId, reason })
        console.log(formatOutput(result, format))
      } catch (err) {
        handleError(err)
      }
    })

  flows
    .command("initiate-erasure")
    .description("initiate an erasure flow")
    .argument("<dsarCaseId>", "DSAR case ID")
    .argument("<accountId>", "account ID")
    .action(async (dsarCaseId: string, accountId: string) => {
      try {
        const config = readConfig()
        const client = createCLIClient(config.apiUrl, config.token)
        const format = program.opts().format as OutputFormat
        const result = await client.admin.flows.initiateErasure.mutate({ dsarCaseId, accountId })
        console.log(formatOutput(result, format))
      } catch (err) {
        handleError(err)
      }
    })

  flows
    .command("initiate-closure")
    .description("initiate account closure flow")
    .argument("<accountId>", "account ID")
    .action(async (accountId: string) => {
      try {
        const config = readConfig()
        const client = createCLIClient(config.apiUrl, config.token)
        const format = program.opts().format as OutputFormat
        const result = await client.admin.flows.initiateClosureForAccount.mutate({ accountId })
        console.log(formatOutput(result, format))
      } catch (err) {
        handleError(err)
      }
    })
}
