/**
 * PROJ-144 — Auth-Gates der drei neuen Entwurfs-Routen.
 *
 * Diese Slice ist das zweite *mutierende* Aktionspaket des Assistenten: eine
 * Bestätigung erzeugt ein echtes Work-Item. Die Bestätigungsroute darf deshalb
 * ohne Sitzung unter keinen Umständen erreichbar sein.
 *
 * Die Autorisierungs-TIEFE ist bewusst nicht hier bewiesen, sondern dort, wo sie
 * hingehört:
 *   - tests/sql/PROJ-144-assistant-work-item-drafts-pentest.sql (17/17 PASS
 *     gegen Prod): Entwürfe sind nutzer-privat — ein Tenant-Admin sieht fremde
 *     Entwürfe NICHT (Fall B), kein Schreibzugriff auf Fremdes, INSERT auf
 *     fremde `user_id` → 42501, Doppel-Beanspruchen → 2. Versuch 0 Zeilen,
 *     Cascade, CHECKs, anon → 42501.
 *   - Route-Unit-Tests (confirm/route.test.ts, 11 Fälle): 400/401/403/404/409,
 *     Rollenwechsel zwischen den Schritten, verlorener Anspruch legt KEIN
 *     Work-Item an, korrigierter Titel landet im Work-Item, Freigabe bei
 *     gescheiterter Anlage.
 *   - Methoden-Matrix (work-item-command.test.ts): über alle Methoden × alle
 *     Arten nur gültige Kombinationen — beide Achsen datengetrieben, weil die
 *     Zuordnung Methode↔Art in der Datenbank keinen Constraint hat.
 *
 * Hier wird nur geprüft, dass die Fläche ohne Sitzung zu ist.
 */

import { expect, test } from "@playwright/test"

// RFC-4122-konform (Versions- und Variantennibble gesetzt) — nicht-konforme
// Kennungen scheitern an der Zod-Prüfung und würden ein Auth-Gate vortäuschen,
// das gar nicht geprüft wurde (Lehre aus PROJ-143).
const DRAFT_ID = "44444444-4444-4444-8444-444444444444"
const GATE = [307, 401, 403]

test.describe("PROJ-144 / Sprach-Entwürfe für Work-Items — Auth-Gates", () => {
  test("GET /api/assistant/work-item-drafts ist auth-gated", async ({
    request,
  }) => {
    const res = await request.get("/api/assistant/work-item-drafts", {
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })

  test("POST …/[draftId]/confirm ist auth-gated (mutierender Pfad)", async ({
    request,
  }) => {
    const res = await request.post(
      `/api/assistant/work-item-drafts/${DRAFT_ID}/confirm`,
      {
        data: { title: "Aus dem Netz bestätigt" },
        failOnStatusCode: false,
        maxRedirects: 0,
      },
    )
    expect(GATE).toContain(res.status())
  })

  test("DELETE …/[draftId] ist auth-gated", async ({ request }) => {
    const res = await request.delete(
      `/api/assistant/work-item-drafts/${DRAFT_ID}`,
      { failOnStatusCode: false, maxRedirects: 0 },
    )
    expect(GATE).toContain(res.status())
  })

  test("die Bestätigung verrät ohne Sitzung nichts über den Entwurf", async ({
    request,
  }) => {
    const res = await request.post(
      `/api/assistant/work-item-drafts/${DRAFT_ID}/confirm`,
      { data: {}, failOnStatusCode: false, maxRedirects: 0 },
    )
    expect(GATE).toContain(res.status())
    const body = await res.text()
    // Kein Titel, keine Projekt-, keine Mandantenkennung im Rumpf.
    expect(body).not.toContain("project_id")
    expect(body).not.toContain("tenant_id")
    expect(body).not.toContain("work_item")
  })
})
