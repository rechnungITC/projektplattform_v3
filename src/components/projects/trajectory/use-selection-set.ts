"use client"

/**
 * PROJ-65 ε.3c.β — useSelectionSet (multi-select state hook).
 *
 * Tactical Set<string>-based selection state for sprint/phase nodes
 * in the trajectory graph. Powers Ctrl/Cmd-Click-Toggle + the
 * floating BulkActionBar.
 *
 * Single-purpose:
 *   - `toggle(id)`: add when missing, remove when present
 *   - `clear()`: drop all selections (used on background-click, ESC,
 *     mode-switch, dialog-commit/abort, snapshot-refetch)
 *   - `has(id)`: O(1) lookup for selection-ring rendering
 *   - `size`: count for the action-bar label
 *   - `selectedIds`: Set<string> reference for downstream prop drilling
 *
 * Optional `onChange` callback fires after each mutation so the parent
 * can update a screen-reader live-region ("{N} Knoten ausgewählt").
 *
 * State is transient — never persisted across reload (per brief
 * Section "Selection-State · Persistenz").
 */

import * as React from "react"

export interface UseSelectionSetReturn {
  selectedIds: Set<string>
  toggle: (id: string) => void
  clear: () => void
  has: (id: string) => boolean
  size: number
}

export interface UseSelectionSetOptions {
  /** Fires after every mutation with the new size — for live-region a11y. */
  onChange?: (size: number) => void
}

export function useSelectionSet(
  options: UseSelectionSetOptions = {},
): UseSelectionSetReturn {
  const { onChange } = options
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(
    () => new Set<string>(),
  )

  const toggle = React.useCallback(
    (id: string) => {
      setSelectedIds((prev) => {
        const next = new Set(prev)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        onChange?.(next.size)
        return next
      })
    },
    [onChange],
  )

  const clear = React.useCallback(() => {
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev
      onChange?.(0)
      return new Set<string>()
    })
  }, [onChange])

  const has = React.useCallback(
    (id: string) => selectedIds.has(id),
    [selectedIds],
  )

  return {
    selectedIds,
    toggle,
    clear,
    has,
    size: selectedIds.size,
  }
}
