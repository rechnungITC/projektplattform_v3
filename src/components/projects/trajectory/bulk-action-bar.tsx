"use client"

/**
 * PROJ-65 ε.3c.β — BulkActionBar (AC-4, AC-13).
 *
 * Floating Card at `fixed bottom-6 left-1/2 -translate-x-1/2 z-50`
 * shown whenever the user has ≥ 1 sprint/phase node selected. Mobile
 * 375px collapses to a full-width sticky-bottom bar.
 *
 * Anatomy:
 *   - count + kind-mix summary ("2 Phasen · 1 Sprint")
 *   - "Alle deselektieren" (variant=ghost)
 *   - "Bulk-Verschieben" → opens `BulkShiftPopover` (anchored to the
 *     button), days-input feeds `onBulkShift(days)`.
 *
 * Slide-in via framer-motion (`y: 100 → 0`); honors
 * `prefers-reduced-motion`.
 *
 * a11y: `role="region" aria-label="Bulk-Aktionen"`; the action-bar is
 * itself a live region landmark (selection-count is announced via
 * `useSelectionSet`'s `onChange` + a separate live-region in the
 * parent view; this component only carries the static role).
 */

import { motion, useReducedMotion, type Variants } from "framer-motion"
import { X } from "lucide-react"
import * as React from "react"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"

import { BulkShiftPopover } from "./bulk-shift-popover"

export interface BulkActionBarKindCount {
  /** Display label, e.g. "Phasen" / "Sprints" / "Knoten". */
  label: string
  count: number
}

interface BulkActionBarProps {
  /** Total number of selected nodes. */
  selectedCount: number
  /** Per-kind tally derived from selected nodes (used in the summary
   *  line "2 Phasen · 1 Sprint"). Empty array = no breakdown shown. */
  kindMix: BulkActionBarKindCount[]
  onClear: () => void
  onBulkShift: (days: number) => void
  /** PROJ-65 ε.3c.δ (D9 / OQ-δ1) — forwarded to BulkShiftPopover so the
   *  per-project setting consistently snaps day-counts to ISO-weeks. */
  snapToWeek?: boolean
}

const slideVariants: Variants = {
  hidden: { y: 100, opacity: 0 },
  visible: { y: 0, opacity: 1 },
}

export function BulkActionBar({
  selectedCount,
  kindMix,
  onClear,
  onBulkShift,
  snapToWeek = false,
}: BulkActionBarProps) {
  const reducedMotion = useReducedMotion()
  if (selectedCount === 0) return null

  const kindSummary =
    kindMix.length > 0
      ? kindMix
          .filter((k) => k.count > 0)
          .map((k) => `${k.count} ${k.label}`)
          .join(" · ")
      : null

  return (
    <motion.div
      role="region"
      aria-label="Bulk-Aktionen"
      data-testid="bulk-action-bar"
      initial={reducedMotion ? false : "hidden"}
      animate="visible"
      exit={reducedMotion ? undefined : "hidden"}
      variants={slideVariants}
      transition={{ duration: reducedMotion ? 0 : 0.2, ease: "easeOut" }}
      className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 sm:max-w-md"
    >
      <Card
        className="flex flex-col items-stretch gap-2 border-outline-variant bg-surface-container px-4 py-3 shadow-lg sm:flex-row sm:items-center sm:gap-4"
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium" data-testid="bulk-action-bar-count">
            {selectedCount} {selectedCount === 1 ? "Knoten" : "Knoten"} ausgewählt
          </p>
          {kindSummary && (
            <p
              className="truncate text-[11px] text-muted-foreground"
              data-testid="bulk-action-bar-mix"
            >
              {kindSummary}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClear}
            data-testid="bulk-action-bar-clear"
            aria-label="Alle deselektieren"
          >
            <X className="mr-1 h-3.5 w-3.5" aria-hidden />
            Alle deselektieren
          </Button>
          <BulkShiftPopover
            selectedCount={selectedCount}
            onSubmit={onBulkShift}
            snapToWeek={snapToWeek}
          >
            <Button
              type="button"
              size="sm"
              data-testid="bulk-action-bar-shift"
            >
              Bulk-Verschieben
            </Button>
          </BulkShiftPopover>
        </div>
      </Card>
    </motion.div>
  )
}

/**
 * Helper to compute the kind-mix summary from a set of node ids and
 * a label/kind lookup. Exported so the parent view can compose without
 * leaking layout types into this component.
 */
export function computeKindMix(
  selectedIds: Iterable<string>,
  kindById: Map<string, "phase" | "sprint">,
): BulkActionBarKindCount[] {
  let phases = 0
  let sprints = 0
  for (const id of selectedIds) {
    const k = kindById.get(id)
    if (k === "phase") phases++
    else if (k === "sprint") sprints++
  }
  const out: BulkActionBarKindCount[] = []
  if (phases > 0) out.push({ label: phases === 1 ? "Phase" : "Phasen", count: phases })
  if (sprints > 0)
    out.push({ label: sprints === 1 ? "Sprint" : "Sprints", count: sprints })
  return out
}
