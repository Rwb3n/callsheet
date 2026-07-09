// Root loading state — CS-WORK-113 AC-2

import { Skeleton } from "@/components/ui/skeleton"

export default function RootLoading() {
  return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center gap-6 p-8">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-4 w-72" />
      <Skeleton className="h-64 w-full max-w-4xl" />
    </main>
  )
}
