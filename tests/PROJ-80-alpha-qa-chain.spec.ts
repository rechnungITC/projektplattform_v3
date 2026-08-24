import { createClient } from "@supabase/supabase-js"

import {
  E2E_CONSTRUCTION_PROJECT_ID,
  E2E_CONSTRUCTION_TENANT_ID,
  E2E_CONSTRUCTION_VIEWER_USER_ID,
  E2E_PROJECT_ID,
  E2E_TENANT_ID,
  E2E_USER_ID,
} from "./fixtures/constants"
import { expect, test } from "./fixtures/auth-fixture"

/**
 * PROJ-80-α (`/qa`) — die zwei Zusagen, die `/frontend` ausdrücklich offen
 * gelassen hat, plus der Nachweis für den Sicherheits-Fix aus #399.
 *
 * ## Teil 1 — der Autorisierungs-Fix, an einer echten Sitzung
 *
 * `resolveDocumentInProject` ist **Anwendungscode**. Der Live-Pentest
 * (`PROJ-80-alpha-qa-redteam-pentest.sql`, K und L) zeigt, dass die Datenbank
 * ihn nicht überflüssig macht: die Quintessenz-Zeile IST für jedes
 * Projektmitglied lesbar (L = 1), es gibt aber **keinen** Client-Schreibweg
 * (K/M/N = 42501), geschrieben wird also mit service-role. Zwischen
 * „Bearbeitungsrecht in Projekt A" und „Quintessenz eines Dokuments aus
 * Projekt B" steht damit nichts außer diesem Auflöser.
 *
 * Diese Datei prüft ihn dort, wo er wirkt — über HTTP, mit einer echten
 * Sitzung. Der Angriff allein würde nichts belegen (ein 404 kann auch von einer
 * kaputten Sitzung kommen), deshalb stehen **drei Gegenproben** daneben:
 *
 *   1. Angriff:      PATCH /projects/A/documents/{docB}  → 404, Zeile unverändert
 *   2. Recht da:     PATCH /projects/A/documents/{docA}  → 200
 *   3. Zeile sichtbar: GET /projects/B/documents/{docB}  → 200 mit Inhalt
 *   4. Rollenregel:  PATCH /projects/B/documents/{docB}  → 403 (nur Betrachter)
 *
 * Erst 1+2 zusammen sagen „der Pfad war das Problem, nicht die Sitzung", und
 * erst 1+3 zusammen sagen „die RLS hat die Zeile nicht verborgen — gestoppt hat
 * allein der Auflöser". 4 trennt die Rollenregel von der Bereichsregel: ohne
 * ihn wäre unklar, ob 1 an der Rolle oder am Bereich scheitert.
 *
 * ## Warum der Bau-Betrachter der einzig mögliche Akteur ist
 *
 * Der Angriff braucht jemanden, der in einem Projekt schreiben darf und in
 * einem anderen nur lesen. `isProjectEditAllowed` (src/lib/projects/access.ts)
 * gibt für `tenantRole === "admin"` **überall** im Mandanten `true` zurück —
 * mit dem geteilten E2E-Nutzer (Mandanten-Admin) ist „Betrachter in Projekt B"
 * also gar nicht darstellbar, und der Angriff würde legitim mit 200 enden.
 *
 * `E2E_CONSTRUCTION_VIEWER_USER_ID` ist Mandanten-`member` und Projekt-
 * `viewer` — genau aus diesem Grund von PROJ-45-β so angelegt („in production
 * every tenant member happens to be admin"). Er bringt seine Sitzung mit, also
 * kostet diese Datei keinen weiteren Anmeldevorgang und keine fünfte Fixture-
 * Spur.
 *
 * ## Teil 2 — die Fläche im angemeldeten Browser
 *
 * `/frontend` hatte notiert: „Ebenso nicht bewiesen ist ein angemeldeter
 * Browser-Durchlauf über die Fläche; die DMS-Fläche ist zwar nicht
 * modul-gegatet, das DMS in Produktion aber leer, und ein Dokument mit Auszug
 * und Quintessenz gibt es in keiner Fixture." Genau das wird hier geseedet und
 * durchfahren — im geteilten Mandanten, weil dessen Projekt von **keiner**
 * Visual-Baseline fotografiert wird (die laufen seit PROJ-Y-143l auf
 * `E2E_VISUAL_*`).
 *
 * Alles Geseedete wird am Ende gelöscht und die Rückstandsfreiheit gemessen.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

/** Eigene, offensichtlich synthetische Kennungen — RFC-4122-konform (PROJ-143). */
const P80_PROJECT_A_ID = "e2e00000-0000-4e2e-8e2e-000000008001"
const P80_NODE_A_ID = "e2e00000-0000-4e2e-8e2e-000000008002"
const P80_DOC_A_ID = "e2e00000-0000-4e2e-8e2e-000000008003"
const P80_NODE_B_ID = "e2e00000-0000-4e2e-8e2e-000000008004"
const P80_DOC_B_ID = "e2e00000-0000-4e2e-8e2e-000000008005"
const P80_NODE_UI_ID = "e2e00000-0000-4e2e-8e2e-000000008006"
const P80_DOC_UI_ID = "e2e00000-0000-4e2e-8e2e-000000008007"

const MARKDOWN_A = "## Quintessenz A\n\nKurzfassung des Dokuments in Projekt A."
const MARKDOWN_B = "## Quintessenz B\n\nKurzfassung des Dokuments in Projekt B."
const MARKDOWN_UI = "## Quintessenz UI\n\nDies ist die automatisch erzeugte Kurzfassung."

function admin() {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return null
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })
}

/**
 * Ein Dokument samt Auszug und Quintessenz. `status: "extracted"` mit
 * `privacy_class` ist Pflicht — ohne Klassifikation weist der CHECK aus α.1 die
 * Zeile ab (Vektor B des α.1-Pentests), und genau das ist beabsichtigt.
 */
async function seedDocument(
  db: NonNullable<ReturnType<typeof admin>>,
  args: {
    tenantId: string
    projectId: string
    nodeId: string
    docId: string
    markdown: string
    slug: string
  },
) {
  await db.from("document_tree_nodes").upsert(
    {
      id: args.nodeId,
      tenant_id: args.tenantId,
      project_id: args.projectId,
      // `node_type: "document"` — NICHT "folder". Der Baum rendert
      // `document_tree_nodes`, und `dms-page` zeigt die Reiter nur für
      // Dokument-Knoten; ein Ordner bekommt das Ordner-Panel ohne
      // Quintessenz. Der erste Entwurf seedete einen Ordner und die
      // Oberfläche hat korrekt keine Reiter angeboten.
      node_type: "document",
      name: "[E2E 80] Kickoff.txt",
      slug: args.slug,
      created_by: E2E_USER_ID,
      confidentiality_level: "standard",
    },
    { onConflict: "id" },
  )
  await db.from("documents").upsert(
    {
      id: args.docId,
      tenant_id: args.tenantId,
      tree_node_id: args.nodeId,
      storage_path: `e2e80/${args.docId}.txt`,
      mime_type: "text/plain",
      size_bytes: 42,
      original_filename: "[E2E 80] Kickoff.txt",
      checksum: args.docId,
      created_by: E2E_USER_ID,
    },
    { onConflict: "id" },
  )
  await db.from("document_extractions").upsert(
    {
      tenant_id: args.tenantId,
      document_id: args.docId,
      status: "extracted",
      extracted_text: "Harmloser Auszugstext fuer den E2E-Lauf.",
      privacy_class: 2,
      full_text_classified_at: new Date().toISOString(),
    },
    { onConflict: "document_id" },
  )
  await db.from("document_summaries").upsert(
    {
      tenant_id: args.tenantId,
      document_id: args.docId,
      summary_markdown: args.markdown,
      status: "auto",
      generated_at: new Date().toISOString(),
    },
    { onConflict: "document_id" },
  )
}

async function readSummary(
  db: NonNullable<ReturnType<typeof admin>>,
  docId: string,
) {
  const { data } = await db
    .from("document_summaries")
    .select("summary_markdown, status, edited_by_user_id, updated_at")
    .eq("document_id", docId)
    .maybeSingle()
  return data
}

test.describe("PROJ-80-α — Autorisierung über Projektgrenzen (#399)", () => {
  test.describe.configure({ mode: "serial" })

  test.beforeAll(async () => {
    const db = admin()
    test.skip(!db, "SUPABASE_SERVICE_ROLE_KEY fehlt — siehe tests/fixtures/README.md")
    if (!db) return

    // Projekt A im BAU-Mandanten, damit der Bau-Betrachter beide Projekte im
    // selben Mandanten hat: schreibberechtigt in A, nur lesend in B.
    await db.from("projects").upsert(
      {
        id: P80_PROJECT_A_ID,
        tenant_id: E2E_CONSTRUCTION_TENANT_ID,
        name: "[E2E 80] Projekt A (Schreibrecht)",
        project_type: "general",
        responsible_user_id: E2E_USER_ID,
        created_by: E2E_USER_ID,
      },
      { onConflict: "id" },
    )
    await db.from("project_memberships").upsert(
      {
        project_id: P80_PROJECT_A_ID,
        user_id: E2E_CONSTRUCTION_VIEWER_USER_ID,
        role: "editor",
        created_by: E2E_USER_ID,
      },
      { onConflict: "project_id,user_id" },
    )

    await seedDocument(db, {
      tenantId: E2E_CONSTRUCTION_TENANT_ID,
      projectId: P80_PROJECT_A_ID,
      nodeId: P80_NODE_A_ID,
      docId: P80_DOC_A_ID,
      markdown: MARKDOWN_A,
      slug: "e2e80-a",
    })
    await seedDocument(db, {
      tenantId: E2E_CONSTRUCTION_TENANT_ID,
      projectId: E2E_CONSTRUCTION_PROJECT_ID,
      nodeId: P80_NODE_B_ID,
      docId: P80_DOC_B_ID,
      markdown: MARKDOWN_B,
      slug: "e2e80-b",
    })
  })

  test.afterAll(async () => {
    const db = admin()
    if (!db) return
    await db.from("document_summaries").delete().in("document_id", [P80_DOC_A_ID, P80_DOC_B_ID])
    await db.from("document_extractions").delete().in("document_id", [P80_DOC_A_ID, P80_DOC_B_ID])
    await db.from("documents").delete().in("id", [P80_DOC_A_ID, P80_DOC_B_ID])
    await db.from("document_tree_nodes").delete().in("id", [P80_NODE_A_ID, P80_NODE_B_ID])
    await db.from("project_memberships").delete().eq("project_id", P80_PROJECT_A_ID)
    await db.from("projects").delete().eq("id", P80_PROJECT_A_ID)
  })

  test("Gegenprobe: die fremde Quintessenz ist für diese Sitzung LESBAR", async ({
    constructionViewerPage,
  }) => {
    // Ohne diesen Fall wäre der 404 im Angriffsfall auch mit „RLS verbirgt die
    // Zeile ohnehin" erklärbar — und der Auflöser wäre nicht als die wirksame
    // Stelle belegt.
    const res = await constructionViewerPage.request.get(
      `/api/projects/${E2E_CONSTRUCTION_PROJECT_ID}/documents/${P80_DOC_B_ID}/summary`,
    )
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.summary?.summary_markdown).toBe(MARKDOWN_B)
  })

  test("Angriff: Schreiben über ein fremdes Projekt im Pfad wird abgewiesen", async ({
    constructionViewerPage,
  }) => {
    const db = admin()
    if (!db) return
    const before = await readSummary(db, P80_DOC_B_ID)
    expect(before?.status).toBe("auto")

    const res = await constructionViewerPage.request.patch(
      // Projekt A im Pfad (dort darf er schreiben), Dokument aus Projekt B.
      `/api/projects/${P80_PROJECT_A_ID}/documents/${P80_DOC_B_ID}/summary`,
      {
        headers: { "if-match": before?.updated_at ?? "" },
        data: { summary_markdown: "UEBERNOMMEN durch Projekt A" },
      },
    )
    expect(res.status()).toBe(404)

    // Und die Zeile ist wirklich unangetastet — ein 404 bei bereits
    // geschriebener Zeile wäre der schlechtere Fehler.
    const after = await readSummary(db, P80_DOC_B_ID)
    expect(after?.summary_markdown).toBe(MARKDOWN_B)
    expect(after?.status).toBe("auto")
    expect(after?.edited_by_user_id).toBeNull()
  })

  test("Angriff: auch der Leseweg ist auf das Projekt im Pfad begrenzt", async ({
    constructionViewerPage,
  }) => {
    const res = await constructionViewerPage.request.get(
      `/api/projects/${P80_PROJECT_A_ID}/documents/${P80_DOC_B_ID}/summary`,
    )
    expect(res.status()).toBe(404)
    const body = await res.text()
    expect(body).not.toContain("Quintessenz B")
  })

  test("Rollenregel getrennt belegt: Betrachter darf im eigenen Projekt nicht schreiben", async ({
    constructionViewerPage,
  }) => {
    const db = admin()
    if (!db) return
    const before = await readSummary(db, P80_DOC_B_ID)
    const res = await constructionViewerPage.request.patch(
      `/api/projects/${E2E_CONSTRUCTION_PROJECT_ID}/documents/${P80_DOC_B_ID}/summary`,
      {
        headers: { "if-match": before?.updated_at ?? "" },
        data: { summary_markdown: "Betrachter versucht zu schreiben" },
      },
    )
    // 403, nicht 404: hier ist der Bereich korrekt, nur die Rolle reicht nicht.
    // Die zwei Absagen sind damit unterscheidbar und beide belegt.
    expect(res.status()).toBe(403)
  })

  test("Gegenprobe Recht: im eigenen Projekt mit Bearbeitungsrecht geht es", async ({
    constructionViewerPage,
  }) => {
    const db = admin()
    if (!db) return
    const before = await readSummary(db, P80_DOC_A_ID)

    const res = await constructionViewerPage.request.patch(
      `/api/projects/${P80_PROJECT_A_ID}/documents/${P80_DOC_A_ID}/summary`,
      {
        headers: { "if-match": before?.updated_at ?? "" },
        data: { summary_markdown: "Von Hand korrigiert." },
      },
    )
    expect(res.status()).toBe(200)

    const after = await readSummary(db, P80_DOC_A_ID)
    expect(after?.summary_markdown).toBe("Von Hand korrigiert.")
    expect(after?.status).toBe("user_edited")
    expect(after?.edited_by_user_id).toBe(E2E_CONSTRUCTION_VIEWER_USER_ID)
  })

  test("Auch das Neuerzeugen ist auf das Projekt im Pfad begrenzt", async ({
    constructionViewerPage,
  }) => {
    const db = admin()
    if (!db) return
    // Die dritte Route. Sie war in `/frontend` die einzige, die den Auflöser
    // von Anfang an hatte — geprüft wird hier, dass das auch stimmt, denn
    // „Neuerzeugen" ist der einzige Weg, der eine von Hand geänderte Fassung
    // überschreibt (`force: true`). Ein fehlendes Tor wäre hier also
    // zerstörend, nicht bloß unerlaubt.
    const before = await readSummary(db, P80_DOC_B_ID)

    const res = await constructionViewerPage.request.post(
      `/api/projects/${P80_PROJECT_A_ID}/documents/${P80_DOC_B_ID}/summary/retry`,
    )
    expect(res.status()).toBe(404)

    const after = await readSummary(db, P80_DOC_B_ID)
    expect(after?.summary_markdown).toBe(before?.summary_markdown)
    expect(after?.updated_at).toBe(before?.updated_at)
  })

  test("Optimistische Sperre: fehlender Kopf 428, veralteter Stand 409", async ({
    constructionViewerPage,
  }) => {
    const url = `/api/projects/${P80_PROJECT_A_ID}/documents/${P80_DOC_A_ID}/summary`

    const withoutHeader = await constructionViewerPage.request.patch(url, {
      data: { summary_markdown: "ohne Kopf" },
    })
    expect(withoutHeader.status()).toBe(428)

    const stale = await constructionViewerPage.request.patch(url, {
      headers: { "if-match": "2020-01-01T00:00:00+00:00" },
      data: { summary_markdown: "veraltet" },
    })
    expect(stale.status()).toBe(409)
  })
})

test.describe("PROJ-80-α — Quintessenz-Fläche im angemeldeten Browser", () => {
  test.describe.configure({ mode: "serial" })

  test.beforeAll(async () => {
    const db = admin()
    test.skip(!db, "SUPABASE_SERVICE_ROLE_KEY fehlt — siehe tests/fixtures/README.md")
    if (!db) return
    await seedDocument(db, {
      tenantId: E2E_TENANT_ID,
      projectId: E2E_PROJECT_ID,
      nodeId: P80_NODE_UI_ID,
      docId: P80_DOC_UI_ID,
      markdown: MARKDOWN_UI,
      slug: "e2e80-ui",
    })
  })

  test.afterAll(async () => {
    const db = admin()
    if (!db) return
    await db.from("document_summaries").delete().eq("document_id", P80_DOC_UI_ID)
    await db.from("document_extractions").delete().eq("document_id", P80_DOC_UI_ID)
    await db.from("documents").delete().eq("id", P80_DOC_UI_ID)
    await db.from("document_tree_nodes").delete().eq("id", P80_NODE_UI_ID)
  })

  test("Reiter Quintessenz zeigt die Kurzfassung und speichert eine Handänderung", async ({
    authenticatedPage,
  }) => {
    const db = admin()
    if (!db) return
    test.setTimeout(120_000)

    await authenticatedPage.goto(`/projects/${E2E_PROJECT_ID}/dokumente`, {
      waitUntil: "domcontentloaded",
    })

    // Der Baum lädt asynchron; erst das Dokument wählen, dann den Reiter.
    const docRow = authenticatedPage.getByText("[E2E 80] Kickoff.txt").first()
    await expect(docRow).toBeVisible({ timeout: 60_000 })
    await docRow.click()

    await authenticatedPage.getByRole("tab", { name: "Quintessenz" }).click()

    // Zustand 4 der Fläche: Quintessenz vorhanden, automatisch erzeugt.
    await expect(
      authenticatedPage.getByText("Dies ist die automatisch erzeugte Kurzfassung."),
    ).toBeVisible({ timeout: 30_000 })
    // `exact: true`: ohne das trifft der Ausdruck auch den Fixture-Text
    // („automatisch erzeugte Kurzfassung") und Playwright bricht mit einer
    // Mehrdeutigkeit ab. Gemeint ist das Zustands-Abzeichen.
    await expect(
      authenticatedPage.getByText("Automatisch erzeugt", { exact: true }),
    ).toBeVisible()

    // Handänderung über die Oberfläche — der Weg, den die Spec als AC führt.
    await authenticatedPage.getByRole("button", { name: "Bearbeiten" }).click()
    const editor = authenticatedPage.getByLabel("Quintessenz bearbeiten")
    await expect(editor).toBeVisible()
    await editor.fill("Im Browser von Hand korrigiert.")
    await authenticatedPage.getByRole("button", { name: "Speichern" }).click()

    // Die Oberfläche sagt es …
    await expect(
      authenticatedPage.getByText("Von Hand geändert", { exact: true }),
    ).toBeVisible({ timeout: 30_000 })
    // … und die Datenbank bestätigt es. Ohne diese Hälfte wäre nur belegt, dass
    // ein Abzeichen den Text wechselt.
    const row = await readSummary(db, P80_DOC_UI_ID)
    expect(row?.summary_markdown).toBe("Im Browser von Hand korrigiert.")
    expect(row?.status).toBe("user_edited")
    expect(row?.edited_by_user_id).toBe(E2E_USER_ID)
  })

})

/**
 * PROJ-130-δ2 — die Quintessenz ist eine Verdichtung des Volltexts, also
 * In-App-Lesen von Dokument-INHALT. Die veröffentlichte Stufen-Regel verlangt
 * dafür bei `strict` einen Protokolleintrag; ohne ihn ließe sich die Essenz
 * eines `strict`-Dokuments lesen, ohne je die protokollierte Download-Route
 * (δ1) zu berühren. Die Routentests belegen das gemockt — hier gegen die echte
 * RPC.
 *
 * ## Warum dieser Block ein EIGENES, je Lauf frisches Projekt anlegt
 *
 * Zwei Eigenschaften des Protokolls machen die naive Prüfung wertlos, und beide
 * sind an der Live-Definition von `log_confidential_read` gemessen, nicht
 * vermutet:
 *
 *   1. **Append-only** (δ1/PROJ-Y-130n): Zeilen früherer Läufe bleiben liegen.
 *      Eine Prüfung „es existiert ein `strict`-Eintrag" ist damit ab dem
 *      zweiten Lauf durch die Geschichte erfüllt — sie war in einer
 *      Zwischenfassung dieser Datei grün, OBWOHL der Protokoll-Aufruf aus der
 *      Route entfernt war. Genau der Leerlauf, den `/qa` finden soll.
 *   2. **Entprellung** (δ2): der Schlüssel ist
 *      `(actor_user_id, project_id, entity_type, action, max_level)` in einem
 *      15-Minuten-Fenster — `entity_id` gehört NICHT dazu. Ein neues Dokument
 *      im selben Projekt wird also mit-entprellt; eine `+1`-Erwartung ist
 *      innerhalb des Fensters zwangsläufig rot.
 *
 * Ein frisches Projekt je Lauf löst beides zugleich: es kann keine
 * Vorgeschichte haben, und der Entprellungs-Schlüssel ist garantiert neu. Damit
 * ist die Erwartung exakt statt defensiv — 0 Einträge nach dem `standard`-Lesen,
 * genau 1 nach dem `strict`-Lesen — und das Entfernen des Protokoll-Aufrufs
 * macht sie rot (rot-grün belegt).
 */
test.describe("PROJ-80-α — Zugriffsprotokoll für vertrauliche Quintessenz (δ2)", () => {
  test.describe.configure({ mode: "serial" })

  // Je Lauf neu, siehe Blockkommentar.
  const runProjectId = crypto.randomUUID()
  const runNodeId = crypto.randomUUID()
  const runDocId = crypto.randomUUID()

  test.beforeAll(async () => {
    const db = admin()
    test.skip(!db, "SUPABASE_SERVICE_ROLE_KEY fehlt — siehe tests/fixtures/README.md")
    if (!db) return
    await db.from("projects").insert({
      id: runProjectId,
      tenant_id: E2E_TENANT_ID,
      name: "[E2E 80] Protokoll-Lauf",
      project_type: "general",
      responsible_user_id: E2E_USER_ID,
      created_by: E2E_USER_ID,
    })
    await seedDocument(db, {
      tenantId: E2E_TENANT_ID,
      projectId: runProjectId,
      nodeId: runNodeId,
      docId: runDocId,
      markdown: "## Protokoll\n\nInhalt fuer die Protokollpruefung.",
      slug: `e2e80-log-${runProjectId.slice(0, 8)}`,
    })
  })

  test.afterAll(async () => {
    const db = admin()
    if (!db) return
    await db.from("document_summaries").delete().eq("document_id", runDocId)
    await db.from("document_extractions").delete().eq("document_id", runDocId)
    await db.from("documents").delete().eq("id", runDocId)
    await db.from("document_tree_nodes").delete().eq("id", runNodeId)
    await db.from("projects").delete().eq("id", runProjectId)
    // `confidential_read_log` bleibt bewusst stehen: append-only seit δ1, kein
    // Löschpfad. Ein Eintrag je Lauf, im `[E2E]`-Mandanten, mit synthetischem
    // Inhalt — im QA-Bericht offengelegt statt weggeräumt.
  })

  test("strict wird beim Lesen protokolliert, standard nicht", async ({
    authenticatedPage,
  }) => {
    const db = admin()
    if (!db) return

    async function logRows() {
      const { data } = await db!
        .from("confidential_read_log")
        .select("max_level, action, entity_type, entity_id")
        .eq("project_id", runProjectId)
      return data ?? []
    }

    // a) standard — der Normalfall darf NICHT protokollieren.
    const stdRes = await authenticatedPage.request.get(
      `/api/projects/${runProjectId}/documents/${runDocId}/summary`,
    )
    expect(stdRes.status()).toBe(200)
    expect(await logRows()).toHaveLength(0)

    // b) dasselbe Dokument auf `strict` gehoben — jetzt ist der Eintrag Pflicht.
    await db
      .from("document_tree_nodes")
      .update({ confidentiality_level: "strict" })
      .eq("id", runNodeId)

    const strictRes = await authenticatedPage.request.get(
      `/api/projects/${runProjectId}/documents/${runDocId}/summary`,
    )
    // Der geteilte E2E-Nutzer ist Mandanten-Admin; `can_access_classified`
    // schließt für ihn kurz, die Zeile bleibt also lesbar. Geprüft wird hier
    // nicht das Tor (das macht der Live-Pentest), sondern das Protokoll.
    expect(strictRes.status()).toBe(200)

    const rows = await logRows()
    expect(rows).toHaveLength(1)
    expect(rows[0].max_level).toBe("strict")
    expect(rows[0].entity_type).toBe("documents")
    expect(rows[0].entity_id).toBe(runDocId)
  })
})
