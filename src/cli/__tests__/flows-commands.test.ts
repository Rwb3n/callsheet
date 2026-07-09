// Flow command tests — CS-WORK-106

import { describe, it, expect, beforeEach } from "vitest"
import { Command } from "commander"
import { registerFlowCommands } from "../commands/flows"

describe("flow commands", () => {
  let program: Command

  beforeEach(() => {
    program = new Command()
    program.name("callsheet").option("--format <type>", "output format", "json")
    registerFlowCommands(program)
  })

  it("registers flows command group", () => {
    const flows = program.commands.find((c) => c.name() === "flows")
    expect(flows).toBeDefined()
  })

  const subcommands = ["list", "get", "retry", "skip", "escalate", "initiate-erasure", "initiate-closure"]

  for (const name of subcommands) {
    it(`flows group has ${name} subcommand`, () => {
      const flows = program.commands.find((c) => c.name() === "flows")!
      const cmd = flows.commands.find((c) => c.name() === name)
      expect(cmd).toBeDefined()
    })
  }

  it("list has --status, --type, --cursor, --limit options", () => {
    const flows = program.commands.find((c) => c.name() === "flows")!
    const list = flows.commands.find((c) => c.name() === "list")!
    const optNames = list.options.map((o) => o.long)
    expect(optNames).toContain("--status")
    expect(optNames).toContain("--type")
    expect(optNames).toContain("--cursor")
    expect(optNames).toContain("--limit")
  })

  it("get accepts flowId argument", () => {
    const flows = program.commands.find((c) => c.name() === "flows")!
    const get = flows.commands.find((c) => c.name() === "get")!
    expect(get.registeredArguments[0].name()).toBe("flowId")
  })

  it("initiate-erasure accepts dsarCaseId and accountId arguments", () => {
    const flows = program.commands.find((c) => c.name() === "flows")!
    const cmd = flows.commands.find((c) => c.name() === "initiate-erasure")!
    expect(cmd.registeredArguments.length).toBe(2)
    expect(cmd.registeredArguments[0].name()).toBe("dsarCaseId")
    expect(cmd.registeredArguments[1].name()).toBe("accountId")
  })
})
