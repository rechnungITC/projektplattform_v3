/**
 * Reine Entscheidungsregeln für Projekt-Schreibrechte.
 *
 * Herausgelöst in PROJ-144, weil neben `requireProjectAccess` (API-Ebene, gibt
 * eine HTTP-Antwort zurück) auch die Assistant-Runtime dieselbe Frage stellen
 * muss — dort aber als Wahrheitswert, um schon beim Diktat abzusagen statt eine
 * Prüfansicht anzubieten, die beim Bestätigen scheitert (Tech Design D6).
 *
 * Ohne diese Auslagerung stünde die Drei-Rollen-Regel an zwei Stellen; genau
 * solche Duplikate driften auseinander.
 */

/** Darf mit dieser Rollenkombination fachlich geschrieben werden? */
export function isProjectEditAllowed(
  tenantRole: string | null,
  projectRole: string | null,
): boolean {
  return (
    tenantRole === "admin" || projectRole === "lead" || projectRole === "editor"
  )
}

/** Darf mit dieser Rollenkombination die Besetzung geändert werden? */
export function isProjectMemberManagementAllowed(
  tenantRole: string | null,
  projectRole: string | null,
): boolean {
  return tenantRole === "admin" || projectRole === "lead"
}
