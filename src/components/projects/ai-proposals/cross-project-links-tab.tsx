"use client"

/**
 * PROJ-65 ε.4.γ — Cross-project-links tab inside AIProposalDrawer.
 *
 * Class-2 advisory: this tab calls `/api/projects/[id]/ai/cross-project-
 * links` (POST to generate, GET to list, POST .../accept). Reject reuses
 * the purpose-agnostic `/api/ki/suggestions/[id]/reject`.
 *
 * Accept is advisory — the actual `work_item_links` row is created via
 * PROJ-27's existing link-create dialog. Each card carries an "Im
 * Link-Dialog öffnen" button that deeplinks to the source work-item
 * (`/projects/[id]/work-items/[wid]`) where the create-link flow lives.
 */

import * as React from "react"
import {
  CheckCircle2,
  Copy,
  ExternalLink,
  Files,
  Layers,
  Link2,
  Lock,
  Network,
  ShieldCheck,
  Sparkles,
  XCircle,
} from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  acceptCrossProjectLinkSuggestion,
  listCrossProjectLinkSuggestions,
  rejectCrossProjectLinkSuggestion,
  triggerCrossProjectLinks,
  type CrossProjectLinkKind,
  type CrossProjectLinkSuggestionRow,
} from "@/lib/ai-proposals/cross-project-links-api"

interface CrossProjectLinksTabProps {
  projectId: string
}

const KIND_VISUAL: Record<
  CrossProjectLinkKind,
  { label: string; icon: React.ComponentType<{ className?: string }>; cls: string }
> = {
  relates: { label: "Verbunden", icon: Link2, cls: "text-slate-600 dark:text-slate-300" },
  blocks: { label: "Blockiert", icon: Lock, cls: "text-rose-600 dark:text-rose-300" },
  requires: { label: "Benötigt", icon: ShieldCheck, cls: "text-amber-600 dark:text-amber-300" },
  duplicates: { label: "Duplikat", icon: Copy, cls: "text-violet-600 dark:text-violet-300" },
  delivers: { label: "Liefert", icon: Files, cls: "text-emerald-600 dark:text-emerald-300" },
  precedes: { label: "Geht voran", icon: Network, cls: "text-sky-600 dark:text-sky-300" },
  includes: { label: "Enthält", icon: Layers, cls: "text-indigo-600 dark:text-indigo-300" },
}

const CONFIDENCE_LABEL: Record<"low" | "medium" | "high", string> = {
  low: "Niedrige Konfidenz",
  medium: "Mittlere Konfidenz",
  high: "Hohe Konfidenz",
}

export function CrossProjectLinksTab({ projectId }: CrossProjectLinksTabProps) {
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [suggestions, setSuggestions] = React.useState<
    CrossProjectLinkSuggestionRow[]
  >([])
  const [generating, setGenerating] = React.useState(false)
  const [actingId, setActingId] = React.useState<string | null>(null)

  const reload = React.useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const rows = await listCrossProjectLinkSuggestions(projectId)
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
      const result = await triggerCrossProjectLinks(projectId, { count: 3 })
      if (result.status === "error") {
        toast.error("KI-Lauf fehlgeschlagen", {
          description: result.error_message ?? "Unbekannter Fehler",
        })
      } else if (result.external_blocked) {
        toast.info("Lokal ausgeführt", {
          description:
            result.error_message ??
            "Cloud-Routing war nicht möglich; lokales Fallback genutzt.",
        })
      } else {
        toast.success(
          result.suggestion_ids.length === 0
            ? "KI hat keine sinnvollen Cross-Project-Links gefunden."
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

  const onAccept = async (s: CrossProjectLinkSuggestionRow) => {
    setActingId(s.id)
    try {
      await acceptCrossProjectLinkSuggestion(projectId, s.id)
      toast.success("Vorschlag akzeptiert", {
        description:
          "Lege den Link im Work-Item-Detail über den Link-Dialog an, falls noch nicht geschehen.",
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

  const onReject = async (s: CrossProjectLinkSuggestionRow) => {
    setActingId(s.id)
    try {
      await rejectCrossProjectLinkSuggestion(s.id)
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

      <p className="rounded-md border border-sky-400/30 bg-sky-500/5 p-2 text-[11px] text-sky-700 dark:text-sky-300">
        Cross-Projekt-Vorschläge basieren auf Work-Item-Titeln, Status und
        Projekt-Hierarchie (parent/child/siblings). Annehmen ist advisory —
        den eigentlichen Link legst du anschließend im Work-Item-Dialog an.
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
          Noch keine Vorschläge. Drücke „Vorschläge generieren&ldquo;, um die
          KI nach sinnvollen Verknüpfungen zu fragen (z.B. duplicates,
          delivers zwischen Sub-Projekten).
        </div>
      )}

      {drafts.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Offen
          </h3>
          {drafts.map((s) => (
            <LinkCard
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
            <LinkCard
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

interface LinkCardProps {
  suggestion: CrossProjectLinkSuggestionRow
  projectId: string
  onAccept: (() => void) | null
  onReject: (() => void) | null
  acting: boolean
}

function LinkCard({
  suggestion,
  projectId,
  onAccept,
  onReject,
  acting,
}: LinkCardProps) {
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

  const fromTitle = p.display?.from_work_item_title ?? p.from_work_item_id.slice(0, 8)
  const toTitle = p.to_work_item_id
    ? p.display?.to_work_item_title ?? p.to_work_item_id.slice(0, 8)
    : `${p.display?.to_project_name ?? "Projekt"} (Gesamt)`
  const toProjectName = p.display?.to_project_name ?? null

  // Deeplink to the source work-item — that's where the PROJ-27 link-create
  // dialog already lives. The user then picks the to-side via the existing
  // combobox.
  const linkDialogHref = `/projects/${encodeURIComponent(projectId)}/work-items/${encodeURIComponent(p.from_work_item_id)}`

  return (
    <article
      className="rounded-md border bg-card p-3 text-sm"
      data-testid="ai-cross-project-link-card"
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
        <span className="text-muted-foreground">Von:</span>
        <Badge variant="secondary" className="font-normal">{fromTitle}</Badge>
        <span aria-hidden className="text-muted-foreground">→</span>
        <Badge variant="default" className="font-normal">{toTitle}</Badge>
        {toProjectName && (
          <>
            <span aria-hidden className="text-muted-foreground">·</span>
            <Badge variant="outline" className="font-normal">{toProjectName}</Badge>
          </>
        )}
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
        <span>{CONFIDENCE_LABEL[p.confidence]}</span>
        {typeof p.lag_days === "number" && (
          <>
            <span aria-hidden>·</span>
            <span>Lag {p.lag_days} Tage</span>
          </>
        )}
      </div>
      <div className="mt-3 flex items-center justify-end gap-2">
        <Button asChild size="sm" variant="ghost">
          <a href={linkDialogHref}>
            <ExternalLink className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            Im Link-Dialog öffnen
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
