// Scheduler, health, and decisions command tests — CS-WORK-109

import { describe, it, expect, beforeEach } from "vitest"
import { Command } from "commander"
import { registerSchedulerCommands } from "../commands/scheduler"

describe("scheduler, health, and decisions commands", () => {
  let program: Command

  beforeEach(() => {
    program = new Command()
    program.name("callsheet").option("--format <type>", "output format", "json")
    registerSchedulerCommands(program)
  })

  describe("scheduler", () => {
    it("registers scheduler command group", () => {
      const scheduler = program.commands.find((c) => c.name() === "scheduler")
      expect(scheduler).toBeDefined()
    })

    const subcommands = ["list", "get", "trigger", "cancel"]

    for (const name of subcommands) {
      it(`scheduler group has ${name} subcommand`, () => {
        const scheduler = program.commands.find((c) => c.name() === "scheduler")!
        const cmd = scheduler.commands.find((c) => c.name() === name)
        expect(cmd).toBeDefined()
      })
    }

    it("get accepts id argument", () => {
      const scheduler = program.commands.find((c) => c.name() === "scheduler")!
      const get = scheduler.commands.find((c) => c.name() === "get")!
      expect(get.registeredArguments[0].name()).toBe("id")
    })

    it("cancel accepts id and reason arguments", () => {
      const scheduler = program.commands.find((c) => c.name() === "scheduler")!
      const cancel = scheduler.commands.find((c) => c.name() === "cancel")!
      expect(cancel.registeredArguments.length).toBe(2)
      expect(cancel.registeredArguments[0].name()).toBe("id")
      expect(cancel.registeredArguments[1].name()).toBe("reason")
    })
  })

  describe("health", () => {
    it("registers health command", () => {
      const health = program.commands.find((c) => c.name() === "health")
      expect(health).toBeDefined()
    })

    it("health has no required arguments", () => {
      const health = program.commands.find((c) => c.name() === "health")!
      expect(health.registeredArguments.length).toBe(0)
    })
  })

  describe("decisions", () => {
    it("registers decisions command group", () => {
      const decisions = program.commands.find((c) => c.name() === "decisions")
      expect(decisions).toBeDefined()
    })

    it("decisions group has search subcommand", () => {
      const decisions = program.commands.find((c) => c.name() === "decisions")!
      const search = decisions.commands.find((c) => c.name() === "search")
      expect(search).toBeDefined()
    })

    it("search has --domain, --type, --account, --listing, --from, --to options", () => {
      const decisions = program.commands.find((c) => c.name() === "decisions")!
      const search = decisions.commands.find((c) => c.name() === "search")!
      const optNames = search.options.map((o) => o.long)
      expect(optNames).toContain("--domain")
      expect(optNames).toContain("--type")
      expect(optNames).toContain("--account")
      expect(optNames).toContain("--listing")
      expect(optNames).toContain("--from")
      expect(optNames).toContain("--to")
    })
  })
})
