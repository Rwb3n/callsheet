// Billing and events command tests — CS-WORK-108

import { describe, it, expect, beforeEach } from "vitest"
import { Command } from "commander"
import { registerBillingCommands } from "../commands/billing"

describe("billing and events commands", () => {
  let program: Command

  beforeEach(() => {
    program = new Command()
    program.name("callsheet").option("--format <type>", "output format", "json")
    registerBillingCommands(program)
  })

  describe("billing", () => {
    it("registers billing command group", () => {
      const billing = program.commands.find((c) => c.name() === "billing")
      expect(billing).toBeDefined()
    })

    const subcommands = ["status", "reconcile", "holds", "release"]

    for (const name of subcommands) {
      it(`billing group has ${name} subcommand`, () => {
        const billing = program.commands.find((c) => c.name() === "billing")!
        const cmd = billing.commands.find((c) => c.name() === name)
        expect(cmd).toBeDefined()
      })
    }

    it("release accepts holdId and reason arguments", () => {
      const billing = program.commands.find((c) => c.name() === "billing")!
      const release = billing.commands.find((c) => c.name() === "release")!
      expect(release.registeredArguments.length).toBe(2)
      expect(release.registeredArguments[0].name()).toBe("holdId")
      expect(release.registeredArguments[1].name()).toBe("reason")
    })
  })

  describe("events", () => {
    it("registers events command group", () => {
      const events = program.commands.find((c) => c.name() === "events")
      expect(events).toBeDefined()
    })

    const subcommands = ["list", "resolve", "retry"]

    for (const name of subcommands) {
      it(`events group has ${name} subcommand`, () => {
        const events = program.commands.find((c) => c.name() === "events")!
        const cmd = events.commands.find((c) => c.name() === name)
        expect(cmd).toBeDefined()
      })
    }

    it("list has --from, --to, --consumer, --resolved options", () => {
      const events = program.commands.find((c) => c.name() === "events")!
      const list = events.commands.find((c) => c.name() === "list")!
      const optNames = list.options.map((o) => o.long)
      expect(optNames).toContain("--from")
      expect(optNames).toContain("--to")
      expect(optNames).toContain("--consumer")
      expect(optNames).toContain("--resolved")
    })

    it("resolve accepts errorId argument", () => {
      const events = program.commands.find((c) => c.name() === "events")!
      const resolve = events.commands.find((c) => c.name() === "resolve")!
      expect(resolve.registeredArguments[0].name()).toBe("errorId")
    })
  })
})
