"use client"

import {
  AlertTriangle,
  CheckSquare,
  Clock,
  TrendingUp,
  type LucideIcon,
} from "lucide-react"

import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import type { DashboardKpiCounters } from "@/types/dashboard"

interface DashboardKpiStripProps {
  kpis: DashboardKpiCounters | null
  isLoading: boolean
}

/**
 * PROJ-64 — KPI strip.
 *
 * 4 high-density counters:
 *   - Open assigned work
 *   - Overdue work
 *   - Pending approvals
 *   - At-risk projects
 *
 * Responsive: 1 column at 375px → 2 columns at 640px → 4 columns at
 * 1024px+. KPIs render zero values explicitly (not "—") so the user
 * sees that the dashboard answered with real data.
 */
export function DashboardKpiStrip({
  kpis,
  isLoading,
}: DashboardKpiStripProps) {
  return (
    <section
      aria-label="Kennzahlen"
      className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
    >
      <KpiCard
        icon={ListIcon}
        label="Offene Aufgaben"
        sublabel="Mir zugewiesen"
        value={kpis?.open_assigned ?? null}
        isLoading={isLoading}
      />
      <KpiCard
        icon={Clock}
        label="Überfällig"
        sublabel="Sofort prüfen"
        value={kpis?.overdue ?? null}
        isLoading={isLoading}
        tone={kpis && kpis.overdue > 0 ? "warning" : "neutral"}
      />
      <KpiCard
        icon={CheckSquare}
        label="Genehmigungen"
        sublabel="Warten auf mich"
        value={kpis?.pending_approvals ?? null}
        isLoading={isLoading}
      />
      <KpiCard
        icon={AlertTriangle}
        label="Projekte unter Beobachtung"
        sublabel="Rot oder Gelb"
        value={kpis?.at_risk_projects ?? null}
        isLoading={isLoading}
        tone={kpis && kpis.at_risk_projects > 0 ? "danger" : "neutral"}
      />
    </section>
  )
}

const ListIcon: LucideIcon = TrendingUp

type KpiTone = "neutral" | "warning" | "danger"

interface KpiCardProps {
  icon: LucideIcon
  label: string
  sublabel: string
  value: number | null
  isLoading: boolean
  tone?: KpiTone
}

function KpiCard({
  icon: Icon,
  label,
  sublabel,
  value,
  isLoading,
  tone = "neutral",
}: KpiCardProps) {
  return (
    <Card>
      <CardContent className="flex items-start justify-between gap-3 py-5">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          {isLoading || value === null ? (
            <Skeleton className="h-8 w-16" />
          ) : (
            <p
              className={cn(
                "text-3xl font-semibold tabular-nums",
                tone === "warning" && value > 0 && "text-amber-600 dark:text-amber-400",
                tone === "danger" && value > 0 && "text-destructive",
              )}
              aria-label={`${label}: ${value}`}
            >
              {value}
            </p>
          )}
          <p className="text-xs text-muted-foreground">{sublabel}</p>
        </div>
        <div
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-full",
            tone === "warning"
              ? "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
              : tone === "danger"
                ? "bg-destructive/10 text-destructive"
                : "bg-secondary text-secondary-foreground",
          )}
        >
          <Icon className="h-5 w-5" aria-hidden />
        </div>
      </CardContent>
    </Card>
  )
}
