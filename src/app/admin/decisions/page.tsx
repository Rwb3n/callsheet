// Admin decision log viewer — CS-WORK-119
// Wired to admin.decisions.search

"use client"

import { useState } from "react"
import { trpc } from "@/lib/trpc/client"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"

export default function AdminDecisionsPage() {
  const [domain, setDomain] = useState("")
  const [decisionType, setDecisionType] = useState("")
  const result = trpc.admin.decisions.search.useQuery({
    domain: domain || undefined,
    decisionType: decisionType || undefined,
    limit: 50,
  } as Parameters<typeof trpc.admin.decisions.search.useQuery>[0])

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">Decision Log</h1>

      <div className="flex gap-3">
        <Input
          placeholder="Filter by domain..."
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          className="max-w-xs"
        />
        <Input
          placeholder="Filter by type..."
          value={decisionType}
          onChange={(e) => setDecisionType(e.target.value)}
          className="max-w-xs"
        />
        <Button variant="outline" onClick={() => { setDomain(""); setDecisionType("") }}>Clear</Button>
      </div>

      {result.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Card key={i}><CardContent className="py-4"><Skeleton className="h-10 w-full" /></CardContent></Card>
          ))}
        </div>
      ) : (
        <>
          {(result.data?.items ?? []).length === 0 && (
            <p className="text-muted-foreground">No decisions found</p>
          )}
          {(result.data?.items ?? []).map((d) => (
            <Card key={d.id}>
              <CardContent className="py-4">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px]">{d.domain}</Badge>
                  <span className="font-medium font-mono text-sm">{d.decisionType}</span>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {new Date(d.createdAt).toLocaleString()}
                </div>
              </CardContent>
            </Card>
          ))}
        </>
      )}
    </div>
  )
}
