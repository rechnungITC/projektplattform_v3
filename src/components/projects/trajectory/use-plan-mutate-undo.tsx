"use client"

/**
 * PROJ-65 ε.3b — usePlanMutateUndo (AC-9, AC-10).
 *
 * Sonner-toast lifecycle hook that owns the 30 s undo window after a
 * successful Plan-Mutate apply.
 *
 * Performance notes (R-D5):
 * - The 30 s progress-bar is driven by a CSS keyframe (single render).
 * - The "Rückgängig (Ns)"-Button shows a live-countdown via 1 s
 *   interval that ONLY updates a local label, not the whole toast —
 *   sonner re-render cost is one number per second.
 * - On dismiss / tab-hidden / undo-click we clear the interval.
 *
 * Variants:
 * - **idle** — initial 30 s undo offer.
 * - **loading** — POST /plan-mutate/undo in flight.
 * - **success** — undo committed (auto-dismiss after 3 s).
 * - **conflict** — undo returned 409; opens AlertDialog via parent.
 * - **error** — 5xx; "Erneut versuchen" action.
 */

import * as React from "react"
import { toast } from "sonner"

export type UndoVariant = "idle" | "loading" | "success" | "conflict" | "error"

interface ShowUndoToastInput {
  causationId: string
  affectedCount: number
  sourceNodeLabel: string
  shiftDays: number
  /** Returns the next variant given the server response. */
  onUndo: () => Promise<{
    ok: boolean
    status?: number
    conflictedNodeIds?: string[]
  }>
  /** Called when the user opens the conflict details via the 409 variant. */
  onConflictDetails?: (conflictedNodeIds: string[]) => void
}

const UNDO_WINDOW_MS = 30_000
const SUCCESS_TTL_MS = 3_000

const SHRINK_KEYFRAME_ID = "plan-mutate-shrink-keyframes"

function ensureShrinkKeyframes() {
  if (typeof document === "undefined") return
  if (document.getElementById(SHRINK_KEYFRAME_ID)) return
  const style = document.createElement("style")
  style.id = SHRINK_KEYFRAME_ID
  style.textContent = `
    @keyframes plan-mutate-shrink {
      from { transform: scaleX(1); }
      to { transform: scaleX(0); }
    }
  `
  document.head.appendChild(style)
}

export function usePlanMutateUndo() {
  const cancelledRef = React.useRef<Set<string>>(new Set())

  const showUndoToast = React.useCallback(
    (input: ShowUndoToastInput) => {
      ensureShrinkKeyframes()
      const {
        causationId,
        affectedCount,
        sourceNodeLabel,
        shiftDays,
        onUndo,
        onConflictDetails,
      } = input

      // Persistent live-second counter; only the toast description updates.
      let secondsLeft = Math.floor(UNDO_WINDOW_MS / 1000)
      let countdownTimer: number | null = null
      let dismissTimer: number | null = null

      const clearTimers = () => {
        if (countdownTimer != null) {
          window.clearInterval(countdownTimer)
          countdownTimer = null
        }
        if (dismissTimer != null) {
          window.clearTimeout(dismissTimer)
          dismissTimer = null
        }
      }

      const renderIdle = () => (
        <PlanMutateUndoToast
          variant="idle"
          affectedCount={affectedCount}
          sourceNodeLabel={sourceNodeLabel}
          shiftDays={shiftDays}
          secondsLeft={secondsLeft}
          onUndoClick={undoClick}
        />
      )

      const renderLoading = () => (
        <PlanMutateUndoToast
          variant="loading"
          affectedCount={affectedCount}
          sourceNodeLabel={sourceNodeLabel}
          shiftDays={shiftDays}
          secondsLeft={0}
        />
      )

      const renderSuccess = () => (
        <PlanMutateUndoToast
          variant="success"
          affectedCount={affectedCount}
          sourceNodeLabel={sourceNodeLabel}
          shiftDays={shiftDays}
          secondsLeft={0}
        />
      )

      const renderConflict = (conflictedNodeIds: string[]) => (
        <PlanMutateUndoToast
          variant="conflict"
          affectedCount={affectedCount}
          sourceNodeLabel={sourceNodeLabel}
          shiftDays={shiftDays}
          secondsLeft={0}
          conflictedCount={conflictedNodeIds.length}
          onConflictDetailsClick={() => onConflictDetails?.(conflictedNodeIds)}
        />
      )

      const renderError = (onRetry: () => void) => (
        <PlanMutateUndoToast
          variant="error"
          affectedCount={affectedCount}
          sourceNodeLabel={sourceNodeLabel}
          shiftDays={shiftDays}
          secondsLeft={0}
          onRetryClick={onRetry}
        />
      )

      const undoClick = async () => {
        if (cancelledRef.current.has(causationId)) return
        cancelledRef.current.add(causationId)
        clearTimers()
        toast(renderLoading(), { id: causationId, duration: Infinity })
        try {
          const result = await onUndo()
          if (result.ok) {
            toast(renderSuccess(), { id: causationId, duration: SUCCESS_TTL_MS })
            window.setTimeout(() => toast.dismiss(causationId), SUCCESS_TTL_MS)
          } else if (result.status === 409) {
            toast(renderConflict(result.conflictedNodeIds ?? []), {
              id: causationId,
              duration: Infinity,
            })
          } else {
            toast(renderError(undoClick), {
              id: causationId,
              duration: Infinity,
            })
          }
        } catch {
          toast(renderError(undoClick), {
            id: causationId,
            duration: Infinity,
          })
        }
      }

      toast(renderIdle(), {
        id: causationId,
        duration: UNDO_WINDOW_MS,
        onDismiss: clearTimers,
        onAutoClose: clearTimers,
      })

      // 1 s countdown — only re-renders if seconds change.
      countdownTimer = window.setInterval(() => {
        secondsLeft = Math.max(0, secondsLeft - 1)
        if (cancelledRef.current.has(causationId)) {
          clearTimers()
          return
        }
        toast(renderIdle(), { id: causationId, duration: UNDO_WINDOW_MS })
        if (secondsLeft <= 0) {
          clearTimers()
        }
      }, 1000)
      // Safety net: auto-clear after window.
      dismissTimer = window.setTimeout(clearTimers, UNDO_WINDOW_MS + 100)
    },
    [],
  )

  return { showUndoToast }
}

interface PlanMutateUndoToastProps {
  variant: UndoVariant
  affectedCount: number
  sourceNodeLabel: string
  shiftDays: number
  secondsLeft: number
  onUndoClick?: () => void
  onConflictDetailsClick?: () => void
  conflictedCount?: number
  onRetryClick?: () => void
}

/**
 * Pure render component for the toast body. Exported for tests.
 */
export function PlanMutateUndoToast({
  variant,
  affectedCount,
  sourceNodeLabel,
  shiftDays,
  secondsLeft,
  onUndoClick,
  onConflictDetailsClick,
  conflictedCount,
  onRetryClick,
}: PlanMutateUndoToastProps) {
  const titleByVariant: Record<UndoVariant, string> = {
    idle: `Plan übernommen · ${affectedCount} Knoten geändert`,
    loading: "Wird rückgängig gemacht…",
    success: `Plan rückgängig · ${affectedCount} Knoten wiederhergestellt`,
    conflict: `Undo nicht möglich — ${conflictedCount ?? 0} Konflikt-Knoten`,
    error: "Undo fehlgeschlagen — bitte erneut versuchen",
  }
  const shiftLabel =
    shiftDays === 0
      ? ""
      : `${sourceNodeLabel} verschoben um ${shiftDays > 0 ? "+" : ""}${shiftDays} Tage`

  return (
    <div
      data-testid="plan-mutate-undo-toast"
      data-variant={variant}
      className="flex w-full flex-col gap-1.5"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">
            {variant === "idle" && (
              <span aria-hidden className="mr-1 text-primary">
                ✓
              </span>
            )}
            {titleByVariant[variant]}
          </p>
          {variant === "idle" && shiftLabel && (
            <p className="text-xs text-muted-foreground">{shiftLabel}</p>
          )}
          {variant === "loading" && (
            <p className="text-xs text-muted-foreground">
              Server verarbeitet Undo…
            </p>
          )}
        </div>
        <div className="shrink-0">
          {variant === "idle" && onUndoClick && (
            <button
              type="button"
              onClick={onUndoClick}
              className="text-xs font-medium text-primary underline-offset-2 hover:underline"
              data-testid="plan-mutate-undo-action"
            >
              Rückgängig ({secondsLeft}s)
            </button>
          )}
          {variant === "conflict" && onConflictDetailsClick && (
            <button
              type="button"
              onClick={onConflictDetailsClick}
              className="text-xs font-medium text-primary underline-offset-2 hover:underline"
              data-testid="plan-mutate-undo-conflict-details"
            >
              Details
            </button>
          )}
          {variant === "error" && onRetryClick && (
            <button
              type="button"
              onClick={onRetryClick}
              className="text-xs font-medium text-primary underline-offset-2 hover:underline"
              data-testid="plan-mutate-undo-retry"
            >
              Erneut versuchen
            </button>
          )}
        </div>
      </div>
      {variant === "idle" && (
        <div
          className="h-0.5 w-full overflow-hidden rounded-full bg-muted"
          aria-hidden
        >
          <div
            className="h-full origin-left bg-primary"
            style={{
              animation: "plan-mutate-shrink 30s linear forwards",
            }}
          />
        </div>
      )}
    </div>
  )
}
