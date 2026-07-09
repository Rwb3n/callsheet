// Intelligence command tests — CS-WORK-110

import { describe, it, expect, beforeEach } from "vitest"
import { Command } from "commander"
import { registerIntelligenceCommands } from "../commands/intelligence"

describe("intelligence commands", () => {
  let program: Command

  beforeEach(() => {
    program = new Command()
    program.name("callsheet").option("--format <type>", "output format", "json")
    registerIntelligenceCommands(program)
  })

  it("registers intelligence command group", () => {
    const intel = program.commands.find((c) => c.name() === "intelligence")
    expect(intel).toBeDefined()
  })

  const subcommands = ["quality", "decay", "enrichment", "ceremonies", "hypotheses", "revenue"]

  for (const name of subcommands) {
    it(`intelligence group has ${name} subcommand`, () => {
      const intel = program.commands.find((c) => c.name() === "intelligence")!
      const cmd = intel.commands.find((c) => c.name() === name)
      expect(cmd).toBeDefined()
    })
  }

  it("decay has --status, --severity, --cursor, --limit options", () => {
    const intel = program.commands.find((c) => c.name() === "intelligence")!
    const decay = intel.commands.find((c) => c.name() === "decay")!
    const optNames = decay.options.map((o) => o.long)
    expect(optNames).toContain("--status")
    expect(optNames).toContain("--severity")
    expect(optNames).toContain("--cursor")
    expect(optNames).toContain("--limit")
  })

  it("enrichment has --tier option", () => {
    const intel = program.commands.find((c) => c.name() === "intelligence")!
    const enrichment = intel.commands.find((c) => c.name() === "enrichment")!
    const opt = enrichment.options.find((o) => o.long === "--tier")
    expect(opt).toBeDefined()
  })

  it("quality has no required arguments", () => {
    const intel = program.commands.find((c) => c.name() === "intelligence")!
    const quality = intel.commands.find((c) => c.name() === "quality")!
    expect(quality.registeredArguments.length).toBe(0)
  })
})
