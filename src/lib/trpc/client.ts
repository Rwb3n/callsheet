// tRPC React client — CH-CS-014 W3 AC-10
// Typed hooks for all 18 routers via AppRouter inference.

"use client"

import { createTRPCReact } from "@trpc/react-query"
import { httpBatchLink } from "@trpc/client"
import type { AppRouter } from "@/server/root"

export const trpc = createTRPCReact<AppRouter>()

export function getTRPCClientConfig() {
  return {
    links: [
      httpBatchLink({
        url: "/api/trpc",
      }),
    ],
  }
}
