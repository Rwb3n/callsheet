// Notification centre — CS-WORK-116
// List, dismiss, mark-read via tRPC notification router.

"use client"

import { trpc } from "@/lib/trpc/client"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"

export default function NotificationCentre() {
  const result = trpc.notification.list.useQuery({ limit: 50 })
  const dismiss = trpc.notification.dismiss.useMutation({ onSuccess: () => result.refetch() })
  const markRead = trpc.notification.markRead.useMutation({ onSuccess: () => result.refetch() })

  if (result.isLoading) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold tracking-tight">Notifications</h1>
        {Array.from({ length: 5 }).map((_, i) => (
          <Card key={i}><CardContent className="py-4"><Skeleton className="h-10 w-full" /></CardContent></Card>
        ))}
      </div>
    )
  }

  const notifications = result.data?.items ?? []

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">Notifications</h1>
      {notifications.length === 0 && (
        <p className="text-muted-foreground">No notifications</p>
      )}
      {notifications.map((n) => (
        <Card key={n.id} className={n.readAt ? "opacity-60" : ""}>
          <CardContent className="flex items-start gap-4 py-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium">{n.title}</span>
                {!n.readAt && <Badge className="text-[10px]">New</Badge>}
              </div>
              {n.body && <p className="mt-1 text-sm text-muted-foreground">{n.body}</p>}
              <span className="mt-1 block text-xs text-muted-foreground">
                {new Date(n.createdAt).toLocaleDateString()}
              </span>
            </div>
            <div className="flex shrink-0 gap-2">
              {!n.readAt && (
                <Button size="xs" variant="ghost" onClick={() => markRead.mutate({ notificationId: n.id })}>
                  Mark read
                </Button>
              )}
              <Button size="xs" variant="ghost" onClick={() => dismiss.mutate({ notificationId: n.id })}>
                Dismiss
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
