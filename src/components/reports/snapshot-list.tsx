"use client"

import { FileText } from "lucide-react"

import { SnapshotRow } from "./snapshot-row"
import { Skeleton } from "@/components/ui/skeleton"
import type { SnapshotListItem } from "@/lib/reports/types"

interface SnapshotListProps {
  projectId: string
  snapshots: SnapshotListItem[]
  loading: boolean
  error: string | null
  onRetryPdf: (snapshotId: string) => Promise<void>
}

export function SnapshotList({
  projectId,
  snapshots,
  loading,
  error,
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
