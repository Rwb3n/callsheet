// CLI compliance and support commands — CS-WORK-107
// compliance list/get/create/update, support list/get/create/update/priority

import { Command } from "commander"
import { readConfig } from "../config.js"
import { createCLIClient } from "../client.js"
import { formatOutput, type OutputFormat } from "../output.js"
import { handleError } from "../errors.js"

export function registerComplianceCommands(program: Command): void {
  const compliance = program
    .command("compliance")
    .description("manage compliance cases")

  compliance
    .command("list")
    .description("list compliance cases")
    .option("--status <status>", "filter by status (open, in_progress, completed, overdue)")
    .option("--type <type>", "filter by type (dsar, erasure, article_14, complaint, investigation, obligation)")
    .option("--cursor <cursor>", "pagination cursor")
    .option("--limit <limit>", "results per page", "20")
    .action(async (opts) => {
      try {
        const config = readConfig()
        const client = createCLIClient(config.apiUrl, config.token)
        const format = program.opts().format as OutputFormat
        const result = await client.admin.compliance.list.query({
          status: opts.status as "open" | "in_progress" | "completed" | "overdue" | undefined,
          type: opts.type as "dsar" | "erasure" | "article_14" | "complaint" | "investigation" | "obligation" | undefined,
          cursor: opts.cursor,
          limit: parseInt(opts.limit, 10),
        })
        console.log(formatOutput(result, format))
      } catch (err) {
        handleError(err)
      }
    })

  compliance
    .command("get")
    .description("get compliance case detail")
    .argument("<entryId>", "compliance entry ID")
    .action(async (entryId: string) => {
      try {
        const config = readConfig()
        const client = createCLIClient(config.apiUrl, config.token)
        const format = program.opts().format as OutputFormat
        const result = await client.admin.compliance.getDetail.query({ entryId })
        console.log(formatOutput(result, format))
      } catch (err) {
        handleError(err)
      }
    })

  compliance
    .command("create")
    .description("create a compliance case")
    .argument("<type>", "case type (dsar, erasure, article_14, complaint, investigation, obligation)")
    .option("--account <accountId>", "account ID")
    .option("--deadline <date>", "deadline (ISO date)")
    .action(async (type: string, opts: { account?: string; deadline?: string }) => {
      try {
        const config = readConfig()
        const client = createCLIClient(config.apiUrl, config.token)
        const format = program.opts().format as OutputFormat
        const result = await client.admin.compliance.create.mutate({
          type: type as "dsar" | "erasure" | "article_14" | "complaint" | "investigation" | "obligation",
          accountId: opts.account,
          deadline: opts.deadline,
        })
        console.log(formatOutput(result, format))
      } catch (err) {
        handleError(err)
      }
    })

  compliance
    .command("update")
    .description("update compliance case status")
    .argument("<entryId>", "compliance entry ID")
    .argument("<status>", "new status (open, in_progress, completed, overdue)")
    .option("--notes <text>", "status notes")
    .action(async (entryId: string, status: string, opts: { notes?: string }) => {
      try {
        const config = readConfig()
        const client = createCLIClient(config.apiUrl, config.token)
        const format = program.opts().format as OutputFormat
        const result = await client.admin.compliance.updateStatus.mutate({
          entryId,
          status: status as "open" | "in_progress" | "completed" | "overdue",
          notes: opts.notes,
        })
        console.log(formatOutput(result, format))
      } catch (err) {
        handleError(err)
      }
    })

  // Support commands
  const support = program
    .command("support")
    .description("manage support tickets")

  support
    .command("list")
    .description("list support tickets")
    .option("--status <status>", "filter by status (open, assigned, resolved, closed)")
    .option("--priority <priority>", "filter by priority (critical, high, normal, low)")
    .option("--cursor <cursor>", "pagination cursor")
    .option("--limit <limit>", "results per page", "20")
    .action(async (opts) => {
      try {
        const config = readConfig()
        const client = createCLIClient(config.apiUrl, config.token)
        const format = program.opts().format as OutputFormat
        const result = await client.admin.support.list.query({
          status: opts.status as "open" | "assigned" | "resolved" | "closed" | undefined,
          priority: opts.priority as "critical" | "high" | "normal" | "low" | undefined,
          cursor: opts.cursor,
          limit: parseInt(opts.limit, 10),
        })
        console.log(formatOutput(result, format))
      } catch (err) {
        handleError(err)
      }
    })

  support
    .command("get")
    .description("get support ticket detail")
    .argument("<ticketId>", "support ticket ID")
    .action(async (ticketId: string) => {
      try {
        const config = readConfig()
        const client = createCLIClient(config.apiUrl, config.token)
        const format = program.opts().format as OutputFormat
        const result = await client.admin.support.getDetail.query({ ticketId })
        console.log(formatOutput(result, format))
      } catch (err) {
        handleError(err)
      }
    })

  support
    .command("create")
    .description("create a support ticket")
    .argument("<category>", "ticket category")
    .argument("<subject>", "ticket subject")
    .option("--account <accountId>", "account ID")
    .option("--listing <listingId>", "listing ID")
    .option("--priority <priority>", "ticket priority (critical, high, normal, low)", "normal")
    .option("--body <text>", "ticket body")
    .action(async (category: string, subject: string, opts: { account?: string; listing?: string; priority: string; body?: string }) => {
      try {
        const config = readConfig()
        const client = createCLIClient(config.apiUrl, config.token)
        const format = program.opts().format as OutputFormat
        const result = await client.admin.support.create.mutate({
          category,
          subject,
          accountId: opts.account,
          listingId: opts.listing,
          priority: opts.priority as "critical" | "high" | "normal" | "low",
          body: opts.body,
        })
        console.log(formatOutput(result, format))
      } catch (err) {
        handleError(err)
      }
    })

  support
    .command("update")
    .description("update support ticket status")
    .argument("<ticketId>", "support ticket ID")
    .argument("<status>", "new status (open, assigned, resolved, closed)")
    .option("--resolution <text>", "resolution notes")
    .action(async (ticketId: string, status: string, opts: { resolution?: string }) => {
      try {
        const config = readConfig()
        const client = createCLIClient(config.apiUrl, config.token)
        const format = program.opts().format as OutputFormat
        const result = await client.admin.support.updateStatus.mutate({
          ticketId,
          status: status as "open" | "assigned" | "resolved" | "closed",
          resolution: opts.resolution,
        })
        console.log(formatOutput(result, format))
      } catch (err) {
        handleError(err)
      }
    })

  support
    .command("priority")
    .description("update support ticket priority")
    .argument("<ticketId>", "support ticket ID")
    .argument("<priority>", "new priority (critical, high, normal, low)")
    .argument("<reason>", "reason for priority change")
    .action(async (ticketId: string, priority: string, reason: string) => {
      try {
        const config = readConfig()
        const client = createCLIClient(config.apiUrl, config.token)
        const format = program.opts().format as OutputFormat
        const result = await client.admin.support.updatePriority.mutate({
          ticketId,
          priority: priority as "critical" | "high" | "normal" | "low",
          reason,
        })
        console.log(formatOutput(result, format))
      } catch (err) {
        handleError(err)
      }
    })
}
