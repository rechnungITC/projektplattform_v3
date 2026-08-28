"use client"

/**
 * PROJ-153-α — Prüfansicht für Arbeitspakete aus dem Vorhaben.
 *
 * **Abweichung von AC-153.18, mit gemessenem Grund.** Das Kriterium sagt, die
 * bestehende Prüfansicht werde wiederverwendet und nichts neu gebaut. Der
 * PROJ-70-Reiter ist 892 Zeilen und hängt an Dingen, die α **nicht hat**:
 * einer Kontextquelle samt Auswahlliste und Upload, und dem Umhängen per
 * Drag-and-drop. Seine Kartenkomponente nimmt ein `NodeApi` aus
 * `react-arborist` und verlangt `dropDisabled`/`onIndent`/`onOutdent` —
 * wiederverwenden hiesse, ein `NodeApi` zu fälschen.
 *
 * Wiederverwendet wird deshalb, was **wirklich** geteilt gehört:
 * `WORK_ITEM_KIND_LABELS` als eine Autorität für die Artbezeichnungen, die
 * shadcn-Primitiven, und die Bedienlogik (Einzel- und Sammelannahme,
 * 30-Sekunden-Rückgängig) im Verhalten. Die Alternative — eine 900-Zeilen-Kopie
 * mit totem Kontextquellen- und Drag-and-drop-Anteil — wäre schlechter.
 *
 * **Die häufigste Fläche ist die Absage, nicht die Liste.** Live liegen 30 von
 * 31 Projekten unter der Substanz-Schwelle. Sie bekommt deshalb den
 * ausführlichsten Zustand, nicht den knappsten.
 */

import * as React from "react"
import { CheckCircle2, Info, Loader2, ServerOff, Sparkles } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { reasonCodeToBanner } from "@/lib/ai-proposals/reason-code-banner"
import {
  acceptWorkItemsFromIntent,
  listWorkItemsFromIntentSuggestions,
  triggerWorkItemsFromIntent,
  undoWorkItemsFromIntentAccept,
  type KiSuggestionRow,
} from "@/lib/ai-proposals/work-items-from-intent-api"
import type { RouterWorkItemsFromIntentResult } from "@/lib/ai/types"
import { WORK_ITEM_KIND_LABELS, type WorkItemKind } from "@/types/work-item"

interface IntentSuggestionPayload {
  temp_id: string
  parent_temp_id: string | null
  title: string
  description: string | null
  kind: WorkItemKind
  confidence: "low" | "medium" | "high"
}

interface IntentProposalTabProps {
  projectId: string
}

/** Tiefe eines Vorschlags über die Elternkette — für die Einrückung. */
function depthOf(
  payload: IntentSuggestionPayload,
  byTempId: Map<string, IntentSuggestionPayload>,
): number {
  let depth = 0
  let cursor = payload.parent_temp_id
  const seen = new Set<string>([payload.temp_id])
  while (cursor && !seen.has(cursor) && depth < 5) {
    seen.add(cursor)
    depth += 1
    cursor = byTempId.get(cursor)?.parent_temp_id ?? null
  }
  return depth
}

export function IntentProposalTab({ projectId }: IntentProposalTabProps) {
  const [drafts, setDrafts] = React.useState<KiSuggestionRow[]>([])
  const [loading, setLoading] = React.useState(true)
  const [generating, setGenerating] = React.useState(false)
  const [accepting, setAccepting] = React.useState(false)
  const [lastResult, setLastResult] =
    React.useState<RouterWorkItemsFromIntentResult | null>(null)

  const refresh = React.useCallback(async () => {
    try {
      const rows = await listWorkItemsFromIntentSuggestions(projectId, {
        status: "draft",
      })
      setDrafts(rows)
    } catch {
      // Bestand nicht lesbar — die Fläche bleibt bedienbar, die Generierung
      // meldet ihren eigenen Fehler.
      setDrafts([])
    }
  }, [projectId])

  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      await refresh()
      if (!cancelled) setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [refresh])

  const onGenerate = React.useCallback(async () => {
    setGenerating(true)
    try {
      const result = await triggerWorkItemsFromIntent(projectId)
      setLastResult(result)
      await refresh()
    } catch (err) {
      toast.error("Generierung fehlgeschlagen", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    } finally {
      setGenerating(false)
    }
  }, [projectId, refresh])

  const onAccept = React.useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) return
      setAccepting(true)
      try {
        const result = await acceptWorkItemsFromIntent(projectId, ids)
        await refresh()
        toast.success(
          result.accepted_suggestion_ids.length === 1
            ? "1 Arbeitspaket übernommen"
            : `${result.accepted_suggestion_ids.length} Arbeitspakete übernommen`,
          {
            duration: 30_000,
            action: {
              label: "Rückgängig",
              onClick: () => {
                void (async () => {
                  try {
                    await undoWorkItemsFromIntentAccept(
                      projectId,
                      result.accepted_suggestion_ids,
                    )
                    await refresh()
                    toast.success("Übernahme rückgängig gemacht")
                  } catch (err) {
                    // Das Fenster ist 30 s — abgelaufen ist kein Defekt.
                    toast.warning(
                      err instanceof Error ? err.message : "Rückgängig fehlgeschlagen",
                    )
                  }
                })()
              },
            },
          },
        )
      } catch (err) {
        toast.error("Übernahme fehlgeschlagen", {
          description: err instanceof Error ? err.message : "Unbekannter Fehler",
        })
      } finally {
        setAccepting(false)
      }
    },
    [projectId, refresh],
  )

  const payloads = React.useMemo(() => {
    const list = drafts.map((d) => ({
      row: d,
      payload: d.payload as IntentSuggestionPayload,
    }))
    const byTempId = new Map(list.map((e) => [e.payload.temp_id, e.payload]))
    return list.map((e) => ({ ...e, depth: depthOf(e.payload, byTempId) }))
  }, [drafts])

  // Abgeleitet statt im JSX zugegriffen: `lastResult?.x && <.../>` verengt den
  // Typ innerhalb des Blocks nicht.
  const reasonBanner = lastResult?.reason_code
    ? reasonCodeToBanner(lastResult.reason_code)
    : null

  const busy = generating || accepting

  return (
    <div className="space-y-4" data-testid="intent-proposal-tab">
      <div className="rounded-md border bg-muted/40 p-3 text-sm">
        <p className="font-medium">Arbeitspakete aus dem Vorhaben</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Ohne Kickoff-Datei. Grundlage ist ausschliesslich das, was Sie im
          Vorhaben beschrieben haben — die KI leitet daraus ab und erfindet
          nichts dazu.
        </p>
      </div>

      <Button
        type="button"
        size="sm"
        onClick={() => void onGenerate()}
        disabled={busy}
        data-testid="intent-generate"
      >
        {generating ? (
          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
        ) : (
          <Sparkles className="mr-1.5 h-3.5 w-3.5" aria-hidden />
        )}
        Aus Vorhaben vorschlagen
      </Button>

      {/* Die Absage ist der Normalfall (30 von 31 Projekten) und bekommt
          deshalb den ausführlichsten Zustand — mit der Zahl, damit niemand
          raten muss, wie viel zu wenig. */}
      {lastResult?.status === "substance_rejected" && lastResult.substance && (
        <div
          className="rounded-md border border-warning/40 bg-warning/5 p-3 text-sm"
          data-testid="intent-substance-rejected"
        >
          <div className="flex items-start gap-2">
            <Info
              className="mt-0.5 h-4 w-4 shrink-0 text-warning"
              aria-hidden
            />
            <div>
              <p className="font-medium text-warning">
                Noch nicht genug Grundlage
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {lastResult.substance.message}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* PROJ-137: ein leeres Ergebnis muss erklärbar sein. */}
      {reasonBanner && (
        <div
          className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/5 p-3 text-sm"
          data-testid="intent-reason-banner"
        >
          <ServerOff
            className="mt-0.5 h-4 w-4 shrink-0 text-warning"
            aria-hidden
          />
          <div>
            <p className="font-medium text-warning">
              {reasonBanner.title}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {reasonBanner.body}
            </p>
          </div>
        </div>
      )}

      {lastResult?.status === "success" &&
        lastResult.suggestion_ids.length === 0 && (
          <p className="text-xs text-muted-foreground">
            Die KI hat aus dem Vorhaben keine belastbaren Arbeitspakete
            abgeleitet. Eine kurze Liste ist ein zulässiges Ergebnis — eine
            erfundene lange wäre es nicht.
          </p>
        )}

      {loading ? (
        <p className="text-xs text-muted-foreground">Wird geladen …</p>
      ) : payloads.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Keine offenen Vorschläge.
        </p>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              {payloads.length} Vorschläge zur Prüfung
            </p>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={() => void onAccept(drafts.map((d) => d.id))}
              data-testid="intent-accept-all"
            >
              <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              Alle übernehmen ({payloads.length})
            </Button>
          </div>

          <ul className="space-y-1.5">
            {payloads.map(({ row, payload, depth }) => (
              <li
                key={row.id}
                className="rounded-md border bg-card p-2.5 text-sm"
                style={{ marginLeft: `${depth * 16}px` }}
                data-testid="intent-suggestion"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant="outline" className="text-[10px]">
                        {WORK_ITEM_KIND_LABELS[payload.kind] ?? payload.kind}
                      </Badge>
                      {/* Lock L2: die Herkunft folgt aus dem Zweck und wird
                          serverseitig gestempelt — sie steht NICHT in der
                          Modellantwort und ist deshalb nicht fälschbar. */}
                      <Badge
                        variant="outline"
                        className="text-[10px]"
                        title="Aus dem Vorhaben abgeleitet — nicht durch ein Dokument belegt."
                        data-testid="intent-origin-badge"
                      >
                        abgeleitet, nicht belegt
                      </Badge>
                    </div>
                    <p className="mt-1 font-medium">{payload.title}</p>
                    {payload.description && (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {payload.description}
                      </p>
                    )}
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => void onAccept([row.id])}
                  >
                    Übernehmen
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
