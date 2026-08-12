"use client"

import { FileText } from "lucide-react"

import { SnapshotRow } from "./snapshot-row"
import { ModuleUnavailableNotice } from "@/components/app/module-unavailable-notice"
import { Skeleton } from "@/components/ui/skeleton"
import type { SnapshotListItem } from "@/lib/reports/types"

interface SnapshotListProps {
  projectId: string
  snapshots: SnapshotListItem[]
  loading: boolean
  error: string | null
  /** PROJ-Y-143f — module gate answered 404; not a failure. */
  unavailable?: boolean
  onRetryPdf: (snapshotId: string) => Promise<void>
}

export function SnapshotList({
  projectId,
  snapshots,
  loading,
  error,
  unavailable = false,
  onRetryPdf,
}: SnapshotListProps) {
  if (loading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    )
  }

  if (unavailable) {
    // PROJ-Y-143f: this route has two 404 paths (module gate and project
    // access), so the copy states availability without naming a reason —
    // and deliberately does not fall through to the "Noch keine Snapshots"
    // empty state, which would claim there are none (PROJ-64 AC-9).
    return (
      <ModuleUnavailableNotice
        title="Reports sind für dieses Projekt nicht verfügbar."
        description="Sobald das Modul für den Workspace aktiv ist, erscheinen hier die erzeugten Status-Reports und Executive-Summaries."
      />
    )
  }

  if (error) {
    return (
      <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
        Snapshots konnten nicht geladen werden: {error}
      </p>
    )
  }

  if (snapshots.length === 0) {
    return (
      <div className="rounded-md border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
        <FileText className="mx-auto h-6 w-6 opacity-60" aria-hidden />
        <p className="mt-2">
          Noch keine Snapshots. Erzeuge den ersten Status-Report oder die
          Executive-Summary über den Button rechts oben.
        </p>
      </div>
    )
  }

  return (
    <ul className="space-y-2">
      {snapshots.map((s) => (
        <li key={s.id}>
          <SnapshotRow
            projectId={projectId}
            snapshot={s}
            onRetryPdf={onRetryPdf}
          />
        </li>
      ))}
    </ul>
  )
}
