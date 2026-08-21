"use client"

/**
 * PROJ-80-α — Quintessenz-Reiter am ausgewählten Dokument.
 *
 * Der eigentliche Anspruch dieser Fläche ist nicht das Anzeigen der Kurzfassung,
 * sondern das **Unterscheiden**: „läuft noch", „Dokument hat keine Textebene",
 * „zu groß", „kein zulässiger Anbieter" und „ist da" sind fünf Zustände mit
 * fünf verschiedenen nächsten Schritten. Ein gemeinsames „keine Quintessenz
 * vorhanden" wäre bequem und falsch — und würde einen Vertraulichkeits-Block
 * wie ein Produktversagen aussehen lassen.
 */

import * as React from "react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import {
  DmsRequestError,
  fetchDocumentSummary,
  retryDocumentSummary,
  saveDocumentSummary,
  type DocumentSummaryResponse,
} from "@/lib/dms/api"

/** Erklärt einen Auszugs-Zustand in einem Satz plus nächstem Schritt. */
function explainExtraction(status: string, failureCode: string | null): {
  title: string
  body: string
} {
  switch (status) {
    case "pending":
      return {
        title: "Textauszug läuft",
        body: "Das Dokument wird gerade ausgewertet. Diese Ansicht aktualisiert sich beim nächsten Öffnen.",
      }
    case "too_large":
      return {
        title: "Dokument zu umfangreich",
        body: "Der Text überschreitet die Grenze, bis zu der er vollständig geprüft werden kann. Eine Quintessenz entsteht erst, wenn abschnittsweises Auswerten verfügbar ist.",
      }
    case "unsupported_type":
      return {
        title: "Dateityp wird nicht ausgewertet",
        body: "Für diesen Dateityp gibt es keinen Textauszug. Unterstützt sind derzeit PDF, DOCX sowie Text- und Markdown-Dateien.",
      }
    case "failed":
      return failureCode === "no_text_layer"
        ? {
            title: "Kein Text im Dokument",
            body: "Die Datei enthält keine Textebene — typisch für eingescannte Seiten. Eine Texterkennung ist derzeit nicht Teil des Produkts.",
          }
        : {
            title: "Textauszug fehlgeschlagen",
            body: "Die Datei konnte nicht ausgewertet werden. Erneutes Hochladen ist der zuverlässigste Weg.",
          }
    default:
      return { title: "Unbekannter Zustand", body: status }
  }
}

/** Übersetzt den maschinenlesbaren Grund aus PROJ-137. */
function explainReason(code: string | null): string {
  switch (code) {
    case "class3_blocked":
      return "Das Dokument enthält personenbezogene Daten. Es darf deshalb nur an einen mandanteneigenen Anbieter gehen — es ist keiner eingerichtet."
    case "no_provider":
      return "Für diesen Workspace ist kein KI-Anbieter hinterlegt."
    case "cost_cap_exceeded":
      return "Das Monatsbudget für KI-Aufrufe ist ausgeschöpft."
    case "external_ai_disabled":
      return "Externe KI ist für diese Umgebung abgeschaltet."
    case "provider_error":
      return "Der KI-Anbieter hat nicht geantwortet."
    default:
      return "Es wurde keine Quintessenz erzeugt."
  }
}

/**
 * „Neu erzeugen" über eine von Hand geänderte Fassung ist der einzige Weg im
 * Produkt, der eine menschlich verantwortete Quintessenz vernichtet — und die
 * Spec erlaubt das ausdrücklich nur als bewusste Ausnahme („unless admin
 * force-re-runs"). Ein Klick ohne Rückfrage wäre die Ausnahme als Regel.
 *
 * Auf Modulebene und nicht im Render: eine im Render erzeugte Komponente
 * verliert bei jedem Durchlauf ihren Zustand (`react-hooks/static-components`) —
 * beim Bestätigungsdialog hieße das, dass er sich unter der Hand schließt.
 */
function RegenerateButton({
  hasUserEdit,
  busy,
  onConfirm,
}: {
  hasUserEdit: boolean
  busy: boolean
  onConfirm: () => void
}) {
  const label = busy ? "Läuft …" : "Neu erzeugen"
  if (!hasUserEdit) {
    return (
      <Button size="sm" variant="ghost" onClick={onConfirm} disabled={busy}>
        {label}
      </Button>
    )
  }
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="ghost" disabled={busy}>
          {label}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Handänderung überschreiben?</AlertDialogTitle>
          <AlertDialogDescription>
            Diese Quintessenz wurde von Hand angepasst. Neu erzeugen ersetzt den
            angepassten Text durch eine frisch erzeugte Fassung. Der bisherige
            Wortlaut bleibt nur im Änderungsverlauf erhalten.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Abbrechen</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Überschreiben</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

export function DocumentSummaryPanel({
  projectId,
  documentId,
  canEdit,
}: {
  projectId: string
  documentId: string
  canEdit: boolean
}) {
  const [data, setData] = React.useState<DocumentSummaryResponse | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [draft, setDraft] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)

  /**
   * Neuladen über einen Zähler statt über eine geteilte `load()`-Funktion.
   *
   * Der erste Anlauf rief eine `useCallback`-Funktion, die vor dem `await` schon
   * `setLoading(true)` setzte — `react-hooks/set-state-in-effect` hat das zu
   * Recht abgelehnt. Haus-Muster ist `use-tenant-members`: Anfangszustand
   * `loading = true`, Zustand ausschließlich NACH dem `await`, Neuladen über
   * einen Zähler in der Abhängigkeitsliste. Ein Ladeweg bleibt es dadurch
   * trotzdem.
   */
  const [tick, setTick] = React.useState(0)

  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await fetchDocumentSummary(projectId, documentId)
        // Der `cancelled`-Wächter ist hier nicht Zierde: der Nutzer klickt im
        // Baum weiter, während die Antwort noch läuft — ohne ihn schreibt die
        // alte Anfrage die Quintessenz des vorigen Dokuments in die neue Ansicht.
        if (cancelled) return
        setData(res)
        setDraft(null)
        setError(null)
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : "Laden fehlgeschlagen.")
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [projectId, documentId, tick])

  async function handleSave() {
    if (!data?.summary || draft == null) return
    setBusy(true)
    setError(null)
    try {
      const saved = await saveDocumentSummary(
        projectId,
        documentId,
        draft,
        data.summary.updated_at,
      )
      setData({ ...data, summary: saved })
      setDraft(null)
    } catch (err) {
      // 409 ist kein Fehlschlag der Anwendung, sondern eine Aussage über die
      // Wirklichkeit: jemand anders war schneller.
      if (err instanceof DmsRequestError && err.status === 409) {
        setError(
          "Jemand anders hat die Quintessenz zwischenzeitlich geändert. Bitte neu laden — deine Änderung ist noch im Feld.",
        )
      } else {
        setError(err instanceof Error ? err.message : "Speichern fehlgeschlagen.")
      }
    } finally {
      setBusy(false)
    }
  }

  async function handleRetry() {
    setBusy(true)
    setError(null)
    try {
      await retryDocumentSummary(projectId, documentId)
      // Nicht die Antwort des Laufs anzeigen, sondern neu laden: der Lauf gibt
      // nur Zustand und Grund zurück, die Ansicht braucht auch den Text.
      setTick((t) => t + 1)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erneuter Versuch fehlgeschlagen.")
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-2" aria-busy="true">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
      </div>
    )
  }

  if (error && !data) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Quintessenz konnte nicht geladen werden</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    )
  }

  const extraction = data?.extraction ?? null
  const summary = data?.summary ?? null

  // 1. Kein Auszug angestoßen — das Dokument stammt aus der Zeit vor PROJ-80.
  if (!extraction) {
    return (
      <Alert>
        <AlertTitle>Noch nicht ausgewertet</AlertTitle>
        <AlertDescription>
          Für dieses Dokument wurde noch kein Textauszug erzeugt. Bei Dokumenten,
          die vor der Einführung der Quintessenz hochgeladen wurden, geschieht
          das beim nächsten nächtlichen Lauf.
        </AlertDescription>
      </Alert>
    )
  }

  // 2. Auszug vorhanden, aber nicht verwertbar — der Zustand IST die Erklärung.
  if (extraction.status !== "extracted") {
    const e = explainExtraction(extraction.status, extraction.failure_code)
    return (
      <Alert>
        <AlertTitle>{e.title}</AlertTitle>
        <AlertDescription>{e.body}</AlertDescription>
      </Alert>
    )
  }

  // 3. Auszug da, aber keine Quintessenz erzeugt — Grund + Wiederholen.
  if (!summary || summary.status === "stale" || !summary.summary_markdown) {
    return (
      <div className="space-y-3">
        <Alert>
          <AlertTitle>Quintessenz nicht erzeugt</AlertTitle>
          <AlertDescription>
            {explainReason(summary?.reason_code ?? null)}
          </AlertDescription>
        </Alert>
        {canEdit ? (
          <Button size="sm" onClick={handleRetry} disabled={busy}>
            {busy ? "Läuft …" : "Erneut versuchen"}
          </Button>
        ) : null}
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    )
  }

  // 4. Quintessenz vorhanden.
  const isEditing = draft != null
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={summary.status === "user_edited" ? "default" : "secondary"}>
          {summary.status === "user_edited" ? "Von Hand geändert" : "Automatisch erzeugt"}
        </Badge>
        {extraction.classification_unverified ? (
          <Badge variant="outline">Klassifikation unbestätigt</Badge>
        ) : null}
        {summary.generated_at ? (
          <span className="text-xs text-muted-foreground">
            {new Date(summary.generated_at).toLocaleString("de-DE")}
          </span>
        ) : null}
      </div>

      {isEditing ? (
        <>
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={14}
            aria-label="Quintessenz bearbeiten"
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={handleSave} disabled={busy || draft.trim().length === 0}>
              {busy ? "Speichert …" : "Speichern"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setDraft(null)} disabled={busy}>
              Verwerfen
            </Button>
          </div>
        </>
      ) : (
        <>
          <div className="whitespace-pre-wrap rounded-md border bg-muted/30 p-3 text-sm">
            {summary.summary_markdown}
          </div>
          {canEdit ? (
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setDraft(summary.summary_markdown ?? "")}
              >
                Bearbeiten
              </Button>
              <RegenerateButton
                hasUserEdit={summary.status === "user_edited"}
                busy={busy}
                onConfirm={handleRetry}
              />
            </div>
          ) : null}
        </>
      )}

      {summary.status === "user_edited" ? (
        <p className="text-xs text-muted-foreground">
          Diese Fassung wurde von Hand angepasst. Automatische Läufe überschreiben
          sie nicht mehr &mdash; &bdquo;Neu erzeugen&ldquo; ersetzt sie bewusst.
        </p>
      ) : null}

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}
