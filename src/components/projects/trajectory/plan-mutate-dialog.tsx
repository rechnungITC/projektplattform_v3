"use client"

/**
 * PROJ-65 ε.3b — PlanMutateDialog (AC-3, AC-7, AC-8, AC-9, AC-10, AC-11).
 *
 * Orchestrator that opens on drop:
 *  1. POSTs to `/api/projects/[id]/plan-mutate` with `if_updated_at`
 *  2. Renders Skeleton / OK / 409 / 422 / 5xx states
 *  3. On Commit: fires `usePlanMutateUndo` with the causation_id
 *  4. Mobile 375px: rendered as bottom `Sheet` instead of `Dialog`
 *
 * Mobile detection is media-query-driven so we don't have to
 * dynamic-import — `Sheet` and `Dialog` are both already in the
 * bundle (used elsewhere in the app).
 */

import { Loader2 } from "lucide-react"
import * as React from "react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"

import { ClassThreeLock } from "../stakeholder/class-three-lock"

import { PlanMutateConflictBanner } from "./plan-mutate-conflict-banner"
import { PlanMutateCycleAlert } from "./plan-mutate-cycle-alert"
import {
  PlanMutateDiffTable,
  type AffectedRow,
} from "./plan-mutate-diff-table"
import { usePlanMutateUndo } from "./use-plan-mutate-undo"

interface IfUpdatedAtEntry {
  node_id: string
  node_kind: string
  updated_at: string
}

export interface PlanMutateRequest {
  source_node_id: string
  source_node_kind: "sprint" | "phase"
  intent: { kind: "shift_dates"; days: number }
  if_updated_at: IfUpdatedAtEntry[]
}

type PlanMutateConflict = {
  ok: false
  kind: "conflict"
  status: 409
  conflict: {
    conflicted_node_ids: string[]
    current_snapshot_hint: unknown
  }
}

type PlanMutateCycle = {
  ok: false
  kind: "cycle"
  status: 422
  cycle: { detected_at_node_id: string; path: string[] }
}

type PlanMutateOk = {
  ok: true
  kind: "ok"
  causation_id: string
  diff: { affected: AffectedRow[] }
}

type PlanMutateError = {
  ok: false
  kind: "error"
  status: number
  error: string
}

type PlanMutateResponse =
  | PlanMutateOk
  | PlanMutateConflict
  | PlanMutateCycle
  | PlanMutateError

interface PlanMutateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  /** Source node id (canonical id like `sprint:<uuid>` or `phase:<uuid>`). */
  sourceNodeId: string
  sourceNodeKind: "sprint" | "phase"
  sourceNodeLabel: string
  /** Day-shift from the drag operation (positive = future). */
  shiftDays: number
  /** Snapshot-derived list of (node_id, node_kind, updated_at) per node. */
  ifUpdatedAt: IfUpdatedAtEntry[]
  /** Server-driven Class-3 cost-clear-view flag. */
  costClearView: boolean
  /** Labels for breadcrumbs / banner copy. */
  nodeLabels?: Record<string, string>
  /** Called when the diff is committed atomically. Parent should
   *  refetch the snapshot to render the new state. */
  onCommitted?: (causationId: string) => void
  /** Called when the user requests a snapshot reload (409 case). */
  onReloadSnapshot?: () => void
}

type DialogState =
  | { kind: "loading" }
  | { kind: "ok"; affected: AffectedRow[]; causationId: null }
  | { kind: "conflict"; conflictedNodeIds: string[]; affected: AffectedRow[] }
  | { kind: "cycle"; detectedAt: string; path: string[] }
  | { kind: "error"; message: string }
  | { kind: "applying" }

const MOBILE_MEDIA_QUERY = "(max-width: 480px)"

function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = React.useState(false)
  React.useEffect(() => {
    if (typeof window === "undefined") return
    const mq = window.matchMedia(MOBILE_MEDIA_QUERY)
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot sync of current media-query state on mount
    setIsMobile(mq.matches)
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener?.("change", handler)
    return () => mq.removeEventListener?.("change", handler)
  }, [])
  return isMobile
}

export function PlanMutateDialog({
  open,
  onOpenChange,
  projectId,
  sourceNodeId,
  sourceNodeKind,
  sourceNodeLabel,
  shiftDays,
  ifUpdatedAt,
  costClearView,
  nodeLabels,
  onCommitted,
  onReloadSnapshot,
}: PlanMutateDialogProps) {
  const [state, setState] = React.useState<DialogState>({ kind: "loading" })
  const [reloadingConflict, setReloadingConflict] = React.useState(false)
  const { showUndoToast } = usePlanMutateUndo()
  const isMobile = useIsMobile()

  const requestBody: PlanMutateRequest = React.useMemo(
    () => ({
      source_node_id: sourceNodeId,
      source_node_kind: sourceNodeKind,
      intent: { kind: "shift_dates", days: shiftDays },
      if_updated_at: ifUpdatedAt,
    }),
    [sourceNodeId, sourceNodeKind, shiftDays, ifUpdatedAt],
  )

  const fetchDiff = React.useCallback(
    async (signal?: AbortSignal): Promise<PlanMutateResponse> => {
      const res = await fetch(
        `/api/projects/${encodeURIComponent(projectId)}/plan-mutate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
          signal,
        },
      )
      // 404 / 501 → backend not yet provisioned (mock OK empty).
      if (res.status === 404 || res.status === 501) {
        return {
          ok: true,
          kind: "ok",
          causation_id: "stub",
          diff: { affected: [] },
        }
      }
      if (res.status === 409) {
        const body = (await res.json().catch(() => ({}))) as {
          conflict?: {
            conflicted_node_ids?: string[]
            current_snapshot_hint?: unknown
          }
        }
        return {
          ok: false,
          kind: "conflict",
          status: 409,
          conflict: {
            conflicted_node_ids: body.conflict?.conflicted_node_ids ?? [],
            current_snapshot_hint: body.conflict?.current_snapshot_hint,
          },
        }
      }
      if (res.status === 422) {
        const body = (await res.json().catch(() => ({}))) as {
          cycle?: { detected_at_node_id?: string; path?: string[] }
        }
        return {
          ok: false,
          kind: "cycle",
          status: 422,
          cycle: {
            detected_at_node_id:
              body.cycle?.detected_at_node_id ?? sourceNodeId,
            path: body.cycle?.path ?? [],
          },
        }
      }
      if (!res.ok) {
        let msg = `HTTP ${res.status}`
        try {
          const body = (await res.json()) as { error?: string }
          msg = body.error ?? msg
        } catch {
          /* ignore */
        }
        return { ok: false, kind: "error", status: res.status, error: msg }
      }
      const body = (await res.json()) as {
        causation_id: string
        diff: { affected: AffectedRow[] }
      }
      return {
        ok: true,
        kind: "ok",
        causation_id: body.causation_id,
        diff: body.diff ?? { affected: [] },
      }
    },
    [projectId, requestBody, sourceNodeId],
  )

  // Fetch diff on open.
  React.useEffect(() => {
    if (!open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset to loading when dialog closes so next open shows skeleton
      setState({ kind: "loading" })
      return
    }
    const ctrl = new AbortController()
    setState({ kind: "loading" })
    fetchDiff(ctrl.signal)
      .then((res) => {
        if (ctrl.signal.aborted) return
        if (res.kind === "ok") {
          setState({
            kind: "ok",
            affected: res.diff.affected,
            causationId: null,
          })
          return
        }
        if (res.kind === "conflict") {
          setState({
            kind: "conflict",
            conflictedNodeIds: res.conflict.conflicted_node_ids,
            affected: [],
          })
          return
        }
        if (res.kind === "cycle") {
          setState({
            kind: "cycle",
            detectedAt: res.cycle.detected_at_node_id,
            path: res.cycle.path,
          })
          return
        }
        setState({ kind: "error", message: res.error })
      })
      .catch((err) => {
        if (ctrl.signal.aborted) return
        setState({
          kind: "error",
          message: err instanceof Error ? err.message : String(err),
        })
      })
    return () => ctrl.abort()
  }, [open, fetchDiff])

  const handleApply = React.useCallback(async () => {
    if (state.kind !== "ok") return
    setState({ kind: "applying" })
    try {
      const res = await fetchDiff()
      if (res.kind === "ok") {
        const cid = res.causation_id
        showUndoToast({
          causationId: cid,
          affectedCount: res.diff.affected.length,
          sourceNodeLabel,
          shiftDays,
          onUndo: async () => {
            try {
              const undoRes = await fetch(
                `/api/projects/${encodeURIComponent(projectId)}/plan-mutate/undo`,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ causation_id: cid }),
                },
              )
              if (undoRes.status === 404 || undoRes.status === 501) {
                return { ok: true }
              }
              if (undoRes.status === 409) {
                const body = (await undoRes.json().catch(() => ({}))) as {
                  conflict?: { conflicted_node_ids?: string[] }
                }
                return {
                  ok: false,
                  status: 409,
                  conflictedNodeIds:
                    body.conflict?.conflicted_node_ids ?? [],
                }
              }
              if (!undoRes.ok) {
                return { ok: false, status: undoRes.status }
              }
              return { ok: true }
            } catch {
              return { ok: false, status: 500 }
            }
          },
        })
        onCommitted?.(cid)
        onOpenChange(false)
        return
      }
      if (res.kind === "conflict") {
        setState({
          kind: "conflict",
          conflictedNodeIds: res.conflict.conflicted_node_ids,
          affected: [],
        })
        return
      }
      if (res.kind === "cycle") {
        setState({
          kind: "cycle",
          detectedAt: res.cycle.detected_at_node_id,
          path: res.cycle.path,
        })
        return
      }
      setState({ kind: "error", message: res.error })
    } catch (err) {
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      })
    }
  }, [
    state.kind,
    fetchDiff,
    showUndoToast,
    sourceNodeLabel,
    shiftDays,
    onCommitted,
    onOpenChange,
    projectId,
  ])

  const handleReloadAfterConflict = React.useCallback(() => {
    setReloadingConflict(true)
    onReloadSnapshot?.()
    // Trigger refetch via state reset + dialog stays open.
    setState({ kind: "loading" })
    setReloadingConflict(false)
  }, [onReloadSnapshot])

  // Compose title + description.
  const directionLabel =
    shiftDays === 0
      ? sourceNodeLabel
      : `${sourceNodeLabel} · ${shiftDays > 0 ? "+" : ""}${shiftDays} Tage`
  const title = `Plan-Mutate-Vorschau · ${directionLabel}`
  const description =
    state.kind === "ok"
      ? `Die Verschiebung wirkt auf ${state.affected.length} Folge-Knoten.`
      : state.kind === "loading"
        ? "Diff wird berechnet…"
        : state.kind === "applying"
          ? "Übernehmen…"
          : "Konflikt oder Fehler."

  const body = (
    <div className="space-y-3">
      {state.kind === "loading" && <DiffLoading />}
      {state.kind === "applying" && <DiffLoading />}
      {state.kind === "error" && (
        <Alert variant="destructive" data-testid="plan-mutate-error">
          <AlertTitle>Plan-Vorschau fehlgeschlagen</AlertTitle>
          <AlertDescription>
            {state.message}
            <div className="mt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setState({ kind: "loading" })}
              >
                Erneut versuchen
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}
      {state.kind === "cycle" && (
        <PlanMutateCycleAlert
          detectedAtNodeId={state.detectedAt}
          path={state.path}
          nodeLabels={nodeLabels}
          onClose={() => onOpenChange(false)}
        />
      )}
      {state.kind === "ok" && (
        <PlanMutateDiffTable
          affected={state.affected}
          costClearView={costClearView}
          projectId={projectId}
        />
      )}
      {state.kind === "conflict" && (
        <div className="space-y-3">
          <div className="opacity-60">
            <PlanMutateDiffTable
              affected={state.affected}
              costClearView={costClearView}
              projectId={projectId}
              conflictedNodeIds={new Set(state.conflictedNodeIds)}
            />
          </div>
          <PlanMutateConflictBanner
            conflictedNodeIds={state.conflictedNodeIds}
            nodeLabels={nodeLabels}
            onReload={handleReloadAfterConflict}
            onCancel={() => onOpenChange(false)}
            reloading={reloadingConflict}
          />
        </div>
      )}
    </div>
  )

  const footer =
    state.kind === "ok" || state.kind === "applying" || state.kind === "loading"
      ? (
        <div className="flex flex-row items-center justify-between gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={state.kind === "applying"}
          >
            Verwerfen
          </Button>
          <Button
            type="button"
            onClick={handleApply}
            disabled={state.kind !== "ok"}
            data-testid="plan-mutate-apply"
          >
            {state.kind === "applying" && (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
            )}
            {state.kind === "applying" ? "Übernehmen…" : "Übernehmen"}
          </Button>
        </div>
      )
      : null

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="bottom"
          className="h-[90vh] overflow-y-auto"
          data-testid="plan-mutate-sheet"
        >
          <SheetHeader>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <SheetTitle className="truncate text-base">
                  {title}
                </SheetTitle>
                <SheetDescription>{description}</SheetDescription>
              </div>
              <ClassThreeLock clearView={costClearView} />
            </div>
          </SheetHeader>
          <div className="mt-3">{body}</div>
          {footer && <div className="mt-4">{footer}</div>}
        </SheetContent>
      </Sheet>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-2xl"
        data-testid="plan-mutate-dialog"
      >
        <DialogHeader>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <DialogTitle className="truncate">{title}</DialogTitle>
              <DialogDescription className="truncate">
                {description}
              </DialogDescription>
            </div>
            <ClassThreeLock clearView={costClearView} />
          </div>
        </DialogHeader>
        {body}
        {footer && <DialogFooter>{footer}</DialogFooter>}
      </DialogContent>
    </Dialog>
  )
}

function DiffLoading() {
  return (
    <div className="space-y-2" data-testid="plan-mutate-diff-loading">
      <Skeleton className="h-8 w-full" />
      <Skeleton className="h-8 w-full" />
      <Skeleton className="h-8 w-full" />
    </div>
  )
}
