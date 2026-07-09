// Admin users — CS-WORK-119
// Wired to admin.users.list

"use client"

import { trpc } from "@/lib/trpc/client"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"

export default function AdminUsersPage() {
  const result = trpc.admin.users.list.useQuery({})

  if (result.isLoading) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold tracking-tight">Users</h1>
        {Array.from({ length: 5 }).map((_, i) => (
          <Card key={i}><CardContent className="py-4"><Skeleton className="h-10 w-full" /></CardContent></Card>
        ))}
      </div>
    )
  }

  const users = result.data?.items ?? []

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">Users</h1>
      {users.length === 0 && <p className="text-muted-foreground">No users</p>}
      {users.map((u) => (
        <Card key={u.id} className="transition-shadow hover:shadow-md">
          <CardContent className="flex items-center gap-4 py-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium">{u.name ?? "Unnamed"}</span>
                <Badge variant={u.role === "admin" ? "default" : "outline"} className="text-[10px] capitalize">
                  {u.role ?? "user"}
                </Badge>
                {u.emailVerified && <Badge variant="secondary" className="text-[10px]">Verified</Badge>}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {u.email} — joined {new Date(u.createdAt).toLocaleDateString()}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
