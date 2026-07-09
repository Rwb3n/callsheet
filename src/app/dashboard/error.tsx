// Dashboard error boundary — CS-WORK-113 AC-1

"use client"

import { Button } from "@/components/ui/button"

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-2xl font-bold">Dashboard Error</h1>
      <p className="text-muted-foreground max-w-md text-center">
        Something went wrong loading your dashboard. Your data is safe.
      </p>
      {error.digest && (
        <p className="text-muted-foreground text-xs">Error ID: {error.digest}</p>
      )}
      <div className="flex gap-3">
        <Button onClick={reset}>Try again</Button>
        <Button variant="outline" asChild>
          <a href="/dashboard">Go to dashboard</a>
        </Button>
      </div>
    </div>
  )
}
