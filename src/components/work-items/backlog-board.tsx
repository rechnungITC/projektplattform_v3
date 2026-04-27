"use client"

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
  WORK_ITEM_STATUS_LABELS,
  WORK_ITEM_STATUSES,
  type WorkItemStatus,
  type WorkItemWithProfile,
} from "@/types/work-item"

import { WorkItemKindBadge } from "./work-item-kind-badge"
import { WorkItemPriorityBadge } from "./work-item-priority-badge"

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

export function BacklogBoard({
  projectId,
  items,
  loading,
  onSelect,
  onChanged,
}: BacklogBoardProps) {
  const canEdit = useProjectAccess(projectId, "edit_master")

  const grouped = React.useMemo(() => {
    const out: Record<WorkItemStatus, WorkItemWithProfile[]> = {
      todo: [],
      in_progress: [],
      blocked: [],
      done: [],
      cancelled: [],
    }
    for (const it of items) {
      out[it.status].push(it)
    }
    return out
  }, [items])

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

  return (
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
          projectId={projectId}
          canEdit={canEdit}
          onSelect={onSelect}
          onChanged={onChanged}
        />
      ))}
    </div>
  )
}

interface BoardColumnProps {
  status: WorkItemStatus
  items: WorkItemWithProfile[]
  projectId: string
  canEdit: boolean
  onSelect: (id: string) => void
  onChanged: () => void | Promise<void>
}

function BoardColumn({
  status,
  items,
  projectId,
  canEdit,
  onSelect,
  onChanged,
}: BoardColumnProps) {
  return (
    <section
      role="listitem"
      aria-label={`Spalte ${WORK_ITEM_STATUS_LABELS[status]}`}
      className="flex min-h-32 flex-col rounded-md border bg-muted/30"
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
              projectId={projectId}
              item={item}
              canEdit={canEdit}
              onSelect={onSelect}
              onChanged={onChanged}
            />
          ))
        )}
      </div>
    </section>
  )
}

interface BoardCardProps {
  projectId: string
  item: WorkItemWithProfile
  canEdit: boolean
  onSelect: (id: string) => void
  onChanged: () => void | Promise<void>
}

function BoardCard({
  projectId,
  item,
  canEdit,
  onSelect,
  onChanged,
}: BoardCardProps) {
  const [moving, setMoving] = React.useState<"prev" | "next" | null>(null)

  const currentIndex = COLUMN_ORDER.indexOf(item.status)
  const prevStatus = currentIndex > 0 ? COLUMN_ORDER[currentIndex - 1] : null
  const nextStatus =
    currentIndex < COLUMN_ORDER.length - 1
      ? COLUMN_ORDER[currentIndex + 1]
      : null

  const move = async (direction: "prev" | "next") => {
    const target = direction === "prev" ? prevStatus : nextStatus
    if (!target) return
    setMoving(direction)
    try {
      const response = await fetch(
        `/api/projects/${projectId}/work-items/${item.id}/status`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: target }),
        }
      )

      if (response.status === 404) {
        toast.warning("Endpoint kommt mit /backend", {
          description:
            "PATCH /api/projects/[id]/work-items/[wid]/status ist noch nicht implementiert.",
        })
        return
      }

      if (!response.ok) {
        const message = await safeReadError(response)
        toast.error("Status konnte nicht geändert werden", {
          description: message,
        })
        return
      }

      toast.success("Status geändert", {
        description: `${item.title} → ${WORK_ITEM_STATUS_LABELS[target]}.`,
      })
      await onChanged()
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unerwarteter Fehler"
      toast.error("Status konnte nicht geändert werden", { description: message })
    } finally {
      setMoving(null)
    }
  }

  return (
    <Card
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
        item.status === "cancelled" && "opacity-70"
      )}
      aria-label={`Work Item: ${item.title}`}
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
                disabled={!prevStatus || moving !== null}
                aria-label={
                  prevStatus
                    ? `Nach ${WORK_ITEM_STATUS_LABELS[prevStatus]}`
                    : "Schon in der ersten Spalte"
                }
                onClick={(event) => {
                  event.stopPropagation()
                  void move("prev")
                }}
              >
                {moving === "prev" ? (
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
                disabled={!nextStatus || moving !== null}
                aria-label={
                  nextStatus
                    ? `Nach ${WORK_ITEM_STATUS_LABELS[nextStatus]}`
                    : "Schon in der letzten Spalte"
                }
                onClick={(event) => {
                  event.stopPropagation()
                  void move("next")
                }}
              >
                {moving === "next" ? (
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
