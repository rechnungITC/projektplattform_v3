"use client"

import {
  CalendarDays,
  MoreHorizontal,
  Pencil,
  PlayCircle,
  Trash2,
} from "lucide-react"
import * as React from "react"

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
import { useProjectAccess } from "@/hooks/use-project-access"
import { useWorkItems } from "@/hooks/use-work-items"
import { cn } from "@/lib/utils"
import type { Sprint } from "@/types/sprint"

import { WorkItemKindBadge } from "../work-items/work-item-kind-badge"
import { WorkItemPriorityBadge } from "../work-items/work-item-priority-badge"
import { WorkItemStatusBadge } from "../work-items/work-item-status-badge"
import { EditSprintDialog } from "./edit-sprint-dialog"
import { SprintStateBadge } from "./sprint-state-badge"
import { SprintStateDialog } from "./sprint-state-dialog"

interface SprintCardProps {
  projectId: string
  sprint: Sprint
  onChanged: () => void | Promise<void>
}

export function SprintCard({
  projectId,
  sprint,
  onChanged,
}: SprintCardProps) {
  const canEdit = useProjectAccess(projectId, "edit_master")
  const canTransition = useProjectAccess(projectId, "transition")

  const [editOpen, setEditOpen] = React.useState(false)
  const [stateOpen, setStateOpen] = React.useState(false)

  const { items } = useWorkItems(projectId, { sprintId: sprint.id })

  const isActive = sprint.state === "active"
  const visibleItems = items.slice(0, 6)
  const hiddenItemCount = items.length - visibleItems.length

  return (
    <Card
      className={cn(
        "transition-colors",
        isActive && "border-primary/50 bg-primary/5"
      )}
    >
      <CardHeader className="space-y-2 pb-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-1">
            <CardTitle className="flex items-center gap-2 text-base">
              {isActive ? (
                <span
                  className="inline-block h-2 w-2 animate-pulse rounded-full bg-primary"
                  aria-label="Sprint läuft"
                />
              ) : null}
              <span className="truncate">{sprint.name}</span>
            </CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <SprintStateBadge state={sprint.state} />
              <span className="text-xs text-muted-foreground">
                {items.length}{" "}
                {items.length === 1 ? "Item" : "Items"}
              </span>
            </div>
          </div>
          {canEdit ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Aktionen für ${sprint.name}`}
                >
                  <MoreHorizontal className="h-4 w-4" aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
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
                      setStateOpen(true)
                    }}
                  >
                    <PlayCircle className="mr-2 h-4 w-4" aria-hidden />
                    Status ändern
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  disabled
                >
                  <Trash2 className="mr-2 h-4 w-4" aria-hidden />
                  Löschen (PROJ-9 backend)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
        {sprint.start_date || sprint.end_date ? (
          <CardDescription className="inline-flex items-center gap-1 text-xs">
            <CalendarDays className="h-3.5 w-3.5" aria-hidden />
            {formatDate(sprint.start_date)} – {formatDate(sprint.end_date)}
          </CardDescription>
        ) : null}
      </CardHeader>
      {sprint.goal || visibleItems.length > 0 ? (
        <CardContent className="space-y-3 pt-0">
          {sprint.goal ? (
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">
              {sprint.goal}
            </p>
          ) : null}
          {visibleItems.length > 0 ? (
            <div className="space-y-1.5" aria-label="Zugeordnete Sprint-Items">
              {visibleItems.map((item) => (
                <div
                  key={item.id}
                  className="flex min-w-0 items-center gap-2 rounded-md border bg-background px-2 py-1.5"
                >
                  <WorkItemKindBadge kind={item.kind} />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {item.title}
                  </span>
                  <div className="hidden shrink-0 sm:block">
                    <WorkItemPriorityBadge priority={item.priority} />
                  </div>
                  <WorkItemStatusBadge status={item.status} />
                </div>
              ))}
              {hiddenItemCount > 0 ? (
                <p className="px-1 text-xs text-muted-foreground">
                  +{hiddenItemCount} weitere Items
                </p>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      ) : null}

      <EditSprintDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        projectId={projectId}
        sprint={sprint}
        onSaved={onChanged}
      />
      <SprintStateDialog
        open={stateOpen}
        onOpenChange={setStateOpen}
        projectId={projectId}
        sprint={sprint}
        onChanged={onChanged}
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
