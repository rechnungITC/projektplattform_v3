"use client"

import { Plus } from "lucide-react"
import * as React from "react"

import { NewPhaseDialog } from "@/components/phases/new-phase-dialog"
import { PhaseCard } from "@/components/phases/phase-card"
import { ReorderPhasesDialog } from "@/components/phases/reorder-phases-dialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { useProjectAccess } from "@/hooks/use-project-access"
import type { Phase } from "@/types/phase"
import type { WorkItemWithProfile } from "@/types/work-item"

interface PhaseListProps {
  projectId: string
  phases: Phase[]
  /** Optional — work_packages for the project. Passed down to PhaseCard so
   * each card can render its assigned WPs in-place. Empty/undefined → fallback
   * placeholder. */
  workItems?: WorkItemWithProfile[]
  loading: boolean
  onChanged: () => void | Promise<void>
}

export function PhaseList({
  projectId,
  phases,
  workItems,
  loading,
  onChanged,
}: PhaseListProps) {
  const canEdit = useProjectAccess(projectId, "edit_master")
  const canTransition = useProjectAccess(projectId, "transition")

  const [newOpen, setNewOpen] = React.useState(false)
  const [reorderOpen, setReorderOpen] = React.useState(false)

  const nextSequence = React.useMemo(() => {
    if (phases.length === 0) return 1
    return Math.max(...phases.map((p) => p.sequence_number)) + 1
  }, [phases])

  if (loading) {
    return (
      <div className="space-y-4" role="status" aria-label="Lädt Phasen">
        {Array.from({ length: 3 }).map((_, idx) => (
          <Card key={idx}>
            <CardContent className="space-y-3 p-6">
              <Skeleton className="h-5 w-1/3" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-2 w-full" />
              <Skeleton className="h-12 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  if (phases.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
          <p className="max-w-md text-sm text-muted-foreground">
            Für dieses Projekt gibt es noch keine Phasen. Lege die erste Phase
            an, um eine Timeline aufzubauen.
          </p>
          {canEdit ? (
            <Button onClick={() => setNewOpen(true)}>
              <Plus className="mr-1 h-4 w-4" aria-hidden />
              Erste Phase erstellen
            </Button>
          ) : null}
        </CardContent>
        <NewPhaseDialog
          open={newOpen}
          onOpenChange={setNewOpen}
          projectId={projectId}
          defaultSequenceNumber={nextSequence}
          onCreated={onChanged}
        />
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <div className="space-y-4">
        {phases.map((phase) => (
          <PhaseCard
            key={phase.id}
            projectId={projectId}
            phase={phase}
            phaseWorkItems={(workItems ?? []).filter(
              (wp) => wp.phase_id === phase.id && !wp.is_deleted,
            )}
            onChanged={onChanged}
            onReorderRequest={canTransition ? () => setReorderOpen(true) : undefined}
          />
        ))}
      </div>

      <NewPhaseDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        projectId={projectId}
        defaultSequenceNumber={nextSequence}
        onCreated={onChanged}
      />
      <ReorderPhasesDialog
        open={reorderOpen}
        onOpenChange={setReorderOpen}
        projectId={projectId}
        phases={phases}
        onReordered={onChanged}
      />
    </div>
  )
}
