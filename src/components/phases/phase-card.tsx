"use client"

import {
  ArrowUpDown,
  CalendarDays,
  ListTree,
  MoreHorizontal,
  Pencil,
  PlayCircle,
  Plus,
  Trash2,
} from "lucide-react"
import Link from "next/link"
import * as React from "react"

import { PhaseComplianceWarnings } from "@/components/compliance/phase-compliance-warnings"
import { MilestoneCard } from "@/components/milestones/milestone-card"
import { NewMilestoneDialog } from "@/components/milestones/new-milestone-dialog"
import { DeletePhaseDialog } from "@/components/phases/delete-phase-dialog"
import { EditPhaseDialog } from "@/components/phases/edit-phase-dialog"
import { PhaseStatusBadge } from "@/components/phases/phase-status-badge"
import { PhaseStatusTransitionDialog } from "@/components/phases/phase-status-transition-dialog"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Progress } from "@/components/ui/progress"
import { useMilestones } from "@/hooks/use-milestones"
import { useProjectAccess } from "@/hooks/use-project-access"
import {
  getMethodSlug,
  getProjectSectionHref,
} from "@/lib/method-templates/routing"
import { useCurrentProjectMethod } from "@/lib/work-items/method-context"
import { cn } from "@/lib/utils"
import type { Phase } from "@/types/phase"
import type { WorkItemWithProfile } from "@/types/work-item"

import { WorkItemKindBadge } from "@/components/work-items/work-item-kind-badge"
import { WorkItemStatusBadge } from "@/components/work-items/work-item-status-badge"
import { toast } from "sonner"
import { X } from "lucide-react"

interface PhaseCardProps {
  projectId: string
  phase: Phase
  /** Work-items already filtered to phase_id === phase.id (passed by PhaseList). */
  phaseWorkItems?: WorkItemWithProfile[]
  onChanged: () => void | Promise<void>
  /** Triggered when the user picks "Sortieren" from the actions menu. */
  onReorderRequest?: () => void
}

export function PhaseCard({
  projectId,
  phase,
  phaseWorkItems = [],
  onChanged,
  onReorderRequest,
}: PhaseCardProps) {
  const canEdit = useProjectAccess(projectId, "edit_master")
  const canTransition = useProjectAccess(projectId, "transition")
  const method = useCurrentProjectMethod(projectId)
  // Phase-aware methods (Waterfall/PMI/PRINCE2) call this section
  // "Arbeitspakete" (id=work-packages); hybrid/agile methods keep
  // "Backlog" (id=backlog). Pick whichever the method declares.
  const targetSection =
    getMethodSlug("work-packages", method) != null ? "work-packages" : "backlog"
  const backlogHref = `${getProjectSectionHref(
    projectId,
    targetSection,
    method,
  )}?phase=${phase.id}`

  const [editOpen, setEditOpen] = React.useState(false)
  const [statusOpen, setStatusOpen] = React.useState(false)
  const [deleteOpen, setDeleteOpen] = React.useState(false)
  const [newMilestoneOpen, setNewMilestoneOpen] = React.useState(false)

  const { milestones, refresh: refreshMilestones } = useMilestones(projectId, {
    phaseId: phase.id,
  })

  React.useEffect(() => {
    void refreshMilestones()
    // Re-run when the phase id changes; the hook itself reruns on
    // projectId only.
  }, [phase.id, refreshMilestones])

  const handleChanged = React.useCallback(async () => {
    await refreshMilestones()
    await onChanged()
  }, [onChanged, refreshMilestones])

  const elapsed = computeElapsedPercent(phase)

  return (
    <Card id={`phase-${phase.id}`} className="scroll-mt-24">
      <CardHeader className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-1">
            <CardTitle className="break-words text-lg">
              <span className="mr-2 inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-secondary px-2 text-xs font-semibold text-secondary-foreground">
                {phase.sequence_number}.
              </span>
              <span
                className={cn(
                  phase.status === "cancelled" && "text-muted-foreground line-through"
                )}
              >
                {phase.name}
              </span>
            </CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              {canTransition ? (
                <button
                  type="button"
                  onClick={() => setStatusOpen(true)}
                  className="rounded-full focus:outline-none focus:ring-2 focus:ring-ring"
                  aria-label="Status ändern"
                >
                  <PhaseStatusBadge status={phase.status} />
                </button>
              ) : (
                <PhaseStatusBadge status={phase.status} />
              )}
            </div>
          </div>
          {canEdit ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Aktionen für „${phase.name}"`}
                >
                  <MoreHorizontal className="h-4 w-4" aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem
                  onSelect={(event) => {
                    event.preventDefault()
                    setEditOpen(true)
                  }}
                >
                  <Pencil className="mr-2 h-4 w-4" aria-hidden />
                  Bearbeiten
                </DropdownMenuItem>
                {canTransition ? (
                  <DropdownMenuItem
                    onSelect={(event) => {
                      event.preventDefault()
                      setStatusOpen(true)
                    }}
                  >
                    <PlayCircle className="mr-2 h-4 w-4" aria-hidden />
                    Status ändern
                  </DropdownMenuItem>
                ) : null}
                {onReorderRequest ? (
                  <DropdownMenuItem
                    onSelect={(event) => {
                      event.preventDefault()
                      onReorderRequest()
                    }}
                  >
                    <ArrowUpDown className="mr-2 h-4 w-4" aria-hidden />
                    Sortieren
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={(event) => {
                    event.preventDefault()
                    setDeleteOpen(true)
                  }}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="mr-2 h-4 w-4" aria-hidden />
                  Löschen
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>

        <CardDescription className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          <span className="inline-flex items-center gap-1">
            <CalendarDays className="h-3.5 w-3.5" aria-hidden />
            Plan: {formatDate(phase.planned_start)} – {formatDate(phase.planned_end)}
          </span>
          {phase.actual_start || phase.actual_end ? (
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="h-3.5 w-3.5" aria-hidden />
              Ist: {formatDate(phase.actual_start)} – {formatDate(phase.actual_end)}
            </span>
          ) : null}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {phase.status === "in_progress" && elapsed !== null ? (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Fortschritt (geplant)</span>
              <span>{elapsed}%</span>
            </div>
            <Progress value={elapsed} aria-label={`Phasenfortschritt: ${elapsed}%`} />
          </div>
        ) : null}

        {phase.description ? (
          <p className="whitespace-pre-wrap text-sm text-muted-foreground">
            {phase.description}
          </p>
        ) : null}

        {/* Compliance warnings (PROJ-18) */}
        <PhaseComplianceWarnings projectId={projectId} phaseId={phase.id} />

        {/* Milestones */}
        <section aria-label="Meilensteine in dieser Phase" className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">Meilensteine</h3>
            {canEdit ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setNewMilestoneOpen(true)}
              >
                <Plus className="mr-1 h-4 w-4" aria-hidden />
                Hinzufügen
              </Button>
            ) : null}
          </div>
          {milestones.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Keine Meilensteine in dieser Phase.
            </p>
          ) : (
            <div className="space-y-2">
              {milestones.map((m) => (
                <MilestoneCard
                  key={m.id}
                  projectId={projectId}
                  milestone={m}
                  onChanged={handleChanged}
                />
              ))}
            </div>
          )}
        </section>

        {/* Work packages — live list of WPs assigned to this phase. */}
        <section
          aria-label="Arbeitspakete in dieser Phase"
          className="space-y-2"
        >
          <div className="flex items-center justify-between">
            <h3 className="inline-flex items-center gap-2 text-sm font-medium">
              <ListTree className="h-4 w-4" aria-hidden />
              Arbeitspakete ({phaseWorkItems.length})
            </h3>
            <Link
              href={backlogHref}
              className="text-xs text-primary underline-offset-4 hover:underline"
            >
              Im Backlog öffnen
            </Link>
          </div>
          {phaseWorkItems.length === 0 ? (
            <p className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              Keine Arbeitspakete dieser Phase zugeordnet. Im Backlog kannst du
              Pakete dieser Phase zuweisen.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {phaseWorkItems.map((wp) => (
                <PhaseWorkItemRow
                  key={wp.id}
                  projectId={projectId}
                  workItem={wp}
                  canEdit={canEdit}
                  onChanged={onChanged}
                />
              ))}
            </ul>
          )}
        </section>
      </CardContent>

      <EditPhaseDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        projectId={projectId}
        phase={phase}
        onSaved={onChanged}
      />
      <PhaseStatusTransitionDialog
        open={statusOpen}
        onOpenChange={setStatusOpen}
        projectId={projectId}
        phaseId={phase.id}
        phaseName={phase.name}
        currentStatus={phase.status}
        onTransitioned={onChanged}
      />
      <DeletePhaseDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        projectId={projectId}
        phaseId={phase.id}
        phaseName={phase.name}
        onDeleted={onChanged}
      />
      <NewMilestoneDialog
        open={newMilestoneOpen}
        onOpenChange={setNewMilestoneOpen}
        projectId={projectId}
        initialPhaseId={phase.id}
        onCreated={handleChanged}
      />
    </Card>
  )
}

function formatDate(iso: string | null): string {
  if (!iso) return "—"
  const [yearStr, monthStr, dayStr] = iso.slice(0, 10).split("-")
  const year = Number(yearStr)
  const month = Number(monthStr)
  const day = Number(dayStr)
  if (!year || !month || !day) return "—"
  return new Date(year, month - 1, day).toLocaleDateString("de-DE", {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

/**
 * Returns 0–100 elapsed percent of the phase's planned window, or `null`
 * if either bound is missing or the window is degenerate.
 */
function computeElapsedPercent(phase: Phase): number | null {
  if (!phase.planned_start || !phase.planned_end) return null
  const start = parseIso(phase.planned_start)
  const end = parseIso(phase.planned_end)
  if (!start || !end) return null
  const total = end.getTime() - start.getTime()
  if (total <= 0) return 100
  const now = Date.now()
  if (now <= start.getTime()) return 0
  if (now >= end.getTime()) return 100
  return Math.round(((now - start.getTime()) / total) * 100)
}

function parseIso(value: string): Date | null {
  const [yearStr, monthStr, dayStr] = value.slice(0, 10).split("-")
  const year = Number(yearStr)
  const month = Number(monthStr)
  const day = Number(dayStr)
  if (!year || !month || !day) return null
  return new Date(year, month - 1, day)
}

interface PhaseWorkItemRowProps {
  projectId: string
  workItem: WorkItemWithProfile
  canEdit: boolean
  onChanged: () => void | Promise<void>
}

/**
 * Compact row for one WP inside a PhaseCard's work-items section.
 * Click on title → opens detail-drawer (via project-room navigation).
 * Click on "X" → unassigns WP from this phase (PATCH phase_id: null).
 */
function PhaseWorkItemRow({
  projectId,
  workItem,
  canEdit,
  onChanged,
}: PhaseWorkItemRowProps) {
  const [pending, setPending] = React.useState(false)

  const handleRemove = React.useCallback(async () => {
    setPending(true)
    try {
      const res = await fetch(
        `/api/projects/${projectId}/work-items/${workItem.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phase_id: null }),
        },
      )
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: { message?: string }
        } | null
        throw new Error(
          body?.error?.message ?? `Fehler ${res.status} beim Entfernen aus Phase`,
        )
      }
      toast.success("Aus Phase entfernt", {
        description: workItem.title,
      })
      await onChanged()
    } catch (err) {
      toast.error("Konnte Arbeitspaket nicht aus Phase entfernen", {
        description: err instanceof Error ? err.message : String(err),
      })
    } finally {
      setPending(false)
    }
  }, [projectId, workItem.id, workItem.title, onChanged])

  // PROJ-43-α follow-up — show planned dates so saved values are visible
  // here, not only in the Gantt or the Edit-Dialog. Falls back to the
  // PROJ-36 rolled-up derived values when own dates are unset.
  const displayStart =
    workItem.planned_start ?? workItem.derived_planned_start ?? null
  const displayEnd =
    workItem.planned_end ?? workItem.derived_planned_end ?? null
  const isDerived =
    !workItem.planned_start && !!workItem.derived_planned_start

  return (
    <li
      className={cn(
        "flex items-center gap-2 rounded-md border bg-card px-3 py-1.5 text-sm",
        pending && "opacity-60",
      )}
    >
      <WorkItemKindBadge kind={workItem.kind} iconOnly />
      <span className="flex-1 truncate font-medium">{workItem.title}</span>
      {displayStart || displayEnd ? (
        <span
          className={cn(
            "whitespace-nowrap text-xs text-muted-foreground",
            isDerived && "italic",
          )}
          title={
            isDerived
              ? "Aus Kind-Elementen abgeleitet (Roll-up)"
              : "Eigenes Start- und End-Datum"
          }
        >
          {formatDate(displayStart)} – {formatDate(displayEnd)}
        </span>
      ) : null}
      <WorkItemStatusBadge status={workItem.status} />
      {canEdit ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0"
          aria-label={`„${workItem.title}" aus dieser Phase entfernen`}
          title="Aus Phase entfernen"
          disabled={pending}
          onClick={handleRemove}
        >
          <X className="h-3.5 w-3.5" aria-hidden />
        </Button>
      ) : null}
    </li>
  )
}
