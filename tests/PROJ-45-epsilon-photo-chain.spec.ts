/**
 * PROJ-45-ε `/qa` — der authentifizierte Durchlauf, den `/backend` und
 * `/frontend` ausdrücklich offen gelassen haben.
 *
 * Warum er nötig ist: bis hierher war belegt, dass die Datenbank die Regeln
 * durchsetzt (Pentest) und dass die Oberfläche die richtigen Knöpfe rendert
 * (Komponententests). Was **nicht** belegt war, ist die Verkettung — ob eine
 * echte Datei über die echte Maske durch Sniffer, Pixelgrenze, Ableitung,
 * Aufnahmekern, Verknüpfung und Galerie läuft und am anderen Ende als Bild
 * wieder herauskommt. Genau diese Lücke hat in PROJ-135 ein Akzeptanzkriterium
 * ein Vierteljahr unbemerkt unerfüllt gelassen.
 *
 * Die Lane ist die aus β (`[E2E] Bau Test`, eigener Mandant mit aktivem
 * Bau-Modul): das Modul im geteilten `[E2E]`-Mandanten einzuschalten ist
 * ausgeschlossen (PROJ-Y-143f/143l).
 *
 * **Zwei Akteure, weil die Rechte es erzwingen** (β-Regel, AC-45ε.16/.17): der
 * Betrachter darf erfassen, aber nicht ändern; die Bauleitung darf beides. Der
 * Nachweis ist ein **Paar** — nur zu zeigen, dass dem Betrachter Knöpfe fehlen,
 * belegte „Knopf fehlt", nicht „hier bewusst anders als bei der Abnahme"
 * (die Lücke, die γs QA an seinem eigenen Test gefunden hat).
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js"

import { expect, hasAuthStorageState, test } from "./fixtures/auth-fixture"
import { deleteOrThrow } from "./fixtures/cleanup"
import {
  E2E_CONSTRUCTION_LEAD_STORAGE_STATE_PATH,
  E2E_CONSTRUCTION_PROJECT_ID,
  E2E_CONSTRUCTION_SECTION_ROOT_ID,
  E2E_CONSTRUCTION_TENANT_ID,
  E2E_CONSTRUCTION_TRADE_LABEL,
  E2E_CONSTRUCTION_VIEWER_STORAGE_STATE_PATH,
} from "./fixtures/constants"
import {
  FIXTURE_CAPTURE_DATE,
  FIXTURE_DEVICE_MAKE,
  FIXTURE_DEVICE_MODEL,
  describeExif,
  fakeJpeg,
  hasGpsBlock,
  jpegWithExif,
  jpegWithoutExif,
  pdfNotAPhoto,
  pngPhoto,
  type PhotoFixture,
} from "./fixtures/photo-fixtures"

const PROJECT = E2E_CONSTRUCTION_PROJECT_ID
const DEFECTS_PATH = `/projects/${PROJECT}/maengel`
const SECTIONS_PATH = `/projects/${PROJECT}/bauabschnitte`

const STAMP = `${Date.now()}`

function mark(scope: string, name: string): string {
  return `[E2E ε] ${name} ${STAMP}-${scope}`
}

async function admin(): Promise<SupabaseClient | null> {
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
 * Aufräumen eines Blocks.
 *
 * Reihenfolge ist nicht beliebig: erst der **Mangel** (die Fotozeilen gehen per
 * Kaskade mit, `defect_id` ist `on delete cascade`), danach die Dokumente. In
 * der anderen Richtung greift `documents_construction_photo_lock` und weist das
 * Papierkorbieren ab, solange eine Fotozeile daran hängt — das ist AC-45ε.20 und
 * genau richtig, macht aber die Reihenfolge zur Pflicht.
 *
 * `deleteOrThrow`, weil ein stilles Aufräumen laut PROJ-Y-143o zur Halde wird,
 * die später jemandes Fixture ist.
 */
async function cleanupBlock(_scope: string): Promise<void> {
  const db = await admin()
  if (!db) return

  const { data: docs } = await db
    .from("documents")
    .select("id, tree_node_id, storage_path")
    .eq("tenant_id", E2E_CONSTRUCTION_TENANT_ID)
    .like("original_filename", "%")

  /*
   * **PROJ-Y-45h schlägt hier zu, und zwar gemessen.** Den Mangel zu löschen
   * ist seit PROJ-Y-148d unmöglich, sobald er Verlaufszeilen trägt: der
   * Ereignis-Wächter hat seinen Kaskaden-Ausstieg verloren und antwortet
   * „construction defect events are append-only". Ein erster Lauf dieser Datei
   * ist genau daran gescheitert.
   *
   * Deshalb wird der Mangel hier NICHT gelöscht — ein `deleteOrThrow` darauf
   * würde jeden Block rot machen, obwohl das Produkt in Ordnung ist. Die
   * Fotozeilen dagegen lassen sich lösen, und das ist der Teil, der ε gehört.
   * Die zurückbleibenden Mängel räumt der QA-Lauf über den Runbook-Weg
   * (`session_replication_role = replica`, mandantengebunden, mit Vor- und
   * Nachprüfung) — dokumentiert, nicht verschwiegen.
   */
  await deleteOrThrow(
    db.from("construction_photos").delete().eq("project_id", PROJECT),
    `construction_photos des Projekts`,
  )

  // Jetzt sind die Dateien frei. Storage-Objekte zuerst, dann die Zeilen —
  // umgekehrt wäre der Ablageweg verloren.
  const nodeIds = (docs ?? [])
    .map((d) => (d as { tree_node_id: string }).tree_node_id)
    .filter(Boolean)
  const paths = (docs ?? [])
    .map((d) => (d as { storage_path: string }).storage_path)
    .filter(Boolean)
  const derived = paths.flatMap((p) => {
    const slash = p.lastIndexOf("/")
    const dir = p.slice(0, slash)
    const stem = p.slice(slash + 1).replace(/\.[^.]+$/, "")
    return [`${dir}/_derived/preview-${stem}.jpg`, `${dir}/_derived/print-${stem}.jpg`]
  })
  if (paths.length > 0) {
    await db.storage.from("documents").remove([...paths, ...derived])
  }
  if (docs && docs.length > 0) {
    await deleteOrThrow(
      db
        .from("documents")
        .delete()
        .in(
          "id",
          docs.map((d) => (d as { id: string }).id),
        ),
      `documents des Laufs ${STAMP}`,
    )
  }
  if (nodeIds.length > 0) {
    await deleteOrThrow(
      db.from("document_tree_nodes").delete().in("id", nodeIds),
      `document_tree_nodes des Laufs ${STAMP}`,
    )
  }
  // Der Fotoordner bleibt bewusst NICHT stehen: er ist Teil dessen, was dieser
  // Lauf angelegt hat, und ein leerer Wurzelordner wäre Rückstand.
  await deleteOrThrow(
    db
      .from("document_tree_nodes")
      .delete()
      .eq("project_id", PROJECT)
      .eq("slug", "baufotos"),
    `Fotoordner des Projekts`,
  )
}

type Page = import("@playwright/test").Page

/**
 * Legt einen Mangel über die Maske an.
 *
 * Wörtlich aus `PROJ-45-beta-defects.spec.ts` übernommen statt nachgebaut: mein
 * erster Nachbau benutzte `getByRole("button", { name: /Erfassen/ })` — der
 * Absenden-Knopf heisst aber „Mangel erfassen", und ein Namens-Regex ist bei
 * Playwright gross-/kleinschreibungsempfindlich. Der Lauf lief in den Timeout.
 */
async function reportDefect(page: Page, title: string): Promise<void> {
  await page.getByRole("button", { name: "Mangel erfassen" }).first().click()
  const dialog = page.getByRole("dialog")
  await expect(dialog).toBeVisible()
  await dialog.locator("#defect-title").fill(title)
  await dialog.locator("#defect-trade").click()
  await page.getByRole("option", { name: E2E_CONSTRUCTION_TRADE_LABEL }).click()
  await dialog.getByRole("button", { name: "Mangel erfassen" }).click()
  await expect(dialog).toBeHidden({ timeout: 30_000 })
}

/**
 * Die Detailansicht. Gefiltert auf „Verlauf", weil auf der Fläche mehrere
 * Dialoge gleichzeitig im Baum stehen können (β-Form).
 */
async function openDetail(page: Page, title: string) {
  await page.getByRole("row").filter({ hasText: title }).click()
  const sheet = page.getByRole("dialog").filter({ hasText: "Verlauf" })
  await expect(sheet).toBeVisible({ timeout: 30_000 })
  return sheet
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/** Lädt Dateien über den verborgenen Datei-Eingang der Fotostrecke. */
async function uploadPhotos(
  page: Page,
  files: PhotoFixture[],
): Promise<void> {
  const input = page.locator('input[type="file"][accept*="image/jpeg"]')
  await input.setInputFiles(
    files.map((f) => ({
      name: f.name,
      mimeType: f.mimeType,
      buffer: f.buffer,
    })),
  )
}

/*
 * **Die ganze Datei läuft seriell, und das ist keine Bequemlichkeit.**
 *
 * Playwright fährt `describe`-Blöcke parallel. Alle vier Blöcke hier arbeiten im
 * **selben** Projekt und damit im selben automatisch angelegten Fotoordner, und
 * das Aufräumen kann Fotozeilen nicht nach Lauf trennen (ein Foto trägt keinen
 * Titel, an dem sich ein Bereichsbuchstabe festmachen liesse — anders als β's
 * Mängel). Ein fertiger Block löschte deshalb die Fotos eines noch laufenden:
 * gemessen, drei Blöcke fielen mit „0 Bilder", während der Upload selbst
 * nachweislich funktionierte. Dieselbe Klasse, die β mit Bereichsbuchstaben
 * gelöst hat — nur ist sie hier nicht lösbar, also wird serialisiert.
 */
test.describe.configure({ mode: "serial" })

const laneMissing = () =>
  !hasAuthStorageState(E2E_CONSTRUCTION_VIEWER_STORAGE_STATE_PATH) ||
  !hasAuthStorageState(E2E_CONSTRUCTION_LEAD_STORAGE_STATE_PATH)

test.describe("PROJ-45-ε · Kette am Mangel", () => {
  test.describe.configure({ mode: "serial" })
  test.setTimeout(240_000)
  test.skip(laneMissing, "Bau-Lane nicht bereitgestellt — tests/fixtures/README.md.")

  const TITLE = mark("A", "Riss Attika")

  test.afterAll(async () => {
    await cleanupBlock("A")
  })

  test("1 · dem BETRACHTER wird „Foto hinzufügen“ angeboten, Steuerung nicht", async ({
    constructionViewerPage: page,
  }) => {
    await page.goto(DEFECTS_PATH)
    await expect(page.getByRole("heading", { name: "Mängel" })).toBeVisible()
    await reportDefect(page, TITLE)

    const sheet = await openDetail(page, TITLE)

    // AC-45ε.1 — die Strecke ist da, und der Betrachter bekommt „hinzufügen".
    await expect(
      sheet.getByRole("heading", { name: /Fotos zum Mangel/ }),
    ).toBeVisible()
    await expect(
      sheet.getByRole("button", { name: /Foto hinzufügen/ }),
    ).toBeVisible()

    // Gegenprobe im SELBEN Zustand: die Steuerung des Mangels fehlt ihm. Ohne
    // diese Hälfte belegte die Zeile darüber nur „ein Knopf ist da".
    await expect(
      sheet.getByRole("button", { name: "Fertigmelden" }),
    ).toHaveCount(0)
    await expect(
      sheet.getByRole("button", { name: "Angaben bearbeiten" }),
    ).toHaveCount(0)
  })

  /**
   * QA-BEFUND F-1 (High) — hier bewusst als offene Lücke markiert statt
   * grün gerechnet.
   *
   * AC-45ε.16/.17 sagen zu, dass **jedes** Projektmitglied Fotos hinzufügen
   * darf, Betrachter eingeschlossen (β-Regel). Über die echte Route ist das
   * **nicht** erreichbar: der Betrachter bekommt `422 create_failed` mit
   * „new row violates row-level security policy for table
   * document_tree_nodes" — live gemessen, während dieselbe Anfrage als
   * Bauleitung mit 201 antwortet.
   *
   * Ursache ist ein Widerspruch zwischen zwei Nutzer-Locks, nicht ein Tippfehler:
   * **L31** legt das Foto als echtes DMS-Dokument ab, und PROJ-79s
   * `document_tree_nodes_insert` erlaubt INSERT nur `lead`/`editor`/Admin
   * (an der Migration nachgelesen). Die Rechteregel der Fotostrecke ist damit
   * strenger, als ihr eigenes Kriterium behauptet.
   *
   * Warum die bisherigen Nachweise es nicht sahen — alle drei prüfen an der
   * Lücke vorbei: der Pentest-Vektor A verknüpft ein Dokument, das der **Admin**
   * geseedet hat (er prüft `link_construction_photo`, nicht den DMS-Einfüge-Pfad);
   * die Routentests mocken `ingestDocumentFile` vollständig; der
   * Komponententest belegt, dass der Knopf angeboten wird, nicht dass er wirkt.
   * Genau deshalb verlangt diese Slice einen echten Durchlauf.
   */
  test.fixme(
    "1b · QA-BEFUND F-1: der Betrachter kann NICHT hochladen (422, DMS-RLS)",
    async ({ constructionViewerPage: page }) => {
      await page.goto(DEFECTS_PATH)
      const sheet = await openDetail(page, TITLE)
      await uploadPhotos(page, [await jpegWithExif()])
      await expect(sheet.getByRole("img").first()).toBeVisible({
        timeout: 60_000,
      })
    },
  )

  test("1c · die BAULEITUNG lädt hoch — die Kette läuft durch (AC-45ε.1/.9)", async ({
    constructionLeadPage: page,
  }) => {
    await page.goto(DEFECTS_PATH)
    const sheet = await openDetail(page, TITLE)
    await uploadPhotos(page, [await jpegWithExif()])

    // Das Bild erscheint, und zwar als VORSCHAU — nicht als Original.
    const img = sheet.getByRole("img").first()
    await expect(img).toBeVisible({ timeout: 60_000 })
    await expect(img).toHaveAttribute("src", /size=preview/)

    // Und die Bytes kommen wirklich an: ein nicht geladenes Bild hätte
    // `naturalWidth === 0`.
    await expect
      .poll(async () => img.evaluate((el) => (el as HTMLImageElement).naturalWidth), {
        timeout: 30_000,
      })
      .toBeGreaterThan(0)

    // Herunterladen zeigt auf das Original (AC-45ε.9, zweite Hälfte).
    await expect(
      sheet.getByRole("link", { name: /Original/ }).first(),
    ).toHaveAttribute("href", /size=original/)
  })

  test("2 · AC-45ε.8 — nur die Aufnahmezeit erreicht die Datenbank", async () => {
    const db = await admin()
    test.skip(!db, "Kein Dienst-Schlüssel — Datenbank nicht prüfbar.")
    if (!db) return

    const { data } = await db
      .from("construction_photos")
      .select("id, taken_on, caption, sort_order, document_id, defect_id")
      .eq("project_id", PROJECT)
      .order("created_at", { ascending: false })
      .limit(1)
    const row = (data ?? [])[0] as
      | { taken_on: string | null; caption: string | null; document_id: string }
      | undefined
    expect(row).toBeDefined()

    // Die Aufnahmezeit IST übernommen — sonst prüfte der Rest nichts.
    expect(row?.taken_on).toBe(FIXTURE_CAPTURE_DATE)

    // Und die Gegenprobe: das ORIGINAL trug Geräteangaben und eine GPS-Marke.
    // Ohne diese Zeile könnte das Bild schlicht keine getragen haben.
    const fixture = await jpegWithExif()
    const rawExif = await describeExif(fixture.buffer)
    expect(rawExif).toContain(FIXTURE_DEVICE_MAKE)
    expect(rawExif).toContain(FIXTURE_DEVICE_MODEL)
    // GPS auf den BYTES geprüft: EXIF speichert numerische Tag-Kennungen, keine
    // Namen — eine Textsuche nach „GPSLatitudeRef" schlägt zwangsläufig fehl.
    // Die erste Fassung dieser Zeile tat genau das und hätte den Nachweis
    // wertlos gemacht (falsch-rot, hier aufgefallen).
    expect(await hasGpsBlock(fixture.buffer)).toBe(true)

    // Nichts davon steht in der Zeile — die Tabelle hat dafür auch keine Spalte.
    const serialized = JSON.stringify(row)
    expect(serialized).not.toContain(FIXTURE_DEVICE_MAKE)
    expect(serialized).not.toContain(FIXTURE_DEVICE_MODEL)
    expect(serialized).not.toContain("GPS")
  })

  test("3 · die BAULEITUNG ändert Bildunterschrift und leert das Datum", async ({
    constructionLeadPage: page,
  }) => {
    await page.goto(DEFECTS_PATH)
    const sheet = await openDetail(page, TITLE)

    // AC-45ε.7 — das aus EXIF vorbelegte Datum ist sichtbar.
    await expect(sheet.getByLabel("Aufnahmedatum")).toHaveValue(
      FIXTURE_CAPTURE_DATE,
    )

    const caption = `Attika Achse C ${STAMP}`
    await sheet.getByLabel("Bildunterschrift").fill(caption)
    await sheet.getByRole("button", { name: "Speichern" }).click()
    await expect(sheet.getByLabel("Bildunterschrift")).toHaveValue(caption, {
      timeout: 30_000,
    })

    // Der Leeren-Schalter: das Datum wird wirklich leer, nicht „unverändert".
    await sheet.getByLabel("Aufnahmedatum").fill("")
    await sheet.getByRole("button", { name: "Speichern" }).click()
    await expect(
      sheet.getByText(/Das Bild trug keine Aufnahmezeit/),
    ).toBeVisible({ timeout: 30_000 })

    const db = await admin()
    if (db) {
      const { data } = await db
        .from("construction_photos")
        .select("caption, taken_on")
        .eq("project_id", PROJECT)
        .order("created_at", { ascending: false })
        .limit(1)
      const row = (data ?? [])[0] as
        | { caption: string | null; taken_on: string | null }
        | undefined
      expect(row?.caption).toBe(caption)
      // Der tragende Teil: NULL in der Datenbank, nicht der alte Wert.
      expect(row?.taken_on).toBeNull()
    }
  })

  test("4 · AC-45ε.10 — lösen lässt die Datei stehen, löschen legt sie in den Papierkorb", async ({
    constructionLeadPage: page,
  }) => {
    const db = await admin()
    test.skip(!db, "Kein Dienst-Schlüssel.")
    if (!db) return

    await page.goto(DEFECTS_PATH)
    const sheet = await openDetail(page, TITLE)

    const before = await db
      .from("documents")
      .select("id, deleted_at")
      .eq("tenant_id", E2E_CONSTRUCTION_TENANT_ID)
    const docCountBefore = (before.data ?? []).length
    expect(docCountBefore).toBeGreaterThan(0)

    await sheet.getByRole("button", { name: /Vom Bezug lösen/ }).first().click()
    await expect(
      page.getByText(/Datei bleibt im Dokumentenbaum/),
    ).toBeVisible({ timeout: 30_000 })

    // Die Fotozeile ist weg …
    const { data: photos } = await db
      .from("construction_photos")
      .select("id")
      .eq("project_id", PROJECT)
    expect(photos ?? []).toHaveLength(0)
    // … die Datei aber nicht, und sie ist NICHT im Papierkorb.
    const after = await db
      .from("documents")
      .select("id, deleted_at")
      .eq("tenant_id", E2E_CONSTRUCTION_TENANT_ID)
    expect((after.data ?? []).length).toBe(docCountBefore)
    expect(
      (after.data ?? []).every(
        (d) => (d as { deleted_at: string | null }).deleted_at === null,
      ),
    ).toBe(true)
  })
})

test.describe("PROJ-45-ε · Mehrfach-Upload und Abweisung", () => {
  test.describe.configure({ mode: "serial" })
  test.setTimeout(240_000)
  test.skip(laneMissing, "Bau-Lane nicht bereitgestellt.")

  const TITLE = mark("B", "Fugen Sockel")

  test.afterAll(async () => {
    await cleanupBlock("B")
  })

  test("AC-45ε.2 — eine abgewiesene Datei bricht die übrigen nicht ab", async ({
    constructionLeadPage: page,
  }) => {
    await page.goto(DEFECTS_PATH)
    await reportDefect(page, TITLE)
    const sheet = await openDetail(page, TITLE)

    const good = await jpegWithExif("gut-eins.jpg")
    const png = await pngPhoto("gut-zwei.png")
    // AC-45εH-8 — die Bytes entscheiden, nicht die Endung und nicht der
    // gemeldete Inhaltstyp.
    const bad = fakeJpeg("luegt-ueber-sich.jpg")
    const pdf = pdfNotAPhoto()

    await uploadPhotos(page, [good, bad, png, pdf])

    // Die Meldung benennt die abgewiesenen Dateien NAMENTLICH.
    const toast = page.getByText(/abgewiesen/)
    await expect(toast).toBeVisible({ timeout: 60_000 })
    await expect(page.getByText(/luegt-ueber-sich\.jpg/)).toBeVisible()
    await expect(page.getByText(/kein-foto\.pdf/)).toBeVisible()

    // Und die guten sind da — zwei, nicht null und nicht vier.
    await expect(sheet.getByRole("img")).toHaveCount(2, { timeout: 60_000 })

    const db = await admin()
    if (db) {
      const { data } = await db
        .from("construction_photos")
        .select("id, document_id")
        .eq("project_id", PROJECT)
      expect(data ?? []).toHaveLength(2)
    }
  })

  test("AC-45ε.7 — ohne EXIF bleibt das Datum leer statt „heute“", async ({
    constructionLeadPage: page,
  }) => {
    await page.goto(DEFECTS_PATH)
    const sheet = await openDetail(page, TITLE)
    await uploadPhotos(page, [await jpegWithoutExif()])
    await expect(sheet.getByRole("img")).toHaveCount(3, { timeout: 60_000 })

    const db = await admin()
    test.skip(!db, "Kein Dienst-Schlüssel.")
    if (!db) return
    const { data } = await db
      .from("construction_photos")
      .select("taken_on, created_at")
      .eq("project_id", PROJECT)
      .order("created_at", { ascending: false })
      .limit(1)
    const row = (data ?? [])[0] as { taken_on: string | null } | undefined
    // Kein erfundenes Datum — und ausdrücklich auch nicht das heutige.
    expect(row?.taken_on).toBeNull()
  })

  test("AC-45ε.6 — die Reihenfolge lässt sich ändern und wird gespeichert", async ({
    constructionLeadPage: page,
  }) => {
    const db = await admin()
    test.skip(!db, "Kein Dienst-Schlüssel.")
    if (!db) return

    await page.goto(DEFECTS_PATH)
    const sheet = await openDetail(page, TITLE)
    await expect(sheet.getByRole("img").first()).toBeVisible({ timeout: 60_000 })

    const orderBefore = await photoOrder(db)
    expect(orderBefore.length).toBeGreaterThanOrEqual(2)

    // Das ZWEITE Foto nach vorne. Am ersten ist „Nach vorne" gesperrt — das ist
    // die Randbedingung aus `planPhotoSwap`.
    await expect(sheet.getByLabel("Nach vorne").first()).toBeDisabled()
    await sheet.getByLabel("Nach vorne").nth(1).click()

    await expect
      .poll(async () => (await photoOrder(db)).join(","), { timeout: 30_000 })
      .not.toBe(orderBefore.join(","))

    const orderAfter = await photoOrder(db)
    expect(orderAfter[0]).toBe(orderBefore[1])
    expect(orderAfter[1]).toBe(orderBefore[0])
  })

  async function photoOrder(db: SupabaseClient): Promise<string[]> {
    const { data } = await db
      .from("construction_photos")
      .select("id, sort_order, created_at")
      .eq("project_id", PROJECT)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true })
    return (data ?? []).map((r) => (r as { id: string }).id)
  }
})

test.describe("PROJ-45-ε · Ausdruck mit sichtbaren Fotos", () => {
  test.describe.configure({ mode: "serial" })
  test.setTimeout(240_000)
  test.skip(laneMissing, "Bau-Lane nicht bereitgestellt.")

  const TITLE = mark("C", "Durchfeuchtung Keller")

  test.afterAll(async () => {
    await cleanupBlock("C")
  })

  test("AC-45ε.11/.13 — die Mängelanzeige zeigt das Foto in DRUCKGRÖSSE", async ({
    constructionLeadPage: page,
  }) => {
    await page.goto(DEFECTS_PATH)
    await reportDefect(page, TITLE)
    const sheet = await openDetail(page, TITLE)
    await uploadPhotos(page, [await jpegWithExif("keller.jpg")])
    await expect(sheet.getByRole("img").first()).toBeVisible({ timeout: 60_000 })

    const caption = `Wasserfahne Nordwand ${STAMP}`
    await sheet.getByLabel("Bildunterschrift").fill(caption)
    await sheet.getByRole("button", { name: "Speichern" }).click()
    await expect(sheet.getByLabel("Bildunterschrift")).toHaveValue(caption, {
      timeout: 30_000,
    })
    await page.keyboard.press("Escape")

    // Die Druckseite direkt, wie der Nutzer sie über „Mängelanzeige" öffnet.
    await page.goto(`/projects/${PROJECT}/maengelanzeige/print`)
    await expect(
      page.getByRole("heading", { name: "Mängelanzeige" }),
    ).toBeVisible()

    // AC-45ε.11 — Bildunterschrift und Aufnahmedatum stehen im Ausdruck.
    await expect(page.getByText(new RegExp(escapeRe(caption)))).toBeVisible()
    await expect(page.getByText(/aufgenommen am 14\.3\.2026/)).toBeVisible()

    // AC-45ε.13 — eingebettet ist die Druckgrösse, NICHT das Original.
    const printImg = page.getByRole("img", { name: caption })
    await expect(printImg).toBeVisible({ timeout: 30_000 })
    await expect(printImg).toHaveAttribute("src", /size=print/)

    // Und die Bytes kommen wirklich an: ein Bild, das nicht lädt, hätte
    // `naturalWidth === 0` und die Fläche zeigte stattdessen den Fehlhinweis.
    await expect
      .poll(
        async () =>
          printImg.evaluate((el) => (el as HTMLImageElement).naturalWidth),
        { timeout: 30_000 },
      )
      .toBeGreaterThan(0)
    await expect(
      page.getByText(/Foto konnte nicht geladen werden/),
    ).toHaveCount(0)
  })

  test("AC-45ε.13 — echter Druck nach PDF enthält das Bild", async ({
    constructionLeadPage: page,
  }, testInfo) => {
    await page.goto(`/projects/${PROJECT}/maengelanzeige/print`)
    await expect(
      page.getByRole("heading", { name: "Mängelanzeige" }),
    ).toBeVisible()
    // Warten, bis das Bild wirklich dekodiert ist — sonst druckt der Lauf eine
    // Seite ohne Foto und wäre grün, ohne etwas zu belegen.
    await expect
      .poll(
        async () =>
          page
            .getByRole("img")
            .first()
            .evaluate((el) => (el as HTMLImageElement).naturalWidth),
        { timeout: 30_000 },
      )
      .toBeGreaterThan(0)

    const pdf = await page.pdf({ format: "A4", printBackground: true })
    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-")
    // Ein PDF mit eingebettetem Bild ist deutlich grösser als eine reine
    // Textseite; die Schwelle ist bewusst grob, sie soll nur „Bild fehlt ganz"
    // ausschliessen.
    expect(pdf.byteLength).toBeGreaterThan(20_000)
    // Gemessene Größe im Protokoll, damit die Schwelle nachvollziehbar bleibt
    // und ein Schrumpfen auffällt, statt nur „über 20 kB" zu behaupten.
    console.log(`[PROJ-45-ε] Mängelanzeige-PDF: ${pdf.byteLength} Byte`)
    await testInfo.attach("maengelanzeige-mit-foto.pdf", {
      body: Buffer.from(pdf),
      contentType: "application/pdf",
    })
  })
})

test.describe("PROJ-45-ε · Bauabschnitt und Zähler", () => {
  test.describe.configure({ mode: "serial" })
  test.setTimeout(240_000)
  test.skip(laneMissing, "Bau-Lane nicht bereitgestellt.")

  test.afterAll(async () => {
    await cleanupBlock("D")
  })

  test("AC-45ε.15 — am Abschnitt gibt es eine Strecke, und der Zähler steht in der Liste", async ({
    constructionLeadPage: page,
  }) => {
    await page.goto(SECTIONS_PATH)
    await expect(
      page.getByRole("heading", { name: "Bauabschnitte" }),
    ).toBeVisible()

    // Vor dem Upload: die Zeile trägt „Fotos" ohne Zahl — „keine Fotos" und
    // „noch nicht geladen" dürfen nicht gleich aussehen, deshalb KEIN Abzeichen.
    const fotoButtons = page.getByRole("button", { name: /^Fotos/ })
    await expect(fotoButtons.first()).toBeVisible()

    await fotoButtons.first().click()
    await expect(page.getByRole("heading", { name: /^Fotos · / })).toBeVisible()

    await uploadPhotos(page, [await jpegWithExif("abschnitt.jpg")])
    await expect(page.getByRole("img").first()).toBeVisible({ timeout: 60_000 })

    // Der Zähler erscheint — und zwar OHNE dass die Liste Bilder lädt: er kommt
    // aus der gebündelten Auswertung.
    await expect(
      page.getByRole("button", { name: /^Fotos\s*1$/ }).first(),
    ).toBeVisible({ timeout: 30_000 })

    const db = await admin()
    if (db) {
      const { data } = await db
        .from("construction_photos")
        .select("id, section_id, defect_id, acceptance_id")
        .eq("project_id", PROJECT)
      expect(data ?? []).toHaveLength(1)
      const row = (data ?? [])[0] as {
        section_id: string | null
        defect_id: string | null
        acceptance_id: string | null
      }
      // Genau EIN Anker (L32).
      expect(row.section_id).toBe(E2E_CONSTRUCTION_SECTION_ROOT_ID)
      expect(row.defect_id).toBeNull()
      expect(row.acceptance_id).toBeNull()
    }
  })
})
