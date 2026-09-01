/**
 * PROJ-153-α — Auth-Gates der drei neuen Routen.
 *
 * Die Zusicherung ist auf **exakt 307** verschärft, nicht auf eine Liste
 * plausibler Statuswerte: eine lockere Erwartung ([307, 401, 404]) besteht
 * auch dann, wenn die Route gar nicht existiert — genau der Fund aus PROJ-80-α.
 *
 * Zusätzlich wird der Rumpf geprüft. Ein Leck mit korrektem Status sieht eine
 * reine Statusprüfung nicht (die Lehre aus PROJ-45-ε).
 */
import { expect, test } from "@playwright/test"

import { E2E_PROJECT_ID } from "./fixtures/constants"

const ROUTES = [
  { path: "ai/work-items-from-intent", method: "GET" as const },
  { path: "ai/work-items-from-intent", method: "POST" as const },
  { path: "ai/work-items-from-intent/accept", method: "POST" as const },
  { path: "ai/work-items-from-intent/undo", method: "POST" as const },
]

for (const route of ROUTES) {
  test(`${route.method} ${route.path} ist ohne Sitzung auth-gegatet`, async ({
    request,
  }) => {
    const url = `/api/projects/${E2E_PROJECT_ID}/${route.path}`
    const res =
      route.method === "GET"
        ? await request.get(url, { maxRedirects: 0 })
        : await request.post(url, {
            maxRedirects: 0,
            data: { suggestionIds: [E2E_PROJECT_ID], count: 5 },
          })

    expect(res.status()).toBe(307)

    // Kein Inhalt im Rumpf — nur die Umleitung. Die Ziel-Adresse im
    // `weiter=`-Parameter ist die Eingabe des Aufrufers, kein Leck.
    const body = await res.text()
    expect(body).not.toContain("suggestion")
    expect(body).not.toContain("payload")
    expect(body).not.toContain("temp_id")
  })
}
