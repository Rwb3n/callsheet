// Config command tests — CS-WORK-105

import { describe, it, expect, beforeEach } from "vitest"
import { Command } from "commander"
import { registerConfigCommands } from "../commands/config"

describe("config commands", () => {
  let program: Command

  beforeEach(() => {
    program = new Command()
    program
      .name("callsheet")
      .option("--format <type>", "output format", "json")
    registerConfigCommands(program)
  })

  it("registers config command group", () => {
    const config = program.commands.find((c) => c.name() === "config")
    expect(config).toBeDefined()
  })

  it("config group has show subcommand", () => {
    const config = program.commands.find((c) => c.name() === "config")!
    const show = config.commands.find((c) => c.name() === "show")
    expect(show).toBeDefined()
  })

  it("config group has set-url subcommand", () => {
    const config = program.commands.find((c) => c.name() === "config")!
    const setUrl = config.commands.find((c) => c.name() === "set-url")
    expect(setUrl).toBeDefined()
  })

  it("config group has set-token subcommand", () => {
    const config = program.commands.find((c) => c.name() === "config")!
    const setToken = config.commands.find((c) => c.name() === "set-token")
    expect(setToken).toBeDefined()
  })

  it("set-url accepts a url argument", () => {
    const config = program.commands.find((c) => c.name() === "config")!
    const setUrl = config.commands.find((c) => c.name() === "set-url")!
    expect(setUrl.registeredArguments.length).toBe(1)
    expect(setUrl.registeredArguments[0].name()).toBe("url")
  })

  it("set-token accepts a token argument", () => {
    const config = program.commands.find((c) => c.name() === "config")!
    const setToken = config.commands.find((c) => c.name() === "set-token")!
    expect(setToken.registeredArguments.length).toBe(1)
    expect(setToken.registeredArguments[0].name()).toBe("token")
  })

  it("config group description is set", () => {
    const config = program.commands.find((c) => c.name() === "config")!
    expect(config.description()).toContain("config")
  })
})
