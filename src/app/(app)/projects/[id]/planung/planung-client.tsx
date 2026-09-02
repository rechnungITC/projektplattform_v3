"use client"

import { ArrowUpDown, Plus } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { GanttView } from "@/components/phases/gantt-view"
import { NewMilestoneDialog } from "@/components/milestones/new-milestone-dialog"
import { MilestonesList } from "@/components/milestones/milestones-list"
import { NewPhaseDialog } from "@/components/phases/new-phase-dialog"
import { PhaseList } from "@/components/phases/phase-list"
import { PhasesTimeline } from "@/components/phases/phases-timeline"
import { ReorderPhasesDialog } from "@/components/phases/reorder-phases-dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { EditWorkItemDialog } from "@/components/work-items/edit-work-item-dialog"
import { useMilestones } from "@/hooks/use-milestones"
import { usePhases } from "@/hooks/use-phases"
import { BacklogAiProposalLauncher } from "@/components/projects/ai-proposals/backlog-ai-proposal-launcher"
import { useProject } from "@/hooks/use-project"
import { useProjectAccess } from "@/hooks/use-project-access"
import { useWorkItems } from "@/hooks/use-work-items"
import { phaseListItems } from "@/lib/work-items/planning-items"
import type { WorkItemWithProfile } from "@/types/work-item"

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
  // PROJ-154: kein `kinds`-Filter mehr. Vorher lud die Ansicht ausschliesslich
  // `work_package`, wodurch ein Task oder eine Story MIT Phasenzuordnung in
  // Phasenliste und Gantt unsichtbar blieb (live in Prod gemessen). Welche
  // Menge welche Flaeche sieht, entscheidet `planning-items.ts`.
  const { items: allWorkItems, refresh: refreshWorkItems } =
    useWorkItems(projectId)

  const phaseItems = React.useMemo(
    () => phaseListItems(allWorkItems),
    [allWorkItems],
  )
  // PROJ-155-α: kein Vorfilter mehr. `ganttRowItems` liess nur Arbeitspakete
  // und Items MIT `phase_id` durch — ein Task haengt aber per `parent_id` an
  // seinem Arbeitspaket (in Prod 39 von 48) und fiel damit heraus, bevor die
  // Baumlogik ihn sehen konnte. Welche Zeilen erscheinen, entscheidet jetzt
  // `buildGanttRows`, weil nur dort die Hierarchie bekannt ist. Eine zweite
  // Sichtbarkeitsregel daneben waere genau die Drift, die diese Slice behebt.
  const ganttItems = allWorkItems

  /**
   * PROJ-155-β.2 — der Auto-Scheduling-Schalter.
   *
   * Liegt in `projects.settings` (Nutzer-Entscheid Q2) und ist seit dieser Slice
   * **auditiert**: sein Umstellen erzeugt eine Feld-Audit-Zeile (AC-21). Der
   * Anzeigewert wird aus dem geladenen Projekt abgeleitet, damit es keinen
   * zweiten Zustand gibt, der davon abdriften kann — nur der laufende
   * Schreibvorgang hat einen eigenen.
   */
  const { project, refresh: refreshProject } = useProject(projectId)
  const autoSchedule = project?.settings?.autoScheduleSuccessors === true
  const [autoScheduleSaving, setAutoScheduleSaving] = React.useState(false)

  const toggleAutoSchedule = React.useCallback(
    async (next: boolean) => {
      setAutoScheduleSaving(true)
      try {
        const res = await fetch(`/api/projects/${projectId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ settings: { autoScheduleSuccessors: next } }),
        })
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as
            | { error?: { message?: string } }
            | null
          throw new Error(body?.error?.message ?? `HTTP ${res.status}`)
        }
        refreshProject()
        toast.success(
          next
            ? "Nachfolger werden jetzt mitgerechnet"
            : "Nachfolger werden nicht mehr mitgerechnet",
        )
      } catch (err) {
        toast.error("Umstellen fehlgeschlagen", {
          description:
            err instanceof Error ? err.message : "Unbekannter Fehler",
        })
      } finally {
        setAutoScheduleSaving(false)
      }
    },
    [projectId, refreshProject],
  )

  const [tab, setTab] = React.useState<"phasen" | "meilensteine" | "gantt">(
    "phasen",
  )
  const [newPhaseOpen, setNewPhaseOpen] = React.useState(false)
  const [newMilestoneOpen, setNewMilestoneOpen] = React.useState(false)
  const [reorderOpen, setReorderOpen] = React.useState(false)
  const [editWorkItem, setEditWorkItem] =
    React.useState<WorkItemWithProfile | null>(null)

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
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Planung</h1>
          <p className="text-sm text-muted-foreground">
            Phasen, Meilensteine und der zeitliche Rahmen des Projekts.
          </p>
        </div>
        {canEdit && <BacklogAiProposalLauncher projectId={projectId} />}
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
            workItems={phaseItems}
            loading={phasesLoading}
            onChanged={refreshAll}
          />
        </TabsContent>

        <TabsContent value="meilensteine" className="space-y-4">
          <MilestonesList projectId={projectId} phases={phases} />
        </TabsContent>

        <TabsContent value="gantt" className="space-y-4">
          {/* PROJ-155-β.2 — der Schalter sitzt bei den Terminen, weil er nur
              dort wirkt. Der Hinweistext ist Teil der Zusage: auch bei „an"
              wird nicht ungefragt geschrieben. */}
          {canEdit ? (
            <div className="flex flex-wrap items-start gap-3 rounded-md border px-3 py-2">
              <Switch
                id="auto-schedule"
                checked={autoSchedule}
                disabled={autoScheduleSaving}
                onCheckedChange={toggleAutoSchedule}
              />
              <div className="min-w-0 flex-1">
                <Label htmlFor="auto-schedule" className="text-sm font-medium">
                  Nachfolger automatisch mitverschieben
                </Label>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Beim Verschieben eines Arbeitspakets wird berechnet, welche
                  Nachfolger nachziehen müssten — und als Vorschau gezeigt.
                  Geschrieben wird erst nach „Übernehmen“.
                </p>
              </div>
            </div>
          ) : null}
          <GanttView
            projectId={projectId}
            phases={phases}
            milestones={milestones}
            workPackages={ganttItems}
            canEdit={canEdit}
            onChanged={refreshAll}
            onEditWorkItemRequest={setEditWorkItem}
            autoScheduleSuccessors={autoSchedule}
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

      {editWorkItem ? (
        <EditWorkItemDialog
          open={!!editWorkItem}
          onOpenChange={(open) => {
            if (!open) setEditWorkItem(null)
          }}
          projectId={projectId}
          item={editWorkItem}
          onSaved={async () => {
            await refreshAll()
            setEditWorkItem(null)
          }}
        />
      ) : null}
    </div>
  )
}
