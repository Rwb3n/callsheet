// CLI intelligence commands — CS-WORK-110
// intelligence quality, decay, enrichment, ceremonies, hypotheses, revenue

import { Command } from "commander"
import { readConfig } from "../config.js"
import { createCLIClient } from "../client.js"
import { formatOutput, type OutputFormat } from "../output.js"
import { handleError } from "../errors.js"

export function registerIntelligenceCommands(program: Command): void {
  const intel = program
    .command("intelligence")
    .description("query intelligence and analytics data")

  intel
    .command("quality")
    .description("get quality score distribution")
    .action(async () => {
      try {
        const config = readConfig()
        const client = createCLIClient(config.apiUrl, config.token)
        const format = program.opts().format as OutputFormat
        const result = await client.admin.intelligence.qualityDistribution.query()
        console.log(formatOutput(result, format))
      } catch (err) {
        handleError(err)
      }
    })

  intel
    .command("decay")
    .description("list decay signals")
    .option("--status <status>", "filter by status (active, resolved, all)", "active")
    .option("--severity <severity>", "filter by severity (critical, high, medium, low)")
    .option("--cursor <cursor>", "pagination cursor")
    .option("--limit <limit>", "results per page", "50")
    .action(async (opts) => {
      try {
        const config = readConfig()
        const client = createCLIClient(config.apiUrl, config.token)
        const format = program.opts().format as OutputFormat
        const result = await client.admin.intelligence.decaySignals.query({
          status: opts.status as "active" | "resolved" | "all",
          severity: opts.severity as "critical" | "high" | "medium" | "low" | undefined,
          limit: parseInt(opts.limit, 10),
          cursor: opts.cursor,
        })
        console.log(formatOutput(result, format))
      } catch (err) {
        handleError(err)
      }
    })

  intel
    .command("enrichment")
    .description("get enrichment pipeline status")
    .option("--tier <tier>", "filter by cadence tier (paid, claimed, unclaimed)")
    .action(async (opts) => {
      try {
        const config = readConfig()
        const client = createCLIClient(config.apiUrl, config.token)
        const format = program.opts().format as OutputFormat
        const result = await client.admin.intelligence.enrichmentStatus.query({
          cadenceTier: opts.tier as "paid" | "claimed" | "unclaimed" | undefined,
        })
        console.log(formatOutput(result, format))
      } catch (err) {
        handleError(err)
      }
    })

  intel
    .command("ceremonies")
    .description("list cognitive ceremonies")
    .option("--type <type>", "filter by ceremony type")
    .option("--limit <limit>", "results per page", "20")
    .action(async (opts) => {
      try {
        const config = readConfig()
        const client = createCLIClient(config.apiUrl, config.token)
        const format = program.opts().format as OutputFormat
        const result = await client.admin.intelligence.ceremonies.query({
          ceremonyType: opts.type,
          limit: parseInt(opts.limit, 10),
        })
        console.log(formatOutput(result, format))
      } catch (err) {
        handleError(err)
      }
    })

  intel
    .command("hypotheses")
    .description("list learning hypotheses")
    .action(async () => {
      try {
        const config = readConfig()
        const client = createCLIClient(config.apiUrl, config.token)
        const format = program.opts().format as OutputFormat
        const result = await client.admin.intelligence.learningHypotheses.query()
        console.log(formatOutput(result, format))
      } catch (err) {
        handleError(err)
      }
    })

  intel
    .command("revenue")
    .description("get revenue health overview")
    .action(async () => {
      try {
        const config = readConfig()
        const client = createCLIClient(config.apiUrl, config.token)
        const format = program.opts().format as OutputFormat
        const result = await client.admin.intelligence.revenueHealth.query()
        console.log(formatOutput(result, format))
      } catch (err) {
        handleError(err)
      }
    })
}
