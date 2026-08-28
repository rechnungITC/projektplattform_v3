"use client"

/**
 * PROJ-153-α — das Vorhaben-Feld, an beiden Stellen dasselbe.
 *
 * **Warum es diese Komponente gibt.** Beim Abwägen der Substanz-Schwelle kam
 * heraus, dass die Schwelle gar nicht der Engpass war. Gemessen (Prod,
 * 2026-08-27): die fünf vorhandenen Vorhaben sind 97, 67, 55, 10 und 4 Zeichen
 * lang — jede denkbare Schwelle hätte alle abgelehnt. Der Grund stand im
 * Formular: das Feld hieß **„Beschreibung (optional)"**, war drei Zeilen hoch
 * und fragte **„Worum geht es in diesem Projekt?"** — eine Frage, auf die man
 * mit einem Satz antwortet. Die Nutzer haben sich genau so verhalten, wie die
 * Oberfläche es nahelegte.
 *
 * **Eine Komponente für beide Flächen** (Wizard und Projekt-Stammdaten). Zwei
 * Fassungen würden auseinanderlaufen, und dann sagt die eine Fläche etwas
 * anderes über dieselbe Schwelle als die andere.
 *
 * **Der Zähler ist ein Angebot, kein Tor.** Das Feld bleibt optional — wer kein
 * Vorhaben schreiben will, wird nicht gehindert. Der Hinweis sagt nur, was ab
 * wann zusätzlich möglich wird. Das eigentliche Tor sitzt serverseitig
 * (`intent-substance.ts`) und ist von hier aus nicht erreichbar.
 *
 * **Eine Autorität für die Zahl:** die Schwelle wird importiert, nicht
 * abgeschrieben. Eine zweite Zahl im Frontend wäre genau die Sorte stiller
 * Drift, die dieses Repo wiederholt teuer bezahlt hat.
 */

import * as React from "react"

import { Textarea } from "@/components/ui/textarea"
import { INTENT_MIN_HUMAN_CHARS } from "@/lib/ai/intent-substance"

interface ProjectIntentFieldProps {
  value: string | null | undefined
  onChange: (value: string) => void
  onBlur?: () => void
  name?: string
  disabled?: boolean
  /** Der Wizard zeigt weniger Zeilen als der Stammdaten-Dialog. */
  rows?: number
}

/** Der Beschriftungstext — hier, damit beide Flächen dieselbe Zusage machen. */
export const PROJECT_INTENT_LABEL = "Vorhaben (optional)"

export const PROJECT_INTENT_PLACEHOLDER =
  "Was soll erreicht werden, in welchem Umfang, mit welchen Rahmenbedingungen? " +
  "Je konkreter, desto besser lassen sich daraus Arbeitspakete ableiten."

/**
 * Sagt, wie weit der Text von der Nutzbarkeit entfernt ist.
 *
 * Bewusst zwei verschiedene Sätze statt eines mit Zahl: „noch 300 Zeichen"
 * liest sich wie eine Pflicht, „reicht für KI-Vorschläge" wie ein erreichter
 * Zustand. Der Unterschied ist der ganze Zweck des Hinweises.
 */
export function describeIntentProgress(length: number): {
  text: string
  reached: boolean
} {
  if (length >= INTENT_MIN_HUMAN_CHARS) {
    return {
      text: "Ausführlich genug, um daraus Arbeitspakete vorschlagen zu lassen.",
      reached: true,
    }
  }
  if (length === 0) {
    return {
      text:
        `Ab ${INTENT_MIN_HUMAN_CHARS} Zeichen kann die KI daraus Arbeitspakete ` +
        "vorschlagen.",
      reached: false,
    }
  }
  return {
    text:
      `${length} von ${INTENT_MIN_HUMAN_CHARS} Zeichen — ab dann kann die KI ` +
      "daraus Arbeitspakete vorschlagen.",
    reached: false,
  }
}

export function ProjectIntentField({
  value,
  onChange,
  onBlur,
  name,
  disabled,
  rows = 6,
}: ProjectIntentFieldProps) {
  const text = value ?? ""
  const progress = describeIntentProgress(text.trim().length)

  return (
    <div className="space-y-1.5">
      <Textarea
        name={name}
        rows={rows}
        maxLength={5000}
        disabled={disabled}
        placeholder={PROJECT_INTENT_PLACEHOLDER}
        value={text}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
      />
      {/* Der Zustand steht im Text und wird über aria-live angesagt — eine
          zusätzliche Farbcodierung wäre für Screenreader ohnehin stumm und
          hätte hier eine rohe Palette-Farbe gebraucht (Token-Drift-Wächter). */}
      <p className="text-xs text-muted-foreground" aria-live="polite">
        {progress.text}
      </p>
    </div>
  )
}
