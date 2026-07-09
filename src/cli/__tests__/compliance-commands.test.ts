// Compliance and support command tests — CS-WORK-107

import { describe, it, expect, beforeEach } from "vitest"
import { Command } from "commander"
import { registerComplianceCommands } from "../commands/compliance"

describe("compliance and support commands", () => {
  let program: Command

  beforeEach(() => {
    program = new Command()
    program.name("callsheet").option("--format <type>", "output format", "json")
    registerComplianceCommands(program)
  })

  describe("compliance", () => {
    it("registers compliance command group", () => {
      const compliance = program.commands.find((c) => c.name() === "compliance")
      expect(compliance).toBeDefined()
    })

    const subcommands = ["list", "get", "create", "update"]

    for (const name of subcommands) {
      it(`compliance group has ${name} subcommand`, () => {
        const compliance = program.commands.find((c) => c.name() === "compliance")!
        const cmd = compliance.commands.find((c) => c.name() === name)
        expect(cmd).toBeDefined()
      })
    }

    it("get accepts entryId argument", () => {
      const compliance = program.commands.find((c) => c.name() === "compliance")!
      const get = compliance.commands.find((c) => c.name() === "get")!
      expect(get.registeredArguments[0].name()).toBe("entryId")
    })

    it("create accepts type argument", () => {
      const compliance = program.commands.find((c) => c.name() === "compliance")!
      const create = compliance.commands.find((c) => c.name() === "create")!
      expect(create.registeredArguments[0].name()).toBe("type")
    })
  })

  describe("support", () => {
    it("registers support command group", () => {
      const support = program.commands.find((c) => c.name() === "support")
      expect(support).toBeDefined()
    })

    const subcommands = ["list", "get", "create", "update", "priority"]

    for (const name of subcommands) {
      it(`support group has ${name} subcommand`, () => {
        const support = program.commands.find((c) => c.name() === "support")!
        const cmd = support.commands.find((c) => c.name() === name)
        expect(cmd).toBeDefined()
      })
    }

    it("create accepts category and subject arguments", () => {
      const support = program.commands.find((c) => c.name() === "support")!
      const create = support.commands.find((c) => c.name() === "create")!
      expect(create.registeredArguments[0].name()).toBe("category")
      expect(create.registeredArguments[1].name()).toBe("subject")
    })

    it("priority accepts ticketId, priority, and reason arguments", () => {
      const support = program.commands.find((c) => c.name() === "support")!
      const priority = support.commands.find((c) => c.name() === "priority")!
      expect(priority.registeredArguments.length).toBe(3)
    })
  })
})
