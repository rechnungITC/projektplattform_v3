/**
 * PROJ-80-α — die Spalten, die die Quintessenz-Fläche liest.
 *
 * Eigenes Modul und nicht in der Route, aus einem einzigen Grund: der
 * Schema-Drift-Wächter erkennt nur String-Literale unmittelbar in einer
 * `.from("…").select("…")`-Kette (`scripts/check-schema-drift/ast-walker.ts`).
 * Sobald die Spaltenliste — wie hier sinnvoll — eine Konstante ist, sieht er sie
 * nicht mehr. Von hier aus kann ein Test sie gegen die Migrationsdateien prüfen
 * und die verlorene Deckung ersetzen; das läuft zudem ohne Docker (offener
 * Handoff PROJ-67/F6).
 *
 * Beide Tabellen sind seit PROJ-80-α.1 in Produktion. Driftete eine Spalte, wäre
 * die Folge kein Testfehler, sondern ein 500 auf der Detailseite.
 */

export const SUMMARY_COLUMNS = [
  "document_id",
  "structured_summary",
  "summary_markdown",
  "status",
  "reason_code",
  "generated_at",
  "generated_by_skill_version_id",
  "edited_by_user_id",
  "edited_at",
  "updated_at",
] as const

export const EXTRACTION_COLUMNS = [
  "status",
  "char_count",
  "page_count",
  "failure_code",
  "privacy_class",
  "classification_unverified",
  "extracted_at",
] as const

/** Spalten je Tabelle — die Form, die der Migrations-Abgleich im Test erwartet. */
export const SUMMARY_READ_COLUMNS = {
  document_summaries: SUMMARY_COLUMNS,
  document_extractions: EXTRACTION_COLUMNS,
} as const

export const SUMMARY_SELECT = SUMMARY_COLUMNS.join(", ")
export const EXTRACTION_SELECT = EXTRACTION_COLUMNS.join(", ")
