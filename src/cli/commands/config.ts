// CLI config commands — CS-WORK-105
// show, set-url, set-token

import { Command } from "commander"
import { readConfig, updateConfig, getConfigPath } from "../config.js"
import { formatOutput, type OutputFormat } from "../output.js"
import { handleError } from "../errors.js"

export function registerConfigCommands(program: Command): void {
  const config = program
    .command("config")
    .description("manage CLI configuration")

  config
    .command("show")
    .description("display current configuration")
    .action(() => {
      try {
        const current = readConfig()
        const format = program.opts().format as OutputFormat
        console.log(formatOutput({
          configPath: getConfigPath(),
          apiUrl: current.apiUrl,
          token: current.token
            ? current.token.slice(0, 8) + "..." + current.token.slice(-4)
            : null,
        }, format))
      } catch (err) {
        handleError(err)
      }
    })

  config
    .command("set-url")
    .description("set API base URL")
    .argument("<url>", "API base URL")
    .action((url: string) => {
      try {
        const updated = updateConfig({ apiUrl: url })
        const format = program.opts().format as OutputFormat
        console.log(formatOutput({
          apiUrl: updated.apiUrl,
          status: "updated",
        }, format))
      } catch (err) {
        handleError(err)
      }
    })

  config
    .command("set-token")
    .description("set API token")
    .argument("<token>", "API key token")
    .action((token: string) => {
      try {
        const updated = updateConfig({ token })
        const format = program.opts().format as OutputFormat
        console.log(formatOutput({
          tokenPrefix: token.slice(0, 8) + "...",
          status: "updated",
        }, format))
      } catch (err) {
        handleError(err)
      }
    })
}
