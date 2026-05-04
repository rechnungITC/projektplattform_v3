"use client"

import { ArrowUpDown, Plus } from "lucide-react"
import * as React from "react"

import { GanttView } from "@/components/phases/gantt-view"
import { NewMilestoneDialog } from "@/components/milestones/new-milestone-dialog"
import { MilestonesList } from "@/components/milestones/milestones-list"
import { NewPhaseDialog } from "@/components/phases/new-phase-dialog"
import { PhaseList } from "@/components/phases/phase-list"
import { PhasesTimeline } from "@/components/phases/phases-timeline"
import { ReorderPhasesDialog } from "@/components/phases/reorder-phases-dialog"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useMilestones } from "@/hooks/use-milestones"
import { usePhases } from "@/hooks/use-phases"
import { useProjectAccess } from "@/hooks/use-project-access"
import { useWorkItems } from "@/hooks/use-work-items"

interface PlanungClientProps {
  projectId: string
}

export function PlanungClient({ projectId }: PlanungClientProps) {
  const canEdit = useProjectAccess(projectId, "edit_master")
  const canTransition = useProjectAccess(projectId, "transition")

  const {
    phases,
    loading: phasesLoading,
    refresh: refreshPhases,
  } = usePhases(projectId)
  const { milestones, refresh: refreshMilestones } = useMilestones(projectId)
  const { items: workItems, refresh: refreshWorkItems } = useWorkItems(
    projectId,
    { kinds: ["work_package"] },
  )

  const [tab, setTab] = React.useState<"phasen" | "meilensteine" | "gantt">(
    "phasen",
  )
  const [newPhaseOpen, setNewPhaseOpen] = React.useState(false)
  const [newMilestoneOpen, setNewMilestoneOpen] = React.useState(false)
  const [reorderOpen, setReorderOpen] = React.useState(false)

  const refreshAll = React.useCallback(async () => {
    await Promise.all([
      refreshPhases(),
      refreshMilestones(),
      refreshWorkItems(),
    ])
  }, [refreshPhases, refreshMilestones, refreshWorkItems])

  const nextSequence = React.useMemo(() => {
    if (phases.length === 0) return 1
    return Math.max(...phases.map((p) => p.sequence_number)) + 1
  }, [phases])

  function scrollToPhase(phaseId: string) {
    if (typeof document === "undefined") return
    const el = document.getElementById(`phase-${phaseId}`)
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" })
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6 sm:px-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Planung</h1>
        <p className="text-sm text-muted-foreground">
          Phasen, Meilensteine und der zeitliche Rahmen des Projekts.
        </p>
      </header>

      <PhasesTimeline phases={phases} onPhaseSelect={scrollToPhase} />

      <Tabs
        value={tab}
        onValueChange={(value) =>
          setTab(value as "phasen" | "meilensteine" | "gantt")
        }
        className="space-y-4"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <TabsList>
            <TabsTrigger value="phasen">Phasen</TabsTrigger>
            <TabsTrigger value="meilensteine">Meilensteine</TabsTrigger>
            <TabsTrigger value="gantt">Gantt</TabsTrigger>
          </TabsList>

          <div className="flex flex-wrap items-center gap-2">
            {tab === "phasen" ? (
              <>
                {canTransition && phases.length > 1 ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setReorderOpen(true)}
                  >
                    <ArrowUpDown className="mr-1 h-4 w-4" aria-hidden />
                    Sortieren
                  </Button>
                ) : null}
                {canEdit ? (
                  <Button size="sm" onClick={() => setNewPhaseOpen(true)}>
                    <Plus className="mr-1 h-4 w-4" aria-hidden />
                    Neue Phase
                  </Button>
                ) : null}
              </>
            ) : (
              canEdit && (
                <Button size="sm" onClick={() => setNewMilestoneOpen(true)}>
                  <Plus className="mr-1 h-4 w-4" aria-hidden />
                  Neuer Meilenstein
                </Button>
              )
            )}
          </div>
        </div>

        <TabsContent value="phasen" className="space-y-4">
          <PhaseList
            projectId={projectId}
            phases={phases}
            loading={phasesLoading}
            onChanged={refreshAll}
          />
        </TabsContent>

        <TabsContent value="meilensteine" className="space-y-4">
          <MilestonesList projectId={projectId} phases={phases} />
        </TabsContent>

        <TabsContent value="gantt" className="space-y-4">
          <GanttView
            projectId={projectId}
            phases={phases}
            milestones={milestones}
            workPackages={workItems}
            canEdit={canEdit}
            onChanged={refreshAll}
          />
          <p className="text-xs text-muted-foreground">
            Tipp: Phasen-Balken horizontal verschieben (Move) oder rechte Kante
            ziehen (Resize). Abgeschlossene Phasen sind gesperrt.
          </p>
        </TabsContent>
      </Tabs>

      <NewPhaseDialog
        open={newPhaseOpen}
        onOpenChange={setNewPhaseOpen}
        projectId={projectId}
        defaultSequenceNumber={nextSequence}
        onCreated={refreshAll}
      />
      <NewMilestoneDialog
        open={newMilestoneOpen}
        onOpenChange={setNewMilestoneOpen}
        projectId={projectId}
        onCreated={refreshAll}
      />
      <ReorderPhasesDialog
        open={reorderOpen}
        onOpenChange={setReorderOpen}
        projectId={projectId}
        phases={phases}
        onReordered={refreshAll}
      />
    </div>
  )
}
