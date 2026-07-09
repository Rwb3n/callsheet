// API key generation unit tests — CS-WORK-099 AC-2

import { describe, it, expect } from "vitest"
import { generateApiKey, hashKey } from "../index"

describe("generateApiKey", () => {
  it("AC-2: returns key, keyPrefix, keyHash", () => {
    const result = generateApiKey()

    expect(result.key).toBeDefined()
    expect(result.keyPrefix).toBeDefined()
    expect(result.keyHash).toBeDefined()
  })

  it("AC-2: key is 64 hex chars (32 bytes)", () => {
    const { key } = generateApiKey()
    expect(key).toHaveLength(64)
    expect(/^[0-9a-f]{64}$/.test(key)).toBe(true)
  })

  it("AC-2: keyPrefix is first 8 chars of key", () => {
    const { key, keyPrefix } = generateApiKey()
    expect(keyPrefix).toBe(key.slice(0, 8))
    expect(keyPrefix).toHaveLength(8)
  })

  it("AC-2: keyHash is SHA-256 of key", () => {
    const { key, keyHash } = generateApiKey()
    expect(keyHash).toBe(hashKey(key))
    expect(keyHash).toHaveLength(64)
  })

  it("AC-2: each call produces unique keys", () => {
    const a = generateApiKey()
    const b = generateApiKey()
    expect(a.key).not.toBe(b.key)
    expect(a.keyHash).not.toBe(b.keyHash)
  })
})
