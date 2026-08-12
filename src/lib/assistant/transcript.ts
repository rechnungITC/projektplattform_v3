/**
 * Transkript-Bereinigung für Assistant-Eingaben (PROJ-40).
 *
 * Herausgelöst in PROJ-144: neben der Turn-Route braucht auch der Sprach-Entwurf
 * dieselbe Bereinigung, wenn der Mandant „bereinigt speichern" eingestellt hat
 * (AC-144.26). Zwei Kopien derselben Regex-Liste würden auseinanderdriften —
 * und eine vergessene Kopie hieße unbereinigte Kontaktdaten in der Datenbank.
 */

const MAX_PERSISTED_LENGTH = 5000

export function redactTranscript(input: string): string {
  return input
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]")
    .replace(/\+?\d[\d\s()./-]{6,}\d/g, "[redacted-phone]")
    .slice(0, MAX_PERSISTED_LENGTH)
}

/**
 * Was von der Eingabe gespeichert werden darf.
 * `none`/`metadata` → nichts; `redacted` → bereinigte Fassung.
 */
export function transcriptForPersistence(
  input: string,
  persistence: "none" | "metadata" | "redacted",
): string | null {
  return persistence === "redacted" ? redactTranscript(input) : null
}
