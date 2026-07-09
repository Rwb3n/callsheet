// CLI scheduler, health, and decisions commands — CS-WORK-109
// scheduler list/get/trigger/cancel, health, decisions search

import { Command } from "commander"
import { readConfig } from "../config.js"
import { createCLIClient } from "../client.js"
import { formatOutput, type OutputFormat } from "../output.js"
import { handleError } from "../errors.js"

export function registerSchedulerCommands(program: Command): void {
  const scheduler = program
    .command("scheduler")
    .description("manage deferred action scheduler")

  scheduler
    .command("list")
    .description("list scheduled actions")
    .option("--status <status>", "filter by status (pending, executing, completed, failed, exhausted, cancelled)")
    .option("--action <action>", "filter by action type")
    .option("--cursor <cursor>", "pagination cursor")
    .option("--limit <limit>", "results per page", "20")
    .action(async (opts) => {
      try {
        const config = readConfig()
        const client = createCLIClient(config.apiUrl, config.token)
        const format = program.opts().format as OutputFormat
        const result = await client.admin.scheduler.list.query({
          status: opts.status as "pending" | "executing" | "completed" | "failed" | "exhausted" | "cancelled" | undefined,
          action: opts.action,
          cursor: opts.cursor,
          limit: parseInt(opts.limit, 10),
        })
        console.log(formatOutput(result, format))
      } catch (err) {
        handleError(err)
      }
    })

  scheduler
    .command("get")
    .description("get scheduled action detail")
    .argument("<id>", "deferred action ID")
    .action(async (id: string) => {
      try {
        const config = readConfig()
        const client = createCLIClient(config.apiUrl, config.token)
        const format = program.opts().format as OutputFormat
        const result = await client.admin.scheduler.getDetail.query({ id })
        console.log(formatOutput(result, format))
      } catch (err) {
        handleError(err)
      }
    })

  scheduler
    .command("trigger")
    .description("trigger a scheduled action immediately")
    .argument("<id>", "deferred action ID")
    .action(async (id: string) => {
      try {
        const config = readConfig()
        const client = createCLIClient(config.apiUrl, config.token)
        const format = program.opts().format as OutputFormat
        const result = await client.admin.scheduler.trigger.mutate({ id })
        console.log(formatOutput(result, format))
      } catch (err) {
        handleError(err)
      }
    })

  scheduler
    .command("cancel")
    .description("cancel a scheduled action")
    .argument("<id>", "deferred action ID")
    .argument("<reason>", "cancellation reason")
    .action(async (id: string, reason: string) => {
      try {
        const config = readConfig()
        const client = createCLIClient(config.apiUrl, config.token)
        const format = program.opts().format as OutputFormat
        const result = await client.admin.scheduler.cancel.mutate({ id, reason })
        console.log(formatOutput(result, format))
      } catch (err) {
        handleError(err)
      }
    })

  // Health command
  program
    .command("health")
    .description("get system health status")
    .action(async () => {
      try {
        const config = readConfig()
        const client = createCLIClient(config.apiUrl, config.token)
        const format = program.opts().format as OutputFormat
        const result = await client.admin.health.getStatus.query()
        console.log(formatOutput(result, format))
      } catch (err) {
        handleError(err)
      }
    })

  // Decisions command
  const decisions = program
    .command("decisions")
    .description("search decision audit log")

  decisions
    .command("search")
    .description("search decision logs")
    .option("--domain <domain>", "filter by domain (data-and-listings, operations, platform, commercial, cross-domain)")
    .option("--type <type>", "filter by decision type")
    .option("--account <accountId>", "filter by account ID")
    .option("--listing <listingId>", "filter by listing ID")
    .option("--from <date>", "start date (ISO)")
    .option("--to <date>", "end date (ISO)")
    .option("--cursor <cursor>", "pagination cursor")
    .option("--limit <limit>", "results per page", "20")
    .action(async (opts) => {
      try {
        const config = readConfig()
        const client = createCLIClient(config.apiUrl, config.token)
        const format = program.opts().format as OutputFormat
        const result = await client.admin.decisions.search.query({
          domain: opts.domain as "data-and-listings" | "operations" | "platform" | "commercial" | "cross-domain" | undefined,
          decisionType: opts.type,
          fromDate: opts.from,
          toDate: opts.to,
          listingId: opts.listing,
          accountId: opts.account,
          cursor: opts.cursor,
          limit: parseInt(opts.limit, 10),
        })
        console.log(formatOutput(result, format))
      } catch (err) {
        handleError(err)
      }
    })
}
