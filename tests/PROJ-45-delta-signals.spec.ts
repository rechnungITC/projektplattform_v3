import { expect, test } from "@playwright/test"

/**
 * PROJ-45-δ — Auth-Gates der Terminsignal-Flächen.
 *
 * Ohne Sitzung muss jede neue Fläche mit exakt 307 auf /login umleiten und im
 * Rumpf nichts preisgeben. Der EINE Statuswert ist Absicht: die α-Zusicherung
 * erlaubte vier und wurde in der β-QA auf den verschärft, der wirklich auftritt.
 *
 * Was hier NICHT belegt ist, und zwar bewusst: die Modul-Tore (Lese-Absicht →
 * 404) und die Rechteregel. Ein unangemeldeter Aufruf kann darüber nichts
 * aussagen, weil die Umleitung VOR dem Tor greift. Beides liegt woanders:
 *  - Modul-Tor je Route: Route-Tests in
 *    src/app/api/projects/[id]/construction-schedule-signals/**\/route.test.ts
 *  - Sichtbarkeit, Aggregat-Leck und die Prädikat-Parität: live gegen Prod in
 *    tests/sql/PROJ-45-delta-schedule-signals-pentest.sql (46/46).
 */

const PROJECT = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa"
const BASE = `/api/projects/${PROJECT}/construction-schedule-signals`

const ROUTES: Array<{ name: string; path: string }> = [
  { name: "Auswertung", path: BASE },
  { name: "CSV Gewerke", path: `${BASE}/export?section=trades` },
  { name: "CSV Abschnitte", path: `${BASE}/export?section=sections` },
  { name: "CSV Fristen", path: `${BASE}/export?section=deadlines` },
  { name: "CSV Engpässe", path: `${BASE}/export?section=overdue_defects` },
]

test.describe("PROJ-45-δ — Terminsignale: Auth-Gates", () => {
  for (const route of ROUTES) {
    test(`GET ${route.name} ist ohne Sitzung gesperrt`, async ({ request }) => {
      const res = await request.get(route.path, { maxRedirects: 0 })
      expect(res.status()).toBe(307)
      const body = await res.text()
      // Geprüft wird die Abwesenheit von INHALT, nicht die des Pfades: der Rumpf
      // spiegelt `?next=<angefragter Pfad>` und damit die Eingabe des Aufrufers
      // selbst — das ist keine Preisgabe (Hausform aus der β/γ-Spec).
      expect(body).not.toContain("blocker_reasons")
      expect(body).not.toContain("progress_source")
      expect(body).not.toContain("overdue_defects")
      // Eine CSV-Route darf ohne Sitzung auch keinen CSV-Rumpf liefern.
      expect(res.headers()["content-type"] ?? "").not.toContain("text/csv")
    })
  }

  test("Reiter Terminsignale ist ohne Sitzung gesperrt", async ({ request }) => {
    const res = await request.get(`/projects/${PROJECT}/terminsignale`, { maxRedirects: 0 })
    expect(res.status()).toBe(307)
    const body = await res.text()
    expect(body).not.toContain("Terminsignale")
    expect(body).not.toContain("Blocker")
    expect(body).not.toContain("Nächste Fristen")
  })
})
