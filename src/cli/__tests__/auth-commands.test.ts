// Auth command tests — CS-WORK-104

import { describe, it, expect, beforeEach, vi } from "vitest"
import { Command } from "commander"
import { registerAuthCommands } from "../commands/auth"

describe("auth commands", () => {
  let program: Command

  beforeEach(() => {
    program = new Command()
    program
      .name("callsheet")
      .option("--format <type>", "output format", "json")
    registerAuthCommands(program)
  })

  it("registers auth command group", () => {
    const auth = program.commands.find((c) => c.name() === "auth")
    expect(auth).toBeDefined()
  })

  it("auth group has login subcommand", () => {
    const auth = program.commands.find((c) => c.name() === "auth")!
    const login = auth.commands.find((c) => c.name() === "login")
    expect(login).toBeDefined()
  })

  it("auth group has logout subcommand", () => {
    const auth = program.commands.find((c) => c.name() === "auth")!
    const logout = auth.commands.find((c) => c.name() === "logout")
    expect(logout).toBeDefined()
  })

  it("auth group has whoami subcommand", () => {
    const auth = program.commands.find((c) => c.name() === "auth")!
    const whoami = auth.commands.find((c) => c.name() === "whoami")
    expect(whoami).toBeDefined()
  })

  it("auth group has token subcommand", () => {
    const auth = program.commands.find((c) => c.name() === "auth")!
    const token = auth.commands.find((c) => c.name() === "token")
    expect(token).toBeDefined()
  })

  it("login command accepts a token argument", () => {
    const auth = program.commands.find((c) => c.name() === "auth")!
    const login = auth.commands.find((c) => c.name() === "login")!
    // Commander.js stores argument definitions
    expect(login.registeredArguments.length).toBe(1)
    expect(login.registeredArguments[0].name()).toBe("token")
  })

  it("login command has --api-url option", () => {
    const auth = program.commands.find((c) => c.name() === "auth")!
    const login = auth.commands.find((c) => c.name() === "login")!
    const opt = login.options.find((o) => o.long === "--api-url")
    expect(opt).toBeDefined()
  })

  it("auth group description is set", () => {
    const auth = program.commands.find((c) => c.name() === "auth")!
    expect(auth.description()).toContain("auth")
  })
})
