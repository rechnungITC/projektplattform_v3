"use client"

/**
 * PROJ-65 ε.4.β — Resource-Swap tab inside AIProposalDrawer.
 *
 * Class-3 hard-fixed at the router; this tab calls `/api/projects/[id]/
 * ai/resource-swap` (POST to generate, GET to list, POST .../accept).
 * Reject reuses the purpose-agnostic `/api/ki/suggestions/[id]/reject`.
 *
 * Per CIA-L4 the accept is intentionally advisory — a separate
 * "Im Swap-Preview öffnen"-button on each card wires to the existing
 * PROJ-65 ε.2 stakeholder-swap-preview endpoint with its own audit
 * trail.
 */

import * as React from "react"
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  ExternalLink,
  HandCoins,
  Sparkles,
  Users,
  XCircle,
} from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  acceptResourceSwapSuggestion,
  listResourceSwapSuggestions,
  rejectResourceSwapSuggestion,
  triggerResourceSwap,
  type ResourceSwapKind,
  type ResourceSwapSuggestionRow,
} from "@/lib/ai-proposals/resource-swap-api"

interface ResourceSwapTabProps {
  projectId: string
}

const KIND_VISUAL: Record<
  ResourceSwapKind,
  { label: string; icon: React.ComponentType<{ className?: string }>; cls: string }
> = {
  skill_mismatch: { label: "Skill-Mismatch", icon: Users, cls: "text-rose-600 dark:text-rose-300" },
  overallocation: { label: "Überlastung", icon: Clock, cls: "text-amber-600 dark:text-amber-300" },
  cost_optimization: { label: "Kosten", icon: HandCoins, cls: "text-emerald-600 dark:text-emerald-300" },
  availability: { label: "Verfügbarkeit", icon: Clock, cls: "text-sky-600 dark:text-sky-300" },
}

const CONFIDENCE_LABEL: Record<"low" | "medium" | "high", string> = {
  low: "Niedrige Konfidenz",
  medium: "Mittlere Konfidenz",
  high: "Hohe Konfidenz",
}

export function ResourceSwapTab({ projectId }: ResourceSwapTabProps) {
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [suggestions, setSuggestions] = React.useState<
    ResourceSwapSuggestionRow[]
  >([])
  const [generating, setGenerating] = React.useState(false)
  const [actingId, setActingId] = React.useState<string | null>(null)

  const reload = React.useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const rows = await listResourceSwapSuggestions(projectId)
      setSuggestions(rows)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler")
    } finally {
      setLoading(false)
    }
  }, [projectId])

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot fetch when the tab opens
    void reload()
  }, [reload])

  const onGenerate = async () => {
    setGenerating(true)
    try {
      const result = await triggerResourceSwap(projectId, { count: 3 })
      if (result.status === "error") {
        toast.error("KI-Lauf fehlgeschlagen", {
          description: result.error_message ?? "Unbekannter Fehler",
        })
      } else if (result.external_blocked) {
        // CIA-L2: Ollama-Error oder kein Ollama → external_blocked.
        // Stub-Fallback ist hier bewusst deaktiviert.
        toast.info("Lokaler Provider erforderlich", {
          description:
            result.error_message ??
            "resource_swap braucht einen tenant-konfigurierten Ollama. Vorerst keine Empfehlung erzeugt.",
        })
      } else {
        toast.success(
          result.suggestion_ids.length === 0
            ? "KI hat keinen Wechsel empfohlen — Zuordnungen passen."
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

  const onAccept = async (s: ResourceSwapSuggestionRow) => {
    setActingId(s.id)
    try {
      await acceptResourceSwapSuggestion(projectId, s.id)
      toast.success("Vorschlag akzeptiert", {
        description: "Wende den Wechsel im Swap-Preview an, falls noch nicht geschehen.",
      })
      await reload()
    } catch (err) {
      toast.error("Akzeptieren fehlgeschlagen", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    } finally {
      setActingId(null)
    }
  }

  const onReject = async (s: ResourceSwapSuggestionRow) => {
    setActingId(s.id)
    try {
      await rejectResourceSwapSuggestion(s.id)
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
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {suggestions.length === 0
            ? "Noch keine Vorschläge generiert."
            : `${drafts.length} offen · ${others.length} bearbeitet`}
        </p>
        <Button size="sm" onClick={() => void onGenerate()} disabled={generating}>
          <Sparkles className="mr-1.5 h-3.5 w-3.5" aria-hidden />
          {generating ? "Generiere …" : "Vorschläge generieren"}
        </Button>
      </div>

      <p className="rounded-md border border-amber-400/30 bg-amber-500/5 p-2 text-[11px] text-amber-700 dark:text-amber-300">
        Class-3 — der Lauf nutzt ausschließlich den tenant-konfigurierten
        Ollama-Provider. Bei fehlender Ollama-Verbindung bleibt die Liste
        leer (kein Stub-Fallback).
      </p>

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
          Noch keine Vorschläge. „Vorschläge generieren&ldquo; startet einen
          Ollama-Lauf mit Class-3-Kontext (Tagessätze als Buckets, wenn
          dein Account keinen Cost-Clear-View hat).
        </div>
      )}

      {drafts.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Offen
          </h3>
          {drafts.map((s) => (
            <SwapCard
              key={s.id}
              suggestion={s}
              projectId={projectId}
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
            <SwapCard
              key={s.id}
              suggestion={s}
              projectId={projectId}
              onAccept={null}
              onReject={null}
              acting={false}
            />
          ))}
        </section>
      )}
    </div>
  )
}

interface SwapCardProps {
  suggestion: ResourceSwapSuggestionRow
  projectId: string
  onAccept: (() => void) | null
  onReject: (() => void) | null
  acting: boolean
}

function SwapCard({
  suggestion,
  projectId,
  onAccept,
  onReject,
  acting,
}: SwapCardProps) {
  const p = suggestion.payload
  const visual = KIND_VISUAL[p.kind]
  const Icon = visual.icon
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

  const fromName = p.display?.from_resource_name ?? p.from_resource_id.slice(0, 8)
  const toName = p.display?.to_resource_name ?? p.to_resource_id.slice(0, 8)
  const workItemTitle = p.display?.work_item_title ?? p.work_item_id.slice(0, 8)

  const previewHref = `/projects/${encodeURIComponent(projectId)}/work-items/${encodeURIComponent(p.work_item_id)}`

  return (
    <article
      className="rounded-md border bg-card p-3 text-sm"
      data-testid="ai-resource-swap-card"
    >
      <header className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Icon className={`h-4 w-4 shrink-0 ${visual.cls}`} aria-hidden />
          <span className="truncate font-medium">{p.title}</span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Badge variant="outline" className="text-[10px]">{visual.label}</Badge>
          {statusBadge}
        </div>
      </header>
      <p className="mt-1.5 whitespace-pre-line text-xs text-muted-foreground">
        {p.rationale}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
        <span className="text-muted-foreground">Work-Item:</span>
        <Badge variant="secondary" className="font-normal">{workItemTitle}</Badge>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
        <span className="text-muted-foreground">Wechsel:</span>
        <Badge variant="outline" className="font-normal">{fromName}</Badge>
        <ArrowRight className="h-3 w-3 text-muted-foreground" aria-hidden />
        <Badge variant="default" className="font-normal">{toName}</Badge>
        <span aria-hidden>·</span>
        <span className="text-muted-foreground">Fit {p.fit_score}/100</span>
        <span aria-hidden>·</span>
        <span className="text-muted-foreground">{CONFIDENCE_LABEL[p.confidence]}</span>
      </div>
      <div className="mt-3 flex items-center justify-end gap-2">
        <Button asChild size="sm" variant="ghost">
          <a href={previewHref}>
            <ExternalLink className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            Im Swap-Preview öffnen
          </a>
        </Button>
        {onReject && (
          <Button size="sm" variant="ghost" onClick={onReject} disabled={acting}>
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
    </article>
  )
}
