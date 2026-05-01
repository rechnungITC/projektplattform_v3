"use client"

import { FileBarChart2 } from "lucide-react"

import { SnapshotCreateButton } from "@/components/reports/snapshot-create-button"
import { SnapshotList } from "@/components/reports/snapshot-list"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { useProjectAccess } from "@/hooks/use-project-access"
import { useSnapshots } from "@/hooks/use-snapshots"

interface ReportsSectionProps {
  projectId: string
  /** Comes from `tenant_settings.output_rendering.ki_narrative_enabled`. */
  kiNarrativeEnabled: boolean
}

/**
 * PROJ-21 — Reports sub-section in the Project-Room "Übersicht" tab.
 *
 * Editor / Lead / Tenant-Admin see the create button + list.
 * Read-only members see the list only.
 */
export function ReportsSection({
  projectId,
  kiNarrativeEnabled,
}: ReportsSectionProps) {
  const canCreate = useProjectAccess(projectId, "edit_master")
  const { snapshots, loading, error, create, retryPdf } = useSnapshots(projectId)

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <FileBarChart2 className="mt-0.5 h-5 w-5 text-muted-foreground" aria-hidden />
          <div>
            <CardTitle>Reports</CardTitle>
            <CardDescription>
              Status-Report und Executive-Summary als HTML-Snapshot oder
              PDF — eingefroren zum Erzeugungs-Zeitpunkt, jederzeit teilbar.
            </CardDescription>
          </div>
        </div>
        {canCreate ? (
          <SnapshotCreateButton
            projectId={projectId}
            kiNarrativeEnabled={kiNarrativeEnabled}
            onCreate={create}
          />
        ) : null}
      </CardHeader>
      <CardContent>
        <SnapshotList
          projectId={projectId}
          snapshots={snapshots}
          loading={loading}
          error={error}
          onRetryPdf={retryPdf}
        />
      </CardContent>
    </Card>
  )
}
