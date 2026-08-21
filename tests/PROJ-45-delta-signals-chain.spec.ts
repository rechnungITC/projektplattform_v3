/**
 * PROJ-45-δ `/qa` — der Durchlauf, den `/frontend` ausdrücklich offen gelassen
 * hat (D-δ-FE-4), plus die Hälfte, die die Fixture von sich aus NICHT hergibt.
 *
 * Live gemessen liefert die Bau-Lane nur den LEERZUSTAND: ein Gewerk ohne
 * Befund, zwei Abschnitte ohne Verknüpfung, 0 Fristen, 0 Engpässe. Ein
 * Durchlauf, der nur darauf schaut, belegt von den vier Blöcken keinen
 * einzigen im gefüllten Zustand. Diese Datei seedet deshalb einen ECHTEN
 * Blocker und prüft beide Hälften gegeneinander:
 *
 *   - gefüllt: überfälliger Mangel → Gewerk „Blockiert" MIT benanntem Grund,
 *     drei getrennte Zahlen, Frist als „verstrichen", Engpass-Zeile mit Tagen;
 *   - leer, mit GRUND: ein Abschnitt ohne Verknüpfung zeigt keinen Balken und
 *     kein „0 %", sondern den Satz, warum nichts zu messen ist (AC-45δ.10).
 *
 * Tragend sind zwei NEGATIVE Zusicherungen, weil eine Kette, die nur den
 * Glückspfad geht, über ein Tor nichts beweist:
 *   1. Der **Betrachter** sieht die Fläche vollständig (AC-45δ.23 — hier gibt
 *      es KEINE verschärfte Rolle, anders als bei γ) ...
 *   2. ... und die Fläche bietet ihm **keinen** Schreibweg an, während derselbe
 *      Betrachter auf der Mängel-Fläche „Mangel erfassen" sehr wohl sieht
 *      (β/L15). Ohne diese Gegenprobe belegte „kein Knopf" nur die Abwesenheit
 *      eines Knopfes, nicht die Lesend-Eigenschaft dieser Fläche.
 *
 * WARUM DER TEARDOWN NICHT ALLES LÖSCHT: `construction_defects` ist seit
 * PROJ-Y-148d nicht mehr löschbar (42501, auch als Dienst-Schlüssel). Die
 * Arbeitspakete und der Prüf-Abschnitt werden hier entfernt; der Mangel wird
 * über den Runbook-Weg (`docs/production/prod-test-fixtures.md`) abgeräumt,
 * streng auf den Bau-Mandanten begrenzt. Das ist dieselbe Lücke, die als
 * PROJ-Y-45h registriert ist — dieser Lauf verschärft sie nicht, er benennt
 * sie ein zweites Mal mit Zahlen.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js"

import { expect, test } from "./fixtures/auth-fixture"
import {
  E2E_CONSTRUCTION_PROJECT_ID,
  E2E_CONSTRUCTION_PROJECT_TRADE_ID,
  E2E_CONSTRUCTION_SECTION_CHILD_ID,
  E2E_CONSTRUCTION_SECTION_ROOT_ID,
  E2E_CONSTRUCTION_SECTION_ROOT_LABEL,
  E2E_CONSTRUCTION_TENANT_ID,
  E2E_CONSTRUCTION_TRADE_LABEL,
  E2E_CONSTRUCTION_LEAD_USER_ID,
} from "./fixtures/constants"

const PROJECT = E2E_CONSTRUCTION_PROJECT_ID
const PATH = `/projects/${PROJECT}/terminsignale`
const STAMP = `${Date.now()}`
const DEFECT_TITLE = `[E2E δ] Dachdurchdringung offen ${STAMP}`
const EMPTY_SECTION_LABEL = `[E2E δ] Ohne Verknüpfung ${STAMP}`

const seeded = {
  defectId: null as string | null,
  sectionId: null as string | null,
  workItemIds: [] as string[],
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

function must<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) {
    throw new Error(`${what} fehlt — die Vorbedingung hielt nicht.`)
  }
  return value
}

function isoDaysAgo(days: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - days)
  return d.toISOString().slice(0, 10)
}

test.describe.configure({ mode: "serial" })

test.describe("PROJ-45-δ — Terminsignale: authentifizierte Kette", () => {
  test.beforeAll(async () => {
    const db = await admin()
    test.skip(!db, "SUPABASE_SERVICE_ROLE_KEY fehlt — Kette nicht fahrbar.")
    if (!db) return

    // Ein Abschnitt OHNE jede Verknüpfung: die leere Hälfte mit Grund.
    const { data: section, error: sectionErr } = await db
      .from("construction_sections")
      .insert({
        tenant_id: E2E_CONSTRUCTION_TENANT_ID,
        project_id: PROJECT,
        label: EMPTY_SECTION_LABEL,
      })
      .select("id")
      .single<{ id: string }>()
    if (sectionErr) throw new Error(`Abschnitt-Seed: ${sectionErr.message}`)
    seeded.sectionId = must(section?.id, "Prüf-Abschnitt")

    // Arbeitspakete NUR am KIND-Abschnitt: die Wurzel muss sie über den
    // Teilbaum zählen (AC-45δ.8/AC-45δH-13), nicht über den eigenen Knoten.
    const rows = [
      { title: `[E2E δ] WP fertig ${STAMP}`, status: "done", due_date: null },
      {
        title: `[E2E δ] WP offen ${STAMP}`,
        status: "todo",
        due_date: isoDaysAgo(4),
      },
    ]
    for (const row of rows) {
      const { data, error } = await db
        .from("work_items")
        .insert({
          tenant_id: E2E_CONSTRUCTION_TENANT_ID,
          project_id: PROJECT,
          kind: "work_package",
          title: row.title,
          status: row.status,
          due_date: row.due_date,
          section_id: E2E_CONSTRUCTION_SECTION_CHILD_ID,
          created_by: E2E_CONSTRUCTION_LEAD_USER_ID,
        })
        .select("id")
        .single<{ id: string }>()
      if (error) throw new Error(`Arbeitspaket-Seed: ${error.message}`)
      seeded.workItemIds.push(must(data?.id, "Arbeitspaket"))
    }

    // Der echte Blocker: ein überfälliger Mangel am Fixture-Gewerk.
    const { data: maxRow } = await db
      .from("construction_defects")
      .select("defect_number")
      .eq("project_id", PROJECT)
      .order("defect_number", { ascending: false })
      .limit(1)
      .maybeSingle<{ defect_number: number }>()
    const nextNumber = (maxRow?.defect_number ?? 0) + 1

    const { data: defect, error: defectErr } = await db
      .from("construction_defects")
      .insert({
        tenant_id: E2E_CONSTRUCTION_TENANT_ID,
        project_id: PROJECT,
        defect_number: nextNumber,
        title: DEFECT_TITLE,
        trade_id: E2E_CONSTRUCTION_PROJECT_TRADE_ID,
        section_id: E2E_CONSTRUCTION_SECTION_CHILD_ID,
        severity: "erheblich",
        status: "offen",
        due_date: isoDaysAgo(6),
        created_by: E2E_CONSTRUCTION_LEAD_USER_ID,
      })
      .select("id")
      .single<{ id: string }>()
    if (defectErr) throw new Error(`Mangel-Seed: ${defectErr.message}`)
    seeded.defectId = must(defect?.id, "Mangel")
  })

  test.afterAll(async () => {
    const db = await admin()
    if (!db) return
    if (seeded.workItemIds.length > 0) {
      const { error } = await db
        .from("work_items")
        .delete()
        .in("id", seeded.workItemIds)
      if (error) throw new Error(`Teardown Arbeitspakete: ${error.message}`)
    }
    if (seeded.sectionId) {
      const { error } = await db
        .from("construction_sections")
        .delete()
        .eq("id", seeded.sectionId)
      if (error) throw new Error(`Teardown Abschnitt: ${error.message}`)
    }
    // Der Mangel bleibt bewusst stehen: nicht löschbar (PROJ-Y-148d). Er wird
    // nach dem Lauf über den Runbook-Weg entfernt; der Titel trägt den Stempel,
    // damit er eindeutig zuordenbar ist. Kein stiller `catch` — wer hier
    // schweigt, verdeckt genau den Produktionsfehler, den PROJ-Y-143o gefunden
    // hat.
  })

  test("die gefüllte Hälfte: Blocker mit benanntem Grund, Frist, Engpass", async ({
    constructionLeadPage: page,
  }) => {
    await page.goto(PATH)

    // Kopfzahlen (über ALLE Zeilen, AC-45δ.15).
    await expect(page.getByText("Überfällige Mängel", { exact: false }).first()).toBeVisible()

    // AC-45δ.2 — BEIDE Angaben, beide beschriftet. Ohne die zwei Beschriftungen
    // wäre nicht erkennbar, welche Farbe woher kommt.
    await expect(page.getByText("Bewertung Bauleitung:")).toBeVisible()
    await expect(page.getByText("Aus den Daten:")).toBeVisible()

    // Das Gewerk ist blockiert, und der GRUND steht da (AC-45δ.3).
    await expect(page.getByText(E2E_CONSTRUCTION_TRADE_LABEL).first()).toBeVisible()
    await expect(page.getByText("Blockiert").first()).toBeVisible()
    await expect(page.getByText("Überfällige Mängel").first()).toBeVisible()

    // AC-45δ.5 — drei getrennte Zahlen, nicht addiert.
    await expect(page.getByText("Ohne Frist").first()).toBeVisible()
    await expect(page.getByText("Wartet auf Prüfung").first()).toBeVisible()

    // AC-45δ.8/.9 — die WURZEL zählt die Arbeitspakete des Kindes und sagt,
    // woraus sie rechnet.
    await expect(page.getByText(E2E_CONSTRUCTION_SECTION_ROOT_LABEL).first()).toBeVisible()
    // Wortlaut aus `describeProgressSource`, nicht aus meiner Erinnerung: die
    // erste Fassung dieser Zusicherung erfand „Arbeitspakete verknüpft" und
    // schlug fehl, ohne einen Fehler zu belegen.
    await expect(page.getByText(/aus \d+ Arbeitspaketen im Teilbaum/).first()).toBeVisible()
    // Der Prozentwert wird mit geschütztem Leerzeichen gesetzt.
    await expect(page.getByText(/50\s*%/).first()).toBeVisible()

    // AC-45δ.10 — die leere Hälfte MIT GRUND: kein Balken, kein „0 %".
    await expect(page.getByText(EMPTY_SECTION_LABEL)).toBeVisible()
    await expect(page.getByText(/nichts verknüpft/i).first()).toBeVisible()

    // AC-45δ.11/.12 — die Frist erscheint und ist als verstrichen erkennbar.
    await expect(page.getByText("verstrichen").first()).toBeVisible()
    await expect(page.getByText(DEFECT_TITLE).first()).toBeVisible()

    // AC-45δ.14 — Engpass-Zeile mit Tagen über Frist.
    await expect(page.getByText(/6\s*Tage/).first()).toBeVisible()

    // D-δ7 — CSV je Block, als echte Adresse (kein Fetch-Umweg).
    // Der zugängliche Name sagt, dass eine CSV kommt — der sichtbare Text ist
    // knapp, weil er neben dem Blocktitel steht (QA-Befund δ, in `/qa` behoben).
    const csv = page.getByRole("link", { name: /als CSV herunterladen/i })
    await expect(csv.first()).toHaveAttribute(
      "href",
      new RegExp(`construction-schedule-signals/export\\?section=`)
    )
  })

  test("der Betrachter sieht die Fläche — und sie bietet ihm keinen Schreibweg", async ({
    constructionViewerPage: page,
  }) => {
    await page.goto(PATH)

    // AC-45δ.23 — KEINE verschärfte Rolle: der Betrachter sieht alles.
    await expect(page.getByText(E2E_CONSTRUCTION_TRADE_LABEL).first()).toBeVisible()
    await expect(page.getByText("Blockiert").first()).toBeVisible()
    await expect(page.getByText(DEFECT_TITLE).first()).toBeVisible()

    // AC-45δ.22 — rein lesend: kein Erfassen, kein Bearbeiten, kein Löschen.
    await expect(page.getByRole("button", { name: /erfassen|anlegen|bearbeiten|löschen/i })).toHaveCount(0)

    // Die GEGENPROBE, ohne die „kein Knopf" nichts über diese Fläche aussagt:
    // derselbe Betrachter darf auf der Mängel-Fläche erfassen (β/L15).
    await page.goto(`/projects/${PROJECT}/maengel`)
    await expect(page.getByRole("button", { name: /Mangel erfassen/i })).toBeVisible()
  })
})
