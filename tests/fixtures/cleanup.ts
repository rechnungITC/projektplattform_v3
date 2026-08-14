/**
 * Aufräum-Helfer für E2E-Specs (PROJ-Y-143o).
 *
 * Hintergrund: der Fixture-Mandant hatte 19 verwaiste Testprojekte angesammelt, obwohl **alle**
 * betroffenen Specs ein `afterAll` mit Projekt-Löschung hatten. Die Löschungen schlugen fehl —
 * man sah es nur nicht, weil jeder Teardown seine Fehler verschluckte (`safe()`,
 * `.then(()=>undefined,()=>undefined)`, `try {} catch {}`). Zwei stumme Fehler lagen übereinander:
 *
 *   1. die Teardowns löschten aus `project_members` — diese Tabelle existiert nicht,
 *      sie heißt `project_memberships`;
 *   2. der anschließende Projekt-Delete brach mit `23514 / project must have at least one lead`
 *      ab (PROJ-148) — derselbe Fehler, der auch im Produkt „endgültig löschen" unbrauchbar machte.
 *
 * Beide waren tagelang unsichtbar. Das Verschlucken ist deshalb der eigentliche Defekt: ein
 * Aufräumschritt, der nicht sagen kann, dass er gescheitert ist, verwandelt jeden Folgefehler in
 * langsam wachsenden Datenmüll — und der wird mit der Zeit stillschweigend zur Fixture, auf die
 * sich anderes verlässt (in PROJ-Y-143c hing ein Sicherheitsnachweis an so einer Zeile).
 *
 * Regel hier: **das Löschen des Projekts ist laut, der Rest darf leise bleiben.** Beim Projekt
 * hängt die Anhäufung; bei Storage-Objekten oder Kindzeilen ist ein Fehlschlag folgenlos genug,
 * dass ein roter Lauf mehr Schaden als Nutzen brächte.
 */

type DeleteResult = { error: { message: string } | null }

/**
 * Führt eine Löschung aus und wirft mit Kontext, wenn sie fehlschlägt.
 *
 * supabase-js wirft bei Datenbankfehlern **nicht** — es gibt `{ error }` zurück. Ein
 * `await admin.from(...).delete().eq(...)` ohne Prüfung sieht deshalb wie erfolgreiches
 * Aufräumen aus und ist doch keins. Genau diese Form stand an allen drei Fundstellen.
 */
export async function deleteOrThrow(
  result: PromiseLike<DeleteResult>,
  what: string,
): Promise<void> {
  const { error } = await result
  if (error) {
    throw new Error(
      `Teardown fehlgeschlagen (${what}): ${error.message}. ` +
        `Nicht ignorieren — so entsteht die Halde aus PROJ-Y-143o.`,
    )
  }
}
