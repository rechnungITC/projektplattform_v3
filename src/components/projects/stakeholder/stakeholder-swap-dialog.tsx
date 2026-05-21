"use client"

/**
 * PROJ-65 ε.2 — StakeholderSwapDialog (FE-9..FE-15, FE-17).
 *
 * Modal Dialog (focus-trap + backdrop) that loads candidate
 * stakeholders + their Δ-impacts from the swap-preview endpoint
 * (`POST /api/projects/[id]/work-items/[wid]/stakeholder-swap-preview`).
 *
 * ε.2 scope-lock: transient — clicking „Vorschau übernehmen" emits
 * a sonner toast and a 3 s marker quittance via the parent's
 * `onConfirmTransient` callback. NO plan-mutation. Real Plan-Mutate
 * + LivePropagationToast + Undo land in ε.3.
 */

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Skeleton } from "@/components/ui/skeleton"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { AlertTriangle, ArrowUpDown, Loader2, Search } from "lucide-react"
import * as React from "react"

import type { NodeAssignee } from "@/lib/project-graph/types"

import { ClassThreeFootnote, ClassThreeLock } from "./class-three-lock"
import {
  formatCostDelta,
  formatRiskDelta,
  formatTimeDelta,
  type CostDelta,
  type RiskDelta,
} from "./cost-delta-formatter"

export interface SwapCandidate {
  stakeholder_id: string
  resource_id: string | null
  name: string
  role: string | null
  cost_delta: CostDelta
  time_delta_days: number | null
  risk_delta: RiskDelta
  followup_count: number
  /** Greyed-out when stakeholder is soft-deleted between snapshot and dialog open. */
  deleted_at?: string | null
}

interface StakeholderSwapDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  workItemId: string
  /** Currently assigned (we show only the first / focused). */
  currentAssignee: NodeAssignee | null
  /** Server-driven Class-3 cost-clear-view permission. */
  costClearView: boolean
  /** Triggers parent's transient receipt (toast + 3 s dashed marker). */
  onConfirmTransient: (candidate: SwapCandidate) => void
}

type SortKey = "match" | "cost" | "time" | "name"

interface CandidatesState {
  status: "idle" | "loading" | "ok" | "error"
  candidates: SwapCandidate[]
  error: string | null
}

const INITIAL_CANDIDATES_STATE: CandidatesState = {
  status: "idle",
  candidates: [],
  error: null,
}

function initials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export function StakeholderSwapDialog({
  open,
  onOpenChange,
  projectId,
  workItemId,
  currentAssignee,
  costClearView,
  onConfirmTransient,
}: StakeholderSwapDialogProps) {
  const [state, setState] = React.useState<CandidatesState>(
    INITIAL_CANDIDATES_STATE,
  )
  const [selection, setSelection] = React.useState<string | null>(null)
  const [search, setSearch] = React.useState("")
  const [sortKey, setSortKey] = React.useState<SortKey>("match")
  const [discardOpen, setDiscardOpen] = React.useState(false)

  React.useEffect(() => {
    if (!open) {
      setSelection(null)
      setSearch("")
      setSortKey("match")
      setState(INITIAL_CANDIDATES_STATE)
      return
    }
    let cancelled = false
    setState({ status: "loading", candidates: [], error: null })
    fetch(
      `/api/projects/${encodeURIComponent(projectId)}/work-items/${encodeURIComponent(workItemId)}/stakeholder-swap-preview`,
      { method: "POST", headers: { "Content-Type": "application/json" } },
    )
      .then(async (res) => {
        if (res.status === 404 || res.status === 501) {
          // Backend endpoint not yet provisioned in ε.2 — degrade to
          // empty-state with explanatory copy. Real endpoint lands in
          // /backend ε.2 slice.
          if (!cancelled) setState({ status: "ok", candidates: [], error: null })
          return
        }
        if (!res.ok) {
          let msg = `HTTP ${res.status}`
          try {
            const body = (await res.json()) as { error?: { message?: string } }
            msg = body.error?.message ?? msg
          } catch {
            /* ignore */
          }
          throw new Error(msg)
        }
        const body = (await res.json()) as { candidates: SwapCandidate[] }
        if (!cancelled)
          setState({
            status: "ok",
            candidates: body.candidates ?? [],
            error: null,
          })
      })
      .catch((err) => {
        if (!cancelled)
          setState({
            status: "error",
            candidates: [],
            error: err instanceof Error ? err.message : String(err),
          })
      })
    return () => {
      cancelled = true
    }
  }, [open, projectId, workItemId])

  const visible = React.useMemo(() => {
    const filter = search.trim().toLowerCase()
    let list = state.candidates
    if (filter) {
      list = list.filter(
        (c) =>
          c.name.toLowerCase().includes(filter) ||
          (c.role ?? "").toLowerCase().includes(filter),
      )
    }
    return [...list].sort((a, b) => {
      switch (sortKey) {
        case "name":
          return a.name.localeCompare(b.name, "de")
        case "time":
          return (a.time_delta_days ?? 0) - (b.time_delta_days ?? 0)
        case "cost": {
          const av = a.cost_delta.kind === "exact" ? a.cost_delta.amount_cents : 0
          const bv = b.cost_delta.kind === "exact" ? b.cost_delta.amount_cents : 0
          return av - bv
        }
        case "match":
        default:
          // Match-Score deferred to /backend; keep server order as proxy.
          return 0
      }
    })
  }, [state.candidates, search, sortKey])

  const selectedCandidate = visible.find((c) => c.stakeholder_id === selection)
  const hasMasked = visible.some((c) => c.cost_delta.kind === "aggregate")

  const handleClose = (next: boolean) => {
    if (!next && selection != null) {
      setDiscardOpen(true)
      return
    }
    onOpenChange(next)
  }

  const handleConfirm = () => {
    if (!selectedCandidate) return
    onConfirmTransient(selectedCandidate)
    onOpenChange(false)
  }

  return (
    <>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent
          className="sm:max-w-2xl"
          data-testid="stakeholder-swap-dialog"
        >
          <DialogHeader>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <DialogTitle>Stakeholder wechseln</DialogTitle>
                <DialogDescription className="truncate">
                  {currentAssignee
                    ? `Aktuell: ${currentAssignee.name}${currentAssignee.role ? ` · ${currentAssignee.role}` : ""}`
                    : "Keine bestehende Zuweisung"}
                </DialogDescription>
              </div>
              <ClassThreeLock clearView={costClearView} />
            </div>
          </DialogHeader>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search
                className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground"
                aria-hidden
              />
              <Input
                type="search"
                placeholder="Kandidaten suchen…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8"
                aria-label="Kandidaten suchen"
              />
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="shrink-0">
                  <ArrowUpDown className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                  Sortieren
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setSortKey("match")}>
                  Match-Score (Standard)
                </DropdownMenuItem>
                {costClearView && (
                  <DropdownMenuItem onSelect={() => setSortKey("cost")}>
                    Kosten-Δ
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onSelect={() => setSortKey("time")}>
                  Zeit-Δ
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setSortKey("name")}>
                  Name (A–Z)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div
            className="mt-2 max-h-[50vh] overflow-y-auto rounded-md border"
            data-testid="stakeholder-swap-candidates"
          >
            {state.status === "loading" && (
              <div className="space-y-2 p-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            )}
            {state.status === "error" && (
              <Alert variant="destructive" className="m-3">
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                <AlertTitle>Vorschläge fehlgeschlagen</AlertTitle>
                <AlertDescription>{state.error}</AlertDescription>
              </Alert>
            )}
            {state.status === "ok" && visible.length === 0 && (
              <div
                className="p-6 text-center text-sm text-muted-foreground"
                data-testid="stakeholder-swap-empty"
              >
                <p className="font-medium text-foreground">
                  Keine passenden Kandidaten
                </p>
                <p className="mt-1 text-xs">
                  {search
                    ? "Suche zurücksetzen oder andere Stichworte verwenden."
                    : "Backend liefert in dieser Voransicht noch keine Vorschläge — Wechsel-Vorschau wird in einem Folge-Slice freigeschaltet."}
                </p>
              </div>
            )}
            {state.status === "ok" && visible.length > 0 && (
              <RadioGroup
                value={selection ?? ""}
                onValueChange={(v) => setSelection(v || null)}
                className="divide-y"
              >
                {visible.map((c) => {
                  const selected = c.stakeholder_id === selection
                  const greyed = Boolean(c.deleted_at)
                  return (
                    <label
                      key={c.stakeholder_id}
                      htmlFor={`cand-${c.stakeholder_id}`}
                      className={`flex cursor-pointer items-start gap-3 p-3 transition-colors ${
                        selected ? "bg-primary/5" : "hover:bg-muted/40"
                      } ${greyed ? "opacity-60" : ""}`}
                      data-testid="stakeholder-swap-candidate"
                    >
                      <RadioGroupItem
                        id={`cand-${c.stakeholder_id}`}
                        value={c.stakeholder_id}
                        disabled={greyed}
                        className="mt-1"
                      />
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="bg-slate-500 text-[10px] font-semibold text-white">
                          {initials(c.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-medium">
                            {c.name}
                          </p>
                          {c.role && (
                            <span className="text-xs text-muted-foreground">
                              · {c.role}
                            </span>
                          )}
                          {greyed && (
                            <Badge
                              variant="outline"
                              className="text-[10px] text-muted-foreground"
                            >
                              nicht mehr verfügbar
                            </Badge>
                          )}
                        </div>
                        <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 text-xs sm:grid-cols-4">
                          <DeltaCell
                            label="Kosten-Δ"
                            value={formatCostDelta(c.cost_delta)}
                          />
                          <DeltaCell
                            label="Zeit-Δ"
                            value={formatTimeDelta(c.time_delta_days)}
                          />
                          <DeltaCell
                            label="Risiko-Δ"
                            value={formatRiskDelta(c.risk_delta)}
                          />
                          <DeltaCell
                            label="Folge"
                            value={String(c.followup_count)}
                          />
                        </div>
                      </div>
                    </label>
                  )
                })}
              </RadioGroup>
            )}
          </div>

          <ClassThreeFootnote hasMaskedValue={hasMasked} projectId={projectId} />

          <DialogFooter className="flex flex-row items-center justify-between gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleClose(false)}
            >
              Abbrechen
            </Button>
            <Button
              type="button"
              onClick={handleConfirm}
              disabled={!selectedCandidate || state.status === "loading"}
              data-testid="stakeholder-swap-confirm"
            >
              {state.status === "loading" && (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
              )}
              Vorschau übernehmen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Auswahl verwerfen?</AlertDialogTitle>
            <AlertDialogDescription>
              Deine Auswahl wurde noch nicht übernommen. Beim Schließen geht
              sie verloren.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Bleiben</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setDiscardOpen(false)
                onOpenChange(false)
              }}
            >
              Verwerfen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function DeltaCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="font-mono">{value}</p>
    </div>
  )
}
