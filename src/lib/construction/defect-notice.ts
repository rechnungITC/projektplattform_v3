/**
 * PROJ-45-β — was eine Mängelanzeige umfasst und wie sie adressiert wird.
 *
 * Eine einzige Quelle, weil zwei Stellen dieselbe Frage stellen: der Dialog
 * zeigt vorab, wie viele Mängel aufgeführt werden, und die Druckseite führt sie
 * dann auf. Stünde die Statusauswahl an beiden Orten, könnte die angekündigte
 * Zahl von der gedruckten abweichen — genau die Klasse Widerspruch, die D-β8 für
 * die Überfälligkeit über die Sprachgrenze hinweg in Kauf nehmen muss und die
 * innerhalb von TypeScript vermeidbar ist.
 */

import type { ConstructionDefectStatus } from "@/types/construction-defect"

/**
 * Die Anzeige fordert Nachbesserung, deshalb führt sie die drei nicht
 * abschliessenden Zustände auf. Ausgenommen sind ausschliesslich die beiden
 * **abschliessenden**: bei `geprueft` ist die Nachbesserung abgenommen, bei
 * `verworfen` war es keiner — in beiden Fällen wäre eine Aufforderung falsch.
 *
 * `erledigt` bleibt bewusst drin und wird im Blatt als „fertiggemeldet,
 * Prüfung offen" gekennzeichnet: der Nachunternehmer hat gemeldet, abgenommen
 * ist es noch nicht, und ein stilles Weglassen würde eine Position verschwinden
 * lassen, die der Empfänger erwartet.
 */
export const NOTICE_STATUSES: readonly ConstructionDefectStatus[] = [
  "offen",
  "in_bearbeitung",
  "erledigt",
] as const

export interface DefectNoticeTarget {
  /** Projekt-Gewerk (`project_construction_trades.id`). */
  tradeId?: string
  /** Nachunternehmer (`vendors.id`). */
  vendorId?: string
}

/**
 * Adresse der Druckseite. Genau **eine** Achse — eine Anzeige geht an einen
 * Adressaten; das Gewerk hat Vorrang, wenn versehentlich beides gesetzt ist.
 */
export function defectNoticeHref(
  projectId: string,
  target: DefectNoticeTarget
): string {
  const base = `/projects/${encodeURIComponent(projectId)}/maengelanzeige/print`
  if (target.tradeId) {
    return `${base}?trade=${encodeURIComponent(target.tradeId)}`
  }
  if (target.vendorId) {
    return `${base}?vendor=${encodeURIComponent(target.vendorId)}`
  }
  return base
}
