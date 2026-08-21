/**
 * PROJ-45-β `/qa` — Mängelmanagement, the part `/frontend` explicitly left open.
 *
 * `/backend` proved the rules on the database (live pentest, 52 PASS tokens / 0
 * FAIL) and `/frontend` proved the surface renders; neither ran the CHAIN. The
 * gap was stated as deviation D-β14, but per the PROJ-135/AC-135.3 lesson an
 * unrun E2E layer is an OPEN acceptance criterion, not a deviation — so this
 * file runs it: **Erfassen als Betrachter → Fertigmelden → Abnahme durch eine
 * ZWEITE Person**, in three real authenticated browser sessions.
 *
 * The load-bearing assertions are the negative ones, because a chain that only
 * walks the happy path proves nothing about a gate:
 *   - the Betrachter gets NO control block (AC-45β.5 in the browser, not just
 *     in the RPC);
 *   - the person who reported done is NOT offered „Abnehmen“ AND is refused
 *     server-side when he asks anyway through his own session (AC-45β.10);
 *   - the four-eyes gate CLAMPS when reporter and approver are one person
 *     (B-β7) — reproduced, not worked around, because the design says there is
 *     deliberately no override path.
 *
 * Why an own tenant with three actors: see `tests/fixtures/constants.ts`. In
 * short — the surface is gated on `project_type` AND on the module, and
 * switching `construction` on in the shared `[E2E]` tenant is the move
 * PROJ-Y-143f/143l taught us not to make.
 *
 * Note on the Radix `Select`s: they are not `<select>` elements, so the helper
 * below opens the trigger and clicks the option by accessible name.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js"

import { expect, hasAuthStorageState, test } from "./fixtures/auth-fixture"
import { deleteOrThrow } from "./fixtures/cleanup"
import {
  E2E_CONSTRUCTION_LEAD_STORAGE_STATE_PATH,
  E2E_CONSTRUCTION_PROJECT_ID,
  E2E_CONSTRUCTION_SECTION_CHILD_LABEL,
  E2E_CONSTRUCTION_SECTION_ROOT_ID,
  E2E_CONSTRUCTION_TENANT_ID,
  E2E_CONSTRUCTION_TRADE_LABEL,
  E2E_CONSTRUCTION_VIEWER_STORAGE_STATE_PATH,
  E2E_VISUAL_PROJECT_ID,
  E2E_VISUAL_STORAGE_STATE_PATH,
} from "./fixtures/constants"

const PROJECT = E2E_CONSTRUCTION_PROJECT_ID
const DEFECTS_PATH = `/projects/${PROJECT}/maengel`
const API = `/api/projects/${PROJECT}/construction-defects`

/** Run-unique so repeated or parallel runs never collide and cleanup is exact. */
const STAMP = `${Date.now()}`

async function createAdminClient(): Promise<SupabaseClient | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) return null
  const { default: WebSocketImpl } = (await import("ws")) as {
    default: typeof WebSocket
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { transport: WebSocketImpl },
  })
}

/**
 * Every title carries the run stamp AND a per-block scope letter.
 *
 * The scope letter is not decoration. Playwright parallelises describe blocks
 * across workers, and all four blocks report into the SAME project — so a
 * teardown that deleted everything matching the run stamp would delete rows
 * belonging to a block still in flight. That happened: the chain's defect
 * vanished mid-test and the failure looked like "the status did not update".
 * Scoping the cleanup makes the blocks independent without serialising the file.
 */
function mark(scope: string, name: string): string {
  return `[E2E β] ${name} ${STAMP}-${scope}`
}

/**
 * Teardown for ONE block. Deleting the DEFECT is loud (PROJ-Y-143o: a cleanup
 * that cannot say it failed turns into a slowly growing heap that later becomes
 * somebody's fixture). The event rows go with it via cascade — which is exactly
 * the single documented exception in the immutability trigger (D-β5), proven
 * live as pentest vector Z. Deleting events directly would hit `42501`.
 */
async function removeRunDefects(scope: string): Promise<void> {
  const admin = await createAdminClient()
  if (!admin) return
  await deleteOrThrow(
    admin
      .from("construction_defects")
      .delete()
      .eq("project_id", PROJECT)
      .like("title", `%${STAMP}-${scope}%`),
    `construction_defects des Laufs ${STAMP}, Block ${scope}`,
  )
}

/** Opens a Radix Select trigger and picks the option by accessible name. */
async function pickOption(
  page: import("@playwright/test").Page,
  triggerId: string,
  optionName: string | RegExp,
): Promise<void> {
  await page.locator(`#${triggerId}`).click()
  await page.getByRole("option", { name: optionName }).click()
}

/** Fills the create dialog and submits it. Title + Gewerk are the only musts. */
async function reportDefect(
  page: import("@playwright/test").Page,
  title: string,
  opts: { severity?: RegExp; section?: string; due?: string } = {},
): Promise<void> {
  await page.getByRole("button", { name: "Mangel erfassen" }).first().click()
  const dialog = page.getByRole("dialog")
  await expect(dialog).toBeVisible()
  await dialog.locator("#defect-title").fill(title)
  await pickOption(page, "defect-trade", E2E_CONSTRUCTION_TRADE_LABEL)
  if (opts.severity) await pickOption(page, "defect-severity", opts.severity)
  if (opts.section) await pickOption(page, "defect-section", opts.section)
  if (opts.due) await dialog.locator("#defect-due").fill(opts.due)
  await dialog.getByRole("button", { name: "Mangel erfassen" }).click()
  await expect(dialog).toBeHidden()
}

function defectRow(page: import("@playwright/test").Page, title: string) {
  return page.getByRole("row").filter({ hasText: title })
}

/** Opens the detail sheet of one defect by clicking its row. */
async function openDetail(
  page: import("@playwright/test").Page,
  title: string,
): Promise<import("@playwright/test").Locator> {
  await defectRow(page, title).click()
  const sheet = page.getByRole("dialog").filter({ hasText: "Verlauf" })
  await expect(sheet).toBeVisible()
  return sheet
}

/**
 * Closes the detail sheet.
 *
 * Necessary, not cosmetic: the sheet is a MODAL, so while it is open Radix marks
 * the page behind it `aria-hidden` and the table rows disappear from the
 * accessibility tree — `getByRole("row")` then reports "element(s) not found",
 * which reads exactly like a status that failed to update. Assert on the row
 * only with the sheet closed.
 */
async function closeSheet(page: import("@playwright/test").Page): Promise<void> {
  const sheet = page.getByRole("dialog").filter({ hasText: "Verlauf" })
  await sheet.getByRole("button", { name: "Close" }).click()
  await expect(sheet).toBeHidden()
}

// ---------------------------------------------------------------------------
// 1 — Auth gates on the five NEW β routes.
//
// `/frontend` β added gate tests for the two PAGES but not for a single one of
// the new API routes, so these are new coverage rather than a re-run.
//
// The α suite asserts `expect([307, 401, 403, 404]).toContain(status)`. Measured
// against the running app, every one of these endpoints answers exactly **307**
// with `location: /login?next=…`. A four-value array would stay green if a route
// were deleted (404) or if the gate changed character (403), so these assert the
// one value that actually occurs.
// ---------------------------------------------------------------------------
test.describe("PROJ-45-β · Auth-Gates der neuen Mängel-Routen", () => {
  const CASES: { method: "GET" | "POST" | "PATCH"; path: string; what: string }[] =
    [
      { method: "GET", path: API, what: "Mängelliste" },
      { method: "POST", path: API, what: "Mangel erfassen" },
      { method: "GET", path: `${API}/summary`, what: "Zähler" },
      { method: "PATCH", path: `${API}/${PROJECT}`, what: "Mangel ändern" },
      { method: "POST", path: `${API}/${PROJECT}/status`, what: "Statuswechsel" },
      { method: "GET", path: `${API}/${PROJECT}/events`, what: "Verlauf" },
    ]

  for (const c of CASES) {
    test(`${c.method} ${c.what} → genau 307 auf /login, ohne Leck`, async ({
      request,
    }) => {
      const res = await request.fetch(c.path, {
        method: c.method,
        data: {},
        maxRedirects: 0,
      })
      expect(res.status()).toBe(307)
      expect(res.headers()["location"] ?? "").toContain("/login")
      const body = await res.text()
      expect(body).not.toContain("construction_defect")
      expect(body).not.toContain("defect_number")
    })
  }
})

// ---------------------------------------------------------------------------
// 2 — The two-person chain.
//
// Serial and stateful on purpose: step 3 can only mean anything after step 2
// has actually happened in a DIFFERENT session.
// ---------------------------------------------------------------------------
test.describe("PROJ-45-β · Zwei-Personen-Durchlauf", () => {
  test.describe.configure({ mode: "serial" })
  test.setTimeout(180_000)

  const TITLE = mark("A", "Undichte Attika")

  test.skip(
    () =>
      !hasAuthStorageState(E2E_CONSTRUCTION_VIEWER_STORAGE_STATE_PATH) ||
      !hasAuthStorageState(E2E_CONSTRUCTION_LEAD_STORAGE_STATE_PATH),
    "Bau-Lane nicht bereitgestellt — siehe tests/fixtures/README.md.",
  )

  test.afterAll(async () => {
    await removeRunDefects("A")
  })

  test("1 · der BETRACHTER erfasst einen Mangel und darf ihn danach nicht steuern", async ({
    constructionViewerPage: page,
  }) => {
    await page.goto(DEFECTS_PATH)
    // Reaching the heading at all is AC-45β.20's positive half: the tab exists
    // only because the project is `construction` AND the module is on.
    await expect(page.getByRole("heading", { name: "Mängel" })).toBeVisible()

    // AC-45β.1 / L15 — no role gate on this button, for a viewer too.
    await expect(
      page.getByRole("button", { name: "Mangel erfassen" }).first(),
    ).toBeVisible()
    // AC-45β.13 counter-check: the notice is management-only, so the viewer
    // must NOT see it. Without this the previous line could pass on a surface
    // that simply shows everything to everyone.
    await expect(
      page.getByRole("button", { name: "Mängelanzeige" }),
    ).toHaveCount(0)

    await reportDefect(page, TITLE, { severity: /Gravierend/i })

    // AC-45β.4 — visible without any further step.
    const row = defectRow(page, TITLE)
    await expect(row).toBeVisible()
    await expect(row).toContainText("Offen")
    // B-β3 — the Nachunternehmer is prefilled from the trade; this lane's trade
    // deliberately carries none, so the cell stays empty rather than inventing one.

    // AC-45β.5 / AC-45βH-2 in the browser: the viewer gets the read-only note
    // instead of the control block, and no per-row edit affordance exists.
    const sheet = await openDetail(page, TITLE)
    await expect(sheet).toContainText(
      /Fristen setzen, fertigmelden und abnehmen liegt bei der/i,
    )
    await expect(sheet.getByRole("button", { name: "Fertigmelden" })).toHaveCount(
      0,
    )
    await expect(sheet.getByRole("button", { name: "Abnehmen" })).toHaveCount(0)
    await expect(
      sheet.getByRole("button", { name: "Angaben bearbeiten" }),
    ).toHaveCount(0)
  })

  test("2 · die BAULEITUNG meldet fertig — und bekommt „Abnehmen“ nicht angeboten", async ({
    constructionLeadPage: page,
  }) => {
    await page.goto(DEFECTS_PATH)
    await expect(page.getByRole("heading", { name: "Mängel" })).toBeVisible()

    let sheet = await openDetail(page, TITLE)
    // The lead DOES hold the management role, so the control block is there.
    await expect(sheet).toContainText("Nachbesserung steuern")
    await sheet.getByRole("button", { name: "Fertigmelden" }).click()
    // The sheet itself confirms first — it stays open after the transition.
    await expect(sheet).toContainText("Fertiggemeldet")
    await closeSheet(page)

    await expect(defectRow(page, TITLE)).toContainText("Fertiggemeldet")
    // B-β6 — two separate signals, not merged: once completion is reported the
    // row says „wartet auf Prüfung“, never „überfällig“.
    await expect(defectRow(page, TITLE)).toContainText("wartet auf Prüfung")
    await expect(defectRow(page, TITLE)).not.toContainText("überfällig")

    // AC-45β.10 in the surface: the reporter is not offered the approval, but
    // „Zurückweisen“/„Verwerfen“ stay, otherwise the defect would be frozen.
    sheet = await openDetail(page, TITLE)
    await expect(sheet.getByRole("button", { name: "Abnehmen" })).toHaveCount(0)
    await expect(
      sheet.getByRole("button", { name: "Zurückweisen" }),
    ).toBeVisible()
    await expect(sheet.getByRole("button", { name: "Verwerfen" })).toBeVisible()
    // …and it SAYS why, naming the legitimate remedy (B-β7, PROJ-119 stance).
    await expect(sheet).toContainText(/zweite/i)

    // The decisive half: withholding a button is cosmetic unless the server
    // refuses too. Asked through the lead's OWN authenticated session — so this
    // is the real request path, not a service-role shortcut.
    const admin = await createAdminClient()
    test.skip(!admin, "Kein SUPABASE_SERVICE_ROLE_KEY — Defekt-Id nicht lesbar.")
    const { data } = await admin!
      .from("construction_defects")
      .select("id, status, reported_done_by")
      .eq("project_id", PROJECT)
      .eq("title", TITLE)
      .single()
    expect(data?.status).toBe("erledigt")

    const refused = await page.request.post(`${API}/${data!.id}/status`, {
      data: { action: "pruefen" },
    })
    expect(refused.status()).toBe(403)
    expect(await refused.text()).toContain("four-eyes")
  })

  test("3 · eine ZWEITE Person nimmt ab — Verlauf trägt alle Runden", async ({
    constructionAdminPage: page,
  }) => {
    await page.goto(DEFECTS_PATH)
    await expect(page.getByRole("heading", { name: "Mängel" })).toBeVisible()

    const sheet = await openDetail(page, TITLE)
    await sheet.getByRole("button", { name: "Abnehmen" }).click()
    await expect(sheet).toContainText("Geprüft")
    await closeSheet(page)

    await expect(defectRow(page, TITLE)).toContainText("Geprüft")

    // AC-45β.12 — every round stands, oldest first, and the chain is complete.
    const reopened = await openDetail(page, TITLE)
    await expect(reopened).toContainText("Angelegt")
    await expect(reopened).toContainText("Fertiggemeldet")
    await expect(reopened).toContainText("Geprüft")
    await expect(reopened).toContainText(/Einträge sind unveränderlich/i)

    // „Geprüft“ is terminal — no further step is offered.
    await expect(reopened).toContainText(
      /kein weiterer Schritt vorgesehen|Für diesen Status/i,
    )
  })
})

// ---------------------------------------------------------------------------
// 3 — The five risks the Tech Design handed to `/qa`.
// ---------------------------------------------------------------------------
test.describe("PROJ-45-β · Tech-Design-Risiken", () => {
  test.describe.configure({ mode: "serial" })
  test.setTimeout(180_000)

  test.skip(
    () => !hasAuthStorageState(E2E_CONSTRUCTION_LEAD_STORAGE_STATE_PATH),
    "Bau-Lane nicht bereitgestellt.",
  )

  test.afterAll(async () => {
    await removeRunDefects("B")
  })

  test("Risiko 1 · ein Feld lässt sich in der Maske wirklich LEEREN", async ({
    constructionLeadPage: page,
  }) => {
    const title = mark("B", "Leeren-Schalter")
    await page.goto(DEFECTS_PATH)
    await expect(page.getByRole("heading", { name: "Mängel" })).toBeVisible()

    // Set the location, then clear it. The PROJ-122 defect class is that a
    // cleared field silently keeps its old value because "omitted" is read as
    // "unchanged" — so the assertion has to be that it is really gone.
    await reportDefect(page, title, {
      section: E2E_CONSTRUCTION_SECTION_CHILD_LABEL,
    })
    await expect(defectRow(page, title)).toContainText(
      E2E_CONSTRUCTION_SECTION_CHILD_LABEL,
    )

    const sheet = await openDetail(page, title)
    await sheet.getByRole("button", { name: "Angaben bearbeiten" }).click()

    // The edit dialog is identified by its own heading, not by a substring that
    // the detail sheet could also carry — both are role="dialog".
    const dialog = page
      .getByRole("dialog")
      .filter({ hasText: /Mangel Nr\. \d+ bearbeiten/ })
    await expect(dialog).toBeVisible()
    // The accessible name is "Bauabschnitt leeren" — it is built from the CLEAR
    // label, which is not the same string as the field label "Ort (Bauabschnitt)".
    await dialog.getByRole("button", { name: "Bauabschnitt leeren" }).click()
    await dialog.getByRole("button", { name: "Speichern" }).click()
    await expect(dialog).toBeHidden()

    // Verified against the persisted row, not against the rendered cell: the
    // point of the risk is that the value survives in the DATABASE.
    const admin = await createAdminClient()
    test.skip(!admin, "Kein SUPABASE_SERVICE_ROLE_KEY.")
    const { data } = await admin!
      .from("construction_defects")
      .select("section_id")
      .eq("project_id", PROJECT)
      .eq("title", title)
      .single()
    expect(data?.section_id).toBeNull()
  })

  test("Risiko 2 · Vier-Augen KLEMMT, wenn Melder und Prüfer eine Person sind", async ({
    constructionAdminPage: page,
  }) => {
    const title = mark("B", "Vier-Augen-Klemme")
    await page.goto(DEFECTS_PATH)
    await expect(page.getByRole("heading", { name: "Mängel" })).toBeVisible()

    // The SAME actor reports done and then tries to approve. B-β7 says this must
    // dead-end with no override path — so the expected outcome is a blocked
    // defect, and that is what gets asserted. Reproduced, not worked around.
    await reportDefect(page, title)
    let sheet = await openDetail(page, title)
    await sheet.getByRole("button", { name: "Fertigmelden" }).click()
    await expect(sheet).toContainText("Fertiggemeldet")
    await closeSheet(page)
    await expect(defectRow(page, title)).toContainText("Fertiggemeldet")

    sheet = await openDetail(page, title)
    await expect(sheet.getByRole("button", { name: "Abnehmen" })).toHaveCount(0)
    await expect(sheet).toContainText(/zweite/i)

    const admin = await createAdminClient()
    test.skip(!admin, "Kein SUPABASE_SERVICE_ROLE_KEY.")
    const { data } = await admin!
      .from("construction_defects")
      .select("id")
      .eq("project_id", PROJECT)
      .eq("title", title)
      .single()

    // No bypass, asked directly: this actor is TENANT ADMIN, the highest role in
    // the tenant, and is still refused.
    const refused = await page.request.post(`${API}/${data!.id}/status`, {
      data: { action: "pruefen" },
    })
    expect(refused.status()).toBe(403)
    expect(await refused.text()).toContain("four-eyes")

    // The documented way out is a second authorised person — not a switch. The
    // rejection path stays open so the defect is not frozen.
    const rejected = await page.request.post(`${API}/${data!.id}/status`, {
      data: { action: "zurueckweisen", reason: "QA: Vier-Augen-Klemme (B-β7)" },
    })
    expect(rejected.status()).toBe(200)
  })

  test("Risiko 4 · die Teilbaum-Sperre greift am ENKEL und benennt den Mangel", async ({
    constructionLeadPage: page,
  }) => {
    const title = mark("B", "Enkel-Sperre")
    await page.goto(DEFECTS_PATH)
    await expect(page.getByRole("heading", { name: "Mängel" })).toBeVisible()

    // The defect hangs on the CHILD section; the delete targets its PARENT.
    // `parent_id` cascades, so the naive `.eq("section_id", …)` lookup on the
    // root finds nothing — that is the trap the Tech Design named.
    await reportDefect(page, title, {
      section: E2E_CONSTRUCTION_SECTION_CHILD_LABEL,
    })
    await expect(defectRow(page, title)).toBeVisible()

    const res = await page.request.delete(
      `/api/projects/${PROJECT}/construction-sections/${E2E_CONSTRUCTION_SECTION_ROOT_ID}`,
    )
    // 409, not 500 — the α routes still map every non-42501 error to 500
    // (PROJ-Y-45b), and AC-45β.21 demands a message that NAMES the defects.
    expect(res.status()).toBe(409)
    const body = await res.text()
    expect(body).toContain("defects_present")
    expect(body).toContain(title)
  })

  test("Risiko 5 · die Überfälligkeits-Grenzen: heute / gestern / gestern-aber-erledigt", async ({
    constructionLeadPage: page,
  }) => {
    const iso = (offsetDays: number) => {
      const d = new Date()
      d.setDate(d.getDate() + offsetDays)
      return d.toISOString().slice(0, 10)
    }
    const today = mark("B", "Frist heute")
    const past = mark("B", "Frist gestern")
    const pastDone = mark("B", "Gestern aber fertig")

    await page.goto(DEFECTS_PATH)
    await expect(page.getByRole("heading", { name: "Mängel" })).toBeVisible()

    await reportDefect(page, today, { due: iso(0) })
    await reportDefect(page, past, { due: iso(-1) })
    await reportDefect(page, pastDone, { due: iso(-1) })

    // `_construction_defect_is_overdue` uses `<`, not `<=`: a deadline that is
    // today has not elapsed. This is the boundary a naive implementation gets
    // wrong in exactly one direction.
    await expect(defectRow(page, today)).not.toContainText("überfällig")
    await expect(defectRow(page, past)).toContainText("überfällig")

    // …and once completion is reported the overdue flag must GIVE WAY to
    // „wartet auf Prüfung“ (B-β6): the delay is now the site management's, and
    // an overdue badge would point at the wrong party.
    const sheet = await openDetail(page, pastDone)
    await sheet.getByRole("button", { name: "Fertigmelden" }).click()
    await expect(sheet).toContainText("Fertiggemeldet")
    await closeSheet(page)
    await expect(defectRow(page, pastDone)).toContainText("wartet auf Prüfung")
    await expect(defectRow(page, pastDone)).not.toContainText("überfällig")
  })
})

// ---------------------------------------------------------------------------
// 4 — The Mängelanzeige, printed for real.
// ---------------------------------------------------------------------------
test.describe("PROJ-45-β · Mängelanzeige", () => {
  test.describe.configure({ mode: "serial" })
  test.setTimeout(180_000)

  test.skip(
    () => !hasAuthStorageState(E2E_CONSTRUCTION_LEAD_STORAGE_STATE_PATH),
    "Bau-Lane nicht bereitgestellt.",
  )

  test.afterAll(async () => {
    await removeRunDefects("C")
  })

  test("AC-45β.14/.15 · die Druckseite rendert und lässt sich echt nach PDF drucken", async ({
    constructionLeadPage: page,
  }, testInfo) => {
    const title = mark("C", "Anzeige-Position")
    await page.goto(DEFECTS_PATH)
    await expect(page.getByRole("heading", { name: "Mängel" })).toBeVisible()
    await reportDefect(page, title, {
      section: E2E_CONSTRUCTION_SECTION_CHILD_LABEL,
      due: "2026-12-31",
      severity: /Erheblich/i,
    })

    const admin = await createAdminClient()
    test.skip(!admin, "Kein SUPABASE_SERVICE_ROLE_KEY.")
    const { data: trade } = await admin!
      .from("project_construction_trades")
      .select("id")
      .eq("project_id", PROJECT)
      .limit(1)
      .single()

    await page.goto(
      `/projects/${PROJECT}/maengelanzeige/print?trade=${trade!.id}`,
    )
    // AC-45β.15 — the position and its fields are on the sheet.
    await expect(page.getByText(title)).toBeVisible()
    await expect(page.getByText(E2E_CONSTRUCTION_TRADE_LABEL).first()).toBeVisible()
    await expect(
      page.getByText(E2E_CONSTRUCTION_SECTION_CHILD_LABEL).first(),
    ).toBeVisible()
    // AC-45β.14 — chrome-less: the app shell is deliberately absent.
    await expect(page.locator("[data-sidebar='sidebar']")).toHaveCount(0)

    // The actual print. `page.pdf()` is Chromium's print pipeline — the same one
    // the „Drucken/PDF“ button reaches — so this proves the sheet SURVIVES
    // rendering to PDF rather than merely looking right on screen.
    const pdf = await page.pdf({ format: "A4", printBackground: true })
    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-")
    expect(pdf.byteLength).toBeGreaterThan(1000)
    await testInfo.attach("maengelanzeige.pdf", {
      body: pdf,
      contentType: "application/pdf",
    })
  })

  test("AC-45β.16 · ohne Sitzung führt die Druckseite zur Anmeldung, ohne Inhalt", async ({
    page,
  }) => {
    const res = await page.goto(`/projects/${PROJECT}/maengelanzeige/print`)
    expect(page.url()).toContain("/login")
    expect(res?.status()).toBeLessThan(500)
    const body = await page.content()
    expect(body).not.toContain("Mängelanzeige")
    expect(body).not.toContain("construction_defects")
  })
})

// ---------------------------------------------------------------------------
// 5 — Red-team supplement, at the HTTP layer.
//
// The `/backend` pentest proves these rules inside the database. This block
// asks the same questions one layer up, through a REAL authenticated session,
// because that is where a route can turn a correct refusal into the wrong
// answer: a 500 with raw database text, or a 403 that confirms a foreign
// project exists. Neither is visible from SQL.
// ---------------------------------------------------------------------------
test.describe("PROJ-45-β · Rot-Team über HTTP", () => {
  test.setTimeout(180_000)

  test.skip(
    () =>
      !hasAuthStorageState(E2E_CONSTRUCTION_VIEWER_STORAGE_STATE_PATH) ||
      !hasAuthStorageState(E2E_VISUAL_STORAGE_STATE_PATH),
    "Bau-Lane oder Visual-Lane nicht bereitgestellt.",
  )

  test.afterAll(async () => {
    await removeRunDefects("D")
  })

  test("der BETRACHTER wird beim Ändern und beim Statuswechsel mit 403 abgewiesen, nicht mit 500", async ({
    constructionViewerPage: page,
  }) => {
    const title = mark("D", "Rot-Team Betrachter")
    await page.goto(DEFECTS_PATH)
    await expect(page.getByRole("heading", { name: "Mängel" })).toBeVisible()
    await reportDefect(page, title)

    const admin = await createAdminClient()
    test.skip(!admin, "Kein SUPABASE_SERVICE_ROLE_KEY.")
    const { data } = await admin!
      .from("construction_defects")
      .select("id")
      .eq("project_id", PROJECT)
      .eq("title", title)
      .single()

    // He created it — and may still not change it (B-β2 / AC-45βH-2). The status
    // matters as much as the refusal: a 500 would mean the route leaked raw
    // database text instead of mapping 42501.
    const patched = await page.request.patch(`${API}/${data!.id}`, {
      data: { title: "Rot-Team Übernahmeversuch" },
    })
    expect(patched.status()).toBe(403)

    const transitioned = await page.request.post(`${API}/${data!.id}/status`, {
      data: { action: "fertigmelden" },
    })
    expect(transitioned.status()).toBe(403)

    // …and nothing moved.
    const { data: after } = await admin!
      .from("construction_defects")
      .select("title, status")
      .eq("id", data!.id)
      .single()
    expect(after?.title).toBe(title)
    expect(after?.status).toBe("offen")
  })

  test("ein Fremder erhält 404 — auch auf dem Zähler, der sonst aggregiert lecken könnte", async ({
    visualPage: page,
  }) => {
    // This identity belongs to a different tenant and has no membership here.
    // 404 rather than 403 is the point: 403 would confirm the project exists.
    for (const path of [API, `${API}/summary`]) {
      const res = await page.request.get(path)
      expect(res.status()).toBe(404)
      const body = await res.text()
      expect(body).not.toContain("defect_number")
      expect(body).not.toContain(STAMP)
    }

    // The counter-check, so the 404 above is not just "everything 404s": the
    // same session reaches its OWN project fine. Without this the assertion
    // would also pass on a surface that is simply broken.
    const own = await page.request.get(
      `/api/projects/${E2E_VISUAL_PROJECT_ID}/construction-defects`,
    )
    // The visual tenant has `construction` OFF, so the module gate answers 404
    // as well — with a *module* reason, not a "no such project" one. Either way
    // it must not be a 500, and it must not carry defect data.
    expect([200, 404]).toContain(own.status())
    expect(await own.text()).not.toContain(STAMP)
  })

  test("eine unbekannte Aktion und ein leerer Rumpf werden mit 422 abgewiesen, nicht mit 500", async ({
    constructionLeadPage: page,
  }) => {
    const title = mark("D", "Rot-Team Vokabular")
    await page.goto(DEFECTS_PATH)
    await expect(page.getByRole("heading", { name: "Mängel" })).toBeVisible()
    await reportDefect(page, title)

    const admin = await createAdminClient()
    test.skip(!admin, "Kein SUPABASE_SERVICE_ROLE_KEY.")
    const { data } = await admin!
      .from("construction_defects")
      .select("id")
      .eq("project_id", PROJECT)
      .eq("title", title)
      .single()

    const bogus = await page.request.post(`${API}/${data!.id}/status`, {
      data: { action: "hochstufen" },
    })
    expect(bogus.status()).toBe(422)

    // AC-45β.11 — rejecting without a reason must fail, and the defect must not
    // move as a side effect.
    await page.request.post(`${API}/${data!.id}/status`, {
      data: { action: "fertigmelden" },
    })
    const noReason = await page.request.post(`${API}/${data!.id}/status`, {
      data: { action: "zurueckweisen" },
    })
    expect([422]).toContain(noReason.status())
    const { data: after } = await admin!
      .from("construction_defects")
      .select("status")
      .eq("id", data!.id)
      .single()
    expect(after?.status).toBe("erledigt")
  })
})
