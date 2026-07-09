// Admin error boundary — CS-WORK-113 AC-1

"use client"

import { Button } from "@/components/ui/button"

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-2xl font-bold">Admin Error</h1>
      <p className="text-muted-foreground max-w-md text-center">
        Something went wrong in the admin panel. Please try again or check the health dashboard.
      </p>
      {error.digest && (
        <p className="text-muted-foreground text-xs">Error ID: {error.digest}</p>
      )}
      <div className="flex gap-3">
        <Button onClick={reset}>Try again</Button>
        <Button variant="outline" asChild>
          <a href="/admin">Go to admin</a>
        </Button>
      </div>
    </div>
  )
}
