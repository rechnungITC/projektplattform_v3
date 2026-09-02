"use client"

import { AlertTriangle, CalendarClock, Check, X } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

/**
 * PROJ-155-β.2 — die Kopfzeile der Kaskaden-Vorschau.
 *
 * Sie ist der ganze Unterschied zwischen „Vorschau" und „stiller Kaskade": ein
 * Zug schreibt nicht, er **schlägt vor**. Drei Messungen erzwingen das
 * (Design-Brief, β.2): es gibt kein Rückgängig im Gantt, jede verschobene Zeile
 * kostet zwei append-only Audit-Zeilen, und α hat dieselbe Frage beim
 * Sammelvorgang schon so entschieden („sein Zeitraum ist ein Ergebnis, kein
 * Eingabefeld").
 *
 * Was hier **nicht** passiert: Schönen. Terminlose Nachfolger werden benannt
 * statt beschenkt (AC-16), Konflikte werden benannt statt heimlich repariert,
 * und eine gekappte Kaskade sagt das — die PROJ-Y-45l-Lehre, wo ein Riegel still
 * unterberichtete.
 */

export interface CascadePreviewSummary {
  /** Zahl der Nachfolger, die sich verschieben. */
  shiftCount: number
  /** Um wie viele Tage (der häufigste Wert; bei gemischten Werten `null`). */
  commonDeltaDays: number | null
  /** Nachfolger ohne eigenen Termin — bekommen keinen erfunden. */
  skippedCount: number
  /** Bedingungen, die nach der Kaskade verletzt bleiben. */
  conflictCount: number
  /** Wurde die Tiefengrenze erreicht? */
  truncated: boolean
}

interface CascadePreviewBarProps {
  summary: CascadePreviewSummary
  busy?: boolean
  onApply: () => void
  onDiscard: () => void
}

/**
 * Der Satz, der die Zahl trägt. Bewusst eine Funktion und exportiert, damit ein
 * Test ihn prüfen kann, ohne die Komponente zu rendern.
 */
export function cascadeHeadline(summary: CascadePreviewSummary): string {
  const { shiftCount, commonDeltaDays } = summary
  if (shiftCount === 0) return "Keine Nachfolger betroffen"
  const wer = shiftCount === 1 ? "1 Nachfolger verschiebt sich" : `${shiftCount} Nachfolger verschieben sich`
  if (commonDeltaDays === null) return `${wer} unterschiedlich weit`
  const tage = Math.abs(commonDeltaDays) === 1 ? "1 Tag" : `${Math.abs(commonDeltaDays)} Tage`
  return `${wer} um ${tage}`
}

export function CascadePreviewBar({
  summary,
  busy = false,
  onApply,
  onDiscard,
}: CascadePreviewBarProps) {
  const hatHinweise =
    summary.skippedCount > 0 || summary.conflictCount > 0 || summary.truncated

  return (
    <div
      role="region"
      aria-label="Vorschau der Terminverschiebung"
      className="flex flex-wrap items-center gap-3 rounded-md border border-warning/40 bg-warning/5 px-3 py-2"
    >
      <CalendarClock className="size-4 shrink-0 text-warning" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{cascadeHeadline(summary)}</p>
        {hatHinweise ? (
          <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
            {summary.skippedCount > 0 ? (
              <li>
                {summary.skippedCount === 1
                  ? "1 Nachfolger bekommt keinen Termin (keiner gesetzt)"
                  : `${summary.skippedCount} Nachfolger bekommen keinen Termin (keiner gesetzt)`}
              </li>
            ) : null}
            {summary.conflictCount > 0 ? (
              <li className="text-destructive">
                {summary.conflictCount === 1
                  ? "1 Abhängigkeit bleibt danach verletzt"
                  : `${summary.conflictCount} Abhängigkeiten bleiben danach verletzt`}{" "}
                — Übernehmen ist möglich, der Plan wird dann eng
              </li>
            ) : null}
            {summary.truncated ? (
              <li className="text-destructive">
                Die Kette ist länger als berechnet wird — die Vorschau ist
                unvollständig
              </li>
            ) : null}
          </ul>
        ) : null}
      </div>

      {summary.conflictCount > 0 ? (
        <Badge variant="destructive" className="gap-1">
          <AlertTriangle className="size-3" aria-hidden />
          {summary.conflictCount}
        </Badge>
      ) : null}

      <div className="flex shrink-0 items-center gap-2">
        <Button size="sm" onClick={onApply} disabled={busy}>
          <Check className="size-4" aria-hidden />
          {busy ? "Übernehmen …" : "Übernehmen"}
        </Button>
        <Button size="sm" variant="ghost" onClick={onDiscard} disabled={busy}>
          <X className="size-4" aria-hidden />
          Verwerfen
        </Button>
      </div>
    </div>
  )
}
