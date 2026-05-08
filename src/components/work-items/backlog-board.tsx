"use client"

import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core"
import { ArrowLeft, ArrowRight, Loader2 } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { useProjectAccess } from "@/hooks/use-project-access"
import { cn } from "@/lib/utils"
import {
  WORK_ITEM_KIND_LABELS,
  WORK_ITEM_STATUS_LABELS,
  WORK_ITEM_STATUSES,
  type WorkItemKind,
  type WorkItemStatus,
  type WorkItemWithProfile,
} from "@/types/work-item"

import { WorkItemKindBadge } from "./work-item-kind-badge"
import { WorkItemPriorityBadge } from "./work-item-priority-badge"
import { WorkItemStatusBadge } from "./work-item-status-badge"

interface BacklogBoardProps {
  projectId: string
  items: WorkItemWithProfile[]
  loading: boolean
  onSelect: (id: string) => void
  onChanged: () => void | Promise<void>
}

const COLUMN_ORDER: WorkItemStatus[] = [
  "todo",
  "in_progress",
  "blocked",
  "done",
  "cancelled",
]

const DRAGGABLE_BOARD_KINDS: WorkItemKind[] = ["story", "task"]

function isBoardDraggable(item: WorkItemWithProfile): boolean {
  return DRAGGABLE_BOARD_KINDS.includes(item.kind)
}

export function BacklogBoard({
  projectId,
  items,
  loading,
  onSelect,
  onChanged,
}: BacklogBoardProps) {
  const canEdit = useProjectAccess(projectId, "edit_master")
  const [activeId, setActiveId] = React.useState<string | null>(null)
  const [movingId, setMovingId] = React.useState<string | null>(null)
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    })
  )

  const grouped = React.useMemo(() => {
    const out: Record<WorkItemStatus, WorkItemWithProfile[]> = {
      todo: [],
      in_progress: [],
      blocked: [],
      done: [],
      cancelled: [],
    }
    for (const it of items) {
      if (it.kind === "epic") continue
      out[it.status].push(it)
    }
    return out
  }, [items])

  const epics = React.useMemo(
    () => items.filter((it) => it.kind === "epic"),
    [items]
  )

  const itemsById = React.useMemo(() => {
    const map = new Map<string, WorkItemWithProfile>()
    for (const item of items) map.set(item.id, item)
    return map
  }, [items])

  const activeItem = activeId ? itemsById.get(activeId) ?? null : null

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3 lg:grid-cols-5">
        {COLUMN_ORDER.map((status) => (
          <Card key={status}>
            <CardContent className="space-y-3 p-3">
              <Skeleton className="h-5 w-1/2" />
              <Skeleton className="h-20" />
              <Skeleton className="h-20" />
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  const moveItemToStatus = async (
    item: WorkItemWithProfile,
    target: WorkItemStatus
  ) => {
    if (item.status === target) return
    setMovingId(item.id)
    try {
      const response = await fetch(
        `/api/projects/${projectId}/work-items/${item.id}/status`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: target }),
        }
      )

      if (!response.ok) {
        const message = await safeReadError(response)
        toast.error("Status konnte nicht geändert werden", {
          description: message,
        })
        return
      }

      toast.success("Status geändert", {
        description: `${item.title} -> ${WORK_ITEM_STATUS_LABELS[target]}.`,
      })
      await onChanged()
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unerwarteter Fehler"
      toast.error("Status konnte nicht geändert werden", { description: message })
    } finally {
      setMovingId(null)
    }
  }

  const handleDragStart = (event: DragStartEvent) => {
    const item = itemsById.get(String(event.active.id))
    if (!item || !isBoardDraggable(item)) return
    setActiveId(item.id)
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    const item = itemsById.get(String(event.active.id))
    setActiveId(null)
    if (!item || !isBoardDraggable(item)) return
    const target = event.over?.id ? String(event.over.id) : null
    if (!target || !WORK_ITEM_STATUSES.includes(target as WorkItemStatus)) return
    await moveItemToStatus(item, target as WorkItemStatus)
  }

  const handleDragCancel = () => {
    setActiveId(null)
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="space-y-3">
        {epics.length > 0 ? (
          <StaticEpicList epics={epics} onSelect={onSelect} />
        ) : null}
        <div
          className="grid grid-cols-1 gap-3 md:grid-cols-3 lg:grid-cols-5"
          role="list"
          aria-label="Backlog-Board"
        >
          {COLUMN_ORDER.map((status) => (
            <BoardColumn
              key={status}
              status={status}
              items={grouped[status]}
              canEdit={canEdit}
              movingId={movingId}
              onSelect={onSelect}
              onMove={moveItemToStatus}
            />
          ))}
        </div>
      </div>
      <DragOverlay>
        {activeItem ? <BoardCardPreview item={activeItem} /> : null}
      </DragOverlay>
    </DndContext>
  )
}

interface StaticEpicListProps {
  epics: WorkItemWithProfile[]
  onSelect: (id: string) => void
}

function StaticEpicList({ epics, onSelect }: StaticEpicListProps) {
  return (
    <section className="rounded-md border bg-muted/30" aria-label="Epics">
      <header className="flex items-center justify-between border-b px-3 py-2">
        <h3 className="text-sm font-semibold">Epics</h3>
        <span className="rounded-full bg-background px-2 py-0.5 text-xs font-medium text-muted-foreground">
          {epics.length}
        </span>
      </header>
      <div className="grid gap-2 p-2 md:grid-cols-2 xl:grid-cols-3">
        {epics.map((epic) => (
          <button
            key={epic.id}
            type="button"
            onClick={() => onSelect(epic.id)}
            className="rounded-md border bg-card p-3 text-left transition-colors hover:border-primary/40"
            aria-label={`Epic: ${epic.title}`}
          >
            <div className="mb-2 flex items-start justify-between gap-2">
              <WorkItemKindBadge kind={epic.kind} />
              <WorkItemPriorityBadge priority={epic.priority} />
            </div>
            <p className="line-clamp-2 break-words text-sm font-medium">
              {epic.title}
            </p>
            <div className="mt-2">
              <WorkItemStatusBadge status={epic.status} />
            </div>
          </button>
        ))}
      </div>
    </section>
  )
}

interface BoardColumnProps {
  status: WorkItemStatus
  items: WorkItemWithProfile[]
  canEdit: boolean
  movingId: string | null
  onSelect: (id: string) => void
  onMove: (item: WorkItemWithProfile, status: WorkItemStatus) => Promise<void>
}

function BoardColumn({
  status,
  items,
  canEdit,
  movingId,
  onSelect,
  onMove,
}: BoardColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: status })

  return (
    <section
      ref={setNodeRef}
      role="listitem"
      aria-label={`Spalte ${WORK_ITEM_STATUS_LABELS[status]}`}
      className={cn(
        "flex min-h-32 flex-col rounded-md border bg-muted/30 transition-colors",
        isOver && "border-primary bg-primary/5"
      )}
    >
      <header className="flex items-center justify-between border-b px-3 py-2">
        <h3 className="text-sm font-semibold">
          {WORK_ITEM_STATUS_LABELS[status]}
        </h3>
        <span className="rounded-full bg-background px-2 py-0.5 text-xs font-medium text-muted-foreground">
          {items.length}
        </span>
      </header>
      <div className="space-y-2 overflow-y-auto p-2">
        {items.length === 0 ? (
          <p className="px-2 py-4 text-center text-xs text-muted-foreground">
            Keine Einträge
          </p>
        ) : (
          items.map((item) => (
            <BoardCard
              key={item.id}
              item={item}
              canEdit={canEdit}
              moving={movingId === item.id}
              onSelect={onSelect}
              onMove={onMove}
            />
          ))
        )}
      </div>
    </section>
  )
}

interface BoardCardProps {
  item: WorkItemWithProfile
  canEdit: boolean
  moving: boolean
  onSelect: (id: string) => void
  onMove: (item: WorkItemWithProfile, status: WorkItemStatus) => Promise<void>
}

function BoardCard({
  item,
  canEdit,
  moving,
  onSelect,
  onMove,
}: BoardCardProps) {
  const currentIndex = COLUMN_ORDER.indexOf(item.status)
  const prevStatus = currentIndex > 0 ? COLUMN_ORDER[currentIndex - 1] : null
  const nextStatus =
    currentIndex < COLUMN_ORDER.length - 1
      ? COLUMN_ORDER[currentIndex + 1]
      : null
  const draggable = canEdit && isBoardDraggable(item)
  const { listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: item.id,
    disabled: !draggable,
    data: { kind: item.kind, status: item.status },
  })

  const move = async (direction: "prev" | "next") => {
    const target = direction === "prev" ? prevStatus : nextStatus
    if (!target) return
    await onMove(item, target)
  }

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
      }
    : undefined

  return (
    <Card
      ref={setNodeRef}
      style={style}
      role="button"
      tabIndex={0}
      onClick={() => onSelect(item.id)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault()
          onSelect(item.id)
        }
      }}
      className={cn(
        "cursor-pointer transition-colors hover:border-primary/40",
        draggable && "cursor-grab active:cursor-grabbing",
        isDragging && "opacity-40",
        item.status === "cancelled" && "opacity-70"
      )}
      aria-label={
        draggable
          ? `${WORK_ITEM_KIND_LABELS[item.kind]} '${item.title}' verschieben`
          : `Work Item: ${item.title}`
      }
      {...(draggable ? listeners : {})}
    >
      <CardContent className="space-y-2 p-3">
        <div className="flex items-start justify-between gap-2">
          <WorkItemKindBadge kind={item.kind} />
          <WorkItemPriorityBadge priority={item.priority} />
        </div>
        <p className="line-clamp-3 break-words text-sm font-medium">
          {item.title}
        </p>
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            {item.responsible_user_id ? (
              <Avatar className="h-6 w-6 shrink-0">
                <AvatarFallback className="text-xs">
                  {(item.responsible_display_name ??
                    item.responsible_email ??
                    "?")
                    .slice(0, 2)
                    .toUpperCase()}
                </AvatarFallback>
              </Avatar>
            ) : null}
            <span className="truncate text-xs text-muted-foreground">
              {item.responsible_display_name ??
                item.responsible_email ??
                "Niemand"}
            </span>
          </div>
          {canEdit ? (
            <div className="flex shrink-0 gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                disabled={!prevStatus || moving}
                aria-label={
                  prevStatus
                    ? `Nach ${WORK_ITEM_STATUS_LABELS[prevStatus]}`
                    : "Schon in der ersten Spalte"
                }
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation()
                  void move("prev")
                }}
              >
                {moving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                ) : (
                  <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
                )}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                disabled={!nextStatus || moving}
                aria-label={
                  nextStatus
                    ? `Nach ${WORK_ITEM_STATUS_LABELS[nextStatus]}`
                    : "Schon in der letzten Spalte"
                }
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation()
                  void move("next")
                }}
              >
                {moving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                ) : (
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                )}
              </Button>
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}

function BoardCardPreview({ item }: { item: WorkItemWithProfile }) {
  return (
    <div className="w-64">
      <BoardCardShell item={item} />
    </div>
  )
}

function BoardCardShell({ item }: { item: WorkItemWithProfile }) {
  return (
    <Card className="border-primary/40 bg-card shadow-lg">
      <CardContent className="space-y-2 p-3">
        <div className="flex items-start justify-between gap-2">
          <WorkItemKindBadge kind={item.kind} />
          <WorkItemPriorityBadge priority={item.priority} />
        </div>
        <p className="line-clamp-3 break-words text-sm font-medium">
          {item.title}
        </p>
        <WorkItemStatusBadge status={item.status} />
      </CardContent>
    </Card>
  )
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
