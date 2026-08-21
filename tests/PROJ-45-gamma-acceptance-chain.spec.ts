/**
 * PROJ-45-γ `/qa` — die Kette, die `/frontend` ausdrücklich offen gelassen hat.
 *
 * `/backend` hat die Regeln auf der Datenbank belegt (Live-Pentest 60/60) und
 * `/frontend` hat gezeigt, dass die Fläche rendert; **gefahren** hat die Kette
 * niemand. Das stand als Abweichung D-γ15 — nach der PROJ-135/AC-135.3-Lehre
 * ist ein nicht ausgeführter E2E-Layer aber ein **offenes
 * Akzeptanzkriterium**, keine Abweichung. Diese Datei fährt ihn.
 *
 * Tragend sind die NEGATIVEN Zusicherungen, weil eine Kette, die nur den
 * Glückspfad geht, über ein Tor nichts beweist:
 *   - der **Betrachter** bekommt „Termin ansetzen" gar nicht zu sehen (L22 im
 *     Browser, nicht nur in der Funktion) — und das ist die VERSCHÄRFUNG
 *     gegenüber β, wo derselbe Betrachter einen Mangel erfassen darf;
 *   - nach dem Protokollieren verschwinden die Zeilenaktionen (Einfrieren);
 *   - der **Beleg** lässt sich danach trotzdem anhängen (die einzige Ausnahme).
 *
 * WARUM DIESE DATEI NICHTS LÖSCHT: `construction_acceptance_events` ist seit
 * dem γ-Fix-forward append-only OHNE Kaskaden-Ausstieg (im Gleichzug zu
 * PROJ-Y-148d für die Mängel-Historie). Damit ist eine Abnahme über die
 * Anwendung und über den Dienst-Schlüssel **nicht löschbar** — `42501`, live
 * gemessen. Ein `deleteOrThrow` würde also bei jedem Lauf laut scheitern. Die
 * Zeilen dieses Laufs werden darum über den Runbook-Weg entfernt
 * (`docs/production/prod-test-fixtures.md`), streng auf den Bau-Mandanten
 * begrenzt, mit Vorbedingung und Nachprüfung — genau wie PROJ-45-β es für seine
 * 33 Audit-Zeilen getan hat. Als Folgearbeit registriert.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js"

import { expect, test } from "./fixtures/auth-fixture"
import {
  E2E_CONSTRUCTION_PROJECT_ID,
  E2E_CONSTRUCTION_TRADE_LABEL,
} from "./fixtures/constants"

const PROJECT = E2E_CONSTRUCTION_PROJECT_ID
const PATH = `/projects/${PROJECT}/abnahmen`
const STAMP = `${Date.now()}`

function mark(name: string): string {
  return `[E2E γ] ${name} ${STAMP}`
}

async function admin(): Promise<SupabaseClient | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  const { default: WebSocketImpl } = (await import("ws")) as {
    default: typeof WebSocket
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { transport: WebSocketImpl },
  })
}

/**
 * Verengt `T | null` auf `T` und sagt beim Fehlschlag, WAS fehlte.
 *
 * `.single<T>()` liefert `data: T | null`; ein `!` würde den Typ befriedigen
 * und im Fehlerfall ein nichtssagendes „cannot read property of null" erzeugen.
 */
function must<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) {
    throw new Error(`${what} wurde nicht gefunden — die Vorbedingung hielt nicht.`)
  }
  return value
}

/** Öffnet einen Radix-Select und wählt die Option über ihren Namen. */
async function pick(
  page: import("@playwright/test").Page,
  triggerId: string,
  optionName: string | RegExp
): Promise<void> {
  await page.locator(`#${triggerId}`).click()
  await page.getByRole("option", { name: optionName }).click()
}

function row(page: import("@playwright/test").Page, title: string) {
  return page.getByRole("row").filter({ hasText: title })
}

test.describe("PROJ-45-γ · Abnahme-Kette in echten Sitzungen", () => {
  test("der Betrachter bekommt „Termin ansetzen“ NICHT — die Verschärfung gegenüber β", async ({
    constructionViewerPage,
  }) => {
    await constructionViewerPage.goto(PATH, { waitUntil: "domcontentloaded" })
    await expect(
      constructionViewerPage.getByRole("heading", { name: "Abnahmen" })
    ).toBeVisible()

    // Die Fläche ist LESBAR — das ist der Unterschied zu „gar kein Zugang".
    await expect(
      constructionViewerPage.getByRole("button", { name: "Termin ansetzen" })
    ).toHaveCount(0)

    // Gegenprobe im selben Atemzug: derselbe Betrachter DARF beim Mangel
    // erfassen. Ohne diese Zeile belegte der Test nur „Knopf fehlt", nicht
    // „hier strenger als dort".
    await constructionViewerPage.goto(`/projects/${PROJECT}/maengel`, {
      waitUntil: "domcontentloaded",
    })
    await expect(
      constructionViewerPage.getByRole("button", { name: "Mangel erfassen" }).first()
    ).toBeVisible()
  })

  test("Bauleitung: ansetzen → protokollieren mit Vorbehalt → einfrieren → Beleg → Druck", async ({
    constructionLeadPage,
  }) => {
    test.setTimeout(180_000)
    const db = await admin()
    test.skip(db === null, "SUPABASE_SERVICE_ROLE_KEY fehlt")
    if (!db) return

    const title = mark("Abnahme Dach")
    const defectTitle = mark("Vorbehalt Fuge")

    // ── Vorbereitung: ein offener Mangel am selben Gewerk. Er ist der Grund,
    // warum die Protokoll-Maske überhaupt einen Vorbehalt vorschlagen kann
    // (AC-45γ.13) — und ohne ihn wäre der „unter Vorbehalt"-Pfad nicht fahrbar.
    await constructionLeadPage.goto(`/projects/${PROJECT}/maengel`, {
      waitUntil: "domcontentloaded",
    })
    await constructionLeadPage
      .getByRole("button", { name: "Mangel erfassen" })
      .first()
      .click()
    const defectDialog = constructionLeadPage.getByRole("dialog")
    await expect(defectDialog).toBeVisible()
    await defectDialog.locator("#defect-title").fill(defectTitle)
    await pick(constructionLeadPage, "defect-trade", E2E_CONSTRUCTION_TRADE_LABEL)
    await defectDialog.getByRole("button", { name: "Mangel erfassen" }).click()
    await expect(defectDialog).toBeHidden()

    // ── 1. Termin ansetzen ────────────────────────────────────────────────
    await constructionLeadPage.goto(PATH, { waitUntil: "domcontentloaded" })
    await constructionLeadPage.getByRole("button", { name: "Termin ansetzen" }).click()
    const dialog = constructionLeadPage.getByRole("dialog")
    await expect(dialog).toBeVisible()
    await dialog.getByLabel("Ein Gewerk").check()
    await pick(constructionLeadPage, "acc-trade", E2E_CONSTRUCTION_TRADE_LABEL)
    await dialog.locator("#acc-date").fill("2026-09-15")
    await dialog.locator("#acc-title").fill(title)
    await dialog.getByRole("button", { name: "Termin ansetzen" }).click()
    await expect(dialog).toBeHidden()
    await expect(row(constructionLeadPage, title)).toBeVisible()

    // VOR dem Protokollieren: die Abnahme existiert, hat aber KEIN Ergebnis.
    const { data: scheduled } = await db
      .from("construction_acceptances")
      .select("id, status, warranty_end_date")
      .eq("project_id", PROJECT)
      .eq("title", title)
      .maybeSingle<{ id: string; status: string; warranty_end_date: string | null }>()
    const acceptanceId = must(scheduled, "die angesetzte Abnahme").id
    expect(scheduled?.status).toBe("angesetzt")
    expect(scheduled?.warranty_end_date).toBeNull()

    // ── 2. Protokollieren: unter Vorbehalt, mit Gewährleistung ────────────
    await row(constructionLeadPage, title)
      .getByRole("button", { name: "Protokollieren" })
      .click()
    const rec = constructionLeadPage.getByRole("dialog")
    await expect(rec).toBeVisible()

    // Der offene Mangel ist VORAUSGEWÄHLT (AC-45γ.13) — geprüft, nicht gesetzt.
    const preTicked = rec.getByRole("checkbox", { checked: true })
    await expect(preTicked.first()).toBeVisible()

    await rec.getByLabel("Abgenommen unter Vorbehalt").check()
    await pick(constructionLeadPage, "rec-warranty", /VOB/)
    await expect(rec.getByText(/Frist endet am/)).toBeVisible()
    await rec.getByRole("button", { name: "Protokollieren" }).click()
    await expect(rec).toBeHidden()

    // ── 3. Was die Datenbank danach hält ─────────────────────────────────
    const { data: recordedRaw } = await db
      .from("construction_acceptances")
      .select("id, status, warranty_months, warranty_end_date, accepted_on")
      .eq("id", acceptanceId)
      .single<{
        id: string
        status: string
        warranty_months: number | null
        warranty_end_date: string | null
        accepted_on: string | null
      }>()
    const recorded = must(recordedRaw, "die protokollierte Abnahme")
    expect(recorded.status).toBe("abgenommen_unter_vorbehalt")
    expect(recorded.warranty_months).toBe(48)
    expect(recorded.warranty_end_date).not.toBeNull()
    expect(recorded.accepted_on).not.toBeNull()

    // Der Vorbehalt ist ein VERWEIS auf den echten Mangel — keine Kopie.
    const { data: reservations } = await db
      .from("construction_acceptance_reservations")
      .select("defect_id, defect:construction_defects(title)")
      .eq("acceptance_id", acceptanceId)
    // NICHT auf die Anzahl nageln: die Maske hakt ALLE offenen Mängel des
    // Gewerks vor (AC-45γ.13), und wie viele das sind, hängt am Bestand — bei
    // wiederholtem Lauf also an den Zeilen des Vorlaufs. Die erste Fassung
    // prüfte `=== 1` und fiel beim zweiten Lauf; das Produkt war richtig, die
    // Zusicherung war rückstandsabhängig. Geprüft wird jetzt, worauf es
    // ankommt: der Mangel DIESES Laufs ist als Vorbehalt verknüpft, und jeder
    // Vorbehalt zeigt auf einen echten Mangel.
    const titles = (reservations ?? []).map(
      (r) => (r as { defect?: { title?: string } }).defect?.title
    )
    expect(titles).toContain(defectTitle)
    expect(titles.every((t) => typeof t === "string" && t.length > 0)).toBe(true)

    // ── 4. Einfrieren im Browser ─────────────────────────────────────────
    await constructionLeadPage.reload({ waitUntil: "domcontentloaded" })
    const frozen = row(constructionLeadPage, title)
    await expect(frozen).toBeVisible()
    await expect(frozen.getByRole("button", { name: "Protokollieren" })).toHaveCount(0)
    await expect(frozen.getByRole("button", { name: "Termin ändern" })).toHaveCount(0)

    // ── 5. Der Beleg geht trotzdem — die einzige Ausnahme (D-γ4) ─────────
    await frozen.click()
    const sheet = constructionLeadPage.getByRole("dialog").filter({ hasText: "Verlauf" })
    await expect(sheet).toBeVisible()
    await expect(
      sheet.getByText(/nur der Beleg lässt sich noch nachtragen/)
    ).toBeVisible()
    await sheet.locator("#doc-label").fill("Unterschriebenes Protokoll")
    await sheet
      .locator("#doc-url")
      .fill("https://example.org/abnahmeprotokoll.pdf")
    await sheet.getByRole("button", { name: "Beleg anhängen" }).click()
    await expect(
      sheet.getByRole("link", { name: /Unterschriebenes Protokoll/ })
    ).toBeVisible()

    const { data: withDocRaw } = await db
      .from("construction_acceptances")
      .select("document_url, status")
      .eq("id", acceptanceId)
      .single<{ document_url: string | null; status: string }>()
    const withDoc = must(withDocRaw, "die Abnahme mit Beleg")
    expect(withDoc.document_url).toBe("https://example.org/abnahmeprotokoll.pdf")
    // Und das Ergebnis ist dabei NICHT mitgewandert.
    expect(withDoc.status).toBe("abgenommen_unter_vorbehalt")

    // ── 6. Echter Druck nach PDF (AC-45γ.21/.22) ─────────────────────────
    const print = await constructionLeadPage.context().newPage()
    await print.goto(
      `/projects/${PROJECT}/abnahmeprotokoll/print?abnahme=${acceptanceId}`,
      { waitUntil: "domcontentloaded" }
    )
    await expect(
      print.getByRole("heading", { name: /Abnahmeprotokoll Nr\./ })
    ).toBeVisible()
    // Die Pflichtbestandteile aus AC-45γ.22, einzeln geprüft.
    await expect(print.getByText("Abnahmedatum")).toBeVisible()
    await expect(print.getByText("Gewährleistung")).toBeVisible()
    await expect(print.getByText(defectTitle)).toBeVisible()
    await expect(print.getByText("Auftraggeber / Bauherr")).toBeVisible()
    const pdf = await print.pdf({ format: "A4" })
    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-")
    expect(pdf.byteLength).toBeGreaterThan(1000)
    await print.close()
  })

  test("nach einer Verweigerung wird eine Nachabnahme angeboten, kein Bearbeiten", async ({
    constructionLeadPage,
  }) => {
    test.setTimeout(180_000)
    const db = await admin()
    test.skip(db === null, "SUPABASE_SERVICE_ROLE_KEY fehlt")
    if (!db) return

    const title = mark("Abnahme verweigert")
    await constructionLeadPage.goto(PATH, { waitUntil: "domcontentloaded" })
    await constructionLeadPage.getByRole("button", { name: "Termin ansetzen" }).click()
    const dialog = constructionLeadPage.getByRole("dialog")
    await expect(dialog).toBeVisible()
    // Gesamtabnahme: der ANKERLOSE Fall (D-γ1) — der, den die ursprüngliche
    // Anforderung über den Wurzel-Abschnitt lösen wollte und der so nicht
    // baubar war.
    await dialog.getByLabel("Das ganze Projekt (Gesamtabnahme)").check()
    await dialog.locator("#acc-date").fill("2026-10-01")
    await dialog.locator("#acc-title").fill(title)
    await dialog.getByRole("button", { name: "Termin ansetzen" }).click()
    await expect(dialog).toBeHidden()

    await row(constructionLeadPage, title)
      .getByRole("button", { name: "Protokollieren" })
      .click()
    const rec = constructionLeadPage.getByRole("dialog")
    await rec.getByLabel("Verweigert", { exact: true }).check()
    await rec.locator("#rec-reason").fill("Estrich nicht trocken")
    await rec.getByRole("button", { name: "Protokollieren" }).click()
    await expect(rec).toBeHidden()

    await constructionLeadPage.reload({ waitUntil: "domcontentloaded" })
    const refused = row(constructionLeadPage, title)
    await expect(refused.getByRole("button", { name: "Nachabnahme" })).toBeVisible()
    await expect(refused.getByRole("button", { name: "Termin ändern" })).toHaveCount(0)

    // Und die Datenbank hält keine Frist — eine verweigerte Abnahme setzt keine
    // in Gang (AC-45γ.20).
    const { data: rawRefused } = await db
      .from("construction_acceptances")
      .select("status, warranty_end_date, trade_id, section_id")
      .eq("project_id", PROJECT)
      .eq("title", title)
      .single<{
        status: string
        warranty_end_date: string | null
        trade_id: string | null
        section_id: string | null
      }>()
    const data = must(rawRefused, "die verweigerte Abnahme")
    expect(data.status).toBe("verweigert")
    expect(data.warranty_end_date).toBeNull()
    // Ankerlos = Gesamtabnahme.
    expect(data.trade_id).toBeNull()
    expect(data.section_id).toBeNull()
  })
})
