// Shortlists client content — wired to tRPC shortlist.list + shortlist.getItems

"use client"

import { useState } from "react"
import Link from "next/link"
import { trpc } from "@/lib/trpc/client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"

function ShortlistCard({ list }: { list: { id: string; name: string; itemCount: number; lastAddedAt: string | null } }) {
  const [expanded, setExpanded] = useState(false)
  const items = trpc.shortlist.getItems.useQuery(
    { shortlistId: list.id },
    { enabled: expanded },
  )

  return (
    <Card
      className="cursor-pointer transition-shadow hover:shadow-md"
      onClick={() => setExpanded(!expanded)}
    >
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{list.name}</CardTitle>
          <Badge variant="outline" className="text-[10px]">
            {list.itemCount} {list.itemCount === 1 ? "item" : "items"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          {list.lastAddedAt
            ? `Last added ${formatDate(list.lastAddedAt)}`
            : "No items yet"}
        </p>

        {expanded && (
          <div className="mt-4 space-y-2 border-t pt-4">
            {items.isLoading && (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            )}
            {items.data?.items.map((item) => (
              <Link
                key={item.shortlistItemId}
                href={`/providers/${item.listing.slug}`}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between rounded-md border px-3 py-2 transition-colors hover:bg-muted">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm">{item.listing.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{item.listing.headline}</p>
                  </div>
                  <div className="ml-3 flex gap-1.5 shrink-0">
                    <Badge variant="secondary" className="text-[10px]">
                      {item.listing.baseRegion}
                    </Badge>
                    {item.listing.verificationTier !== "unclaimed" && (
                      <Badge variant="outline" className="text-[10px] capitalize">
                        {item.listing.verificationTier.replace("_", " ")}
                      </Badge>
                    )}
                  </div>
                </div>
              </Link>
            ))}
            {items.data?.items.length === 0 && (
              <p className="text-sm text-muted-foreground">No active items</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export function ShortlistsContent() {
  const result = trpc.shortlist.list.useQuery()

  if (result.isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="space-y-3 pt-6">
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-4 w-1/3" />
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  const lists = result.data

  if (!lists || lists.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-16">
          <p className="text-lg font-medium">No shortlists yet</p>
          <p className="text-sm text-muted-foreground">
            Save providers to shortlists from their profile pages.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {lists.map((list) => (
        <ShortlistCard key={list.id} list={list} />
      ))}
    </div>
  )
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
}
