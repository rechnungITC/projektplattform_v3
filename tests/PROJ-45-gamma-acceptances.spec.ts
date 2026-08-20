import { expect, test } from "@playwright/test"

/**
 * PROJ-45-γ — Auth-Gates der Abnahme-Flächen.
 *
 * Ohne Sitzung muss JEDE neue Fläche mit exakt 307 auf /login umleiten und
 * darf im Rumpf nichts preisgeben. Der eine Statuswert ist Absicht: die
 * α-Zusicherung erlaubte vier und wurde in der β-QA auf den einen verschärft,
 * der wirklich auftritt.
 *
 * Alles Weitergehende (Rollenregel, Vier-Augen-Fragen, Einfrieren, Vorbehalte)
 * ist NICHT hier belegt, sondern live gegen Prod in
 * tests/sql/PROJ-45-gamma-construction-acceptances-pentest.sql — ein
 * unangemeldeter Aufruf kann darüber nichts aussagen.
 */

const PROJECT = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa"
const AID = "11111111-7777-4777-8777-111111111111"
const BASE = `/api/projects/${PROJECT}/construction-acceptances`

const ROUTES: Array<{ name: string; path: string; method: "GET" | "POST" | "PATCH" | "PUT" }> = [
  { name: "Liste", path: BASE, method: "GET" },
  { name: "Ansetzen", path: BASE, method: "POST" },
  { name: "Kopfzahlen", path: `${BASE}/summary`, method: "GET" },
  { name: "Detail", path: `${BASE}/${AID}`, method: "GET" },
  { name: "Ändern", path: `${BASE}/${AID}`, method: "PATCH" },
  { name: "Absagen/Protokollieren", path: `${BASE}/${AID}/status`, method: "POST" },
  { name: "Teilnehmer", path: `${BASE}/${AID}/participants`, method: "PUT" },
  { name: "Beleg", path: `${BASE}/${AID}/document`, method: "PUT" },
]

const PAGES: Array<{ name: string; path: string }> = [
  { name: "Reiter Abnahmen", path: `/projects/${PROJECT}/abnahmen` },
  {
    name: "Druckseite Abnahmeprotokoll",
    path: `/projects/${PROJECT}/abnahmeprotokoll/print?abnahme=${AID}`,
  },
]

test.describe("PROJ-45-γ — Abnahmen: Auth-Gates", () => {
  for (const route of ROUTES) {
    test(`${route.method} ${route.name} ist ohne Sitzung gesperrt`, async ({ request }) => {
      const res = await request.fetch(route.path, {
        method: route.method,
        maxRedirects: 0,
        headers: { "Content-Type": "application/json" },
        data: route.method === "GET" ? undefined : JSON.stringify({}),
      })
      expect(res.status()).toBe(307)
      const body = await res.text()
      // Geprüft wird die Abwesenheit von INHALT, nicht die des Pfades: der
      // Rumpf der Umleitung spiegelt `?next=<angefragter Pfad>` und damit die
      // Eingabe des Aufrufers selbst — das ist keine Preisgabe. Die erste
      // Fassung dieser Zusicherung hat beides verwechselt und schlug deshalb
      // fehl, ohne einen Fehler zu belegen (Hausform: PROJ-45-β-Spec).
      expect(body).not.toContain("construction_acceptances")
      expect(body).not.toContain("acceptance_number")
      expect(body).not.toContain("warranty_end_date")
    })
  }

  for (const page of PAGES) {
    test(`${page.name} ist ohne Sitzung gesperrt`, async ({ request }) => {
      const res = await request.get(page.path, { maxRedirects: 0 })
      expect(res.status()).toBe(307)
      const body = await res.text()
      // Die Druckseite ist der wichtigere der beiden Fälle: sie liegt
      // ausserhalb der App-Hülle und darf ohne Sitzung weder Inhalt noch ihre
      // Überschrift ausgeben (AC-45γ.23) — sonst verriete die Umleitungsseite,
      // dass es die Fläche überhaupt gibt.
      expect(body).not.toContain("Abnahmeprotokoll")
      expect(body).not.toContain("Gewährleistung")
      expect(body).not.toContain("Vorbehalte")
    })
  }
})
