/**
 * PROJ-45-γ — die eine TypeScript-Seite der Gewährleistungsrechnung.
 *
 * Die Frist wird beim Protokollieren in der Datenbank FESTGESCHRIEBEN
 * (`(accepted_on + make_interval(months => n))::date`). Die Maske muss sie schon
 * vorher zeigen — damit existiert sie zwangsläufig zweimal, und genau dort
 * wurde ein Fehler gemessen, nicht vermutet:
 *
 *   Postgres KLEMMT am Monatsende, JavaScript LÄUFT ÜBER.
 *     2026-01-31 + 1 Monat  → Postgres 2026-02-28, `setUTCMonth` 2026-03-03
 *     2026-08-31 + 6 Monate → Postgres 2027-02-28, `setUTCMonth` 2027-03-03
 *
 * Die naive Fassung hätte dem Nutzer also ein anderes — rechtlich relevantes —
 * Fristende angezeigt, als danach gespeichert wird. Diese Funktion klemmt
 * darum ausdrücklich, und die fünf Paare oben sind live gegen Prod gemessen und
 * im Test eingefroren.
 */

/**
 * Fristende aus Abnahmedatum und Dauer in Monaten — mit Klemmung am
 * Monatsende, wie Postgres.
 *
 * Gibt `null` zurück, wenn eines der beiden fehlt oder das Datum unbrauchbar
 * ist; „keine Frist" ist ein zulässiger Zustand (eine verweigerte Abnahme setzt
 * keine in Gang).
 */
export function warrantyEndDate(
  acceptedOn: string | null | undefined,
  months: number | null | undefined
): string | null {
  if (!acceptedOn || !months || months <= 0) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(acceptedOn)
  if (!m) return null

  const year = Number(m[1])
  const month = Number(m[2]) // 1-basiert
  const day = Number(m[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) return null

  const zeroBased = month - 1 + months
  const targetYear = year + Math.floor(zeroBased / 12)
  const targetMonth = (zeroBased % 12 + 12) % 12 // 0-basiert

  // Klemmen statt überlaufen: der 31. eines Monats landet im Zielmonat auf
  // dessen letztem Tag, nicht im Folgemonat.
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate()
  const targetDay = Math.min(day, lastDay)

  const pad = (n: number) => String(n).padStart(2, "0")
  return `${targetYear}-${pad(targetMonth + 1)}-${pad(targetDay)}`
}

/**
 * Ein Mangel gilt für die Abnahme als offen, solange er nicht geprüft ist.
 * `erledigt` zählt bewusst mit: dort ist fertiggemeldet, aber noch niemand hat
 * nachgesehen — für eine Abnahme ist das nicht erledigt.
 */
export const ACCEPTANCE_OPEN_DEFECT_STATUSES = [
  "offen",
  "in_bearbeitung",
  "erledigt",
] as const
