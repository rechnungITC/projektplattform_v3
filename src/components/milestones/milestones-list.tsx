"use client"

import { AlertTriangle, MoreHorizontal, Pencil, Trash2 } from "lucide-react"
import * as React from "react"

import { DeleteMilestoneDialog } from "@/components/milestones/delete-milestone-dialog"
import { EditMilestoneDialog } from "@/components/milestones/edit-milestone-dialog"
import { MilestoneStatusBadge } from "@/components/milestones/milestone-status-badge"
import { MilestoneStatusDialog } from "@/components/milestones/milestone-status-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useMilestones } from "@/hooks/use-milestones"
import { useProjectAccess } from "@/hooks/use-project-access"
import { cn } from "@/lib/utils"
import {
  isOverdue,
  MILESTONE_STATUS_LABELS,
  MILESTONE_STATUSES,
  type Milestone,
  type MilestoneStatus,
} from "@/types/milestone"
import type { Phase } from "@/types/phase"

const ALL_PHASES_VALUE = "__all__"
const NO_PHASE_VALUE = "__none__"
const ALL_STATUSES_VALUE = "__all__"

interface MilestonesListProps {
  projectId: string
  phases: Phase[]
}

export function MilestonesList({ projectId, phases }: MilestonesListProps) {
  const canEdit = useProjectAccess(projectId, "edit_master")
  const canTransition = useProjectAccess(projectId, "transition")

  const [phaseFilter, setPhaseFilter] = React.useState<string>(ALL_PHASES_VALUE)
  const [statusFilter, setStatusFilter] =
    React.useState<string>(ALL_STATUSES_VALUE)
  const [overdueOnly, setOverdueOnly] = React.useState(false)

  const phaseIdOption = React.useMemo<string | null | undefined>(() => {
    if (phaseFilter === ALL_PHASES_VALUE) return undefined
    if (phaseFilter === NO_PHASE_VALUE) return null
    return phaseFilter
  }, [phaseFilter])

  const statusOption = React.useMemo<MilestoneStatus | undefined>(() => {
    if (statusFilter === ALL_STATUSES_VALUE) return undefined
    return statusFilter as MilestoneStatus
  }, [statusFilter])

  const { milestones, loading, refresh } = useMilestones(projectId, {
    phaseId: phaseIdOption,
    status: statusOption,
    overdueOnly,
  })

  const phaseLabelById = React.useMemo(() => {
    const map = new Map<string, string>()
    for (const p of phases) {
      map.set(p.id, `${p.sequence_number}. ${p.name}`)
    }
    return map
  }, [phases])

  const [editTarget, setEditTarget] = React.useState<Milestone | null>(null)
  const [deleteTarget, setDeleteTarget] = React.useState<Milestone | null>(null)
  const [statusTarget, setStatusTarget] = React.useState<Milestone | null>(null)

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="space-y-1">
          <Label className="text-xs uppercase text-muted-foreground">
            Phase
          </Label>
          <Select value={phaseFilter} onValueChange={setPhaseFilter}>
            <SelectTrigger className="w-full sm:w-56">
              <SelectValue placeholder="Phase wählen" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_PHASES_VALUE}>Alle Phasen</SelectItem>
              <SelectItem value={NO_PHASE_VALUE}>Keine Phase</SelectItem>
              {phases.map((phase) => (
                <SelectItem key={phase.id} value={phase.id}>
                  {phase.sequence_number}. {phase.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label className="text-xs uppercase text-muted-foreground">
            Status
          </Label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-44">
              <SelectValue placeholder="Status wählen" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_STATUSES_VALUE}>Alle Status</SelectItem>
              {MILESTONE_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {MILESTONE_STATUS_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2 sm:pb-1">
          <Switch
            id="milestones-overdue-only"
            checked={overdueOnly}
            onCheckedChange={setOverdueOnly}
          />
          <Label htmlFor="milestones-overdue-only" className="text-sm">
            Nur überfällige
          </Label>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2" role="status" aria-label="Lädt Meilensteine">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : milestones.length === 0 ? (
        <div className="rounded-md border border-dashed bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
          Keine Meilensteine, die zu den Filtern passen.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Zieldatum</TableHead>
                <TableHead className="hidden sm:table-cell">Status</TableHead>
                <TableHead className="hidden md:table-cell">Phase</TableHead>
                <TableHead className="hidden md:table-cell">
                  Ist-Datum
                </TableHead>
                <TableHead className="w-12 text-right">
                  <span className="sr-only">Aktionen</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {milestones.map((m) => {
                const overdue = isOverdue(m)
                return (
                  <TableRow
                    key={m.id}
                    className={cn(overdue && "bg-destructive/5")}
                  >
                    <TableCell className="break-words font-medium">
                      <div className="flex flex-col gap-1">
                        <span>{m.name}</span>
                        <div className="flex flex-wrap gap-1 sm:hidden">
                          <MilestoneStatusBadge status={m.status} />
                          {overdue ? <OverdueBadge /> : null}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span>{formatDate(m.target_date)}</span>
                        {overdue ? (
                          <span className="hidden sm:inline-flex">
                            <OverdueBadge />
                          </span>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <MilestoneStatusBadge status={m.status} />
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                      {m.phase_id ? (
                        <Badge variant="outline" className="text-xs">
                          {phaseLabelById.get(m.phase_id) ?? "Unbekannt"}
                        </Badge>
                      ) : (
                        <span className="italic">—</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                      {m.actual_date ? formatDate(m.actual_date) : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {canEdit || canTransition ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              size="icon"
                              variant="ghost"
                              aria-label={`Aktionen für „${m.name}"`}
                            >
                              <MoreHorizontal
                                className="h-4 w-4"
                                aria-hidden
                              />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-44">
                            {canTransition ? (
                              <DropdownMenuItem
                                onSelect={(event) => {
                                  event.preventDefault()
                                  setStatusTarget(m)
                                }}
                              >
                                Status ändern
                              </DropdownMenuItem>
                            ) : null}
                            {canEdit ? (
                              <DropdownMenuItem
                                onSelect={(event) => {
                                  event.preventDefault()
                                  setEditTarget(m)
                                }}
                              >
                                <Pencil
                                  className="mr-2 h-4 w-4"
                                  aria-hidden
                                />
                                Bearbeiten
                              </DropdownMenuItem>
                            ) : null}
                            {canEdit ? <DropdownMenuSeparator /> : null}
                            {canEdit ? (
                              <DropdownMenuItem
                                onSelect={(event) => {
                                  event.preventDefault()
                                  setDeleteTarget(m)
                                }}
                                className="text-destructive focus:text-destructive"
                              >
                                <Trash2
                                  className="mr-2 h-4 w-4"
                                  aria-hidden
                                />
                                Löschen
                              </DropdownMenuItem>
                            ) : null}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : null}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {editTarget ? (
        <EditMilestoneDialog
          open={editTarget !== null}
          onOpenChange={(open) => {
            if (!open) setEditTarget(null)
          }}
          projectId={projectId}
          milestone={editTarget}
          onSaved={refresh}
        />
      ) : null}
      {deleteTarget ? (
        <DeleteMilestoneDialog
          open={deleteTarget !== null}
          onOpenChange={(open) => {
            if (!open) setDeleteTarget(null)
          }}
          projectId={projectId}
          milestoneId={deleteTarget.id}
          milestoneName={deleteTarget.name}
          onDeleted={refresh}
        />
      ) : null}
      {statusTarget ? (
        <MilestoneStatusDialog
          open={statusTarget !== null}
          onOpenChange={(open) => {
            if (!open) setStatusTarget(null)
          }}
          projectId={projectId}
          milestoneId={statusTarget.id}
          milestoneName={statusTarget.name}
          currentStatus={statusTarget.status}
          initialActualDate={statusTarget.actual_date}
          onTransitioned={refresh}
        />
      ) : null}
    </div>
  )
}

function OverdueBadge() {
  return (
    <Badge
      variant="outline"
      className="border-destructive/70 bg-destructive/10 text-destructive"
    >
      <AlertTriangle className="mr-1 h-3 w-3" aria-hidden />
      Überfällig
    </Badge>
  )
}

function formatDate(iso: string): string {
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
