"use client"

/**
 * PROJ-51-δ — View Transitions API helper.
 *
 * Wraps `document.startViewTransition` with progressive-enhancement so
 * callers can request a smooth cross-fade for a state change (tab switch,
 * detail-panel-open, etc.) without breaking on browsers that lack the
 * API. Browsers without support fall through to immediate execution.
 *
 * Usage (opt-in per route — see PROJ-51-α impact-matrix):
 *
 *   const startViewTransition = useViewTransition()
 *   function switchTab(next: string) {
 *     startViewTransition(() => setTab(next))
 *   }
 *
 * AC-19 + AC-21: status updates inside the callback remain deterministic
 * (the API only animates DOM-state diffs, it never blocks JS).
 */

import * as React from "react"

type ViewTransitionCallback = () => void | Promise<void>

interface DocumentWithViewTransition {
  startViewTransition?: (
    cb: () => void | Promise<void>,
  ) => { finished: Promise<void> }
}

export function useViewTransition() {
  return React.useCallback((cb: ViewTransitionCallback) => {
    if (typeof document === "undefined") {
      // Server-side or pre-mount → execute immediately.
      const result = cb()
      if (result instanceof Promise) void result
      return
    }
    const doc = document as Document & DocumentWithViewTransition
    if (typeof doc.startViewTransition !== "function") {
      // Browser doesn't support the API (Firefox < 124, older Safari).
      const result = cb()
      if (result instanceof Promise) void result
      return
    }
    doc.startViewTransition(cb)
  }, [])
}
