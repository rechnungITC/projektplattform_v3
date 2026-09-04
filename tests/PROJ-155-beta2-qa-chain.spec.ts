import { createClient, type SupabaseClient } from "@supabase/supabase-js"

import { expect, test } from "./fixtures/auth-fixture"
import {
  E2E_GANTT_DATES,
  E2E_GANTT_PROJECT_ID,
  E2E_GANTT_WP_DATED_ID,
  E2E_GANTT_WP_DERIVED_ID,
  E2E_GANTT_PHASE_ANALYSE_ID,
  E2E_GANTT_TENANT_ID,
  E2E_USER_ID,
} from "./fixtures/constants"

/** Wie in PROJ-Y-155a: der Dienst-Client kommt aus der Umgebung, nicht aus einer
 *  geteilten Datei — es gibt keine `fixtures/admin-client.ts`. */
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
 * PROJ-155-β.2 — `/qa`: der authentifizierte Durchlauf, den `/frontend` offen
 * gelassen hat.
 *
 * Belegt waren vorher Rechnung (20 Unit-Tests), Route (18), Komponente (11) und
 * Datenschicht (Live-Pentest 12/12). Ungeprüft war die **Verkettung**: Ziehen →
 * Vorschau → Übernehmen → Termine in der Datenbank.
 *
 * **Die Fixture gibt den Fall nicht von sich aus her.** Die geseedete Kante
 * zeigt von `WP_DATED` auf `WP_DERIVED`, und `WP_DERIVED` hat **keine eigenen**
 * Termine — es erbt sie per α-Rollup aus seinen Kindern. Für die Kaskade ist es
 * damit ein `no_dates`-Fall (AC-16), also gerade **kein** Nachfolger, der sich
 * verschiebt. Der Kaskadenfall wird deshalb geseedet und danach zurückgesetzt
 * (Präzedenz PROJ-45-δ, wo die Fixture ebenfalls nur den Leerzustand hergab).
 */

const NACHFOLGER_START = "2026-03-11"
const NACHFOLGER_ENDE = "2026-03-18"

async function schalterSetzen(admin: SupabaseClient, an: boolean) {
  await admin
    .from("projects")
    .update({ settings: an ? { autoScheduleSuccessors: true } : {} })
    .eq("id", E2E_GANTT_PROJECT_ID)
}

async function nachfolgerTerminieren(
  admin: SupabaseClient,
  start: string | null,
  ende: string | null,
) {
  await admin
    .from("work_items")
    .update({ planned_start: start, planned_end: ende })
    .eq("id", E2E_GANTT_WP_DERIVED_ID)
}


const PLANUNG = `/projects/${E2E_GANTT_PROJECT_ID}/planung`
const DIAGRAM = '[aria-label="Gantt-Diagramm der Phasen"]'
/** Der ziehbare Balken. `data-bar-target` ist im Markup vorhanden und damit der
 *  praezise Griff — PROJ-Y-155a musste sich noch an `rect`-Reihenfolgen halten. */
const BALKEN = `[data-bar-target="work_package:${E2E_GANTT_WP_DATED_ID}"]`

async function openGantt(page: import("@playwright/test").Page) {
  await page.goto(PLANUNG, { waitUntil: "domcontentloaded" })
  const tab = page.getByRole("tab", { name: "Gantt" })
  await expect(tab).toBeVisible({ timeout: 30_000 })
  // Klicken bis `aria-selected` — ein Klick vor der Hydration geht lautlos
  // verloren (PROJ-Y-155a hat das ausgemessen).
  await expect(async () => {
    await tab.click()
    await expect(tab).toHaveAttribute("aria-selected", "true", { timeout: 1_000 })
  }).toPass({ timeout: 45_000 })
  await expect(page.locator(DIAGRAM)).toBeVisible({ timeout: 30_000 })
}

/** Zieht den Balken um ~5 Tage nach rechts. */
async function balkenZiehen(page: import("@playwright/test").Page) {
  const bar = page.locator(BALKEN).first()
  await bar.scrollIntoViewIfNeeded()
  const box = await bar.boundingBox()
  expect(box, "Kein ziehbarer Balken gefunden").not.toBeNull()
  const y = box!.y + box!.height / 2
  await page.mouse.move(box!.x + box!.width / 2, y)
  await page.mouse.down()
  await page.mouse.move(box!.x + box!.width / 2 + 60, y, { steps: 8 })
  await page.mouse.move(box!.x + box!.width / 2 + 120, y, { steps: 8 })
  await page.mouse.up()
}

test.describe.configure({ mode: "serial" })

test.describe("PROJ-155-β.2 — Kaskade über die Route (AC-13/15/17)", () => {
  /**
   * Der harte Nachweis, ohne Browser: die Route bekommt genau die Anfrage, die
   * die Oberfläche schickt, und muss den Nachfolger mitverschieben.
   *
   * Warum nicht nur im Browser: der Zug ist eine Mausbewegung über einem SVG mit
   * mehreren überlagerten Elementen (PROJ-Y-155a hat das mühsam ausgemessen).
   * Schlägt der Browser-Fall fehl, unterscheidet er nicht zwischen „der Zug ging
   * ins Leere" und „die Kaskade rechnet falsch". Diese Prüfung trennt das.
   */
  /**
   * **F-1 (High) — behoben durch PROJ-Y-155f; dieser Fall ist jetzt echt grün.**
   *
   * Er stand als `test.fail()` in der Datei und hat genau das getan, wofür das
   * Muster da ist: beim Beheben von selbst angeschlagen. Die Geschichte bleibt
   * stehen, weil sie die Regel begründet, die jetzt gilt.
   *
   * Gemessen: die Antwort der Route lautet
   * `{"applied":{"total":1},"cascade":{"shifts":[],...}}` — die Kaskade ist
   * **leer**, obwohl eine `FS`-Kante mit Abstand 0 existiert und der Nachfolger
   * eigene Termine hat. Ursache ist der Filter in
   * `schedule/apply/route.ts:181-182`: er verlangt `from_type = "todo"` **und**
   * `to_type = "todo"`, während `dependencyEntityTypes` **vier** Werte kennt
   * (`project`, `phase`, `work_package`, `todo`). In Produktion existiert
   * **keine einzige** `todo`/`todo`-Kante (gemessen: 2× work_package→work_package,
   * 2× phase→phase, 1× gemischt) — die Kaskade rechnet dort also nie etwas.
   *
   * Der Gantt filtert **anders** (`gantt-view.tsx:1093`: „beide Enden sind
   * bekannte Zeilen") und zeigt die Kaskade deshalb korrekt an. Vorschau und
   * Server sehen damit **unterschiedliche Kantenmengen** — ausgerechnet in der
   * Slice, deren tragende Entscheidung war, dass es nur **eine** Formel gibt.
   * Die Formel ist geteilt; ihre **Eingabe** wird unterschiedlich beschafft.
   *
   * **Behoben in PROJ-Y-155f:** die Kantenbeschaffung liegt jetzt in
   * `cascadeEdgesFor`, und zwar für **beide** Seiten. Gefiltert wird über die
   * Endpunkt-Zugehörigkeit statt über Typnamen — richtig nicht aus Gewohnheit,
   * sondern weil `dependencies` polymorph ist: wer über die Endpunkte filtert,
   * schliesst Phasen- und Projektkanten automatisch aus, ohne eine Typliste zu
   * führen, die beim nächsten Endpunkttyp erneut auseinanderläuft.
   */
  test("AC-15: Übernehmen verschiebt den Nachfolger mit", async ({
    ganttTenantPage: page,
  }) => {
    const admin = await createAdminClient()
    test.skip(!admin, "SUPABASE_SERVICE_ROLE_KEY fehlt — Zustand nicht prüfbar.")

    await nachfolgerTerminieren(admin!, NACHFOLGER_START, NACHFOLGER_ENDE)
    try {
      // Der gezogene Knoten wandert 5 Tage nach rechts.
      const neuStart = "2026-03-07"
      const neuEnde = "2026-03-15"

      const res = await page.request.post(
        `/api/projects/${E2E_GANTT_PROJECT_ID}/schedule/apply`,
        {
          data: {
            kind: "work_item",
            id: E2E_GANTT_WP_DATED_ID,
            start: neuStart,
            end: neuEnde,
          },
        },
      )
      expect(res.status(), await res.text()).toBe(200)
      const body = await res.json()

      // Der gezogene Knoten ist geschrieben — das ist die leichte Hälfte.
      const gezogen = await admin!
        .from("work_items")
        .select("planned_start, planned_end")
        .eq("id", E2E_GANTT_WP_DATED_ID)
        .single()
      expect(gezogen.data!.planned_start).toBe(neuStart)

      // **Die tragende Zusicherung.** Die Kante ist `FS` mit Abstand 0, der
      // Vorgänger endet neu am 15. — der Nachfolger muss am 16. beginnen.
      const nachfolger = await admin!
        .from("work_items")
        .select("planned_start, planned_end")
        .eq("id", E2E_GANTT_WP_DERIVED_ID)
        .single()
      expect(
        nachfolger.data!.planned_start,
        `Nachfolger nicht mitverschoben. Antwort: ${JSON.stringify(body)}`,
      ).toBe("2026-03-16")
      expect(body.applied.total).toBeGreaterThanOrEqual(2)
    } finally {
      await nachfolgerTerminieren(admin!, null, null)
      await admin!
        .from("work_items")
        .update({
          planned_start: E2E_GANTT_DATES.wpDated.start,
          planned_end: E2E_GANTT_DATES.wpDated.end,
        })
        .eq("id", E2E_GANTT_WP_DATED_ID)
    }
  })

  /**
   * AC-16 — ein Nachfolger ohne Termin bekommt keinen erfunden. Das ist der
   * Zustand, den die Fixture von sich aus hergibt, und die Gegenprobe zum Fall
   * darüber: dieselbe Anfrage, nur ohne Termine am Nachfolger.
   */
  test("AC-16: ein terminloser Nachfolger bekommt keinen Termin erfunden", async ({
    ganttTenantPage: page,
  }) => {
    const admin = await createAdminClient()
    test.skip(!admin, "SUPABASE_SERVICE_ROLE_KEY fehlt.")

    const vorher = await admin!
      .from("work_items")
      .select("planned_start, planned_end")
      .eq("id", E2E_GANTT_WP_DERIVED_ID)
      .single()
    expect(vorher.data!.planned_start, "Vorbedingung: kein eigener Termin").toBeNull()

    try {
      const res = await page.request.post(
        `/api/projects/${E2E_GANTT_PROJECT_ID}/schedule/apply`,
        {
          data: {
            kind: "work_item",
            id: E2E_GANTT_WP_DATED_ID,
            start: "2026-03-07",
            end: "2026-03-15",
          },
        },
      )
      expect(res.status()).toBe(200)

      const nachher = await admin!
        .from("work_items")
        .select("planned_start, planned_end")
        .eq("id", E2E_GANTT_WP_DERIVED_ID)
        .single()
      expect(nachher.data!.planned_start, "kein erfundener Termin").toBeNull()
      expect(nachher.data!.planned_end).toBeNull()
    } finally {
      await admin!
        .from("work_items")
        .update({
          planned_start: E2E_GANTT_DATES.wpDated.start,
          planned_end: E2E_GANTT_DATES.wpDated.end,
        })
        .eq("id", E2E_GANTT_WP_DATED_ID)
    }
  })

  /**
   * AC-15, zweite Hälfte — „schlägt sie fehl, ist KEIN Termin geändert."
   * Ein unmögliches Ziel in derselben Anfrage muss alles verwerfen.
   */
  test("AC-15: ein unmoegliches Ziel verwirft ALLE Schreibvorgaenge", async ({
    ganttTenantPage: page,
  }) => {
    const admin = await createAdminClient()
    test.skip(!admin, "SUPABASE_SERVICE_ROLE_KEY fehlt.")

    const res = await page.request.post(
      `/api/projects/${E2E_GANTT_PROJECT_ID}/schedule/apply`,
      {
        data: {
          kind: "work_item",
          // Ein Arbeitspaket, das es nicht gibt.
          id: "00000000-0000-4000-8000-0000000000ff",
          start: "2026-03-07",
          end: "2026-03-15",
        },
      },
    )
    expect(res.status()).toBe(409)
    const body = await res.json()
    expect(body.error.code).toBe("shift_target_not_writable")
    expect(body.error.message).toContain("kein Termin geändert")

    // Und der echte Knoten steht unverändert.
    const unberuehrt = await admin!
      .from("work_items")
      .select("planned_start")
      .eq("id", E2E_GANTT_WP_DATED_ID)
      .single()
    expect(unberuehrt.data!.planned_start).toBe(E2E_GANTT_DATES.wpDated.start)
  })

  /** AC-11 — der Schalter steht per Default auf aus. */
  test("AC-11: der Schalter ist per Default aus", async () => {
    const admin = await createAdminClient()
    test.skip(!admin, "SUPABASE_SERVICE_ROLE_KEY fehlt.")
    const p = await admin!
      .from("projects")
      .select("settings")
      .eq("id", E2E_GANTT_PROJECT_ID)
      .single()
    expect(p.data!.settings?.autoScheduleSuccessors).not.toBe(true)
  })

  /** AC-21 — das Umstellen des Schalters erzeugt eine Feld-Audit-Zeile. */
  test("AC-21: der Schalter ist auditiert", async ({ ganttTenantPage: page }) => {
    const admin = await createAdminClient()
    test.skip(!admin, "SUPABASE_SERVICE_ROLE_KEY fehlt.")

    const zeilen = async () => {
      const r = await admin!
        .from("audit_log_entries")
        .select("id", { count: "exact", head: true })
        .eq("entity_type", "projects")
        .eq("entity_id", E2E_GANTT_PROJECT_ID)
        .eq("field_name", "settings")
      return r.count ?? 0
    }
    const vorher = await zeilen()
    try {
      const res = await page.request.patch(`/api/projects/${E2E_GANTT_PROJECT_ID}`, {
        data: { settings: { autoScheduleSuccessors: true } },
      })
      expect(res.status(), await res.text()).toBe(200)
      expect(await zeilen()).toBe(vorher + 1)
    } finally {
      await schalterSetzen(admin!, false)
    }
  })

  /**
   * F-1, zweite Seite — **umgedreht statt gelöscht** (Muster PROJ-Y-148d).
   *
   * Der Fall hielt fest, dass der Server auf eine **leere** Kaskade kam und das
   * als Abweichung meldete: formal richtig („es gilt die Rechnung des Servers"),
   * inhaltlich verschleiernd — der Nutzer las „übernommen, nur anders" statt
   * „die Nachfolger blieben stehen". Seit PROJ-Y-155f beschaffen Vorschau und
   * Server ihre Kanten aus derselben Funktion, also **stimmen sie überein**, und
   * genau das prüft der Fall jetzt. Die Zusicherung ist dadurch stärker, nicht
   * schwächer: sie schlägt an, wenn die beiden Seiten wieder auseinanderlaufen.
   */
  test("F-1 umgedreht: Vorschau und Server kommen auf dasselbe Ergebnis", async ({
    ganttTenantPage: page,
  }) => {
    const admin = await createAdminClient()
    test.skip(!admin, "SUPABASE_SERVICE_ROLE_KEY fehlt.")

    await nachfolgerTerminieren(admin!, NACHFOLGER_START, NACHFOLGER_ENDE)
    try {
      const res = await page.request.post(
        `/api/projects/${E2E_GANTT_PROJECT_ID}/schedule/apply`,
        {
          data: {
            kind: "work_item",
            id: E2E_GANTT_WP_DATED_ID,
            start: "2026-03-07",
            end: "2026-03-15",
            // Das schickt die Oberfläche: ihre Vorschau kennt den Nachfolger.
            expected_shift_ids: [E2E_GANTT_WP_DERIVED_ID],
          },
        },
      )
      expect(res.status()).toBe(200)
      const body = await res.json()
      // Der Server rechnet dieselbe Kaskade wie die Vorschau — vorher war diese
      // Liste leer, obwohl eine `FS`-Kante mit Abstand 0 existiert.
      expect(body.cascade.shifts).toHaveLength(1)
      expect(body.cascade.shifts[0].id).toBe(E2E_GANTT_WP_DERIVED_ID)
      // Und deshalb ist die Erwartung der Oberfläche jetzt deckungsgleich.
      expect(body.diverged_from_preview).toBe(false)
    } finally {
      await nachfolgerTerminieren(admin!, null, null)
      await admin!
        .from("work_items")
        .update({
          planned_start: E2E_GANTT_DATES.wpDated.start,
          planned_end: E2E_GANTT_DATES.wpDated.end,
        })
        .eq("id", E2E_GANTT_WP_DATED_ID)
    }
  })

  /**
   * AC-20 — der Meilenstein-Mitzug der Phase läuft über denselben
   * transaktionalen Pfad.
   *
   * Das ist der **Bestandsdefekt**, den β.2 mitgezogen hat: vorher schrieb der
   * Gantt die Phase per eigenem PATCH und danach N Meilenstein-PATCHes über
   * `Promise.all` mit `.catch(() => undefined)` — scheiterten alle N, war die
   * Phase trotzdem verschoben.
   *
   * Die Lane seedet keine Meilensteine, also wird einer angelegt und wieder
   * entfernt.
   */
  test("AC-20: der Phasen-Zug nimmt die Kind-Meilensteine mit", async ({
    ganttTenantPage: page,
  }) => {
    const admin = await createAdminClient()
    test.skip(!admin, "SUPABASE_SERVICE_ROLE_KEY fehlt.")

    const msId = "e2e00000-0000-4e2e-8e2e-0000000009a1"
    await admin!.from("milestones").upsert(
      {
        id: msId,
        tenant_id: E2E_GANTT_TENANT_ID,
        project_id: E2E_GANTT_PROJECT_ID,
        phase_id: E2E_GANTT_PHASE_ANALYSE_ID,
        name: "[QA 155b2] Meilenstein",
        target_date: "2026-03-10",
        created_by: E2E_USER_ID,
      },
      { onConflict: "id" },
    )
    try {
      // Die Phase wandert vom 02.03. auf den 05.03. — drei Tage.
      const res = await page.request.post(
        `/api/projects/${E2E_GANTT_PROJECT_ID}/schedule/apply`,
        {
          data: {
            kind: "phase",
            id: E2E_GANTT_PHASE_ANALYSE_ID,
            start: "2026-03-05",
            end: "2026-03-23",
          },
        },
      )
      expect(res.status(), await res.text()).toBe(200)
      const body = await res.json()
      expect(body.milestone_shift_days).toBe(3)
      // Phase UND Meilenstein in einem Aufruf.
      expect(body.applied.phases).toBe(1)
      expect(body.applied.milestones).toBe(1)

      const ms = await admin!
        .from("milestones")
        .select("target_date")
        .eq("id", msId)
        .single()
      expect(ms.data!.target_date, "Meilenstein um 3 Tage mitgewandert").toBe(
        "2026-03-13",
      )
    } finally {
      await admin!.from("milestones").delete().eq("id", msId)
      await admin!
        .from("phases")
        .update({
          planned_start: E2E_GANTT_DATES.phaseAnalyse.start,
          planned_end: E2E_GANTT_DATES.phaseAnalyse.end,
        })
        .eq("id", E2E_GANTT_PHASE_ANALYSE_ID)
    }
  })

  /**
   * AC-13 / AC-14 — die Verkettung im Browser: Ziehen → Vorschau → Verwerfen.
   *
   * Stand bis PROJ-Y-155g als `test.fail()` in dieser Datei, weil der Schalter
   * nicht einlesbar war und die Vorschau damit über die Oberfläche gar nicht
   * erreichbar. **F-2 (High), behoben:** `use-project.ts` (Einzahl) führte
   * `settings` nicht im SELECT — β.2 hatte die Spalte nur in `use-projects.ts`
   * (Mehrzahl) ergänzt, und der Drift-Wächter erklärte je Typ nur **einen**
   * Leseort, also schwieg er. Beides ist jetzt behoben; der Fall hat beim
   * Beheben von selbst angeschlagen.
   *
   * Geprüft wird **beides**: dass die Vorschau erscheint **und** dass die
   * Datenbank dabei unberührt bleibt. Ohne die zweite Hälfte belegte der Test
   * nur, dass ein Text auftaucht.
   */
  test("AC-13/14: Ziehen zeigt eine Vorschau und schreibt NICHTS", async ({
    ganttTenantPage: page,
  }) => {
    const admin = await createAdminClient()
    test.skip(!admin, "SUPABASE_SERVICE_ROLE_KEY fehlt.")

    await schalterSetzen(admin!, true)
    await nachfolgerTerminieren(admin!, NACHFOLGER_START, NACHFOLGER_ENDE)
    try {
      const gesetzt = await admin!
        .from("projects")
        .select("settings")
        .eq("id", E2E_GANTT_PROJECT_ID)
        .single()
      // Vorbedingung: in der Datenbank steht der Schalter wirklich auf „an".
      expect(
        (gesetzt.data!.settings as { autoScheduleSuccessors?: boolean } | null)
          ?.autoScheduleSuccessors,
      ).toBe(true)

      const vorher = await admin!
        .from("work_items")
        .select("planned_start, planned_end")
        .eq("id", E2E_GANTT_WP_DATED_ID)
        .single()

      await openGantt(page)

      // Genau hier brach F-2: die Oberfläche muss den Wert zurücklesen.
      await expect(page.getByRole("switch").first()).toHaveAttribute(
        "aria-checked",
        "true",
        { timeout: 15_000 },
      )

      await balkenZiehen(page)

      // AC-13: die Vorschau ist da, mit Übernehmen und Verwerfen.
      const bar = page.getByRole("region", {
        name: "Vorschau der Terminverschiebung",
      })
      await expect(bar).toBeVisible({ timeout: 15_000 })
      await expect(
        page.getByRole("button", { name: /Übernehmen/ }),
      ).toBeVisible()

      // … und die Datenbank ist unberührt. Das ist die Hälfte, die „Vorschau"
      // von „hat schon geschrieben" unterscheidet.
      const waehrend = await admin!
        .from("work_items")
        .select("planned_start, planned_end")
        .eq("id", E2E_GANTT_WP_DATED_ID)
        .single()
      expect(
        waehrend.data!.planned_start,
        "Die Vorschau darf nichts schreiben",
      ).toBe(vorher.data!.planned_start)
      expect(waehrend.data!.planned_end).toBe(vorher.data!.planned_end)

      // AC-14: Verwerfen schliesst sie, ohne zu schreiben.
      await page.getByRole("button", { name: /Verwerfen/ }).click()
      await expect(bar).toBeHidden({ timeout: 10_000 })
      const nachher = await admin!
        .from("work_items")
        .select("planned_start, planned_end")
        .eq("id", E2E_GANTT_WP_DATED_ID)
        .single()
      expect(nachher.data!.planned_start).toBe(vorher.data!.planned_start)
      expect(nachher.data!.planned_end).toBe(vorher.data!.planned_end)

      // Und der Nachfolger auch nicht — die Vorschau berechnet ihn, schreibt
      // ihn aber nicht.
      const nachfolger = await admin!
        .from("work_items")
        .select("planned_start")
        .eq("id", E2E_GANTT_WP_DERIVED_ID)
        .single()
      expect(nachfolger.data!.planned_start).toBe(NACHFOLGER_START)
    } finally {
      await schalterSetzen(admin!, false)
      await nachfolgerTerminieren(admin!, null, null)
      await admin!
        .from("work_items")
        .update({
          planned_start: E2E_GANTT_DATES.wpDated.start,
          planned_end: E2E_GANTT_DATES.wpDated.end,
        })
        .eq("id", E2E_GANTT_WP_DATED_ID)
    }
  })

  /**
   * AC-14, zweite Hälfte — Escape verwirft genauso wie der Knopf.
   *
   * Getrennt geführt, weil es ein anderer Weg zum selben Ergebnis ist: der
   * Knopf ruft `onDiscard`, Escape hängt am Tastatur-Handler des Diagramms.
   * Einer kann brechen, ohne den anderen zu berühren.
   */
  test("AC-14: Escape verwirft die Vorschau, ebenfalls ohne zu schreiben", async ({
    ganttTenantPage: page,
  }) => {
    const admin = await createAdminClient()
    test.skip(!admin, "SUPABASE_SERVICE_ROLE_KEY fehlt.")

    await schalterSetzen(admin!, true)
    await nachfolgerTerminieren(admin!, NACHFOLGER_START, NACHFOLGER_ENDE)
    try {
      await openGantt(page)
      await expect(page.getByRole("switch").first()).toHaveAttribute(
        "aria-checked",
        "true",
        { timeout: 15_000 },
      )
      await balkenZiehen(page)

      const bar = page.getByRole("region", {
        name: "Vorschau der Terminverschiebung",
      })
      await expect(bar).toBeVisible({ timeout: 15_000 })

      await page.keyboard.press("Escape")
      await expect(bar).toBeHidden({ timeout: 10_000 })

      const nachher = await admin!
        .from("work_items")
        .select("planned_start, planned_end")
        .eq("id", E2E_GANTT_WP_DATED_ID)
        .single()
      expect(nachher.data!.planned_start).toBe(E2E_GANTT_DATES.wpDated.start)
      expect(nachher.data!.planned_end).toBe(E2E_GANTT_DATES.wpDated.end)
    } finally {
      await schalterSetzen(admin!, false)
      await nachfolgerTerminieren(admin!, null, null)
      await admin!
        .from("work_items")
        .update({
          planned_start: E2E_GANTT_DATES.wpDated.start,
          planned_end: E2E_GANTT_DATES.wpDated.end,
        })
        .eq("id", E2E_GANTT_WP_DATED_ID)
    }
  })

  /**
   * AC-13, die andere Richtung — Übernehmen schreibt wirklich, und zwar beide.
   *
   * Damit ist die Kette vollständig: Ziehen → Vorschau → **Übernehmen** →
   * Termine in der Datenbank, über die Oberfläche und nicht über die Route.
   * Bis PROJ-Y-155g war dieser Weg gar nicht erreichbar.
   */
  test("AC-13: Übernehmen aus der Vorschau schreibt gezogenen Knoten UND Nachfolger", async ({
    ganttTenantPage: page,
  }) => {
    const admin = await createAdminClient()
    test.skip(!admin, "SUPABASE_SERVICE_ROLE_KEY fehlt.")

    await schalterSetzen(admin!, true)
    await nachfolgerTerminieren(admin!, NACHFOLGER_START, NACHFOLGER_ENDE)
    try {
      await openGantt(page)
      await expect(page.getByRole("switch").first()).toHaveAttribute(
        "aria-checked",
        "true",
        { timeout: 15_000 },
      )
      await balkenZiehen(page)

      const bar = page.getByRole("region", {
        name: "Vorschau der Terminverschiebung",
      })
      await expect(bar).toBeVisible({ timeout: 15_000 })
      await page.getByRole("button", { name: /^Übernehmen$/ }).click()
      await expect(bar).toBeHidden({ timeout: 20_000 })

      const gezogen = await admin!
        .from("work_items")
        .select("planned_start")
        .eq("id", E2E_GANTT_WP_DATED_ID)
        .single()
      expect(
        gezogen.data!.planned_start,
        "der gezogene Knoten muss sich bewegt haben",
      ).not.toBe(E2E_GANTT_DATES.wpDated.start)

      // Die tragende Zusicherung: der Nachfolger ist mitgewandert. Genau das
      // war vor PROJ-Y-155f auch serverseitig nicht der Fall.
      const nachfolger = await admin!
        .from("work_items")
        .select("planned_start")
        .eq("id", E2E_GANTT_WP_DERIVED_ID)
        .single()
      expect(
        nachfolger.data!.planned_start,
        "der Nachfolger muss mitverschoben sein",
      ).not.toBe(NACHFOLGER_START)
    } finally {
      await schalterSetzen(admin!, false)
      await nachfolgerTerminieren(admin!, null, null)
      await admin!
        .from("work_items")
        .update({
          planned_start: E2E_GANTT_DATES.wpDated.start,
          planned_end: E2E_GANTT_DATES.wpDated.end,
        })
        .eq("id", E2E_GANTT_WP_DATED_ID)
    }
  })

  test("AC-12: bei ausgeschaltetem Schalter wird sofort geschrieben, ohne Vorschau", async ({
    ganttTenantPage: page,
  }) => {
    const admin = await createAdminClient()
    test.skip(!admin, "SUPABASE_SERVICE_ROLE_KEY fehlt.")

    await schalterSetzen(admin!, false)
    try {
      await openGantt(page)
      await balkenZiehen(page)

      // Kein Vorschau-Bereich …
      await expect(
        page.getByRole("region", { name: "Vorschau der Terminverschiebung" }),
      ).toHaveCount(0)
      // … sondern die alte Erfolgsmeldung.
      await expect(page.getByText("Arbeitspaket aktualisiert")).toBeVisible({
        timeout: 15_000,
      })

      const nachher = await admin!
        .from("work_items")
        .select("planned_start")
        .eq("id", E2E_GANTT_WP_DATED_ID)
        .single()
      expect(
        nachher.data!.planned_start,
        "bei ausgeschaltetem Schalter wird direkt geschrieben",
      ).not.toBe(E2E_GANTT_DATES.wpDated.start)
    } finally {
      await admin!
        .from("work_items")
        .update({
          planned_start: E2E_GANTT_DATES.wpDated.start,
          planned_end: E2E_GANTT_DATES.wpDated.end,
        })
        .eq("id", E2E_GANTT_WP_DATED_ID)
    }
  })
})
