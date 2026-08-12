/**
 * PROJ-130-γ2b — Auth-Gates der Verwaltungs-Oberfläche für den Revisionszugriff.
 *
 * γ2 hat Tabelle, RPCs und API gebaut; γ2b bringt die Bedienfläche. Die eigentliche
 * Autorität liegt NICHT in dieser Oberfläche, sondern in den
 * SECURITY-DEFINER-RPCs (`grant_audit_reader` / `revoke_audit_reader`, admin-gated)
 * und der einzigen SELECT-Policy auf `audit_reader_grants`. Der Tiefen-Nachweis
 * dazu liegt in `tests/sql/PROJ-130-gamma2-audit-reader-pentest.sql` (11/11 PASS
 * gegen Prod), inklusive des Kern-Paares: ein Prüfer liest OHNE Mitgliedschaft,
 * sieht aber `strict` nicht (γ1 hält), und eine abgelaufene Freigabe wirkt nicht.
 *
 * Dieser Spec sichert nur, dass die neue Fläche ohne Sitzung unerreichbar ist —
 * dieselbe Grenze wie bei den übrigen Stammdaten-Admin-Seiten.
 */

import { expect, test } from "@playwright/test"

const DUMMY = "00000000-0000-0000-0000-000000000000"
const GATE = [307, 401, 403]

test.describe("PROJ-130-γ2b / Revisionszugriff", () => {
  test("Die Verwaltungs-Seite ist ohne Sitzung nicht erreichbar", async ({
    page,
  }) => {
    const res = await page.goto("/stammdaten/revisionszugriff", {
      waitUntil: "domcontentloaded",
    })
    // Middleware leitet unauthentifiziert auf /login um.
    expect(page.url()).toContain("/login")
    expect(res?.status()).toBeLessThan(500)
  })

  test("GET der Freigaben-Liste ist auth-gegated", async ({ request }) => {
    const res = await request.get(`/api/tenants/${DUMMY}/audit-readers`, {
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })

  test("POST (Freigabe erteilen) ist auth-gegated", async ({ request }) => {
    const res = await request.post(`/api/tenants/${DUMMY}/audit-readers`, {
      data: { user_id: DUMMY, note: "γ2b auth-gate" },
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })

  test("DELETE (Widerruf) ist auth-gegated", async ({ request }) => {
    const res = await request.delete(`/api/tenants/${DUMMY}/audit-readers`, {
      data: { user_id: DUMMY },
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })
})
