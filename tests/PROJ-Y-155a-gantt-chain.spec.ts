/**
 * PROJ-Y-155a — angemeldeter Gantt-Durchlauf plus Baseline des Diagramms.
 *
 * Ausgangslage, wörtlich aus dem Register: PROJ-155-α ist **ohne `/qa`-Durchgang**
 * ausgeliefert. Belegt waren Zeilenlogik (27 Unit-Tests), der Rollup-Fix (rot-grün live
 * gegen Prod) und die Verknüpfbarkeit — **nicht** die Verkettung im Browser. Der Gantt
 * hatte im Bestand weder Komponententests noch eine Visual-Baseline; es gab also keinen
 * Netzschutz zu erben.
 *
 * Diese Datei schliesst genau das, und sie tut es in einer **eigenen Lane**
 * (`E2E_GANTT_*`). Die Alternative wurde vorher gemessen statt angenommen:
 *
 *   - die VISUAL-Lane setzt `project_type: "general"` **absichtlich** („keeps the seed
 *     minimal — no trigger-spawned phases"). Sie auf Wasserfall umzustellen würde die
 *     methodenabhängige Navigation ändern und `project-room.png` verschieben;
 *   - die CHAT-Lane ist zwar Wasserfall, hat aber null Phasen, und ihr Ketten-Spec
 *     behauptet Dinge über ein Projekt, dessen Inhalt ihm gehört;
 *   - die BAU-Lane ist `project_type: "construction"` — wieder eine andere Navigation.
 *
 * **Warum die Aufnahme das Diagramm ist und nicht die Seite.** PROJ-Y-143l hat für die
 * Visual-Suite eine eigene Identität gebaut, weil fremde Slices den Kontostand des
 * geteilten Nutzers ändern (zweite Mitgliedschaft, Anzeigename, Branding) und das in der
 * Hülle sichtbar wird. Eine elementbezogene Aufnahme des SVG umgeht diese ganze Klasse
 * **konstruktiv**: im Bild ist keine Sidebar, kein Arbeitsbereich-Umschalter, kein Name.
 * Deshalb darf diese Lane den geteilten Nutzer verwenden (Muster Assistant/Chat, kein
 * zusätzlicher Anmeldevorgang), und deshalb ist die Aufnahme zugleich schärfer: sie
 * bewacht das Diagramm statt der Hülle, die sieben andere Bilder ohnehin abdecken.
 *
 * **Determinismus, an drei Stellen gemessen statt gehofft:**
 *   1. Das Kalenderfenster ist eine reine Funktion der Termine (`gantt-view.tsx:305-336`)
 *      — mit gesetzten Terminen ist der `new Date()`-Rückfall unerreichbar.
 *   2. Die Heute-Linie (`:1303`) und das „heute"-Abzeichen (`:2030`) lesen die Uhr. Also
 *      wird sie gestellt. `FIXED_NOW` liegt **innerhalb** des Fensters, damit die Linie
 *      wirklich rendert und mitbewacht wird, statt bloss vermieden zu werden.
 *   3. Feiertage kommen aus `tenants.holiday_region` (PROJ-53-β); die Lane lässt das Feld
 *      leer, sonst hinge das Bild an den Daten einer Kalenderbibliothek.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js"

import { expect, hasAuthStorageState, test } from "./fixtures/auth-fixture"
import {
  E2E_GANTT_DATES,
  E2E_GANTT_DEPENDENCY_ID,
  E2E_GANTT_DERIVED_EXPECTED,
  E2E_GANTT_PROJECT_ID,
  E2E_GANTT_TASK_A1_TITLE,
  E2E_GANTT_TASK_A2_TITLE,
  E2E_GANTT_TASK_B1_TITLE,
  E2E_GANTT_WP_DATED_ID,
  E2E_GANTT_WP_DATED_TITLE,
  E2E_GANTT_WP_DERIVED_ID,
  E2E_GANTT_WP_DERIVED_TITLE,
  E2E_GANTT_WP_UNDATED_ID,
  E2E_GANTT_WP_UNDATED_TITLE,
} from "./fixtures/constants"
import { FIXED_NOW } from "./fixtures/dashboard-payload"
import { watchRuntimeIssues } from "./fixtures/runtime-issues"

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

const PLANUNG = `/projects/${E2E_GANTT_PROJECT_ID}/planung`

/** Das SVG selbst — die eine Fläche, die diese Datei bewacht. */
const DIAGRAM = '[aria-label="Gantt-Diagramm der Phasen"]'

/**
 * Öffnet die Planungsseite und wechselt auf den Gantt-Reiter.
 *
 * Beim ersten Lauf gefunden statt angenommen: der Gantt ist **nicht** die
 * Landefläche. `planung-client.tsx:57` startet auf `"phasen"`, und es gibt
 * **keinen** URL-Parameter für den Reiter — ein Link auf den Netzplan lässt
 * sich also nicht teilen, man muss immer zweimal klicken. Kleiner
 * Bedienbefund, hier nur festgehalten und nicht behoben: er gehört zu β.1,
 * das die Gantt-Flächen ohnehin anfasst (→ PROJ-Y-155c).
 *
 * Für den Durchlauf heisst das: jeder Fall navigiert **und** klickt. Das
 * verschweigen und stattdessen direkt auf ein Element zu warten hätte den
 * Befund unter den Teppich gekehrt.
 *
 * **Zweiter Befund, beim Bauen gemessen und der Grund für die Wiederholung
 * unten:** ein einzelner Klick genügt nicht. Der Reiter wird server-gerendert
 * und ist damit *sichtbar, stabil und aktiviert* — Playwrights komplette
 * Aktionsprüfung ist erfüllt —, bevor React ihn übernommen hat. Der Klick
 * landet dann auf totem Markup und geht **lautlos** verloren. Einzeln lief das
 * durch, unter sechs parallelen Arbeitern fielen **alle sechs** Fälle mit
 * „element(s) not found" nach 30 s; die Diagnose zeigte danach `count: 1` für
 * dieselbe Adresse, also war nie das Diagramm das Problem, sondern der Reiter.
 * Dieselbe Klasse wie der deaktivierte Stepper-Knopf, an dem AC-135.3 zwei
 * Monate lang scheinbar grün vorbeilief (PROJ-135 / PROJ-Y-78f).
 *
 * `toPass` klickt deshalb, bis der Reiter tatsächlich **ausgewählt** ist. Auf
 * ein Zeitfenster zu warten wäre die schlechtere Antwort: sie verschiebt das
 * Rennen nur und macht es auf langsameren Maschinen wieder auf.
 */
async function openGantt(page: import("@playwright/test").Page) {
  await page.goto(PLANUNG, { waitUntil: "domcontentloaded" })
  const tab = page.getByRole("tab", { name: "Gantt" })
  await expect(tab).toBeVisible({ timeout: 30_000 })
  await expect(async () => {
    await tab.click()
    await expect(tab).toHaveAttribute("aria-selected", "true", {
      timeout: 1_000,
    })
  }).toPass({ timeout: 45_000 })
  await expect(page.locator(DIAGRAM)).toBeVisible({ timeout: 30_000 })
}

test.describe("PROJ-Y-155a — Gantt: angemeldeter Durchlauf + Baseline", () => {
  test.skip(
    ({ browserName }) => browserName !== "chromium",
    "Desktop-chromium: der Gantt ist auf 375 px nicht bedienbar und war es nie.",
  )
  test.skip(
    () => !hasAuthStorageState(),
    "Auth-Fixture nicht provisioniert — siehe tests/fixtures/README.md.",
  )

  // Über dem globalen 60-s-Budget, sonst sind die inneren Wartezeiten toter
  // Code (die Lehre aus PROJ-Y-144d/F-10). Der Gantt kompiliert beim ersten
  // Zugriff und die Hydrations-Wiederholung oben braucht im Ernstfall Luft.
  test.setTimeout(150_000)

  /**
   * Seriell, und das ist kein Vorsichtsreflex, sondern ein **latentes Rennen**,
   * das beim Nachrechnen auffiel statt beim Fehlschlagen:
   *
   * „Zeitraum aufziehen" setzt Termine auf `E2E_GANTT_WP_UNDATED_ID` und
   * nimmt sie im `finally` zurück. Die Baseline unten fotografiert **dieselbe
   * Zeile** und erwartet sie terminlos („—  —" plus Platzhaltertext). Parallel
   * laufen beide in verschiedenen Kontexten, aber gegen **eine** Datenbank —
   * fällt die Aufnahme in das Fenster zwischen Zug und Rücknahme, zeigt sie
   * einen Balken statt des Platzhalters und die Baseline ist rot, ohne dass
   * irgendetwas kaputt wäre.
   *
   * Bisher ging es gut, weil das Fenster klein ist. Genau solche Rennen
   * verwandeln sich in „flaky Test, einfach neu starten" und dann in einen
   * ignorierten Wächter. PROJ-45-ε stand vor demselben Fall und hat dieselbe
   * Antwort gewählt: die Datei läuft ganz seriell.
   */
  test.describe.configure({ mode: "serial" })

  // Der Gantt ist 2091 Zeilen und hatte nie einen Konsolen-Wächter. Er läuft
  // hier von Anfang an mit — PROJ-Y-143e hat auf genau diesem Weg einen echten
  // Defekt gefunden (doppelte React-Keys), den kein Screenshot gezeigt hätte.
  let runtimeIssues: () => string[] = () => []
  test.beforeEach(({ ganttTenantPage }) => {
    runtimeIssues = watchRuntimeIssues(ganttTenantPage)
  })
  test.afterEach(() => {
    expect(runtimeIssues(), "Browser-Laufzeitprobleme").toEqual([])
  })

  test("WBS-Baum: Aufgaben hängen eingerückt unter ihrem Arbeitspaket", async ({
    ganttTenantPage: page,
  }) => {
    await openGantt(page)

    // Vor α kamen Aufgaben im Gantt überhaupt nicht vor — die Zeilenliste war
    // flach (Phase → Arbeitspakete). Dass sie da sind, ist die erste Zusage.
    for (const title of [
      E2E_GANTT_WP_DATED_TITLE,
      E2E_GANTT_WP_DERIVED_TITLE,
      E2E_GANTT_TASK_A1_TITLE,
      E2E_GANTT_TASK_A2_TITLE,
    ]) {
      await expect(page.getByText(title, { exact: true }).first()).toBeVisible()
    }

    // Die Einrückung wird GEMESSEN, nicht behauptet: das Label der Aufgabe muss
    // weiter rechts beginnen als das ihres Arbeitspakets.
    const box = async (title: string) => {
      const b = await page
        .getByText(title, { exact: true })
        .first()
        .boundingBox()
      expect(b, `Kein Kasten für "${title}"`).not.toBeNull()
      return b!
    }
    const wpDated = await box(E2E_GANTT_WP_DATED_TITLE)
    const wpDerived = await box(E2E_GANTT_WP_DERIVED_TITLE)
    const taskA1 = await box(E2E_GANTT_TASK_A1_TITLE)

    expect(
      taskA1.x,
      "Aufgabe muss tiefer eingerückt sein als ihr Arbeitspaket",
    ).toBeGreaterThan(wpDated.x)

    // Gegenprobe, ohne die die erste Zusicherung nichts über *Tiefe* sagt:
    // zwei Arbeitspakete derselben Ebene stehen bündig. Ohne sie könnte die
    // Verschiebung aus irgendeiner Zeilen-Eigenart stammen.
    expect(
      Math.abs(wpDated.x - wpDerived.x),
      "Zwei Arbeitspakete derselben Ebene müssen bündig stehen",
    ).toBeLessThan(2)

    // Und der Baum ist wirklich ein Baum: zuklappen versteckt die Kinder.
    const collapse = page.getByRole("button", {
      name: `${E2E_GANTT_WP_DATED_TITLE} zuklappen`,
    })
    await expect(collapse).toBeVisible()
    await collapse.click()
    await expect(
      page.getByText(E2E_GANTT_TASK_A1_TITLE, { exact: true }),
    ).toHaveCount(0)
    await page
      .getByRole("button", { name: `${E2E_GANTT_WP_DATED_TITLE} aufklappen` })
      .click()
    await expect(
      page.getByText(E2E_GANTT_TASK_A1_TITLE, { exact: true }).first(),
    ).toBeVisible()
  })

  test("Sammelvorgang: das Arbeitspaket ohne eigene Termine erbt die Spanne seiner Kinder", async ({
    ganttTenantPage: page,
  }) => {
    // Der Fall, für den PROJ-155-α seinen Rollup-Fix gebaut hat und von dem
    // Produktion **keine einzige** Instanz enthält: am 2026-09-01 gemessen
    // tragen 0 von 138 lebenden Arbeitspaketen ein `derived_planned_start`,
    // weil alle vier terminierten Wurzeln ohne Eltern sind. Hier läuft er
    // zum ersten Mal Ende zu Ende.
    await openGantt(page)

    // Das Abzeichen kommt in der ganzen Zeilenliste **genau einmal** vor —
    // das ist zugleich die Gegenprobe: trüge jede Zeile es, wäre „abgeleitet"
    // bedeutungslos statt aussagekräftig, und diese Zusicherung würde fallen.
    const badge = page.getByTitle("Zeitraum aus den Unterpunkten abgeleitet")
    await expect(badge).toHaveCount(1)

    // Und es hängt an der richtigen Zeile, nicht irgendwo: der Text der Zeile,
    // in der es sitzt, nennt das terminlose Arbeitspaket.
    const badgeRowText = await badge
      .locator("xpath=..")
      .innerText()
    expect(badgeRowText).toContain(E2E_GANTT_WP_DERIVED_TITLE)
    expect(badgeRowText).not.toContain(E2E_GANTT_WP_DATED_TITLE)

    // Und die Datenbank sagt dasselbe — mit der entscheidenden Hälfte, dass
    // die eigenen Termine weiter NULL sind. Wäre der Trigger ein Kopierer
    // statt eines Ableiters, sähe die Oberfläche identisch aus.
    const admin = await createAdminClient()
    test.skip(!admin, "SUPABASE_SERVICE_ROLE_KEY fehlt — DB-Gegenprobe entfällt.")
    const { data, error } = await admin!
      .from("work_items")
      .select("planned_start, planned_end, derived_planned_start, derived_planned_end")
      .eq("id", E2E_GANTT_WP_DERIVED_ID)
      .single()
    expect(error).toBeNull()
    expect(data!.planned_start, "eigener Termin muss leer bleiben").toBeNull()
    expect(data!.planned_end).toBeNull()
    expect(data!.derived_planned_start).toBe(E2E_GANTT_DERIVED_EXPECTED.start)
    expect(data!.derived_planned_end).toBe(E2E_GANTT_DERIVED_EXPECTED.end)
  })

  test("Zeitraum aufziehen: die terminlose Zeile bekommt einen echten Balken", async ({
    ganttTenantPage: page,
  }) => {
    const admin = await createAdminClient()
    test.skip(!admin, "SUPABASE_SERVICE_ROLE_KEY fehlt — Zustand nicht prüfbar.")

    // Ausgangszustand in der Datenbank, nicht in der Oberfläche: ohne diese
    // Vorher-Messung belegt ein Nachher-Wert nicht, dass der Zug ihn erzeugt hat.
    const before = await admin!
      .from("work_items")
      .select("planned_start, planned_end")
      .eq("id", E2E_GANTT_WP_UNDATED_ID)
      .single()
    expect(before.data!.planned_start, "Vorbedingung: kein Termin").toBeNull()

    try {
      await openGantt(page)

      // Der Platzhaltertext sagt, dass die Zeile terminlos ist …
      const placeholder = page.locator("text", {
        hasText: `${E2E_GANTT_WP_UNDATED_TITLE} — Zeitraum im Diagramm aufziehen`,
      })
      await expect(placeholder).toHaveCount(1)

      // … gezogen wird aber am Rechteck darunter. Die beiden sind im Markup
      // bewusst getrennt (`gantt-view.tsx:1516-1535`): der Titel öffnet das
      // Formular, die Fläche zieht den Zeitraum auf — sonst öffnete jedes
      // Aufziehen zusätzlich den Dialog. Auf den Text zu zielen war mein
      // erster Versuch und schrieb nichts.
      const strip = page
        .locator(`g[aria-label="${E2E_GANTT_WP_UNDATED_TITLE}"] rect`)
        .first()
      await strip.scrollIntoViewIfNeeded()
      const box = await strip.boundingBox()
      expect(box, "Kein Aufzieh-Streifen gefunden").not.toBeNull()
      const y = box!.y + box!.height / 2

      // Weit rechts ansetzen, und das ist kein willkürlicher Zahlenwert.
      // Gemessen: bei x + 40 liegt unter dem Zeiger nicht der Streifen,
      // sondern der **Platzhaltertext selbst** — er wird im selben `<g>` NACH
      // dem Rechteck gezeichnet, liegt in SVG damit oben und fängt den
      // Mousedown ab. Der Zug ging dabei lautlos ins Leere: keine Vorschau,
      // **keine einzige Anfrage**. Erst weiter rechts liegt das Rechteck frei
      // (`document.elementFromPoint` bestätigt `rect.fill-muted/15
      // cursor-crosshair`), dann erscheint die Vorschau und es wird ein PATCH
      // gesendet. Der Text überdeckt also einen Teil seiner eigenen
      // Bedienfläche — kleiner Bedienbefund, festgehalten für β.1
      // (→ PROJ-Y-155c).
      await page.mouse.move(box!.x + 520, y)
      await page.mouse.down()
      await page.mouse.move(box!.x + 640, y, { steps: 8 })
      await page.mouse.move(box!.x + 760, y, { steps: 8 })
      await page.mouse.up()

      await expect(page.getByText("Zeitraum gesetzt")).toBeVisible({
        timeout: 15_000,
      })

      const after = await admin!
        .from("work_items")
        .select("planned_start, planned_end")
        .eq("id", E2E_GANTT_WP_UNDATED_ID)
        .single()
      expect(after.data!.planned_start).not.toBeNull()
      expect(after.data!.planned_end).not.toBeNull()

      // Die Oberfläche zieht nach: der Platzhaltertext ist weg.
      await expect(placeholder).toHaveCount(0)
    } finally {
      // Zurücksetzen, damit die Lane deterministisch bleibt — die Baseline
      // unten fotografiert dieselbe Zeile als terminlos. Ein Testlauf, der
      // seine eigene Fixture verändert stehen lässt, macht den nächsten rot.
      await admin!
        .from("work_items")
        .update({ planned_start: null, planned_end: null })
        .eq("id", E2E_GANTT_WP_UNDATED_ID)
    }
  })

  test("Vollbild greift und lässt sich wieder verlassen", async ({
    ganttTenantPage: page,
  }) => {
    await openGantt(page)

    const toggle = page.getByRole("button", { name: "Vollbild", exact: true })
    await expect(toggle).toHaveAttribute("aria-pressed", "false")
    await toggle.click()

    const leave = page.getByRole("button", { name: "Vollbild verlassen" })
    await expect(leave).toHaveAttribute("aria-pressed", "true")

    // Gegenprobe über die Wirkung statt über das Abzeichen: im Vollbild füllt
    // der Rahmen das Fenster. Ein umgeschaltetes `aria-pressed` allein sagt
    // nichts darüber, ob sich etwas bewegt hat.
    const shell = page.locator(".fixed.inset-0.z-50").first()
    await expect(shell).toBeVisible()

    await page.keyboard.press("Escape")
    await expect(toggle).toHaveAttribute("aria-pressed", "false")
    await expect(shell).toHaveCount(0)
  })

  test("Abhängigkeitspfeil ist vorhanden und beschriftet", async ({
    ganttTenantPage: page,
  }) => {
    // Klein, aber die Vorbedingung für PROJ-155-β.1: dort wird aus dem Klick
    // auf genau diesen Pfeil ein Popover statt eines Löschpfads. Ohne eine
    // Zusicherung, dass er heute existiert und wie er beschriftet ist, hätte
    // β.1 keinen Ausgangspunkt.
    await openGantt(page)
    // Die zugängliche Beschriftung kommt aus einem SVG-`<title>`, nicht aus
    // einem `title`-Attribut, und sie trägt Mittelpunkte als Trenner plus den
    // Zusatz „klicken zum Löschen" — genau der Löschpfad, den β.1 durch ein
    // Popover ersetzt. Deshalb Teilstring statt Gleichheit, und `toHaveCount`
    // statt `toBeVisible`: ein `<title>` wird nicht gemalt.
    await expect(
      page.locator("svg title", {
        hasText: "Dependency FS · work_package → work_package",
      }),
    ).toHaveCount(1)
  })

  test("Baseline des Diagramms", async ({ ganttTenantPage: page }) => {
    // Die Uhr wird gestellt, weil Heute-Linie und „heute"-Abzeichen sie lesen.
    // FIXED_NOW (2026-03-05) liegt innerhalb des geseedeten Fensters
    // (02.03.–17.04.), die Linie rendert also und wird mitbewacht.
    await page.clock.setFixedTime(FIXED_NOW)
    await openGantt(page)

    const diagram = page.locator(DIAGRAM)
    // Nicht leerlaufend: die Aufnahme darf erst fallen, wenn wirklich Inhalt
    // da ist. Ein Bild eines noch leeren SVG wäre grün und wertlos — genau
    // der Fehler, den PROJ-Y-143b an zwei Baselines gefunden hat.
    await expect(page.getByText(E2E_GANTT_TASK_B1_TITLE).first()).toBeVisible()
    // `toHaveCount`, nicht `toBeVisible`: die Heute-Linie ist ein `<line>` mit
    // x1 === x2, hat also eine Bounding-Box der Breite 0 und gilt Playwright
    // damit als unsichtbar. Sie wird trotzdem gemalt — im Bild unten ist sie
    // zu sehen. Eine Sichtbarkeits-Zusicherung wäre hier schlicht falsch.
    await expect(page.getByLabel("Heute")).toHaveCount(1)

    // Absolute Schranke statt Verhältnis, und die drei Zahlen dahinter sind
    // an genau dieser Aufnahme gemessen (Methode aus PROJ-Y-143g), nicht
    // geschätzt:
    //
    //   - Rauschen von Lauf zu Lauf ...... 0 px (drei Läufe bei Toleranz 0)
    //   - „Name" → „NameZZ" in der
    //     Spaltenüberschrift ............ 32 px  ← kleinste Änderung, die
    //                                             auffallen muss
    //   - das geerbte Verhältnis 0.02
    //     erlaubte auf 976 × 410 ........ 8003 px
    //
    // Das geerbte Verhältnis wäre also rund 250-fach zu grob gewesen, um eine
    // umbenannte Spaltenüberschrift zu bemerken — derselbe blinde Fleck, durch
    // den in PROJ-Y-143d der Next-Entwickleranzeiger in sieben Bildern
    // mitgereist ist. 20 liegt zwischen dem gemessenen Rauschen (0) und der
    // kleinsten echten Änderung (32): es deckt beiläufiges Kantenglätten ab,
    // ohne Inhalt zu decken.
    await expect(diagram).toHaveScreenshot("gantt-diagram.png", {
      maxDiffPixels: 20,
    })
  })

  /**
   * PROJ-155-β.1 — die Kante ist ein Objekt geworden.
   *
   * Steht **nach** der Baseline, und das ist keine Kosmetik: der Fall ändert
   * den Kantentyp, wodurch am Pfeil ein Abzeichen erscheint. Liefe er vorher,
   * fotografierte die Baseline ein Diagramm mit Abzeichen. Die Datei ist
   * seriell, die Reihenfolge ist also verlässlich.
   */
  test("Kantentyp ist über das Diagramm änderbar — und Löschen ist nicht mehr der einzige Weg", async ({
    ganttTenantPage: page,
  }) => {
    const admin = await createAdminClient()
    test.skip(!admin, "SUPABASE_SERVICE_ROLE_KEY fehlt — Zustand nicht prüfbar.")

    const before = await admin!
      .from("dependencies")
      .select("constraint_type, lag_days")
      .eq("id", E2E_GANTT_DEPENDENCY_ID)
      .single()
    expect(before.data!.constraint_type, "Vorbedingung: FS").toBe("FS")
    expect(before.data!.lag_days).toBe(0)

    try {
      await openGantt(page)

      // Vor β.1 war ein Klick auf den Pfeil unmittelbar der Löschpfad
      // (`window.confirm`). Jetzt öffnet er eine Maske.
      const arrow = page.getByRole("button", { name: /^Abhängigkeit FS von/ })
      await expect(arrow).toHaveCount(1)

      // Tastatur zuerst: der Pfeil war bis β.1 ausschliesslich mit der Maus
      // erreichbar (ein `<g>` ohne Rolle und ohne Tabstopp). Enter muss
      // dieselbe Maske öffnen wie ein Klick — sonst ist die Kante für
      // Tastaturnutzer unbedienbar.
      await arrow.focus()
      await page.keyboard.press("Enter")
      await expect(page.getByRole("dialog")).toBeVisible()
      await page.keyboard.press("Escape")
      await expect(page.getByRole("dialog")).toHaveCount(0)

      await arrow.click()

      const dialog = page.getByRole("dialog")
      await expect(dialog).toBeVisible()
      // Entfernen ist EINE von drei Handlungen, nicht die einzige — das ist
      // die eigentliche Zusage des Kriteriums.
      await expect(dialog.getByRole("button", { name: "Entfernen" })).toBeVisible()
      await expect(dialog.getByRole("button", { name: "Sichern" })).toBeVisible()

      // Typ auf „Start → Start" stellen. Die Beschriftung ist deutsch; vorher
      // stand im Produkt überall nur das Kürzel.
      await dialog.getByLabel("Typ").click()
      await page.getByRole("option", { name: "Start → Start (SS)" }).click()
      await dialog.getByRole("button", { name: "Sichern" }).click()
      await expect(page.getByText("Abhängigkeit gespeichert")).toBeVisible({
        timeout: 15_000,
      })

      // In der Datenbank angekommen …
      const after = await admin!
        .from("dependencies")
        .select("constraint_type")
        .eq("id", E2E_GANTT_DEPENDENCY_ID)
        .single()
      expect(after.data!.constraint_type).toBe("SS")

      // … und am Pfeil sichtbar. Das Abzeichen ist der Punkt: eine Abweichung
      // vom Normalfall soll man sehen, nicht erst im Tooltip suchen müssen —
      // ein Tooltip ist auf Touch-Geräten gar nicht erreichbar.
      await expect(page.getByText("SS", { exact: true }).first()).toBeVisible()
    } finally {
      await admin!
        .from("dependencies")
        .update({ constraint_type: "FS", lag_days: 0 })
        .eq("id", E2E_GANTT_DEPENDENCY_ID)
    }
  })
})
