/**
 * PROJ-45-ε — Fotodokumentation.
 *
 * Diese Datei ist die einzige TypeScript-Wahrheit für die Form; Routen,
 * Client-Wrapper und Oberfläche leiten davon ab.
 */

/** Genau ein Bezug je Foto (L32) — erzwungen von einer CHECK-Bedingung. */
export type ConstructionPhotoAnchorKind = "defect" | "acceptance" | "section"

/** Abgeleitete Größen (L35). `original` ist die unangetastete Datei. */
export type ConstructionPhotoSize = "preview" | "print" | "original"

export interface ConstructionPhoto {
  id: string
  project_id: string
  /** Verweis auf das DMS-Dokument; die Datei selbst liegt dort. */
  document_id: string
  defect_id: string | null
  acceptance_id: string | null
  section_id: string | null
  caption: string | null
  /**
   * Tagesdatum der Aufnahme, aus `DateTimeOriginal` vorbelegt (L36). `null`
   * heisst: das Bild trug keine Angabe — es wird **kein** Datum erfunden
   * (AC-45ε.7).
   */
  taken_on: string | null
  sort_order: number
  created_by: string | null
  created_at: string
  /** Aus dem verknüpften Dokument mitgelesen, für Anzeige und Download. */
  original_filename: string | null
  mime_type: string | null
  size_bytes: number | null
}

/** Zähler je Bezug für die α-Abschnittsfläche (AC-45ε.15). */
export interface ConstructionPhotoCounts {
  project_id: string
  total: number
  by_defect: Record<string, number>
  by_acceptance: Record<string, number>
  by_section: Record<string, number>
}

/** Ergebnis je Datei eines Mehrfach-Uploads (AC-45ε.2). */
export interface ConstructionPhotoUploadOutcome {
  filename: string
  ok: boolean
  photo?: ConstructionPhoto
  /** Stabiler Code für die Oberfläche — nie auf den Meldungstext prüfen. */
  code?: string
  message?: string
}
