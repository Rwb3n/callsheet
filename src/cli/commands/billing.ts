// CLI billing and events commands — CS-WORK-108
// billing status/reconcile/holds/release, events list/resolve/retry

import { Command } from "commander"
import { readConfig } from "../config.js"
import { createCLIClient } from "../client.js"
import { formatOutput, type OutputFormat } from "../output.js"
import { handleError } from "../errors.js"

export function registerBillingCommands(program: Command): void {
  const billing = program
    .command("billing")
    .description("manage billing and reconciliation")

  billing
    .command("status")
    .description("get billing status overview")
    .action(async () => {
      try {
        const config = readConfig()
        const client = createCLIClient(config.apiUrl, config.token)
        const format = program.opts().format as OutputFormat
        const result = await client.admin.billing.getStatus.query()
        console.log(formatOutput(result, format))
      } catch (err) {
        handleError(err)
      }
    })

  billing
    .command("reconcile")
    .description("trigger billing reconciliation")
    .action(async () => {
      try {
        const config = readConfig()
        const client = createCLIClient(config.apiUrl, config.token)
        const format = program.opts().format as OutputFormat
        const result = await client.admin.billing.triggerReconciliation.mutate()
        console.log(formatOutput(result, format))
      } catch (err) {
        handleError(err)
      }
    })

  billing
    .command("holds")
    .description("list billing holds")
    .option("--cursor <cursor>", "pagination cursor")
    .option("--limit <limit>", "results per page", "20")
    .action(async (opts) => {
      try {
        const config = readConfig()
        const client = createCLIClient(config.apiUrl, config.token)
        const format = program.opts().format as OutputFormat
        const result = await client.admin.billing.listHolds.query({
          cursor: opts.cursor,
          limit: parseInt(opts.limit, 10),
        })
        console.log(formatOutput(result, format))
      } catch (err) {
        handleError(err)
      }
    })

  billing
    .command("release")
    .description("release a billing hold")
    .argument("<holdId>", "billing hold ID")
    .argument("<reason>", "release reason")
    .action(async (holdId: string, reason: string) => {
      try {
        const config = readConfig()
        const client = createCLIClient(config.apiUrl, config.token)
        const format = program.opts().format as OutputFormat
        const result = await client.admin.billing.releaseHold.mutate({ holdId, reason })
        console.log(formatOutput(result, format))
      } catch (err) {
        handleError(err)
      }
    })

  // Events commands
  const events = program
    .command("events")
    .description("manage event consumer errors")

  events
    .command("list")
    .description("list event consumer errors")
    .option("--from <date>", "start date (ISO)")
    .option("--to <date>", "end date (ISO)")
    .option("--consumer <consumerId>", "filter by consumer ID")
    .option("--resolved", "show only resolved errors")
    .option("--unresolved", "show only unresolved errors")
    .option("--cursor <cursor>", "pagination cursor")
    .option("--limit <limit>", "results per page", "20")
    .action(async (opts) => {
      try {
        const config = readConfig()
        const client = createCLIClient(config.apiUrl, config.token)
        const format = program.opts().format as OutputFormat
        const resolved = opts.resolved ? true : opts.unresolved ? false : undefined
        const result = await client.admin.events.list.query({
          fromDate: opts.from,
          toDate: opts.to,
          consumerId: opts.consumer,
          resolved,
          cursor: opts.cursor,
          limit: parseInt(opts.limit, 10),
        })
        console.log(formatOutput(result, format))
      } catch (err) {
        handleError(err)
      }
    })

  events
    .command("resolve")
    .description("mark an event error as resolved")
    .argument("<errorId>", "event error ID")
    .action(async (errorId: string) => {
      try {
        const config = readConfig()
        const client = createCLIClient(config.apiUrl, config.token)
        const format = program.opts().format as OutputFormat
        const result = await client.admin.events.resolve.mutate({ errorId })
        console.log(formatOutput(result, format))
      } catch (err) {
        handleError(err)
      }
    })

  events
    .command("retry")
    .description("retry a failed event")
    .argument("<errorId>", "event error ID")
    .action(async (errorId: string) => {
      try {
        const config = readConfig()
        const client = createCLIClient(config.apiUrl, config.token)
        const format = program.opts().format as OutputFormat
        const result = await client.admin.events.retry.mutate({ errorId })
        console.log(formatOutput(result, format))
      } catch (err) {
        handleError(err)
      }
    })
}
