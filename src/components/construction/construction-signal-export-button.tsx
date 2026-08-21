"use client"

import { Download } from "lucide-react"

import { Button } from "@/components/ui/button"
import { constructionScheduleSignalsExportUrl } from "@/lib/construction/api"
import type { ConstructionSignalExportSection } from "@/types/construction-signals"

/**
 * PROJ-45-δ — CSV-Ausgabe je Block (D-δ7).
 *
 * Die Route rechnet DIESELBE Auswertung wie die Ansicht; es wird also nichts
 * exportiert, was hier nicht steht, und nichts nachgerechnet. `disabled` hängt
 * an der Zahl der angezeigten Zeilen: eine leere Datei anzubieten wäre kein
 * Fehler, aber ein leeres Versprechen.
 *
 * Kein `onClick`-Handler und kein `fetch`: ein gewöhnlicher Verweis mit
 * `download` schickt die Sitzungs-Cookies mit und lässt die Route (und damit
 * die RLS des Aufrufers) über den Inhalt entscheiden — Muster aus PROJ-103/131.
 */
export function ConstructionSignalExportButton({
  projectId,
  section,
  label,
  disabled = false,
}: {
  projectId: string
  section: ConstructionSignalExportSection
  label: string
  disabled?: boolean
}) {
  if (disabled) {
    return (
      <Button
        size="sm"
        variant="outline"
        disabled
        aria-label={`${label} als CSV herunterladen`}
      >
        <Download className="mr-1 h-3.5 w-3.5" aria-hidden />
        {label}
      </Button>
    )
  }
  return (
    <Button asChild size="sm" variant="outline">
      {/*
        Der sichtbare Text ist knapp („Gewerke"), weil er neben dem Blocktitel
        steht — als ZUGÄNGLICHER Name wäre er aber doppelt und verschwiege, dass
        hier eine Datei kommt. Darum ein eigener `aria-label` (QA-Befund δ).
      */}
      <a
        href={constructionScheduleSignalsExportUrl(projectId, section)}
        download
        aria-label={`${label} als CSV herunterladen`}
      >
        <Download className="mr-1 h-3.5 w-3.5" aria-hidden />
        {label}
      </a>
    </Button>
  )
}
