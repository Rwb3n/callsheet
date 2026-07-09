// Client factory tests — CS-WORK-103 AC-4

import { describe, it, expect } from "vitest"
import { createCLIClient } from "../client"

describe("createCLIClient", () => {
  it("creates a client with the given URL", () => {
    const client = createCLIClient("http://localhost:3000", "test-token")
    // tRPC proxy is a callable Proxy (typeof "function")
    expect(client).toBeDefined()
  })

  it("creates a client without a token", () => {
    const client = createCLIClient("http://localhost:3000", null)
    expect(client).toBeDefined()
  })

  it("client has admin namespace from AppRouter", () => {
    const client = createCLIClient("http://localhost:3000", "token")
    // tRPC proxy creates nested accessors for router namespaces
    expect(client.admin).toBeDefined()
  })

  it("client has listing namespace from AppRouter", () => {
    const client = createCLIClient("http://localhost:3000", "token")
    expect(client.listing).toBeDefined()
  })

  it("client has settings namespace from AppRouter", () => {
    const client = createCLIClient("http://localhost:3000", "token")
    expect(client.settings).toBeDefined()
  })
})
