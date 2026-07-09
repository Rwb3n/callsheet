// Graduation command tests — CS-WORK-111

import { describe, it, expect, beforeEach } from "vitest"
import { Command } from "commander"
import { registerGraduationCommands } from "../commands/graduation"

describe("graduation commands", () => {
  let program: Command

  beforeEach(() => {
    program = new Command()
    program.name("callsheet").option("--format <type>", "output format", "json")
    registerGraduationCommands(program)
  })

  it("registers graduation command group", () => {
    const grad = program.commands.find((c) => c.name() === "graduation")
    expect(grad).toBeDefined()
  })

  const subcommands = ["status", "history", "override", "rollout", "comparison"]

  for (const name of subcommands) {
    it(`graduation group has ${name} subcommand`, () => {
      const grad = program.commands.find((c) => c.name() === "graduation")!
      const cmd = grad.commands.find((c) => c.name() === name)
      expect(cmd).toBeDefined()
    })
  }

  it("history accepts subEntity and capability arguments", () => {
    const grad = program.commands.find((c) => c.name() === "graduation")!
    const history = grad.commands.find((c) => c.name() === "history")!
    expect(history.registeredArguments.length).toBe(2)
    expect(history.registeredArguments[0].name()).toBe("subEntity")
    expect(history.registeredArguments[1].name()).toBe("capability")
  })

  it("override accepts subEntity, capability, graduated, and reason arguments", () => {
    const grad = program.commands.find((c) => c.name() === "graduation")!
    const override = grad.commands.find((c) => c.name() === "override")!
    expect(override.registeredArguments.length).toBe(4)
  })

  it("rollout accepts percentage argument", () => {
    const grad = program.commands.find((c) => c.name() === "graduation")!
    const rollout = grad.commands.find((c) => c.name() === "rollout")!
    expect(rollout.registeredArguments.length).toBe(1)
    expect(rollout.registeredArguments[0].name()).toBe("percentage")
  })

  it("status has --sub-entity and --capability options", () => {
    const grad = program.commands.find((c) => c.name() === "graduation")!
    const status = grad.commands.find((c) => c.name() === "status")!
    const optNames = status.options.map((o) => o.long)
    expect(optNames).toContain("--sub-entity")
    expect(optNames).toContain("--capability")
  })
})
