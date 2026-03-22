// Searches client content — wired to tRPC searchHistory.list

"use client"

import Link from "next/link"
import { trpc } from "@/lib/trpc/client"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"

export function SearchesContent() {
  const result = trpc.searchHistory.list.useQuery({ limit: 10 })

  if (result.isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="flex items-center gap-4 py-4">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-4 w-1/4" />
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  const searches = result.data

  if (!searches || searches.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-16">
          <p className="text-lg font-medium">No recent searches</p>
          <p className="text-sm text-muted-foreground">
            Your search history will appear here.
          </p>
          <Button asChild>
            <Link href="/search">Search Providers</Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-3">
      {searches.map((entry) => (
        <Link
          key={entry.id}
          href={`/search${entry.query ? `?q=${encodeURIComponent(entry.query)}` : ""}`}
        >
          <Card className="transition-shadow hover:shadow-md">
            <CardContent className="flex items-center justify-between py-4">
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  {entry.query || "Filter-only search"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatDate(entry.createdAt)}
                </p>
              </div>
              <Badge variant="outline" className="ml-4 shrink-0 text-[10px]">
                {entry.resultCount} {entry.resultCount === 1 ? "result" : "results"}
              </Badge>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  )
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
}
