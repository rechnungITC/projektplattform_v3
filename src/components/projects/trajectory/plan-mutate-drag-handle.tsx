"use client"

/**
 * PROJ-65 ε.3b — PlanMutateDragHandle.
 *
 * 12×12 px SVG drag-handle anchored to the top-right corner of a
 * Sprint or Phase node. Rendered as `<foreignObject>` containing a
 * `<button>` so it stays keyboard-accessible (Enter opens manual
 * date-input Popover; Space starts drag).
 *
 * Behaviour:
 * - Cursor `grab` → `grabbing` during pointer-drag.
 * - Horizontal-only drag with snap-to-day (`pxPerDay` prop).
 * - ESC during drag → cancel; ghost disappears, no server-call.
 * - Drop → `onDrop(days)` parent commits to dialog.
 * - Hidden unless `canEdit && featureFlagOn` (controlled by caller).
 *
 * AC-1 / AC-2 / AC-12 cover this component.
 */

import { Calendar } from "lucide-react"
import * as React from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

interface PlanMutateDragHandleProps {
  /** Anchor x (SVG coord) — top-right of the node. */
  anchorX: number
  /** Anchor y (SVG coord) — top of the node. */
  anchorY: number
  /** Day-axis scale in SVG px (e.g. lane width per day). */
  pxPerDay: number
  /** Node identity (for aria-label). */
  nodeLabel: string
  /** Called with the snap-to-day shift in days (positive = future). */
  onDrop: (days: number) => void
  /** Called when the user uses the keyboard Popover fallback. */
  onManualShift: (days: number) => void
  /** Optional class for the foreignObject container. */
  className?: string
  /**
   * PROJ-65 ε.3c.δ (D9 / L35) — when true, drag delta and manual-input
   * day count are rounded to whole ISO-weeks (nearest multiple of 7).
   * Reads from `snapshot.trajectory.settings.plan_mutate.snap_to_week`.
   * Default `false` (snap-to-day, ε.3b behavior).
   */
  snapToWeek?: boolean
}

/** PROJ-65 ε.3c.δ — round day-delta to nearest multiple of 7 when snapToWeek. */
function applySnap(days: number, snapToWeek: boolean): number {
  if (!snapToWeek) return days
  return Math.round(days / 7) * 7
}

const HANDLE_SIZE = 14

export function PlanMutateDragHandle({
  anchorX,
  anchorY,
  pxPerDay,
  nodeLabel,
  onDrop,
  onManualShift,
  className,
  snapToWeek = false,
}: PlanMutateDragHandleProps) {
  const [dragging, setDragging] = React.useState(false)
  const [popoverOpen, setPopoverOpen] = React.useState(false)
  const [manualDays, setManualDays] = React.useState("0")
  const startXRef = React.useRef<number | null>(null)
  const cancelledRef = React.useRef(false)
  const longPressTimerRef = React.useRef<number | null>(null)

  // Compute days from pointer-delta with snap-to-day (ε.3b) and optional
  // snap-to-week (ε.3c.δ D9). The ISO-week snap applies AFTER the day-snap,
  // so the user sees integer days during drag and the final commit lands on
  // a multiple of 7.
  const daysFromDelta = React.useCallback(
    (deltaX: number) => {
      if (pxPerDay <= 0) return 0
      const rawDays = Math.round(deltaX / pxPerDay)
      return applySnap(rawDays, snapToWeek)
    },
    [pxPerDay, snapToWeek],
  )

  // Drag lifecycle — pointer events so it handles mouse + touch.
  const handlePointerDown = React.useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      if (event.button !== 0) return // primary button only
      event.preventDefault()
      event.stopPropagation()
      startXRef.current = event.clientX
      cancelledRef.current = false
      setDragging(true)
      try {
        event.currentTarget.setPointerCapture(event.pointerId)
      } catch {
        /* capture is best-effort */
      }
    },
    [],
  )

  const handlePointerMove = React.useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      if (!dragging || startXRef.current == null) return
      // We only need to react on move for ghost-tracking; the parent
      // SVG renders the ghost via its own listener if it wants to —
      // ε.3b ships without an SVG ghost (the drag-handle button itself
      // moves under the pointer thanks to pointer-capture).
      // Suppress unused-variable lint.
      void event
    },
    [dragging],
  )

  const finishDrag = React.useCallback(
    (event: React.PointerEvent<HTMLButtonElement>, commit: boolean) => {
      if (!dragging || startXRef.current == null) return
      const delta = event.clientX - startXRef.current
      const days = daysFromDelta(delta)
      try {
        event.currentTarget.releasePointerCapture(event.pointerId)
      } catch {
        /* release is best-effort */
      }
      setDragging(false)
      startXRef.current = null
      if (!commit || cancelledRef.current || days === 0) return
      onDrop(days)
    },
    [dragging, daysFromDelta, onDrop],
  )

  const handlePointerUp = React.useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      finishDrag(event, true)
    },
    [finishDrag],
  )

  const handlePointerCancel = React.useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      cancelledRef.current = true
      finishDrag(event, false)
    },
    [finishDrag],
  )

  // ESC cancels in-flight drag (window-level so it works even when
  // pointer-capture is on a moving target).
  React.useEffect(() => {
    if (!dragging) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        cancelledRef.current = true
        setDragging(false)
        startXRef.current = null
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [dragging])

  // Long-press on touch → open Popover (mobile fallback per AC-11).
  const handleTouchStart = React.useCallback(() => {
    if (longPressTimerRef.current != null) {
      window.clearTimeout(longPressTimerRef.current)
    }
    longPressTimerRef.current = window.setTimeout(() => {
      setPopoverOpen(true)
    }, 500)
  }, [])

  const handleTouchEnd = React.useCallback(() => {
    if (longPressTimerRef.current != null) {
      window.clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
  }, [])

  const handleKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (event.key === "Enter") {
        event.preventDefault()
        setPopoverOpen(true)
      }
    },
    [],
  )

  const submitManual = React.useCallback(() => {
    const parsed = Number.parseInt(manualDays, 10)
    if (Number.isFinite(parsed) && parsed !== 0) {
      // PROJ-65 ε.3c.δ D9 — Snap-to-Week also applies to the manual-input
      // fallback so keyboard-only users get the same behavior as drag.
      onManualShift(applySnap(parsed, snapToWeek))
    }
    setPopoverOpen(false)
    setManualDays("0")
  }, [manualDays, onManualShift, snapToWeek])

  return (
    <foreignObject
      x={anchorX - HANDLE_SIZE}
      y={anchorY - 2}
      width={HANDLE_SIZE + 8}
      height={HANDLE_SIZE + 8}
      className={className}
      data-testid="plan-mutate-drag-handle-anchor"
    >
      <div
        style={{ width: HANDLE_SIZE + 8, height: HANDLE_SIZE + 8 }}
        className="flex items-start justify-end"
      >
        <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={`Plan-Mutate Drag-Handle für ${nodeLabel}. Enter zum Öffnen des manuellen Datums-Inputs.`}
              data-testid="plan-mutate-drag-handle"
              data-drag-handle="plan-mutate"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerCancel}
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
              onKeyDown={handleKeyDown}
              className={`material-symbols-outlined inline-flex items-center justify-center rounded-sm border border-outline-variant bg-surface-container-high text-[12px] leading-none text-muted-foreground opacity-60 outline-none transition-all hover:bg-primary/10 hover:text-primary hover:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 ${
                dragging
                  ? "cursor-grabbing opacity-100"
                  : "cursor-grab"
              }`}
              style={{
                width: HANDLE_SIZE,
                height: HANDLE_SIZE,
                touchAction: "none",
              }}
            >
              <span aria-hidden className="text-[12px] leading-none">
                drag_indicator
              </span>
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            className="w-64"
            data-testid="plan-mutate-manual-popover"
          >
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Calendar
                  className="h-3.5 w-3.5 text-muted-foreground"
                  aria-hidden
                />
                <p className="text-sm font-medium">Plan manuell verschieben</p>
              </div>
              <p className="text-xs text-muted-foreground">
                Verschiebung in Tagen (positiv = später, negativ = früher).
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="plan-mutate-manual-days" className="text-xs">
                  Tage
                </Label>
                <Input
                  id="plan-mutate-manual-days"
                  type="number"
                  inputMode="numeric"
                  step={1}
                  value={manualDays}
                  onChange={(e) => setManualDays(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault()
                      submitManual()
                    }
                  }}
                  aria-label="Verschiebung in Tagen"
                  className="h-8"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setPopoverOpen(false)
                    setManualDays("0")
                  }}
                >
                  Abbrechen
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={submitManual}
                  data-testid="plan-mutate-manual-submit"
                >
                  Übernehmen
                </Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </foreignObject>
  )
}
