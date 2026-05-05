"use client"

import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core"
import * as React from "react"
import { toast } from "sonner"

import { useStorySelection } from "@/hooks/use-story-selection"
import type { Sprint } from "@/types/sprint"
import type { WorkItemWithProfile } from "@/types/work-item"

import { DragOverlayCard } from "./drag-overlay-card"

/**
 * PROJ-25b — DnD orchestration for the Backlog page.
 *
 * Owns:
 *   • multi-select state (Ctrl/Shift-Click) — `useStorySelection`
 *   • DndContext from @dnd-kit/core with Pointer + Keyboard sensors
 *   • drop handler: dispatches single-item PATCH or bulk-PATCH based on
 *     selection size, runs optimistic update, rolls back on failure
 *   • aria-live region for screen-reader drop announcements
 *
 * Drop semantics:
 *   - Drop on a Sprint card  → sprint_id := <sprint.id>
 *   - Drop on the Backlog zone → sprint_id := null (detach)
 *   - Drop on a closed sprint  → no-op (frontend gate; backend is
 *                                  defense-in-depth via 422 sprint_closed)
 *
 * Droppable IDs use a typed prefix: "sprint:<uuid>" or "backlog".
 * Draggable IDs are bare work-item UUIDs.
 */

interface BacklogDndContextValue {
  /** All currently visible story IDs in the order they are rendered. */
  orderedStoryIds: readonly string[]
  selectedIds: Set<string>
  isSelected: (id: string) => boolean
  toggle: (id: string) => void
  range: (id: string, ordered: readonly string[]) => void
  clear: () => void
  /** Set the announcement sent to the aria-live region. */
  announce: (message: string) => void
  /** Lookup helpers for the drop handler. */
  getItemById: (id: string) => WorkItemWithProfile | undefined
  getSprintById: (id: string) => Sprint | undefined
  /** True while a drag is in progress (rendered nodes can dim non-targets). */
  activeDragId: string | null
}

const Ctx = React.createContext<BacklogDndContextValue | null>(null)

export function useBacklogDnd(): BacklogDndContextValue {
  const value = React.useContext(Ctx)
  if (!value) {
    throw new Error(
      "useBacklogDnd must be used inside <BacklogDndProvider>"
    )
  }
  return value
}

/**
 * Optional variant — returns `null` when no provider is mounted. Used by
 * components that can render with OR without DnD (e.g. read-only embeds).
 */
export function useBacklogDndOptional(): BacklogDndContextValue | null {
  return React.useContext(Ctx)
}

interface BacklogDndProviderProps {
  projectId: string
  /** All work items currently rendered, in render order. */
  items: WorkItemWithProfile[]
  /** All sprints in the project (used to look up state for guard). */
  sprints: Sprint[]
  /** Refresh callback invoked after a successful drop. */
  onChanged: () => void | Promise<void>
  children: React.ReactNode
}

export function BacklogDndProvider({
  projectId,
  items,
  sprints,
  onChanged,
  children,
}: BacklogDndProviderProps) {
  const selection = useStorySelection()
  const [activeDragId, setActiveDragId] = React.useState<string | null>(null)
  const [announcement, setAnnouncement] = React.useState<string>("")

  // Lookup maps recomputed when inputs change. Cheap; the items list is
  // typically < 200 entries on a real project.
  const itemsById = React.useMemo(() => {
    const map = new Map<string, WorkItemWithProfile>()
    for (const it of items) map.set(it.id, it)
    return map
  }, [items])
  const sprintsById = React.useMemo(() => {
    const map = new Map<string, Sprint>()
    for (const s of sprints) map.set(s.id, s)
    return map
  }, [sprints])

  const orderedStoryIds = React.useMemo(
    () => items.filter((it) => it.kind === "story").map((it) => it.id),
    [items]
  )

  // Sensors: pointer for mouse/touch + keyboard for a11y (Space/Arrow-Up-Down/Space).
  const sensors = useSensors(
    useSensor(PointerSensor, {
      // Small distance prevents accidental drags on click. 6px matches @dnd-kit
      // recommendation for desktop.
      activationConstraint: { distance: 6 },
    }),
    useSensor(KeyboardSensor)
  )

  const announce = React.useCallback((message: string) => {
    setAnnouncement(message)
  }, [])

  const handleDragStart = (event: DragStartEvent) => {
    const id = String(event.active.id)
    setActiveDragId(id)
    // If the dragged item is not in the current selection, treat the drag
    // as single-item (replace selection). Matches macOS Finder behavior.
    if (!selection.isSelected(id)) {
      selection.set([id])
    }
  }

  const handleDragCancel = () => {
    setActiveDragId(null)
    announce("Verschieben abgebrochen.")
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveDragId(null)
    const dropTarget = event.over?.id ? String(event.over.id) : null
    if (!dropTarget) {
      // Released outside any droppable → cancel silently.
      return
    }

    // Resolve target sprint_id from the typed droppable id.
    let targetSprintId: string | null = null
    let targetLabel: string
    if (dropTarget === "backlog") {
      targetSprintId = null
      targetLabel = "Backlog"
    } else if (dropTarget.startsWith("sprint:")) {
      targetSprintId = dropTarget.slice("sprint:".length)
      const sprint = sprintsById.get(targetSprintId)
      if (!sprint) {
        announce("Ziel-Sprint nicht gefunden.")
        return
      }
      if (sprint.state === "closed") {
        announce(`Sprint '${sprint.name}' ist abgeschlossen — Drop nicht erlaubt.`)
        toast.error(`Sprint '${sprint.name}' ist abgeschlossen — Drop nicht erlaubt.`)
        return
      }
      targetLabel = `Sprint '${sprint.name}'`
    } else {
      return
    }

    // Resolve which IDs travel with the drag.
    const activeId = String(event.active.id)
    const ids = selection.isSelected(activeId)
      ? Array.from(selection.selectedIds)
      : [activeId]

    // Filter out items that already sit on the target — no-op for those.
    const idsToMove = ids.filter((id) => {
      const it = itemsById.get(id)
      return it ? it.sprint_id !== targetSprintId : true
    })
    if (idsToMove.length === 0) {
      // Everything was already on the target. Don't fire an API call.
      return
    }

    try {
      const isBulk = idsToMove.length > 1
      const url = isBulk
        ? `/api/projects/${projectId}/work-items/sprint-bulk`
        : `/api/projects/${projectId}/work-items/${idsToMove[0]}/sprint`
      const body = isBulk
        ? { work_item_ids: idsToMove, sprint_id: targetSprintId }
        : { sprint_id: targetSprintId }
      const res = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const errBody = (await res.json().catch(() => null)) as
          | { error?: { code?: string; message?: string } }
          | null
        const code = errBody?.error?.code ?? "unknown_error"
        const msg = errBody?.error?.message ?? "Fehler beim Verschieben."
        if (code === "sprint_closed") {
          announce(`Sprint ist abgeschlossen — Drop nicht erlaubt.`)
        } else {
          announce(`Fehler: ${msg}`)
        }
        toast.error(msg)
        return
      }

      // Build the announcement.
      let announcement: string
      if (isBulk) {
        announcement =
          targetSprintId === null
            ? `${idsToMove.length} Stories wurden in den Backlog zurückverschoben.`
            : `${idsToMove.length} Stories wurden ${targetLabel} zugewiesen.`
      } else {
        const story = itemsById.get(idsToMove[0])
        const storyLabel = story?.title ?? "Story"
        announcement =
          targetSprintId === null
            ? `Story '${storyLabel}' wurde in den Backlog zurückverschoben.`
            : `Story '${storyLabel}' wurde ${targetLabel} zugewiesen.`
      }
      announce(announcement)

      // Clear selection on success — the user can start fresh.
      selection.clear()
      await onChanged()
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Netzwerkfehler."
      announce(`Fehler: ${msg}`)
      toast.error(msg)
    }
  }

  const value: BacklogDndContextValue = {
    orderedStoryIds,
    selectedIds: selection.selectedIds,
    isSelected: selection.isSelected,
    toggle: selection.toggle,
    range: selection.range,
    clear: selection.clear,
    announce,
    getItemById: (id) => itemsById.get(id),
    getSprintById: (id) => sprintsById.get(id),
    activeDragId,
  }

  // Resolve overlay payload (single vs stack).
  const overlayItems = React.useMemo(() => {
    if (!activeDragId) return []
    const ids = selection.isSelected(activeDragId)
      ? Array.from(selection.selectedIds)
      : [activeDragId]
    return ids
      .map((id) => itemsById.get(id))
      .filter((it): it is WorkItemWithProfile => Boolean(it))
  }, [activeDragId, selection, itemsById])

  return (
    <Ctx.Provider value={value}>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragCancel={handleDragCancel}
        onDragEnd={handleDragEnd}
      >
        {children}
        <DragOverlay>
          {activeDragId && overlayItems.length > 0 ? (
            <DragOverlayCard items={overlayItems} />
          ) : null}
        </DragOverlay>
      </DndContext>
      {/* Local aria-live region — sr-only, polite. PROJ-25b D6. */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {announcement}
      </div>
    </Ctx.Provider>
  )
}
