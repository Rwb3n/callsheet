// Account settings — CS-WORK-115
// Email preferences + account closure.

"use client"

import { useState } from "react"
import { trpc } from "@/lib/trpc/client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"

export default function SettingsPage() {
  const prefs = trpc.settings.getEmailPreferences.useQuery()
  const updatePref = trpc.settings.updateEmailPreference.useMutation({
    onSuccess: () => prefs.refetch(),
  })
  const closureResult = trpc.settings.initiateAccountClosure.useMutation()
  const [showConfirm, setShowConfirm] = useState(false)

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Account Settings</h1>

      <Card>
        <CardHeader><CardTitle>Email Preferences</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {prefs.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
            </div>
          ) : (
            (prefs.data ?? []).map((pref) => (
              <label key={pref.category} className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <span className="font-medium capitalize">{pref.category.replace(/_/g, " ")}</span>
                </div>
                <input
                  type="checkbox"
                  checked={pref.enabled}
                  disabled={updatePref.isPending}
                  onChange={() => updatePref.mutate({ category: pref.category, enabled: !pref.enabled })}
                  className="h-4 w-4"
                />
              </label>
            ))
          )}
        </CardContent>
      </Card>

      <Card className="border-destructive/50">
        <CardHeader><CardTitle className="text-destructive">Close Account</CardTitle></CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-muted-foreground">
            Closing your account initiates a 6-step erasure flow. This action cannot be undone.
          </p>
          {!showConfirm ? (
            <Button variant="destructive" onClick={() => setShowConfirm(true)}>Close my account</Button>
          ) : (
            <div className="space-y-3">
              <p className="text-sm font-medium text-destructive">
                Are you sure? This will permanently delete your account and all associated data.
              </p>
              <div className="flex gap-3">
                <Button variant="destructive" disabled={closureResult.isPending} onClick={() => closureResult.mutate()}>
                  {closureResult.isPending ? "Closing..." : "Confirm closure"}
                </Button>
                <Button variant="outline" onClick={() => setShowConfirm(false)}>Cancel</Button>
              </div>
              {closureResult.isSuccess && (
                <p className="text-sm text-muted-foreground">Account closure initiated. You will receive an email with next steps.</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
