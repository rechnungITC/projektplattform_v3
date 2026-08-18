import { expect, test } from "@playwright/test"

/**
 * PROJ-80-α — Auth-Tore der Quintessenz-Flächen.
 *
 * Die inhaltliche Absicherung liegt im Live-Pentest (RLS, Vertraulichkeit,
 * Audit) und in den Routentests. Hier wird nur die eine Eigenschaft geprüft, die
 * ein Browser prüfen kann: ohne Sitzung kommt niemand an die Routen — und die
 * Antwort verrät dabei nichts über den Bestand.
 *
 * Geprüft wird **genau 307**, nicht „einer aus 307/401/404". Die erste Fassung
 * war die lockere Variante und hätte auch bestanden, wenn die Routen gar nicht
 * mehr existierten (404) — ein Tortest, der das Fehlen der Tür für ein
 * verschlossenes Tor nimmt. 307 ist das belegte Verhalten: die Middleware gatet
 * unangemeldete Aufrufe VOR dem Handler (PROJ-116-F-1).
 */

const PROJECT = "e2e00000-0000-4e2e-8e2e-000000000003"
const DOC = "e2e00000-0000-4e2e-8e2e-0000000000d1"

test.describe("PROJ-80 Quintessenz — Zugang ohne Sitzung", () => {
  test("GET der Quintessenz ist gegated", async ({ request }) => {
    const res = await request.get(
      `/api/projects/${PROJECT}/documents/${DOC}/summary`,
      { maxRedirects: 0 },
    )
    expect(res.status()).toBe(307)
  })

  test("PATCH der Quintessenz ist gegated", async ({ request }) => {
    const res = await request.patch(
      `/api/projects/${PROJECT}/documents/${DOC}/summary`,
      {
        maxRedirects: 0,
        headers: { "if-match": "2026-01-01T00:00:00Z" },
        data: { summary_markdown: "x" },
      },
    )
    expect(res.status()).toBe(307)
  })

  test("Erneut-Versuchen ist gegated", async ({ request }) => {
    const res = await request.post(
      `/api/projects/${PROJECT}/documents/${DOC}/summary/retry`,
      { maxRedirects: 0 },
    )
    expect(res.status()).toBe(307)
  })

  test("die Antwort verrät ohne Sitzung nichts über den Bestand", async ({
    request,
  }) => {
    const res = await request.get(
      `/api/projects/${PROJECT}/documents/${DOC}/summary`,
      { maxRedirects: 0 },
    )
    const body = await res.text()
    // Erst positiv: der Rumpf ist wirklich die Umleitung zur Anmeldung. Ohne
    // diese Zeile wäre die Negativprüfung auch bei einer leeren Antwort grün und
    // würde nichts belegen.
    //
    // Gemessen, nicht angenommen: bei diesen API-Routen ist der Rumpf das
    // Umleitungsziel (`/login?next=…`) — nicht der Rumpf `Redirecting…`, den
    // Seiten-Routen liefern. Eine Erwartung „aus dem Gedächtnis" wäre hier
    // fehlgeschlagen und hat es auch.
    expect(body).toContain("/login?next=")
    expect(body).not.toMatch(/summary_markdown|extracted_text|privacy_class/i)
  })
})
