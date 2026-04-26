"use client"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { useAuth } from "@/hooks/use-auth"

export function DashboardWelcome() {
  const { profile, user, currentTenant, currentRole } = useAuth()
  const displayName =
    profile?.display_name ??
    profile?.email?.split("@")[0] ??
    user.email?.split("@")[0] ??
    "there"

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Welcome, {displayName}
        </h1>
        <p className="text-muted-foreground">
          Your project dashboard will live here.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            {currentTenant?.name ?? "No active workspace"}
          </CardTitle>
          <CardDescription>
            {currentRole
              ? `You are signed in as ${currentRole}.`
              : "No role detected for this workspace."}
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Projects, phases and tasks will appear here once those features land.
        </CardContent>
      </Card>
    </div>
  )
}
