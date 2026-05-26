"use client"

/**
 * PROJ-65 ε.3c.β — BulkShiftPopover (AC-5).
 *
 * Anchored to the "Bulk-Verschieben"-Button inside `BulkActionBar`.
 * Lets the user pick a day-shift before the multi-source
 * `PlanMutateDialog` opens.
 *
 * Range: -365…+365 (defensive — Backend caps anyway).
 * Default: 0 → submit disabled.
 * Quick buttons: ±1 / ±7 / ±14 / ±30.
 * Keyboard: Enter submits, ESC closes (handled by shadcn Popover).
 */

import { ArrowRight } from "lucide-react"
import * as React from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

interface BulkShiftPopoverProps {
  /** Number of selected nodes (drives the "Verschiebe N Knoten um:" label). */
  selectedCount: number
  /** Fired when the user confirms a non-zero day-shift. Parent opens
   *  the multi-source PlanMutateDialog. */
  onSubmit: (days: number) => void
  /** External open-state control. Defaults to internal toggle when
   *  `controlledOpen` is undefined. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /** Render as a child element (used by Action-Bar for inline trigger). */
  children: React.ReactNode
  /**
   * PROJ-65 ε.3c.δ (D9 / OQ-δ1) — when true, the submitted day-count is
   * rounded to whole ISO-weeks (multiples of 7). Mirrors the drag-handle
   * snap-logic so bulk-edit respects the same per-project setting.
   */
  snapToWeek?: boolean
}

const QUICK_DAYS = [-30, -14, -7, -1, 1, 7, 14, 30] as const
const MIN_DAYS = -365
const MAX_DAYS = 365

export function BulkShiftPopover({
  selectedCount,
  onSubmit,
  open,
  onOpenChange,
  children,
  snapToWeek = false,
}: BulkShiftPopoverProps) {
  const [internalOpen, setInternalOpen] = React.useState(false)
  const isControlled = open !== undefined
  const isOpen = isControlled ? open : internalOpen
  const setIsOpen = React.useCallback(
    (next: boolean) => {
      if (isControlled) onOpenChange?.(next)
      else setInternalOpen(next)
    },
    [isControlled, onOpenChange],
  )

  const [days, setDays] = React.useState<number>(0)
  const inputRef = React.useRef<HTMLInputElement | null>(null)

  // Reset days whenever the popover opens fresh.
  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot reset on open
    if (isOpen) setDays(0)
  }, [isOpen])

  const canSubmit = days !== 0 && days >= MIN_DAYS && days <= MAX_DAYS

  const handleSubmit = React.useCallback(() => {
    if (!canSubmit) return
    // PROJ-65 ε.3c.δ D9 / OQ-δ1 — apply snap-to-week to the bulk submit
    // when the per-project setting is on, mirroring the drag-handle logic.
    const submitted = snapToWeek ? Math.round(days / 7) * 7 : days
    if (submitted === 0) return
    onSubmit(submitted)
    setIsOpen(false)
  }, [canSubmit, days, onSubmit, setIsOpen, snapToWeek])

  const handleKey = React.useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Enter" && canSubmit) {
        e.preventDefault()
        handleSubmit()
      }
    },
    [canSubmit, handleSubmit],
  )

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        align="end"
        side="top"
        className="w-72"
        data-testid="bulk-shift-popover"
        onKeyDown={handleKey}
      >
        <div className="space-y-3">
          <div>
            <Label
              htmlFor="bulk-shift-days"
              className="text-xs text-muted-foreground"
            >
              Verschiebe {selectedCount}{" "}
              {selectedCount === 1 ? "Knoten" : "Knoten"} um (Tage):
            </Label>
            <Input
              ref={inputRef}
              id="bulk-shift-days"
              type="number"
              min={MIN_DAYS}
              max={MAX_DAYS}
              value={Number.isFinite(days) ? days : 0}
              onChange={(e) => {
                const v = Number(e.target.value)
                if (Number.isFinite(v)) {
                  setDays(Math.max(MIN_DAYS, Math.min(MAX_DAYS, v)))
                } else {
                  setDays(0)
                }
              }}
              className="mt-1 font-mono"
              data-testid="bulk-shift-days-input"
              aria-describedby="bulk-shift-quick-help"
            />
          </div>
          <div
            className="grid grid-cols-4 gap-1"
            id="bulk-shift-quick-help"
            role="group"
            aria-label="Schnellauswahl Tage"
          >
            {QUICK_DAYS.map((d) => (
              <Button
                key={d}
                type="button"
                variant="outline"
                size="sm"
                className="h-7 px-1 font-mono text-[11px]"
                onClick={() => setDays(d)}
                data-testid={`bulk-shift-quick-${d}`}
              >
                {d > 0 ? `+${d}` : d}
              </Button>
            ))}
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsOpen(false)}
              data-testid="bulk-shift-cancel"
            >
              Abbrechen
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleSubmit}
              disabled={!canSubmit}
              data-testid="bulk-shift-submit"
            >
              Weiter
              <ArrowRight className="ml-1 h-3 w-3" aria-hidden />
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
