// Enquiries sent client content — CH-CS-014 W8 AC-31, AC-33
// Status indicators: grey=unread, green=responded, amber=stale (7d no response).

"use client"

import Link from "next/link"
import { trpc } from "@/lib/trpc/client"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"

const STALE_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000

function resolveDisplayStatus(
  status: string,
  submittedAt: string,
): { label: string; color: string } {
  if (status === "responded") return { label: "Responded", color: "bg-green-500" }
  const age = Date.now() - new Date(submittedAt).getTime()
  if (age > STALE_THRESHOLD_MS) return { label: "No response", color: "bg-amber-500" }
  return { label: "Awaiting response", color: "bg-gray-400" }
}

export function EnquiriesSentContent() {
  const result = trpc.enquiry.listSent.useQuery({ limit: 20 })

  // AC-33: loading skeletons
  if (result.isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="flex items-center gap-4 py-4">
              <Skeleton className="h-3 w-3 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-3 w-2/3" />
              </div>
              <Skeleton className="h-3 w-20" />
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  const enquiries = result.data?.enquiries

  if (!enquiries || enquiries.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-16">
          <p className="text-lg font-medium">No enquiries sent yet</p>
          <p className="text-sm text-muted-foreground">
            Find providers and send enquiries from their profile pages.
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
      {enquiries.map((enq) => {
        const display = resolveDisplayStatus(enq.status, enq.submittedAt)
        return (
          <Link key={enq.enquiryId} href={`/providers/${enq.listingSlug}`}>
            <Card className="transition-shadow hover:shadow-md">
              <CardContent className="flex items-start gap-4 py-4">
                {/* Status indicator dot */}
                <div className="mt-1.5 shrink-0">
                  <div className={`h-2.5 w-2.5 rounded-full ${display.color}`} title={display.label} />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{enq.listingName}</span>
                    <Badge variant="outline" className="text-[10px]">{display.label}</Badge>
                  </div>

                  {/* Message preview */}
                  <p className="mt-1 truncate text-sm text-muted-foreground">
                    {enq.message}
                  </p>

                  {/* Timestamps */}
                  <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
                    <span>Sent {formatDate(enq.submittedAt)}</span>
                    {enq.respondedAt && (
                      <span>Responded {formatDate(enq.respondedAt)}</span>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        )
      })}
    </div>
  )
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
}
