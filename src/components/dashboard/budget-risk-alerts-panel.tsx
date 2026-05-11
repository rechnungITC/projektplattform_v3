"use client"

import {
  AlertOctagon,
  Banknote,
  ChevronRight,
  TriangleAlert,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react"
import Link from "next/link"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import type {
  AlertRow,
  AlertSeverity,
  DashboardSectionEnvelope,
} from "@/types/dashboard"

import { DashboardSectionEmpty } from "./dashboard-section-empty"
import { DashboardSectionError } from "./dashboard-section-error"
import { DashboardSectionSkeleton } from "./dashboard-section-skeleton"
import { DashboardSectionUnavailable } from "./dashboard-section-unavailable"

interface BudgetRiskAlertsPanelProps {
  envelope: DashboardSectionEnvelope<{ items: AlertRow[] }>
  isLoading: boolean
  onRetry: () => void | Promise<void>
}

const ALERT_ICON: Record<AlertRow["kind"], LucideIcon> = {
  budget_overrun: Wallet,
  budget_threshold: Banknote,
  missing_fx_rate: AlertOctagon,
  critical_risk: TriangleAlert,
  stakeholder_critical_path: Users,
  schedule_overdue: AlertOctagon,
}

/**
 * PROJ-64 AC-5 — budget + risk + stakeholder-health exceptions.
 *
 * Each row deep-links into the relevant project tab (budget,
 * risks, stakeholder-health). The icon family makes the alert
 * type scannable without reading the title.
 */
export function BudgetRiskAlertsPanel({
  envelope,
  isLoading,
  onRetry,
}: BudgetRiskAlertsPanelProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <TriangleAlert
            className="h-5 w-5 text-muted-foreground"
            aria-hidden
          />
          Alerts
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Body envelope={envelope} isLoading={isLoading} onRetry={onRetry} />
      </CardContent>
    </Card>
  )
}

function Body({ envelope, isLoading, onRetry }: BudgetRiskAlertsPanelProps) {
  if (isLoading || envelope.state === "loading") {
    return <DashboardSectionSkeleton rows={2} />
  }
  if (envelope.state === "error") {
    return (
      <DashboardSectionError
        title="Alerts"
        message={envelope.error}
        onRetry={onRetry}
      />
    )
  }
  if (envelope.state === "unavailable") {
    return (
      <DashboardSectionUnavailable
        title="Alerts werden vorbereitet"
        description="Budget- und Risiko-Signale werden mit der PROJ-64 Backend-Slice eingebunden."
      />
    )
  }
  const items = envelope.data?.items ?? []
  if (items.length === 0) {
    return (
      <DashboardSectionEmpty
        title="Keine aktiven Alerts"
        description="Budget, Risiken und Stakeholder-Health zeigen keine kritischen Werte."
      />
    )
  }
  return (
    <ul className="space-y-2">
      {items.map((row) => (
        <AlertRowItem key={row.id} row={row} />
      ))}
    </ul>
  )
}

function AlertRowItem({ row }: { row: AlertRow }) {
  const Icon = ALERT_ICON[row.kind] ?? TriangleAlert
  return (
    <li>
      <Link
        href={row.href}
        className={cn(
          "group flex items-start gap-3 rounded-md border bg-card p-3 transition-colors hover:bg-accent",
          row.severity === "critical" && "border-destructive/30",
        )}
      >
        <div
          className={cn(
            "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
            row.severity === "critical"
              ? "bg-destructive/10 text-destructive"
              : row.severity === "warning"
                ? "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400"
                : "bg-secondary text-secondary-foreground",
          )}
        >
          <Icon className="h-4 w-4" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">
              {row.project_name}
            </span>
            <SeverityBadge severity={row.severity} />
          </div>
          <p className="truncate text-sm font-medium text-foreground">
            {row.title}
          </p>
          {row.detail && (
            <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
              {row.detail}
            </p>
          )}
        </div>
        <ChevronRight
          className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
          aria-hidden
        />
      </Link>
    </li>
  )
}

function SeverityBadge({ severity }: { severity: AlertSeverity }) {
  if (severity === "critical") {
    return (
      <Badge variant="destructive" className="h-5 text-[10px]">
        Kritisch
      </Badge>
    )
  }
  if (severity === "warning") {
    return (
      <Badge className="h-5 bg-amber-500 text-[10px] text-white hover:bg-amber-600">
        Warnung
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className="h-5 text-[10px]">
      Info
    </Badge>
  )
}
