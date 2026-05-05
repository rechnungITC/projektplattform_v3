"use client"

import * as React from "react"

/**
 * PROJ-25b — multi-select state for the Backlog page.
 *
 * Lives only in component memory: when the page unmounts, the selection
 * is gone. This is intentional — saved selections would be a different
 * feature (drafts, saved views) and are out of scope.
 *
 * Actions:
 *   • toggle(id)         — Ctrl/Cmd-Click: flip a single ID
 *   • range(id, ordered) — Shift-Click: replace selection with the slice
 *                          between the anchor and `id` in `ordered`
 *   • clear()            — empty the selection (post-drop, Escape)
 *   • set(ids)           — replace selection (rare; programmatic resets)
 *
 * The "anchor" is the last single-toggled ID. Shift-Click extends from
 * there. If the anchor is no longer in the visible list (filter applied
 * since), Shift-Click falls back to single-select on the new target —
 * matching standard list-view behavior in macOS Finder / Windows Explorer.
 */

interface SelectionState {
  ids: Set<string>
  anchor: string | null
}

type SelectionAction =
  | { type: "toggle"; id: string }
  | { type: "range"; id: string; ordered: readonly string[] }
  | { type: "clear" }
  | { type: "set"; ids: readonly string[] }

const INITIAL: SelectionState = { ids: new Set(), anchor: null }

function reducer(state: SelectionState, action: SelectionAction): SelectionState {
  switch (action.type) {
    case "toggle": {
      const next = new Set(state.ids)
      if (next.has(action.id)) {
        next.delete(action.id)
        return { ids: next, anchor: state.anchor === action.id ? null : state.anchor }
      }
      next.add(action.id)
      return { ids: next, anchor: action.id }
    }
    case "range": {
      const anchorIdx = state.anchor ? action.ordered.indexOf(state.anchor) : -1
      const targetIdx = action.ordered.indexOf(action.id)
      // No anchor (or anchor filtered out) → fall back to single-select.
      if (anchorIdx < 0 || targetIdx < 0) {
        return { ids: new Set([action.id]), anchor: action.id }
      }
      const [from, to] = anchorIdx < targetIdx ? [anchorIdx, targetIdx] : [targetIdx, anchorIdx]
      const slice = action.ordered.slice(from, to + 1)
      return { ids: new Set(slice), anchor: state.anchor }
    }
    case "clear":
      return INITIAL
    case "set":
      return { ids: new Set(action.ids), anchor: action.ids[action.ids.length - 1] ?? null }
  }
}

export interface UseStorySelectionResult {
  selectedIds: Set<string>
  isSelected: (id: string) => boolean
  toggle: (id: string) => void
  range: (id: string, ordered: readonly string[]) => void
  clear: () => void
  set: (ids: readonly string[]) => void
}

export function useStorySelection(): UseStorySelectionResult {
  const [state, dispatch] = React.useReducer(reducer, INITIAL)

  const toggle = React.useCallback(
    (id: string) => dispatch({ type: "toggle", id }),
    []
  )
  const range = React.useCallback(
    (id: string, ordered: readonly string[]) =>
      dispatch({ type: "range", id, ordered }),
    []
  )
  const clear = React.useCallback(() => dispatch({ type: "clear" }), [])
  const set = React.useCallback(
    (ids: readonly string[]) => dispatch({ type: "set", ids }),
    []
  )

  const isSelected = React.useCallback(
    (id: string) => state.ids.has(id),
    [state.ids]
  )

  return {
    selectedIds: state.ids,
    isSelected,
    toggle,
    range,
    clear,
    set,
  }
}
