"use client"

/**
 * PROJ-65 ε.4 — AI Proposal Drawer (project-wide, multi-purpose).
 *
 * Three tabs:
 *   - Trajektorie (ε.4.α `trajectory_sequence`, Class-2 advisory)
 *   - Ressourcen  (ε.4.β `resource_swap`,        Class-3 Ollama-only)
 *   - Cross-Project (ε.4.γ `cross_project_links`, Class-2 advisory)
 *
 * All three accept advisory: status flips to `accepted` without creating
 * a downstream entity. The user applies via the respective operational
 * flow (Plan-Mutate, Swap-Preview, PROJ-27 create-link dialog).
 */

import * as React from "react"
import { toast } from "sonner"
import {
  ArrowLeftRight,
  CheckCircle2,
  Layers,
  Merge,
  Network,
  Sparkles,
  XCircle,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  acceptTrajectorySequenceSuggestion,
  listTrajectorySequenceSuggestions,
  rejectTrajectorySequenceSuggestion,
  triggerTrajectorySequence,
  type TrajectorySequenceKind,
  type TrajectorySequenceSuggestionRow,
} from "@/lib/ai-proposals/trajectory-sequence-api"

import { CrossProjectLinksTab } from "./ai-proposals/cross-project-links-tab"
import { BacklogProposalTab } from "./ai-proposals/backlog-proposal-tab"
import { ResourceSwapTab } from "./ai-proposals/resource-swap-tab"
import { StakeholderProposalTab } from "./ai-proposals/stakeholder-proposal-tab"

interface AIProposalDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  /** Project method drives 70-β Method-Validation badges. Optional —
   *  when omitted, the Backlog tab considers all kinds compatible. */
  projectMethod?: string | null
  /**
   * Optional node id (`phase:<uuid>` or `sprint:<uuid>`) that the user
   * focused before opening the drawer. Used to highlight suggestions
   * that touch this node. Not a filter — the drawer is project-wide.
   */
  focusedNodeId?: string | null
  /** Looked-up labels for node ids — used to render affected node names. */
  nodeLabels?: Record<string, string>
  /** PROJ-70-ε — open the drawer on a specific tab (deep-link from the
   *  wizard handoff opens "backlog"). PROJ-88 adds "stakeholders".
   *  Defaults to "trajectory". */
  defaultTab?: "trajectory" | "resources" | "links" | "backlog" | "stakeholders"
  /** PROJ-70-ε — when set, the Backlog tab auto-triggers a generation run
   *  for this context_source on mount (wizard Post-Finalize-Handoff). */
  autoGenerateContextSourceId?: string | null
}

const KIND_VISUAL: Record<
  TrajectorySequenceKind,
  { label: string; icon: React.ComponentType<{ className?: string }>; cls: string }
> = {
  parallelize: { label: "Parallelisieren", icon: Layers, cls: "text-sky-600 dark:text-sky-300" },
  reorder: { label: "Reihenfolge", icon: ArrowLeftRight, cls: "text-amber-600 dark:text-amber-300" },
  serialize: { label: "Serialisieren", icon: Network, cls: "text-emerald-600 dark:text-emerald-300" },
  merge: { label: "Zusammenführen", icon: Merge, cls: "text-violet-600 dark:text-violet-300" },
}

const CONFIDENCE_LABEL: Record<"low" | "medium" | "high", string> = {
  low: "Niedrige Konfidenz",
  medium: "Mittlere Konfidenz",
  high: "Hohe Konfidenz",
}

export function AIProposalDrawer({
  open,
  onOpenChange,
  projectId,
  projectMethod = null,
  focusedNodeId,
  nodeLabels,
  defaultTab = "trajectory",
  autoGenerateContextSourceId = null,
}: AIProposalDrawerProps) {
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [suggestions, setSuggestions] = React.useState<
    TrajectorySequenceSuggestionRow[]
  >([])
  const [generating, setGenerating] = React.useState(false)
  const [actingId, setActingId] = React.useState<string | null>(null)

  const reload = React.useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const rows = await listTrajectorySequenceSuggestions(projectId)
      setSuggestions(rows)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler")
    } finally {
      setLoading(false)
    }
  }, [projectId])

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot fetch when the drawer opens
    if (open) void reload()
  }, [open, reload])

  const onGenerate = async () => {
    setGenerating(true)
    try {
      const result = await triggerTrajectorySequence(projectId, { count: 3 })
      if (result.status === "error") {
        toast.error("KI-Lauf fehlgeschlagen", {
          description: result.error_message ?? "Unbekannter Fehler",
        })
      } else if (result.external_blocked) {
        toast.info("Lokal ausgeführt", {
          description: result.error_message ?? "Cloud-Routing war nicht möglich; lokales Fallback genutzt.",
        })
      } else {
        toast.success(
          result.suggestion_ids.length === 0
            ? "KI hat keine Verbesserungen vorgeschlagen — Struktur wirkt bereits sauber."
            : `${result.suggestion_ids.length} neuer Vorschlag${result.suggestion_ids.length === 1 ? "" : "e"}.`,
        )
      }
      await reload()
    } catch (err) {
      toast.error("Generierung fehlgeschlagen", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    } finally {
      setGenerating(false)
    }
  }

  const onAccept = async (s: TrajectorySequenceSuggestionRow) => {
    setActingId(s.id)
    try {
      await acceptTrajectorySequenceSuggestion(projectId, s.id)
      toast.success("Vorschlag akzeptiert")
      await reload()
    } catch (err) {
      toast.error("Akzeptieren fehlgeschlagen", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    } finally {
      setActingId(null)
    }
  }

  const onReject = async (s: TrajectorySequenceSuggestionRow) => {
    setActingId(s.id)
    try {
      await rejectTrajectorySequenceSuggestion(s.id)
      toast.success("Vorschlag abgelehnt")
      await reload()
    } catch (err) {
      toast.error("Ablehnen fehlgeschlagen", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    } finally {
      setActingId(null)
    }
  }

  const drafts = suggestions.filter((s) => s.status === "draft")
  const others = suggestions.filter((s) => s.status !== "draft")

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-violet-500" aria-hidden />
            KI-Vorschläge
          </SheetTitle>
          <SheetDescription>
            Vorschläge zur Reihenfolge und Parallelisierung der Projekttrajektorie.
            Annehmen ist advisory — du wendest sie dann via Plan-Mutate an.
          </SheetDescription>
        </SheetHeader>

        <Tabs defaultValue={defaultTab} className="mt-4">
          <TabsList>
            <TabsTrigger value="trajectory">Trajektorie</TabsTrigger>
            <TabsTrigger value="resources">Ressourcen</TabsTrigger>
            <TabsTrigger value="links">Cross-Project</TabsTrigger>
            <TabsTrigger value="backlog">Backlog</TabsTrigger>
            <TabsTrigger value="stakeholders">Stakeholder</TabsTrigger>
          </TabsList>

          <TabsContent value="trajectory" className="mt-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                {suggestions.length === 0
                  ? "Noch keine Vorschläge generiert."
                  : `${drafts.length} offen · ${others.length} bearbeitet`}
              </p>
              <Button
                size="sm"
                onClick={() => void onGenerate()}
                disabled={generating}
              >
                <Sparkles className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                {generating ? "Generiere …" : "Vorschläge generieren"}
              </Button>
            </div>

            {loading && (
              <p className="text-sm text-muted-foreground">Lade Vorschläge …</p>
            )}
            {error && (
              <p
                role="alert"
                className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive"
              >
                {error}
              </p>
            )}

            {!loading && !error && suggestions.length === 0 && (
              <div className="rounded-md border border-dashed bg-muted/10 p-6 text-center text-sm text-muted-foreground">
                Noch keine Vorschläge. Drücke „Vorschläge generieren&ldquo;, um
                die KI zu fragen.
              </div>
            )}

            {drafts.length > 0 && (
              <section className="space-y-2">
                <h3 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Offen
                </h3>
                {drafts.map((s) => (
                  <SuggestionCard
                    key={s.id}
                    suggestion={s}
                    focusedNodeId={focusedNodeId ?? null}
                    nodeLabels={nodeLabels}
                    onAccept={() => void onAccept(s)}
                    onReject={() => void onReject(s)}
                    acting={actingId === s.id}
                  />
                ))}
              </section>
            )}

            {others.length > 0 && (
              <section className="space-y-2 pt-2">
                <h3 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Bearbeitet
                </h3>
                {others.map((s) => (
                  <SuggestionCard
                    key={s.id}
                    suggestion={s}
                    focusedNodeId={focusedNodeId ?? null}
                    nodeLabels={nodeLabels}
                    onAccept={null}
                    onReject={null}
                    acting={false}
                  />
                ))}
              </section>
            )}
          </TabsContent>

          <TabsContent value="resources" className="mt-4">
            <ResourceSwapTab projectId={projectId} />
          </TabsContent>

          <TabsContent value="links" className="mt-4">
            <CrossProjectLinksTab projectId={projectId} />
          </TabsContent>

          <TabsContent value="backlog" className="mt-4">
            <BacklogProposalTab
              projectId={projectId}
              projectMethod={projectMethod}
              autoGenerateContextSourceId={autoGenerateContextSourceId}
            />
          </TabsContent>

          <TabsContent value="stakeholders" className="mt-4">
            <StakeholderProposalTab projectId={projectId} />
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  )
}

interface SuggestionCardProps {
  suggestion: TrajectorySequenceSuggestionRow
  focusedNodeId: string | null
  nodeLabels?: Record<string, string>
  onAccept: (() => void) | null
  onReject: (() => void) | null
  acting: boolean
}

function SuggestionCard({
  suggestion,
  focusedNodeId,
  nodeLabels,
  onAccept,
  onReject,
  acting,
}: SuggestionCardProps) {
  const p = suggestion.payload
  const visual = KIND_VISUAL[p.kind]
  const Icon = visual.icon
  const touchesFocused =
    focusedNodeId != null && p.affected_node_ids.includes(focusedNodeId)
  const statusBadge =
    suggestion.status === "accepted" ? (
      <Badge variant="outline" className="border-emerald-500/40 text-emerald-700 dark:text-emerald-300">
        akzeptiert
      </Badge>
    ) : suggestion.status === "rejected" ? (
      <Badge variant="outline" className="border-destructive/40 text-destructive">
        abgelehnt
      </Badge>
    ) : null

  return (
    <article
      className={`rounded-md border bg-card p-3 text-sm ${
        touchesFocused ? "border-sky-400 ring-1 ring-sky-400/40" : ""
      }`}
      data-testid="ai-suggestion-card"
    >
      <header className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Icon className={`h-4 w-4 shrink-0 ${visual.cls}`} aria-hidden />
          <span className="truncate font-medium">{p.title}</span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Badge variant="outline" className="text-[10px]">
            {visual.label}
          </Badge>
          {statusBadge}
        </div>
      </header>
      <p className="mt-1.5 whitespace-pre-line text-xs text-muted-foreground">
        {p.rationale}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
        <span>Betrifft:</span>
        {p.affected_node_ids.map((nid) => (
          <Badge
            key={nid}
            variant={focusedNodeId === nid ? "default" : "secondary"}
            className="font-normal"
          >
            {nodeLabels?.[nid] ?? nid}
          </Badge>
        ))}
        <span aria-hidden>·</span>
        <span>{CONFIDENCE_LABEL[p.confidence]}</span>
        {typeof p.estimated_savings_days === "number" && (
          <>
            <span aria-hidden>·</span>
            <span>≈ {p.estimated_savings_days} Tage Einsparung</span>
          </>
        )}
      </div>
      {(onAccept || onReject) && (
        <div className="mt-3 flex items-center justify-end gap-2">
          {onReject && (
            <Button
              size="sm"
              variant="ghost"
              onClick={onReject}
              disabled={acting}
            >
              <XCircle className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              Ablehnen
            </Button>
          )}
          {onAccept && (
            <Button size="sm" onClick={onAccept} disabled={acting}>
              <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              Annehmen
            </Button>
          )}
        </div>
      )}
    </article>
  )
}
