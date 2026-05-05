"use client"

import { useDraggable } from "@dnd-kit/core"
import { GripVertical } from "lucide-react"
import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * PROJ-25b — drag-handle for a story row (BacklogList or BacklogTree).
 *
 * Renders a Grip-Icon button. The button (not the surrounding row) is the
 * drag activator — keeps row-click for "open detail drawer" intact.
 *
 * Only render this for `kind === 'story'`; the spec says only stories are
 * sprint-droppable. Render nothing for other kinds.
 *
 * Keyboard semantics provided by @dnd-kit/core's KeyboardSensor:
 *   Space         — start drag
 *   Arrow ↑/↓     — move between drop targets
 *   Space         — confirm drop
 *   Escape        — cancel
 */
interface DraggableStoryHandleProps {
  workItemId: string
  storyTitle: string
  /** True when this row is part of the current selection (visual + announce). */
  selected?: boolean
  className?: string
}

export function DraggableStoryHandle({
  workItemId,
  storyTitle,
  selected = false,
  className,
}: DraggableStoryHandleProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: workItemId,
    data: { type: "story" },
  })

  return (
    <button
      ref={setNodeRef}
      type="button"
      aria-label={`Story '${storyTitle}' verschieben`}
      className={cn(
        "inline-flex h-6 w-6 cursor-grab items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        isDragging && "cursor-grabbing opacity-50",
        selected && "text-primary",
        className
      )}
      {...listeners}
      {...attributes}
    >
      <GripVertical className="h-4 w-4" aria-hidden />
    </button>
  )
}
