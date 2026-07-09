// Output formatting tests — CS-WORK-103 AC-3

import { describe, it, expect } from "vitest"
import { formatOutput } from "../output"

describe("formatOutput", () => {
  describe("json format", () => {
    it("formats objects as indented JSON", () => {
      const result = formatOutput({ id: 1, name: "test" }, "json")
      expect(JSON.parse(result)).toEqual({ id: 1, name: "test" })
      expect(result).toContain("\n") // indented, not single-line
    })

    it("formats arrays as indented JSON", () => {
      const result = formatOutput([{ a: 1 }, { a: 2 }], "json")
      expect(JSON.parse(result)).toEqual([{ a: 1 }, { a: 2 }])
    })

    it("formats null", () => {
      const result = formatOutput(null, "json")
      expect(result).toBe("null")
    })

    it("formats strings", () => {
      const result = formatOutput("hello", "json")
      expect(result).toBe('"hello"')
    })
  })

  describe("table format", () => {
    it("formats object array as table with column headers", () => {
      const result = formatOutput(
        [
          { id: "1", name: "Alpha" },
          { id: "2", name: "Beta" },
        ],
        "table",
      )
      expect(result).toContain("id")
      expect(result).toContain("name")
      expect(result).toContain("Alpha")
      expect(result).toContain("Beta")
    })

    it("formats single object as key-value table", () => {
      const result = formatOutput({ status: "ok", count: 42 }, "table")
      expect(result).toContain("status")
      expect(result).toContain("ok")
      expect(result).toContain("count")
      expect(result).toContain("42")
    })

    it("formats empty array with placeholder", () => {
      const result = formatOutput([], "table")
      expect(result).toContain("empty")
    })

    it("formats primitive array as single column", () => {
      const result = formatOutput(["a", "b", "c"], "table")
      expect(result).toContain("Value")
      expect(result).toContain("a")
      expect(result).toContain("b")
    })

    it("formats null values with dash", () => {
      const result = formatOutput({ key: null }, "table")
      // null rendered as dash character
      expect(result).toContain("key")
    })

    it("formats nested objects as JSON within cell", () => {
      const result = formatOutput(
        [{ id: "1", meta: { nested: true } }],
        "table",
      )
      expect(result).toContain("id")
      expect(result).toContain('{"nested":true}')
    })
  })
})
