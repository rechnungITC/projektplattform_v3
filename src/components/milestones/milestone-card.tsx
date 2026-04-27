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
import { useProjectAccess } from "@/hooks/use-project-access"
import { cn } from "@/lib/utils"
import { isOverdue, type Milestone } from "@/types/milestone"

interface MilestoneCardProps {
  projectId: string
  milestone: Milestone
  /** Optional phase metadata for display (badge label). */
  phaseLabel?: string | null
  onChanged: () => void | Promise<void>
}

export function MilestoneCard({
  projectId,
  milestone,
  phaseLabel,
  onChanged,
}: MilestoneCardProps) {
  const canEdit = useProjectAccess(projectId, "edit_master")
  const canTransition = useProjectAccess(projectId, "transition")

  const [editOpen, setEditOpen] = React.useState(false)
  const [deleteOpen, setDeleteOpen] = React.useState(false)
  const [statusOpen, setStatusOpen] = React.useState(false)

  const overdue = isOverdue(milestone)

  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-md border bg-card p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between",
        overdue && "border-destructive/60 bg-destructive/5"
      )}
    >
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="break-words text-sm font-medium">{milestone.name}</p>
          <MilestoneStatusBadge status={milestone.status} />
          {phaseLabel ? (
            <Badge variant="outline" className="text-xs">
              {phaseLabel}
            </Badge>
          ) : null}
          {overdue ? (
            <Badge
              variant="outline"
              className="border-destructive/70 bg-destructive/10 text-destructive"
            >
              <AlertTriangle className="mr-1 h-3 w-3" aria-hidden />
              Überfällig
            </Badge>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">
          Ziel: {formatDate(milestone.target_date)}
          {milestone.actual_date
            ? ` · Ist: ${formatDate(milestone.actual_date)}`
            : ""}
        </p>
      </div>
      {canEdit || canTransition ? (
        <div className="flex shrink-0 items-center gap-2">
          {canTransition ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setStatusOpen(true)}
            >
              Status
            </Button>
          ) : null}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                aria-label={`Aktionen für „${milestone.name}"`}
              >
                <MoreHorizontal className="h-4 w-4" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              {canEdit ? (
                <DropdownMenuItem
                  onSelect={(event) => {
                    event.preventDefault()
                    setEditOpen(true)
                  }}
                >
                  <Pencil className="mr-2 h-4 w-4" aria-hidden />
                  Bearbeiten
                </DropdownMenuItem>
              ) : null}
              {canEdit ? <DropdownMenuSeparator /> : null}
              {canEdit ? (
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
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ) : null}

      <EditMilestoneDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        projectId={projectId}
        milestone={milestone}
        onSaved={onChanged}
      />
      <DeleteMilestoneDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        projectId={projectId}
        milestoneId={milestone.id}
        milestoneName={milestone.name}
        onDeleted={onChanged}
      />
      <MilestoneStatusDialog
        open={statusOpen}
        onOpenChange={setStatusOpen}
        projectId={projectId}
        milestoneId={milestone.id}
        milestoneName={milestone.name}
        currentStatus={milestone.status}
        initialActualDate={milestone.actual_date}
        onTransitioned={onChanged}
      />
    </div>
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
    month: "long",
    day: "numeric",
  })
}
