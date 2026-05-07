"use client"

import { Check, X } from "lucide-react"
import * as React from "react"

import { cn } from "@/lib/utils"
import { PHASE_STATUS_LABELS, type Phase } from "@/types/phase"

interface PhasesTimelineProps {
  phases: Phase[]
  /** Called with a phase id when the user clicks a pill. The page scrolls to
   *  the corresponding card. */
  onPhaseSelect?: (phaseId: string) => void
}

/**
 * Horizontal pill-shape timeline of all phases ordered by sequence.
 *
 * - Active phase (status=in_progress) gets the primary color.
 * - Completed phases show a check icon.
 * - Cancelled phases get a strikethrough + muted color.
 * - Empty state mirrors the spec.
 */
export function PhasesTimeline({ phases, onPhaseSelect }: PhasesTimelineProps) {
  if (phases.length === 0) {
    return (
      <div
        role="status"
        className="flex w-full items-center justify-center rounded-md border border-dashed bg-muted/30 px-4 py-6 text-sm text-muted-foreground"
      >
        Noch keine Phasen — füge eine hinzu, um die Timeline zu sehen.
      </div>
    )
  }

  return (
    <nav
      aria-label="Phasen-Timeline"
      className="w-full overflow-x-auto rounded-md border bg-card p-3"
    >
      <ol className="flex min-w-max items-center gap-1.5">
        {phases.map((phase, index) => {
          const isLast = index === phases.length - 1
          return (
            <li key={phase.id} className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => onPhaseSelect?.(phase.id)}
                className={cn(
                  "group inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                  pillClasses(phase)
                )}
                aria-label={`Phase ${phase.sequence_number}: ${phase.name} – ${PHASE_STATUS_LABELS[phase.status]}`}
              >
                <span
                  aria-hidden
                  className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-background/40 text-[10px] font-semibold"
                >
                  {phase.sequence_number}
                </span>
                {phase.status === "completed" ? (
                  <Check className="h-3.5 w-3.5" aria-hidden />
                ) : null}
                {phase.status === "cancelled" ? (
                  <X className="h-3.5 w-3.5" aria-hidden />
                ) : null}
                <span
                  className={cn(
                    "max-w-[12rem] truncate",
                    phase.status === "cancelled" && "line-through"
                  )}
                >
                  {phase.name}
                </span>
              </button>
              {!isLast ? (
                <span
                  aria-hidden
                  className="h-px w-4 shrink-0 bg-border sm:w-6"
                />
              ) : null}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

function pillClasses(phase: Phase): string {
  switch (phase.status) {
    case "in_progress":
      return "border-primary bg-primary text-primary-foreground hover:bg-primary/90"
    case "completed":
      return "border-success bg-success/15 text-success hover:bg-success/25"
    case "cancelled":
      return "border-muted bg-muted text-muted-foreground hover:bg-muted/80"
    case "planned":
    default:
      return "border-border bg-background text-foreground hover:bg-accent"
  }
}
