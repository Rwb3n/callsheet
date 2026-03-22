// tRPC + React Query provider — CH-CS-014 W3 AC-11
// Wraps children with QueryClientProvider and tRPC provider.

"use client"

import { useState } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { trpc, getTRPCClientConfig } from "@/lib/trpc/client"

export function TRPCProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
      },
    },
  }))
  const [trpcClient] = useState(() => trpc.createClient(getTRPCClientConfig()))

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </trpc.Provider>
  )
}
