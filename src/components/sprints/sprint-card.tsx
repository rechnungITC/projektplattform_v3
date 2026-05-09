"use client"

import { useDraggable, useDroppable } from "@dnd-kit/core"
import {
  CalendarDays,
  GripVertical,
  MoreHorizontal,
  Pencil,
  PlayCircle,
  Trash2,
} from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

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
import { Input } from "@/components/ui/input"
import { useProjectAccess } from "@/hooks/use-project-access"
import { useWorkItems } from "@/hooks/use-work-items"
import { sprintItemDropId } from "@/lib/work-items/drop-intent"
import { cn } from "@/lib/utils"
import type { Sprint } from "@/types/sprint"
import type { WorkItemWithProfile } from "@/types/work-item"

import { useBacklogDndOptional } from "../work-items/backlog-dnd-provider"
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
  refreshKey?: number
}

export function SprintCard({
  projectId,
  sprint,
  onChanged,
  refreshKey = 0,
}: SprintCardProps) {
  const canEdit = useProjectAccess(projectId, "edit_master")
  const canTransition = useProjectAccess(projectId, "transition")

  const [editOpen, setEditOpen] = React.useState(false)
  const [stateOpen, setStateOpen] = React.useState(false)

  const { items, refresh } = useWorkItems(projectId, { sprintId: sprint.id })
  const lastRefreshKey = React.useRef(refreshKey)

  React.useEffect(() => {
    if (lastRefreshKey.current === refreshKey) return
    lastRefreshKey.current = refreshKey
    void refresh()
  }, [refresh, refreshKey])

  const isActive = sprint.state === "active"
  const visibleItems = items
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
                <SprintWorkItemRow
                  key={`${item.id}:${getStoryPoints(item) ?? ""}:${item.planned_start ?? ""}:${item.planned_end ?? ""}`}
                  projectId={projectId}
                  sprintId={sprint.id}
                  item={item}
                  onChanged={async () => {
                    await refresh()
                    await onChanged()
                  }}
                />
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

interface SprintWorkItemRowProps {
  projectId: string
  sprintId: string
  item: WorkItemWithProfile
  onChanged: () => void | Promise<void>
}

function SprintWorkItemRow(props: SprintWorkItemRowProps) {
  const dnd = useBacklogDndOptional()
  if (!dnd) return <SprintWorkItemRowContent {...props} />
  return <DraggableSprintWorkItemRow {...props} />
}

function DraggableSprintWorkItemRow({
  projectId,
  sprintId,
  item,
  onChanged,
}: SprintWorkItemRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef: setDragNodeRef,
    isDragging,
  } = useDraggable({
    id: item.id,
    data: { type: "sprint-work-item", kind: item.kind, sprintId },
  })
  const { setNodeRef: setDropNodeRef, isOver } = useDroppable({
    id: sprintItemDropId(sprintId, item.id),
    data: { type: "sprint-work-item-target", sprintId, workItemId: item.id },
  })
  const setNodeRef = React.useCallback(
    (node: HTMLDivElement | null) => {
      setDragNodeRef(node)
      setDropNodeRef(node)
    },
    [setDragNodeRef, setDropNodeRef]
  )

  return (
    <SprintWorkItemRowContent
      projectId={projectId}
      sprintId={sprintId}
      item={item}
      onChanged={onChanged}
      dragHandleProps={{ ...attributes, ...listeners }}
      ref={setNodeRef}
      className={cn(
        isDragging && "opacity-50",
        isOver && !isDragging && "ring-2 ring-primary ring-offset-1"
      )}
    />
  )
}

const SprintWorkItemRowContent = React.forwardRef<
  HTMLDivElement,
  SprintWorkItemRowProps & {
    className?: string
    dragHandleProps?: React.HTMLAttributes<HTMLButtonElement>
  }
>(function SprintWorkItemRowContent(
  { projectId, item, onChanged, className, dragHandleProps },
  ref
) {
  const [storyPoints, setStoryPoints] = React.useState(
    formatStoryPoints(getStoryPoints(item))
  )
  const [plannedStart, setPlannedStart] = React.useState(
    item.planned_start ?? ""
  )
  const [plannedEnd, setPlannedEnd] = React.useState(item.planned_end ?? "")
  const [saving, setSaving] = React.useState(false)

  const persist = async () => {
    const nextPoints = parseStoryPoints(storyPoints)
    const currentPoints = getStoryPoints(item)
    const nextStart = plannedStart || null
    const nextEnd = plannedEnd || null
    if (
      nextPoints === currentPoints &&
      nextStart === (item.planned_start ?? null) &&
      nextEnd === (item.planned_end ?? null)
    ) {
      return
    }
    setSaving(true)
    try {
      const attributes = { ...(item.attributes ?? {}) }
      if (nextPoints === null) delete attributes.story_points
      else attributes.story_points = nextPoints

      const response = await fetch(
        `/api/projects/${projectId}/work-items/${item.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            attributes,
            planned_start: nextStart,
            planned_end: nextEnd,
          }),
        }
      )
      if (!response.ok) {
        const message = await safeReadError(response)
        toast.error("Sprint-Planung konnte nicht gespeichert werden", {
          description: message,
        })
        return
      }
      await onChanged()
    } catch (err) {
      toast.error("Sprint-Planung konnte nicht gespeichert werden", {
        description: err instanceof Error ? err.message : "Unerwarteter Fehler",
      })
    } finally {
      setSaving(false)
    }
  }

  const stopDragFromInput = (event: React.SyntheticEvent) => {
    event.stopPropagation()
  }

  return (
    <div
      ref={ref}
      className={cn(
        "grid min-w-0 gap-2 rounded-md border bg-background px-2 py-1.5 transition-shadow",
        dragHandleProps
          ? "grid-cols-[auto_minmax(0,1fr)]"
          : "grid-cols-[minmax(0,1fr)]",
        saving && "opacity-70",
        className
      )}
    >
      {dragHandleProps ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 cursor-grab active:cursor-grabbing"
          aria-label={`Sprint-Item ${item.title} verschieben`}
          {...dragHandleProps}
        >
          <GripVertical className="h-4 w-4" aria-hidden />
        </Button>
      ) : null}
      <div className="min-w-0 space-y-1">
        <div className="flex min-w-0 items-center gap-2">
          <WorkItemKindBadge kind={item.kind} />
          <span className="min-w-0 flex-1 truncate text-sm font-medium">
            {item.title}
          </span>
          <div className="hidden shrink-0 sm:block">
            <WorkItemPriorityBadge priority={item.priority} />
          </div>
          <WorkItemStatusBadge status={item.status} />
        </div>
        <div
          className="flex flex-wrap items-center gap-2"
          onPointerDown={stopDragFromInput}
          onClick={stopDragFromInput}
        >
          <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
            SP
            <Input
              type="number"
              min="0"
              step="0.5"
              inputMode="decimal"
              className="h-7 w-16 px-2 text-xs"
              value={storyPoints}
              onChange={(event) => setStoryPoints(event.target.value)}
              onBlur={persist}
              disabled={saving}
              aria-label={`Story Points für ${item.title}`}
            />
          </label>
          <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
            Start
            <Input
              type="date"
              className="h-7 w-[8.5rem] px-2 text-xs"
              value={plannedStart}
              onChange={(event) => setPlannedStart(event.target.value)}
              onBlur={persist}
              disabled={saving}
              aria-label={`Startdatum für ${item.title}`}
            />
          </label>
          <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
            Ende
            <Input
              type="date"
              className="h-7 w-[8.5rem] px-2 text-xs"
              value={plannedEnd}
              onChange={(event) => setPlannedEnd(event.target.value)}
              onBlur={persist}
              disabled={saving}
              aria-label={`Enddatum für ${item.title}`}
            />
          </label>
        </div>
      </div>
    </div>
  )
})

function getStoryPoints(item: WorkItemWithProfile): number | null {
  const raw = item.attributes?.story_points
  if (typeof raw === "number" && Number.isFinite(raw)) return raw
  if (typeof raw === "string" && raw.trim() !== "") {
    const parsed = Number(raw)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function formatStoryPoints(value: number | null): string {
  return value === null ? "" : String(value)
}

function parseStoryPoints(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  const parsed = Number(trimmed.replace(",", "."))
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
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

async function safeReadError(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as {
      error?: string | { message?: string }
      message?: string
    }
    if (typeof data.error === "string") return data.error
    if (data.error && typeof data.error === "object") {
      return data.error.message ?? `Anfrage fehlgeschlagen (${response.status})`
    }
    return data.message ?? `Anfrage fehlgeschlagen (${response.status})`
  } catch {
    return `Anfrage fehlgeschlagen (${response.status})`
  }
}
