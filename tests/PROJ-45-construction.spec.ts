/**
 * PROJ-45-α — Construction extension: auth-gates for every new HTTP surface.
 *
 * Ten new surfaces (7 API routes + 3 pages). This spec proves none of them is
 * reachable without a session — including the two that are additionally gated
 * by the `construction` module, because an unauthenticated caller must never
 * be able to tell the two gates apart.
 *
 * AUTHORIZATION DEPTH lives elsewhere on purpose:
 *   - tests/sql/PROJ-45-construction-trades-sections-pentest.sql (16/16 against
 *     prod, 0 residue) proves cross-tenant isolation, stranger visibility,
 *     viewer write denial, the catalog delete lock, duplicate assignment,
 *     cycle rejection, orphan-free deletion, anon EXECUTE revocation, and the
 *     field audit under a synthesised NON-admin member.
 *   - The route unit tests (38 cases) prove the module gate short-circuits
 *     before the admin check and that DB error codes map to meaningful status
 *     codes instead of leaking a 500.
 *   - src/hooks/use-construction.test.ts (7 cases) proves the tree view cannot
 *     silently drop a row and cannot offer a move that would create a cycle.
 */

import { expect, test } from "@playwright/test"

const DUMMY = "00000000-0000-0000-0000-000000000000"
const GATE = [307, 401, 403, 404]

test.describe("PROJ-45 / construction auth-gates", () => {
  test("GET /api/construction-trades (tenant catalog) is auth-gated", async ({
    request,
  }) => {
    const res = await request.get("/api/construction-trades", {
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })

  test("POST /api/construction-trades is auth-gated", async ({ request }) => {
    const res = await request.post("/api/construction-trades", {
      data: { key: "elektro", label: "Elektro" },
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })

  test("POST /api/construction-trades?seed=1 (lazy seed) is auth-gated", async ({
    request,
  }) => {
    const res = await request.post("/api/construction-trades?seed=1", {
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })

  test("PATCH /api/construction-trades/[id] is auth-gated", async ({ request }) => {
    const res = await request.patch(`/api/construction-trades/${DUMMY}`, {
      data: { label: "Neu" },
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })

  test("DELETE /api/construction-trades/[id] (delete lock) is auth-gated", async ({
    request,
  }) => {
    const res = await request.delete(`/api/construction-trades/${DUMMY}`, {
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })

  test("GET .../construction-trades (project assignment) is auth-gated", async ({
    request,
  }) => {
    const res = await request.get(`/api/projects/${DUMMY}/construction-trades`, {
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })

  test("POST .../construction-trades assignment is auth-gated", async ({ request }) => {
    const res = await request.post(`/api/projects/${DUMMY}/construction-trades`, {
      data: { trade_id: DUMMY },
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })

  test("PATCH .../construction-trades/[ptid] is auth-gated", async ({ request }) => {
    const res = await request.patch(
      `/api/projects/${DUMMY}/construction-trades/${DUMMY}`,
      { data: { rag_status: "rot" }, failOnStatusCode: false, maxRedirects: 0 }
    )
    expect(GATE).toContain(res.status())
  })

  test("GET .../construction-sections (tree) is auth-gated", async ({ request }) => {
    const res = await request.get(`/api/projects/${DUMMY}/construction-sections`, {
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })

  test("POST .../construction-sections is auth-gated", async ({ request }) => {
    const res = await request.post(`/api/projects/${DUMMY}/construction-sections`, {
      data: { label: "Haus A" },
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })

  test("PATCH .../construction-sections/[sid] (move) is auth-gated", async ({
    request,
  }) => {
    const res = await request.patch(
      `/api/projects/${DUMMY}/construction-sections/${DUMMY}`,
      { data: { parent_id: null }, failOnStatusCode: false, maxRedirects: 0 }
    )
    expect(GATE).toContain(res.status())
  })

  test("PUT .../construction-sections/[sid]/phases is auth-gated", async ({
    request,
  }) => {
    const res = await request.put(
      `/api/projects/${DUMMY}/construction-sections/${DUMMY}/phases`,
      { data: { phase_ids: [] }, failOnStatusCode: false, maxRedirects: 0 }
    )
    expect(GATE).toContain(res.status())
  })

  test("a malformed project id is rejected without revealing anything", async ({
    request,
  }) => {
    const res = await request.get("/api/projects/not-a-uuid/construction-sections", {
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect([...GATE, 400]).toContain(res.status())
    const body = await res.text()
    expect(body).not.toContain("construction_sections")
  })

  test("/stammdaten/gewerke is auth-gated", async ({ page }) => {
    const res = await page.goto("/stammdaten/gewerke", { waitUntil: "domcontentloaded" })
    expect(page.url()).toContain("/login")
    expect(res?.status()).toBeLessThan(500)
  })

  test("the project Gewerke tab is auth-gated", async ({ page }) => {
    await page.goto(`/projects/${DUMMY}/gewerke`, { waitUntil: "domcontentloaded" })
    expect(page.url()).toContain("/login")
  })

  test("the project Bauabschnitte tab is auth-gated", async ({ page }) => {
    await page.goto(`/projects/${DUMMY}/bauabschnitte`, { waitUntil: "domcontentloaded" })
    expect(page.url()).toContain("/login")
  })
})

/**
 * PROJ-45-β — die beiden Flächen, die der `/frontend`-Schritt hinzufügt.
 *
 * Die fünf β-API-Routen sind hier bewusst NICHT aufgeführt: sie gehören zum
 * `/backend`-Schritt und sind dort über 39 Route-Unit-Tests und den Live-Pentest
 * (53/53 gegen Prod, 0 Rückstände) abgedeckt. Was diese Slice neu erreichbar
 * macht, sind zwei Seiten — und die Druckseite liegt ausserhalb der App-Hülle,
 * ist also die einzige, bei der man das Anmelde-Tor nicht schon aus der
 * Gruppenzugehörigkeit ableiten kann.
 *
 * Die Tiefe (Rollen, Vier-Augen, Leeren-Schalter, Teilbaum-Sperre) prüft der
 * Pentest; ein authentifizierter Browser-Durchlauf gehört zu `/qa`.
 */
test.describe("PROJ-45-β / defect surfaces auth-gates", () => {
  test("the project Mängel tab is auth-gated", async ({ page }) => {
    await page.goto(`/projects/${DUMMY}/maengel`, { waitUntil: "domcontentloaded" })
    expect(page.url()).toContain("/login")
  })

  test("the Mängelanzeige print page is auth-gated and leaks no defect content", async ({
    page,
  }) => {
    const res = await page.goto(
      `/projects/${DUMMY}/maengelanzeige/print?trade=${DUMMY}`,
      { waitUntil: "domcontentloaded" }
    )
    expect(page.url()).toContain("/login")
    expect(res?.status()).toBeLessThan(500)
    // AC-45βH-11: kein Mangel-Inhalt im Rumpf, auch nicht die Überschrift der
    // Anzeige — sonst verriete die Umleitungsseite, dass es die Fläche gibt.
    const body = await page.content()
    expect(body).not.toContain("Mängelanzeige")
    expect(body).not.toContain("construction_defects")
  })
})
