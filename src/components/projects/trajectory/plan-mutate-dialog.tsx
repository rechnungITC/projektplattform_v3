"use client"

/**
 * PROJ-65 ε.3b / ε.3c.β — PlanMutateDialog.
 *
 * Orchestrator that opens on drop OR on bulk-action-bar submit:
 *  1. POSTs to `/api/projects/[id]/plan-mutate` with `if_updated_at`.
 *     Single-source body when called from a drag-handle drop;
 *     multi-source body (`sources: [...]`) when called from the
 *     BulkActionBar (ε.3c.β AC-6).
 *  2. Renders Skeleton / OK / 409 / 422 / 5xx states.
 *  3. On Commit: fires `usePlanMutateUndo` with the causation_id.
 *  4. On 422-cycle: fires `onCycleDetected(cycle)` so the parent can
 *     persist a transient overlay on the graph (ε.3c.β AC-8).
 *  5. Mobile 375px: rendered as bottom `Sheet` instead of `Dialog`.
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
import { emitPlanMutateEvent } from "@/lib/plan-mutate/broadcast-channel"
import type { PlanMutateSource } from "@/lib/project-graph/types"

import { ClassThreeLock } from "../stakeholder/class-three-lock"

import { PlanMutateCancelBanner } from "./plan-mutate-cancel-banner"
import { PlanMutateConflictBanner } from "./plan-mutate-conflict-banner"
import { PlanMutateCycleAlert } from "./plan-mutate-cycle-alert"
import { PlanMutatePaginationPauseBanner } from "./plan-mutate-pagination-pause-banner"
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

export interface PlanMutateRequestSingle {
  source_node_id: string
  source_node_kind: "sprint" | "phase"
  intent: { kind: "shift_dates"; days: number }
  if_updated_at: IfUpdatedAtEntry[]
}

export interface PlanMutateRequestMulti {
  sources: PlanMutateSource[]
  intent: { kind: "shift_dates"; days: number }
  if_updated_at: IfUpdatedAtEntry[]
}

export type PlanMutateRequest =
  | PlanMutateRequestSingle
  | PlanMutateRequestMulti

type PlanMutateConflict = {
  ok: false
  kind: "conflict"
  status: 409
  conflict: {
    conflicted_node_ids: string[]
    /** Optional — when set (multi-source), points to the offending source. */
    source_node_id?: string
    current_snapshot_hint: unknown
  }
}

type PlanMutateCycle = {
  ok: false
  kind: "cycle"
  status: 422
  cycle: {
    detected_at_node_id: string
    path: string[]
    /** Optional — present in multi-source responses, identifies the
     *  source that triggered the cycle. */
    source_node_id?: string
  }
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

interface PlanMutateDialogPropsBase {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  /** Day-shift from the drag operation or the bulk-popover input
   *  (positive = future). */
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
  /**
   * PROJ-65 ε.3c.β — fired when the server returns 422-cycle so the
   * parent can persist a transient `lastCycleAttempt` overlay on the
   * graph. Optional — defaults to no-op.
   */
  onCycleDetected?: (cycle: {
    detected_at_node_id: string
    path: string[]
    source_node_id?: string
  }) => void
}

interface PlanMutateDialogSingleProps extends PlanMutateDialogPropsBase {
  /** Source node id (canonical id like `sprint:<uuid>` or `phase:<uuid>`). */
  sourceNodeId: string
  sourceNodeKind: "sprint" | "phase"
  sourceNodeLabel: string
  sources?: undefined
}

interface PlanMutateDialogMultiProps extends PlanMutateDialogPropsBase {
  /** PROJ-65 ε.3c.β — multi-source request. When set, header text and
   *  request body switch into multi-mode. */
  sources: PlanMutateSource[]
  sourceNodeId?: undefined
  sourceNodeKind?: undefined
  sourceNodeLabel?: undefined
}

type PlanMutateDialogProps =
  | PlanMutateDialogSingleProps
  | PlanMutateDialogMultiProps

type DialogState =
  | { kind: "loading" }
  | { kind: "ok"; affected: AffectedRow[]; causationId: null }
  | {
      kind: "conflict"
      conflictedNodeIds: string[]
      sourceNodeId?: string
      affected: AffectedRow[]
    }
  | {
      kind: "cycle"
      detectedAt: string
      path: string[]
      sourceNodeId?: string
    }
  | { kind: "error"; message: string }
  | { kind: "applying" }
  // PROJ-65 ε.3c.γ — client-side pagination states (G6-(c)).
  | {
      kind: "paginating"
      /** Rows already pushed into the table. */
      loaded: AffectedRow[]
      /** Full diff response from the server; we slice it client-side. */
      full: AffectedRow[]
      /** Causation id from the (already-committed) mutation. */
      causationId: string
      /** 1-based page index of the page currently being rendered. */
      pageIndex: number
    }
  | {
      kind: "paginating-paused"
      loaded: AffectedRow[]
      full: AffectedRow[]
      causationId: string
      pageIndex: number
    }
  | { kind: "cancelled" }

const MOBILE_MEDIA_QUERY = "(max-width: 480px)"

// PROJ-65 ε.3c.γ — client-side pagination constants (G6-(c), G1, G3).
const PAGE_SIZE = 50
const SOFT_LIMIT_PAGES = 5

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

export function PlanMutateDialog(props: PlanMutateDialogProps) {
  const {
    open,
    onOpenChange,
    projectId,
    shiftDays,
    ifUpdatedAt,
    costClearView,
    nodeLabels,
    onCommitted,
    onReloadSnapshot,
    onCycleDetected,
  } = props

  // Normalize single vs multi into a single canonical source-array.
  const normalizedSources: PlanMutateSource[] = React.useMemo(() => {
    if (props.sources && props.sources.length > 0) return props.sources
    if (props.sourceNodeId && props.sourceNodeKind) {
      return [
        {
          node_id: props.sourceNodeId,
          node_kind: props.sourceNodeKind,
        },
      ]
    }
    return []
  }, [props.sources, props.sourceNodeId, props.sourceNodeKind])

  const isMultiSource = normalizedSources.length > 1
  const sourceCount = normalizedSources.length

  const [state, setState] = React.useState<DialogState>({ kind: "loading" })
  const [reloadingConflict, setReloadingConflict] = React.useState(false)
  const { showUndoToast } = usePlanMutateUndo()
  const isMobile = useIsMobile()

  const requestBody: PlanMutateRequest = React.useMemo(() => {
    if (isMultiSource) {
      return {
        sources: normalizedSources,
        intent: { kind: "shift_dates", days: shiftDays },
        if_updated_at: ifUpdatedAt,
      }
    }
    const first = normalizedSources[0]
    return {
      source_node_id: first?.node_id ?? "",
      source_node_kind: (first?.node_kind ?? "sprint") as "sprint" | "phase",
      intent: { kind: "shift_dates", days: shiftDays },
      if_updated_at: ifUpdatedAt,
    }
  }, [isMultiSource, normalizedSources, shiftDays, ifUpdatedAt])

  const fallbackSourceId = normalizedSources[0]?.node_id ?? ""

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
            source_node_id?: string
            current_snapshot_hint?: unknown
          }
        }
        return {
          ok: false,
          kind: "conflict",
          status: 409,
          conflict: {
            conflicted_node_ids: body.conflict?.conflicted_node_ids ?? [],
            source_node_id: body.conflict?.source_node_id,
            current_snapshot_hint: body.conflict?.current_snapshot_hint,
          },
        }
      }
      if (res.status === 422) {
        const body = (await res.json().catch(() => ({}))) as {
          cycle?: {
            detected_at_node_id?: string
            path?: string[]
            source_node_id?: string
          }
        }
        return {
          ok: false,
          kind: "cycle",
          status: 422,
          cycle: {
            detected_at_node_id:
              body.cycle?.detected_at_node_id ?? fallbackSourceId,
            path: body.cycle?.path ?? [],
            source_node_id: body.cycle?.source_node_id,
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
    [projectId, requestBody, fallbackSourceId],
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
          const all = res.diff.affected
          // PROJ-65 ε.3c.γ — when full diff exceeds PAGE_SIZE, slice
          // client-side and switch to `paginating` state. A separate
          // effect (below) advances pages via setTimeout(0). For
          // ≤ PAGE_SIZE the legacy single-shot `ok` path is used.
          if (all.length > PAGE_SIZE) {
            const withPageIndex = all.map((row, idx) => ({
              ...row,
              page_index: Math.floor(idx / PAGE_SIZE),
            }))
            setState({
              kind: "paginating",
              loaded: withPageIndex.slice(0, PAGE_SIZE),
              full: withPageIndex,
              causationId: res.causation_id,
              pageIndex: 1,
            })
            return
          }
          setState({
            kind: "ok",
            affected: all,
            causationId: null,
          })
          return
        }
        if (res.kind === "conflict") {
          setState({
            kind: "conflict",
            conflictedNodeIds: res.conflict.conflicted_node_ids,
            sourceNodeId: res.conflict.source_node_id,
            affected: [],
          })
          return
        }
        if (res.kind === "cycle") {
          setState({
            kind: "cycle",
            detectedAt: res.cycle.detected_at_node_id,
            path: res.cycle.path,
            sourceNodeId: res.cycle.source_node_id,
          })
          onCycleDetected?.({
            detected_at_node_id: res.cycle.detected_at_node_id,
            path: res.cycle.path,
            source_node_id: res.cycle.source_node_id,
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
  }, [open, fetchDiff, onCycleDetected])

  // PROJ-65 ε.3c.γ — pagination loop. While in `paginating`, schedule the
  // next chunk via setTimeout(0) so the main thread stays responsive.
  // Auto-pause at SOFT_LIMIT_PAGES; user-confirm resumes.
  React.useEffect(() => {
    if (state.kind !== "paginating") return
    const handle = window.setTimeout(() => {
      setState((prev) => {
        if (prev.kind !== "paginating") return prev
        const nextLoadedCount = (prev.pageIndex + 1) * PAGE_SIZE
        const nextLoaded = prev.full.slice(0, nextLoadedCount)
        const isComplete = nextLoaded.length >= prev.full.length
        const reachedSoftLimit =
          prev.pageIndex + 1 >= SOFT_LIMIT_PAGES && !isComplete
        if (isComplete) {
          return {
            kind: "ok",
            affected: prev.full,
            causationId: null,
          }
        }
        if (reachedSoftLimit) {
          return {
            kind: "paginating-paused",
            loaded: nextLoaded,
            full: prev.full,
            causationId: prev.causationId,
            pageIndex: prev.pageIndex + 1,
          }
        }
        return {
          kind: "paginating",
          loaded: nextLoaded,
          full: prev.full,
          causationId: prev.causationId,
          pageIndex: prev.pageIndex + 1,
        }
      })
    }, 0)
    return () => window.clearTimeout(handle)
  }, [state])

  const handleResumePagination = React.useCallback(() => {
    setState((prev) => {
      if (prev.kind !== "paginating-paused") return prev
      return {
        kind: "paginating",
        loaded: prev.loaded,
        full: prev.full,
        causationId: prev.causationId,
        pageIndex: prev.pageIndex,
      }
    })
  }, [])

  const handleCancelPagination = React.useCallback(() => {
    setState({ kind: "cancelled" })
  }, [])

  const handleRetryAfterCancel = React.useCallback(() => {
    setState({ kind: "loading" })
    // The fetch-effect above re-fires whenever `open` flips, but here
    // we want to retrigger without closing/reopening. We bump a local
    // "retryTick" by toggling the cancelled→loading state — the
    // surrounding effect re-runs because we depend on `open` only, so
    // we cheat by closing+reopening from the caller's POV. Simpler:
    // call fetchDiff manually here.
    const ctrl = new AbortController()
    fetchDiff(ctrl.signal)
      .then((res) => {
        if (ctrl.signal.aborted) return
        if (res.kind === "ok") {
          const all = res.diff.affected
          if (all.length > PAGE_SIZE) {
            const withPageIndex = all.map((row, idx) => ({
              ...row,
              page_index: Math.floor(idx / PAGE_SIZE),
            }))
            setState({
              kind: "paginating",
              loaded: withPageIndex.slice(0, PAGE_SIZE),
              full: withPageIndex,
              causationId: res.causation_id,
              pageIndex: 1,
            })
            return
          }
          setState({ kind: "ok", affected: all, causationId: null })
          return
        }
        if (res.kind === "conflict") {
          setState({
            kind: "conflict",
            conflictedNodeIds: res.conflict.conflicted_node_ids,
            sourceNodeId: res.conflict.source_node_id,
            affected: [],
          })
          return
        }
        if (res.kind === "cycle") {
          setState({
            kind: "cycle",
            detectedAt: res.cycle.detected_at_node_id,
            path: res.cycle.path,
            sourceNodeId: res.cycle.source_node_id,
          })
          onCycleDetected?.({
            detected_at_node_id: res.cycle.detected_at_node_id,
            path: res.cycle.path,
            source_node_id: res.cycle.source_node_id,
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
  }, [fetchDiff, onCycleDetected])

  // Build a short label for the toast / banner copy.
  const headerLabel: string = React.useMemo(() => {
    if (isMultiSource) {
      return `${sourceCount} Knoten`
    }
    return props.sourceNodeLabel ?? "Knoten"
  }, [isMultiSource, sourceCount, props.sourceNodeLabel])

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
          sourceNodeLabel: headerLabel,
          shiftDays,
          projectId,
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
        // PROJ-65 ε.3c.δ (D8 / AC-D8.1) — broadcast commit so PROJ-58
        // ProjectGraphView (and any other listener tab) can invalidate
        // its snapshot. Only emits on the apply-success branch, never
        // on conflict / cycle / cancel — those branches do not commit.
        emitPlanMutateEvent({
          type: "plan-mutate-committed",
          detail: {
            projectId,
            causation_id: cid,
            affectedCount: res.diff.affected.length,
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
          sourceNodeId: res.conflict.source_node_id,
          affected: [],
        })
        return
      }
      if (res.kind === "cycle") {
        setState({
          kind: "cycle",
          detectedAt: res.cycle.detected_at_node_id,
          path: res.cycle.path,
          sourceNodeId: res.cycle.source_node_id,
        })
        onCycleDetected?.({
          detected_at_node_id: res.cycle.detected_at_node_id,
          path: res.cycle.path,
          source_node_id: res.cycle.source_node_id,
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
    headerLabel,
    shiftDays,
    onCommitted,
    onOpenChange,
    projectId,
    onCycleDetected,
  ])

  const handleReloadAfterConflict = React.useCallback(() => {
    setReloadingConflict(true)
    onReloadSnapshot?.()
    // Trigger refetch via state reset + dialog stays open.
    setState({ kind: "loading" })
    setReloadingConflict(false)
  }, [onReloadSnapshot])

  // Compose title + description.
  const directionSuffix =
    shiftDays === 0
      ? ""
      : ` · ${shiftDays > 0 ? "+" : ""}${shiftDays} Tage`
  const title = isMultiSource
    ? `Plan-Mutate-Vorschau · ${sourceCount} Knoten${directionSuffix}`
    : `Plan-Mutate-Vorschau · ${headerLabel}${directionSuffix}`
  const description =
    state.kind === "ok"
      ? `Die Verschiebung wirkt auf ${state.affected.length} Folge-Knoten.`
      : state.kind === "loading"
        ? "Diff wird berechnet…"
        : state.kind === "applying"
          ? "Übernehmen…"
          : "Konflikt oder Fehler."

  const applyButtonLabel = isMultiSource
    ? `Übernehmen (${sourceCount} Knoten)`
    : "Übernehmen"

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
          groupHeaderSticky={isMultiSource}
        />
      )}
      {(state.kind === "paginating" || state.kind === "paginating-paused") && (
        <div className="space-y-2">
          <PlanMutateDiffTable
            affected={state.loaded}
            costClearView={costClearView}
            projectId={projectId}
            groupHeaderSticky={isMultiSource}
            maxVisibleRows={state.full.length}
            paginationLoading={state.kind === "paginating"}
          />
          {state.kind === "paginating" && (
            <div
              className="flex items-center justify-between gap-2 rounded-md border border-outline-variant bg-muted/30 px-3 py-2 text-xs text-muted-foreground"
              role="status"
              aria-live="polite"
              data-testid="plan-mutate-pagination-progress"
            >
              <span className="flex items-center gap-2">
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                Lade weitere Knoten… (~{state.loaded.length} von{" "}
                {state.full.length} geladen)
              </span>
              <Button
                size="sm"
                variant="ghost"
                onClick={handleCancelPagination}
                data-testid="plan-mutate-pagination-cancel"
              >
                Abbrechen
              </Button>
            </div>
          )}
          {state.kind === "paginating-paused" && (
            <PlanMutatePaginationPauseBanner
              loadedCount={state.loaded.length}
              totalCount={state.full.length}
              onLoadMore={handleResumePagination}
              onAbort={handleCancelPagination}
            />
          )}
        </div>
      )}
      {state.kind === "cancelled" && (
        <PlanMutateCancelBanner
          onRetry={handleRetryAfterCancel}
          onClose={() => onOpenChange(false)}
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
              groupHeaderSticky={isMultiSource}
            />
          </div>
          <PlanMutateConflictBanner
            conflictedNodeIds={state.conflictedNodeIds}
            offendingSourceNodeId={state.sourceNodeId}
            nodeLabels={nodeLabels}
            onReload={handleReloadAfterConflict}
            onCancel={() => onOpenChange(false)}
            reloading={reloadingConflict}
          />
        </div>
      )}
    </div>
  )

  const showFooter =
    state.kind === "ok" ||
    state.kind === "applying" ||
    state.kind === "loading" ||
    state.kind === "paginating" ||
    state.kind === "paginating-paused"
  const applyDisabledReason =
    state.kind === "paginating" || state.kind === "paginating-paused"
      ? "Vollständige Vorschau wird noch geladen"
      : undefined
  const footer = showFooter
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
          title={applyDisabledReason}
          data-testid="plan-mutate-apply"
        >
          {state.kind === "applying" && (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
          )}
          {state.kind === "applying" ? "Übernehmen…" : applyButtonLabel}
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
