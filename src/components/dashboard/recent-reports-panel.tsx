"use client"

import { ChevronRight, FileText } from "lucide-react"
import Link from "next/link"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type {
  DashboardSectionEnvelope,
  ReportShortcut,
} from "@/types/dashboard"

import { DashboardSectionEmpty } from "./dashboard-section-empty"
import { DashboardSectionError } from "./dashboard-section-error"
import { DashboardSectionSkeleton } from "./dashboard-section-skeleton"
import { DashboardSectionUnavailable } from "./dashboard-section-unavailable"

interface RecentReportsPanelProps {
  envelope: DashboardSectionEnvelope<{ items: ReportShortcut[] }>
  isLoading: boolean
  onRetry: () => void | Promise<void>
}

const KIND_LABEL: Record<ReportShortcut["kind"], string> = {
  status_report: "Status-Report",
  executive_summary: "Executive Summary",
}

/**
 * PROJ-64 — Recent Reports / Snapshots shortcut row.
 *
 * Surfaces the most recent PROJ-21 snapshots the user can access.
 * Each row deep-links into the snapshot HTML view.
 */
export function RecentReportsPanel({
  envelope,
  isLoading,
  onRetry,
}: RecentReportsPanelProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <FileText className="h-5 w-5 text-muted-foreground" aria-hidden />
          Aktuelle Reports
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Body envelope={envelope} isLoading={isLoading} onRetry={onRetry} />
      </CardContent>
    </Card>
  )
}

function Body({ envelope, isLoading, onRetry }: RecentReportsPanelProps) {
  if (isLoading || envelope.state === "loading") {
    return <DashboardSectionSkeleton rows={2} />
  }
  if (envelope.state === "error") {
    return (
      <DashboardSectionError
        title="Aktuelle Reports"
        message={envelope.error}
        onRetry={onRetry}
      />
    )
  }
  if (envelope.state === "unavailable") {
    return (
      <DashboardSectionUnavailable
        title="Reports werden vorbereitet"
        description="Aktuelle Status-Reports und Executive-Summaries erscheinen hier, sobald die Aggregation aktiv ist."
      />
    )
  }
  const items = envelope.data?.items ?? []
  if (items.length === 0) {
    return (
      <DashboardSectionEmpty
        icon={FileText}
        title="Noch keine Snapshots"
        description="Erstelle in einem Projektraum den ersten Status-Report oder die Executive-Summary."
      />
    )
  }
  return (
    <ul className="space-y-2">
      {items.map((row) => (
        <li key={row.snapshot_id}>
          <Link
            href={row.href}
            className="group flex items-start gap-3 rounded-md border bg-card p-3 transition-colors hover:bg-accent"
          >
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-xs uppercase tracking-wide text-muted-foreground">
                  {row.project_name}
                </span>
                <Badge variant="outline" className="h-5 text-[10px]">
                  {KIND_LABEL[row.kind]} · v{row.version}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Erzeugt am{" "}
                {new Date(row.generated_at).toLocaleDateString("de-DE")}
              </p>
            </div>
            <ChevronRight
              className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
              aria-hidden
            />
          </Link>
        </li>
      ))}
    </ul>
  )
}
