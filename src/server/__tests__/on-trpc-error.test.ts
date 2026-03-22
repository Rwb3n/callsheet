// onTRPCError export validation — CH-CS-014 W1 AC-04

import { describe, it, expect } from "vitest"
import { TRPCError } from "@trpc/server"
import { onTRPCError } from "@/server/trpc"

describe("onTRPCError", () => {
  it("is callable with tRPC onError signature (AC-04)", () => {
    expect(onTRPCError).toBeTypeOf("function")

    // Should not throw when called with the expected shape
    expect(() =>
      onTRPCError({
        error: new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "test" }),
        path: "listing.search",
        input: { query: "test" },
      }),
    ).not.toThrow()
  })
})
