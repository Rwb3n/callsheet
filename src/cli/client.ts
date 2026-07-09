// CLI tRPC client factory — CS-WORK-103 AC-4
// Creates a typed tRPC client with Bearer auth for headless operation

import { createTRPCClient, httpBatchLink } from "@trpc/client"
import type { AppRouter } from "@/server/root"

export type CLIClient = ReturnType<typeof createCLIClient>

export function createCLIClient(apiUrl: string, token: string | null) {
  return createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: `${apiUrl}/api/trpc`,
        headers() {
          if (!token) return {}
          return {
            authorization: `Bearer ${token}`,
          }
        },
      }),
    ],
  })
}
