"use client"

import { useDroppable } from "@dnd-kit/core"
import * as React from "react"

import { cn } from "@/lib/utils"
import type { Sprint } from "@/types/sprint"

import { SprintCard } from "./sprint-card"

/**
 * PROJ-25b — wraps SprintCard as a drop target.
 *
 * Visual states:
 *   • idle, droppable          → no extra outline
 *   • idle, closed (rejecting) → no outline (closed-cards aren't dragged-on)
 *   • hover, droppable         → blue ring (drop will accept)
 *   • hover, closed            → red ring + cursor:not-allowed (drop rejected)
 *
 * The droppable id is `sprint:<sprint.id>`; the BacklogDndProvider parses
 * that prefix to resolve the target sprint.
 */
interface DroppableSprintCardProps {
  projectId: string
  sprint: Sprint
  onChanged: () => void | Promise<void>
  refreshKey?: number
}

export function DroppableSprintCard({
  projectId,
  sprint,
  onChanged,
  refreshKey = 0,
}: DroppableSprintCardProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: `sprint:${sprint.id}`,
    data: { type: "sprint", state: sprint.state },
  })
  const isClosed = sprint.state === "closed"

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "rounded-lg transition-shadow",
        isOver && !isClosed && "ring-2 ring-primary ring-offset-2",
        isOver && isClosed && "cursor-not-allowed ring-2 ring-destructive ring-offset-2"
      )}
      aria-label={`Sprint ${sprint.name} (${sprint.state}) — Drop-Target`}
    >
      <SprintCard
        projectId={projectId}
        sprint={sprint}
        onChanged={onChanged}
        refreshKey={refreshKey}
      />
    </div>
  )
}
