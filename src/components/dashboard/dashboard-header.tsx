"use client"

import { RefreshCw } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useAuth } from "@/hooks/use-auth"

import { QuickActions } from "./quick-actions"

interface DashboardHeaderProps {
  onRefresh: () => void | Promise<void>
  isRefreshing: boolean
  capabilities: {
    can_create_project: boolean
    can_create_work_item: boolean
    can_open_approvals: boolean
    can_open_reports: boolean
  }
}

/**
 * PROJ-64 — top of the dashboard.
 *
 * Renders greeting + active tenant + role badge + the QuickActions
 * strip. Responsive: stacks vertically on mobile, single row at
 * 768px+.
 */
export function DashboardHeader({
  onRefresh,
  isRefreshing,
  capabilities,
}: DashboardHeaderProps) {
  const { profile, user, currentTenant, currentRole } = useAuth()
  const displayName =
    profile?.display_name ??
    profile?.email?.split("@")[0] ??
    user.email?.split("@")[0] ??
    "there"

  return (
    <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Hallo, {displayName}
        </h1>
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span>Was möchtest du heute erledigen?</span>
          {currentTenant && (
            <Badge variant="outline" className="font-normal">
              {currentTenant.name}
            </Badge>
          )}
          {currentRole && (
            <Badge variant="secondary" className="font-normal capitalize">
              {currentRole}
            </Badge>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            void onRefresh()
          }}
          disabled={isRefreshing}
          aria-label="Dashboard neu laden"
        >
          <RefreshCw
            className={`mr-2 h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`}
            aria-hidden
          />
          Aktualisieren
        </Button>
        <QuickActions capabilities={capabilities} />
      </div>
    </header>
  )
}
