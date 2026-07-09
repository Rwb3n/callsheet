// Gate command tests — CS-WORK-112

import { describe, it, expect, beforeEach } from "vitest"
import { Command } from "commander"
import { registerGateCommands } from "../commands/gates"

describe("gate commands", () => {
  let program: Command

  beforeEach(() => {
    program = new Command()
    program.name("callsheet").option("--format <type>", "output format", "json")
    registerGateCommands(program)
  })

  describe("smoke", () => {
    it("registers smoke command", () => {
      const smoke = program.commands.find((c) => c.name() === "smoke")
      expect(smoke).toBeDefined()
    })

    it("smoke has --env option with default preview", () => {
      const smoke = program.commands.find((c) => c.name() === "smoke")!
      const env = smoke.options.find((o) => o.long === "--env")
      expect(env).toBeDefined()
      expect(env!.defaultValue).toBe("preview")
    })

    it("smoke has --check option for selective runs", () => {
      const smoke = program.commands.find((c) => c.name() === "smoke")!
      const check = smoke.options.find((o) => o.long === "--check")
      expect(check).toBeDefined()
    })
  })

  describe("data validate", () => {
    it("registers data command group", () => {
      const data = program.commands.find((c) => c.name() === "data")
      expect(data).toBeDefined()
    })

    it("data group has validate subcommand", () => {
      const data = program.commands.find((c) => c.name() === "data")!
      const validate = data.commands.find((c) => c.name() === "validate")
      expect(validate).toBeDefined()
    })

    it("validate has --check option for selective runs", () => {
      const data = program.commands.find((c) => c.name() === "data")!
      const validate = data.commands.find((c) => c.name() === "validate")!
      const check = validate.options.find((o) => o.long === "--check")
      expect(check).toBeDefined()
    })
  })
})
