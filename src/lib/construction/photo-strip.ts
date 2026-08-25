/**
 * PROJ-45-ε — reine Helfer der Fotostrecke.
 *
 * Getrennt von der Komponente, damit die drei Entscheidungen prüfbar sind, die
 * beim Ansehen leicht falsch erscheinen: was ein Mehrfach-Upload dem Nutzer
 * meldet, wie sich die Reihenfolge ändert, und welche Handlung überhaupt
 * angeboten wird.
 */

import type {
  ConstructionPhoto,
  ConstructionPhotoUploadOutcome,
} from "@/types/construction-photo"

/**
 * Zusammenfassung eines Mehrfach-Uploads.
 *
 * AC-45ε.2 verlangt, dass die Antwort **je Datei** das Ergebnis benennt. Eine
 * Meldung „3 von 5 hochgeladen" verschweigt, welche zwei fehlen und warum —
 * genau die Klasse stiller Auslassung, die 45l beseitigt hat. Deshalb trägt die
 * Zusammenfassung die abgewiesenen Dateien namentlich.
 */
export interface UploadSummary
  extends Record<"okCount" | "failedCount", number> {
  /** `null`, wenn alles durchging. */
  failures: Array<{ filename: string; message: string }>
  headline: string
}

export function summarizeUploads(
  outcomes: ConstructionPhotoUploadOutcome[],
): UploadSummary {
  const ok = outcomes.filter((o) => o.ok)
  const failed = outcomes.filter((o) => !o.ok)
  const headline =
    failed.length === 0
      ? ok.length === 1
        ? "Foto hinzugefügt"
        : `${ok.length} Fotos hinzugefügt`
      : ok.length === 0
        ? failed.length === 1
          ? "Datei abgewiesen"
          : `${failed.length} Dateien abgewiesen`
        : `${ok.length} hinzugefügt, ${failed.length} abgewiesen`
  return {
    okCount: ok.length,
    failedCount: failed.length,
    failures: failed.map((f) => ({
      filename: f.filename,
      message: f.message ?? "Unbekannter Grund",
    })),
    headline,
  }
}

/**
 * Reihenfolge-Tausch (AC-45ε.6).
 *
 * Gibt die **beiden** Fotos zurück, deren `sort_order` sich ändert — nicht die
 * ganze neu sortierte Liste. Ein Tausch braucht zwei Schreibvorgänge; die ganze
 * Liste durchzunummerieren wären N Schreibvorgänge für eine Bewegung, und bei
 * einem Fehlschlag in der Mitte bliebe die Strecke halb umsortiert.
 *
 * Am Rand (erstes Foto nach links) ist das Ergebnis `null` — die Fläche bietet
 * die Handlung dort gar nicht an.
 */
export interface PhotoSwap {
  a: { id: string; sort_order: number }
  b: { id: string; sort_order: number }
}

export function planPhotoSwap(
  photos: ConstructionPhoto[],
  photoId: string,
  direction: "up" | "down",
): PhotoSwap | null {
  const index = photos.findIndex((p) => p.id === photoId)
  if (index < 0) return null
  const other = direction === "up" ? index - 1 : index + 1
  if (other < 0 || other >= photos.length) return null

  const self = photos[index]
  const neighbour = photos[other]
  // Gleiche Werte kommen vor (die Anlage vergibt fortlaufend, aber Löschen
  // hinterlässt Lücken und ein Import könnte doppeln). Dann wird der Nachbar
  // gezielt um eins verschoben, sonst wäre der Tausch wirkungslos.
  if (self.sort_order === neighbour.sort_order) {
    return {
      a: { id: self.id, sort_order: direction === "up" ? self.sort_order - 1 : self.sort_order + 1 },
      b: { id: neighbour.id, sort_order: neighbour.sort_order },
    }
  }
  return {
    a: { id: self.id, sort_order: neighbour.sort_order },
    b: { id: neighbour.id, sort_order: self.sort_order },
  }
}

/**
 * Was die Fläche anbietet.
 *
 * Die Rechte (AC-45ε.16/.17, β-Regel) leben in den Datenbankfunktionen; hier
 * wird nur entschieden, welcher Knopf erscheint, damit keiner in eine Absage
 * führt. **Hinzufügen ist bewusst nicht gegated** — jedes Projektmitglied darf
 * fotografieren, Betrachter eingeschlossen.
 */
export interface PhotoActions {
  canAdd: boolean
  canEditMeta: boolean
  canReorder: boolean
  canUnlink: boolean
  canDeleteFile: boolean
}

export function offeredPhotoActions(
  canManage: boolean,
  /**
   * `true` an einer **protokollierten** Abnahme (Q-ε7): dort darf ergänzt,
   * aber nicht entfernt werden — ein Nachweis soll nicht aus einem bereits
   * gedruckten Protokoll verschwinden. Die Durchsetzung ist
   * `construction_photo_removal_guard`, der bei den drei Ergebnis-Status mit
   * `42501` abweist (live gegen die deployte Definition abgeglichen); die
   * Fläche bietet die Handlung dann gar nicht erst an.
   *
   * Bildunterschrift, Datum und Reihenfolge bleiben änderbar — der Wächter
   * hängt allein am Löschen, und ein nachgetragener Bildtext ist die
   * Ergänzung, die Q-ε7 ausdrücklich zulässt.
   */
  frozen = false,
): PhotoActions {
  return {
    canAdd: true,
    canEditMeta: canManage,
    canReorder: canManage,
    canUnlink: canManage && !frozen,
    canDeleteFile: canManage && !frozen,
  }
}

/** Anzeigeform der Dateigröße — „—" statt „0 B" bei fehlender Angabe. */
export function formatPhotoSize(bytes: number | null): string {
  if (bytes === null || bytes <= 0) return "—"
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
