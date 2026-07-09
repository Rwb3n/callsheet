// CLI graduation commands — CS-WORK-111
// graduation status, history, override, rollout, comparison

import { Command } from "commander"
import { readConfig } from "../config.js"
import { createCLIClient } from "../client.js"
import { formatOutput, type OutputFormat } from "../output.js"
import { handleError } from "../errors.js"

export function registerGraduationCommands(program: Command): void {
  const graduation = program
    .command("graduation")
    .description("manage autonomy graduation")

  graduation
    .command("status")
    .description("get graduation status")
    .option("--sub-entity <subEntity>", "filter by sub-entity")
    .option("--capability <capability>", "filter by capability")
    .action(async (opts) => {
      try {
        const config = readConfig()
        const client = createCLIClient(config.apiUrl, config.token)
        const format = program.opts().format as OutputFormat
        const result = await client.admin.graduation.status.query({
          subEntity: opts.subEntity,
          capability: opts.capability,
        })
        console.log(formatOutput(result, format))
      } catch (err) {
        handleError(err)
      }
    })

  graduation
    .command("history")
    .description("get graduation history for a capability")
    .argument("<subEntity>", "sub-entity name")
    .argument("<capability>", "capability name")
    .option("--limit <limit>", "results per page", "20")
    .action(async (subEntity: string, capability: string, opts: { limit: string }) => {
      try {
        const config = readConfig()
        const client = createCLIClient(config.apiUrl, config.token)
        const format = program.opts().format as OutputFormat
        const result = await client.admin.graduation.history.query({
          subEntity,
          capability,
          limit: parseInt(opts.limit, 10),
        })
        console.log(formatOutput(result, format))
      } catch (err) {
        handleError(err)
      }
    })

  graduation
    .command("override")
    .description("manually override graduation status")
    .argument("<subEntity>", "sub-entity name")
    .argument("<capability>", "capability name")
    .argument("<graduated>", "true or false")
    .argument("<reason>", "override reason")
    .action(async (subEntity: string, capability: string, graduated: string, reason: string) => {
      try {
        const config = readConfig()
        const client = createCLIClient(config.apiUrl, config.token)
        const format = program.opts().format as OutputFormat
        const result = await client.admin.graduation.override.mutate({
          subEntity,
          capability,
          graduated: graduated === "true",
          reason,
        })
        console.log(formatOutput(result, format))
      } catch (err) {
        handleError(err)
      }
    })

  graduation
    .command("rollout")
    .description("set algorithm rollout percentage")
    .argument("<percentage>", "rollout percentage (0-100)")
    .action(async (percentage: string) => {
      try {
        const config = readConfig()
        const client = createCLIClient(config.apiUrl, config.token)
        const format = program.opts().format as OutputFormat
        const result = await client.admin.graduation.algorithmRollout.mutate({
          rolloutPercentage: parseInt(percentage, 10),
        })
        console.log(formatOutput(result, format))
      } catch (err) {
        handleError(err)
      }
    })

  graduation
    .command("comparison")
    .description("compare algorithm vs manual graduation decisions")
    .action(async () => {
      try {
        const config = readConfig()
        const client = createCLIClient(config.apiUrl, config.token)
        const format = program.opts().format as OutputFormat
        const result = await client.admin.graduation.algorithmComparison.query()
        console.log(formatOutput(result, format))
      } catch (err) {
        handleError(err)
      }
    })
}
