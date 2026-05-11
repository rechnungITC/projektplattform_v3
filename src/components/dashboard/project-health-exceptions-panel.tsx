"use client"

import { Activity, ChevronRight, ShieldAlert } from "lucide-react"
import Link from "next/link"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import type {
  DashboardSectionEnvelope,
  ProjectHealthExceptionRow,
} from "@/types/dashboard"

import { DashboardSectionEmpty } from "./dashboard-section-empty"
import { DashboardSectionError } from "./dashboard-section-error"
import { DashboardSectionSkeleton } from "./dashboard-section-skeleton"
import { DashboardSectionUnavailable } from "./dashboard-section-unavailable"

interface ProjectHealthExceptionsPanelProps {
  envelope: DashboardSectionEnvelope<{
    items: ProjectHealthExceptionRow[]
    total_accessible_projects: number
  }>
  isLoading: boolean
  onRetry: () => void | Promise<void>
}

/**
 * PROJ-64 AC-4 — portfolio exception view.
 *
 * Shows projects whose health is red, yellow, or unknown, sorted
 * server-side by severity. Unknown projects are listed below
 * yellow but above green-but-empty so the user always sees
 * "needs attention" first.
 */
export function ProjectHealthExceptionsPanel({
  envelope,
  isLoading,
  onRetry,
}: ProjectHealthExceptionsPanelProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <ShieldAlert className="h-5 w-5 text-muted-foreground" aria-hidden />
          Project Health
        </CardTitle>
        {envelope.state === "ready" && envelope.data && (
          <span className="text-xs text-muted-foreground">
            {envelope.data.items.length} von{" "}
            {envelope.data.total_accessible_projects} Projekten
          </span>
        )}
      </CardHeader>
      <CardContent>
        <Body
          isLoading={isLoading}
          envelope={envelope}
          onRetry={onRetry}
        />
      </CardContent>
    </Card>
  )
}

function Body({
  isLoading,
  envelope,
  onRetry,
}: ProjectHealthExceptionsPanelProps) {
  if (isLoading || envelope.state === "loading") {
    return <DashboardSectionSkeleton rows={3} />
  }
  if (envelope.state === "error") {
    return (
      <DashboardSectionError
        title="Project Health"
        message={envelope.error}
        onRetry={onRetry}
      />
    )
  }
  if (envelope.state === "unavailable") {
    return (
      <DashboardSectionUnavailable
        title="Health-Aggregation wird vorbereitet"
        description="Die Portfolio-Health-Übersicht ist mit der PROJ-64 Backend-Slice verfügbar."
      />
    )
  }
  const items = envelope.data?.items ?? []
  if (items.length === 0) {
    return (
      <DashboardSectionEmpty
        icon={Activity}
        title="Alle Projekte im Plan"
        description="Keine roten oder gelben Health-Signale in deinem Portfolio."
      />
    )
  }
  return (
    <ul className="space-y-2">
      {items.map((row) => (
        <ProjectHealthRowItem key={row.project_id} row={row} />
      ))}
    </ul>
  )
}

function ProjectHealthRowItem({ row }: { row: ProjectHealthExceptionRow }) {
  return (
    <li>
      <Link
        href={row.href}
        className="group flex items-start gap-3 rounded-md border bg-card p-3 transition-colors hover:bg-accent"
      >
        <HealthDot health={row.health} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <p className="truncate text-sm font-medium text-foreground">
              {row.project_name}
            </p>
            <HealthBadge health={row.health} />
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">{row.reason}</p>
          <div className="mt-1 flex flex-wrap gap-1.5 text-[10px] text-muted-foreground">
            <Pill state={row.budget_state} label="Budget" />
            <Pill state={row.risk_state} label="Risiken" />
            <Pill state={row.schedule_state} label="Zeitplan" />
            <Pill state={row.stakeholder_state} label="Stakeholder" />
          </div>
        </div>
        <ChevronRight
          className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
          aria-hidden
        />
      </Link>
    </li>
  )
}

function HealthDot({ health }: { health: ProjectHealthExceptionRow["health"] }) {
  return (
    <span
      className={cn(
        "mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full",
        health === "red" && "bg-destructive",
        health === "yellow" && "bg-amber-500",
        health === "green" && "bg-emerald-500",
        health === "unknown" && "bg-muted-foreground/40",
      )}
      aria-label={`Health: ${health}`}
    />
  )
}

function HealthBadge({
  health,
}: {
  health: ProjectHealthExceptionRow["health"]
}) {
  if (health === "red") {
    return (
      <Badge variant="destructive" className="h-5 text-[10px]">
        Kritisch
      </Badge>
    )
  }
  if (health === "yellow") {
    return (
      <Badge className="h-5 bg-amber-500 text-[10px] text-white hover:bg-amber-600">
        Beobachtung
      </Badge>
    )
  }
  if (health === "unknown") {
    return (
      <Badge variant="outline" className="h-5 text-[10px]">
        Daten unvollständig
      </Badge>
    )
  }
  return null
}

function Pill({
  state,
  label,
}: {
  state: ProjectHealthExceptionRow["budget_state"]
  label: string
}) {
  const tone =
    state === "red"
      ? "border-destructive/40 text-destructive"
      : state === "yellow"
        ? "border-amber-500/40 text-amber-700 dark:text-amber-400"
        : state === "green"
          ? "border-emerald-500/30 text-emerald-700 dark:text-emerald-400"
          : "border-muted text-muted-foreground"
  return (
    <span
      className={cn("rounded-full border px-1.5 py-0.5", tone)}
      aria-label={`${label}: ${state}`}
    >
      {label}: {stateLabel(state)}
    </span>
  )
}

function stateLabel(state: ProjectHealthExceptionRow["budget_state"]): string {
  switch (state) {
    case "red":
      return "Rot"
    case "yellow":
      return "Gelb"
    case "green":
      return "Grün"
    case "empty":
      return "Leer"
    case "unknown":
    default:
      return "Unbekannt"
  }
}
