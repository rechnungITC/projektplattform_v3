"use client"

import { useDroppable } from "@dnd-kit/core"
import * as React from "react"

import { SPRINT_BACKLOG_DROP_ID } from "@/lib/work-items/drop-intent"
import { cn } from "@/lib/utils"

/**
 * PROJ-25b — droppable zone wrapping the entire backlog list/tree/board.
 *
 * Drop here = detach (sprint_id := null). Visible visual hint only when a
 * sprint→backlog drag is active; otherwise transparent.
 */
interface BacklogDropZoneProps {
  children: React.ReactNode
}

export function BacklogDropZone({ children }: BacklogDropZoneProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: SPRINT_BACKLOG_DROP_ID,
    data: { type: "backlog" },
  })

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "rounded-lg transition-all",
        isOver && "ring-2 ring-primary ring-offset-2"
      )}
      aria-label="Backlog — Drop hier um Story aus Sprint zu lösen"
    >
      {children}
    </div>
  )
}
