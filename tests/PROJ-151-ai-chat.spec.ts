/**
 * PROJ-151-α — Auth-Gates aller neuen Flächen.
 *
 * Geprüft wird auf EXAKT 307, nicht auf „irgendein Umleitungsstatus": PROJ-45-β
 * hatte eine Zusicherung, die vier Werte erlaubte, wo genau einer auftritt —
 * eine solche Prüfung übersieht eine Statusänderung.
 *
 * Zusätzlich: der Rumpf darf keinen Inhalt verraten. Eine Route, die ohne
 * Sitzung schon Daten mitschickt, wäre auch dann ein Leck, wenn sie umleitet.
 */

import { expect, test } from "@playwright/test"

const PROJECT = "11111111-1111-4111-8111-111111111111"
const CONVERSATION = "22222222-2222-4222-8222-222222222222"
const TEMPLATE = "33333333-3333-4333-8333-333333333333"

const API_ROUTES: { name: string; url: string; method: "GET" | "POST" | "PUT" }[] = [
  { name: "Unterhaltungen lesen", url: `/api/projects/${PROJECT}/chat/conversations`, method: "GET" },
  { name: "Unterhaltung anlegen", url: `/api/projects/${PROJECT}/chat/conversations`, method: "POST" },
  { name: "Nachrichten lesen", url: `/api/projects/${PROJECT}/chat/conversations/${CONVERSATION}/messages`, method: "GET" },
  { name: "Nachricht senden", url: `/api/projects/${PROJECT}/chat/conversations/${CONVERSATION}/messages`, method: "POST" },
  { name: "Ordner lesen", url: `/api/projects/${PROJECT}/chat/folders`, method: "GET" },
  { name: "Eingabe vorprüfen", url: `/api/projects/${PROJECT}/chat/check-input`, method: "POST" },
  { name: "Vorlagen lesen", url: "/api/chat/prompt-templates", method: "GET" },
  { name: "Favorit setzen", url: `/api/chat/prompt-templates/${TEMPLATE}`, method: "PUT" },
  { name: "Modellpreise lesen", url: "/api/chat/model-prices", method: "GET" },
]

for (const route of API_ROUTES) {
  test(`${route.name} (${route.method}) ist ohne Sitzung auth-gated`, async ({ request }) => {
    const res = await request.fetch(route.url, {
      method: route.method,
      maxRedirects: 0,
      data: route.method === "GET" ? undefined : { content: "x", title: "x" },
      failOnStatusCode: false,
    })
    expect(res.status(), `${route.name} soll exakt 307 liefern`).toBe(307)

    // Der Rumpf darf keine DATEN tragen. Ein Wortverbot auf "conversation"
    // wäre falsch: die Umleitung trägt die Ziel-Adresse als `weiter=`-Parameter,
    // und darin steht der Pfad — das ist die Eingabe des Aufrufers, kein Leck.
    // Geprüft wird deshalb, dass nichts JSON-Artiges zurückkommt.
    const body = await res.text()
    expect(body.trim().startsWith("{"), "kein JSON-Objekt im Rumpf").toBe(false)
    expect(body.trim().startsWith("["), "kein JSON-Array im Rumpf").toBe(false)
    expect(body).not.toContain("\"title\"")
    expect(body).not.toContain("\"content\"")
  })
}

test("Die Chat-Seite ist ohne Sitzung auth-gated", async ({ page }) => {
  const res = await page.goto(`/projects/${PROJECT}/ki-chat`, { waitUntil: "domcontentloaded" })
  expect(res).not.toBeNull()
  // Nach der Umleitung steht die Anmeldung, nicht die Fläche.
  await expect(page).toHaveURL(/\/anmelden/)
  await expect(page.getByText("Meine Unterhaltungen")).toHaveCount(0)
})
