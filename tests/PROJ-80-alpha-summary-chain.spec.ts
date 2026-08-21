/**
 * PROJ-80-α — die Quintessenz-Fläche in einem echten, angemeldeten Browser.
 *
 * Dies schließt das **offene Akzeptanzkriterium** „angemeldeter Browser-Durchlauf"
 * aus den α-Implementierungsnotizen — ausdrücklich keine Abweichung, sondern eine
 * offene Zusage (PROJ-135-Lehre: eine nicht ausgeführte Prüfebene ist kein
 * Zugeständnis). Bewiesen waren die Mechanik (Routen-, Lib- und Panel-Tests) und
 * die Datenschicht (Live-Pentest); nicht bewiesen war die Verkettung im Browser.
 *
 * Warum das überhaupt geseedet werden muss: das DMS ist in Produktion **leer**
 * (live gemessen: 0 `documents`, 0 `document_tree_nodes`, 0 `document_extractions`,
 * 0 `document_summaries`), und keine Fixture legt ein Dokument mit Auszug und
 * Quintessenz an. Die Fläche ist **nicht** modul-gegatet, deshalb genügt der
 * geteilte E2E-Mandant — anders als bei PROJ-Y-144d ist keine eigene Lane nötig.
 *
 * Die tragende Zusicherung ist Fall 2: der Bestätigungsdialog **vor** dem
 * Überschreiben einer von Hand geänderten Fassung. Ohne ihn wäre die von der Spec
 * nur als Ausnahme erlaubte Zerstörung („unless admin force-re-runs") ein
 * einzelner Klick — das war F-4 des zweiten /frontend-Laufs, und ein Panel-Test
 * allein beweist nicht, dass der Dialog auf der echten Seite auch erscheint.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js"

import { expect, hasAuthStorageState, test } from "./fixtures/auth-fixture"
import { E2E_PROJECT_ID, E2E_TENANT_ID, E2E_USER_ID } from "./fixtures/constants"

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

// Die Seed-Texte meiden bewusst die Badge-Woerter („Automatisch erzeugt",
// „Von Hand geaendert"): der erste Lauf scheiterte an der eigenen Zusicherung,
// weil der Fliesstext das Badge-Wort enthielt und der Treffer damit zweideutig war.
const STAMP = `${Date.now()}`
const DOC_NAME = `QA80 Kickoff ${STAMP}.txt`
const SEEDED_SUMMARY = `Maschinelle Kurzfassung ${STAMP}`
const EDITED_SUMMARY = `Nachgeschaerfte Kurzfassung ${STAMP}`

let admin: SupabaseClient | null = null
let nodeId: string | null = null
let documentId: string | null = null

test.describe("PROJ-80-α — Quintessenz im angemeldeten Browser", () => {
  test.skip(
    !hasAuthStorageState(),
    "Kein Auth-Storage-State — globalSetup braucht SUPABASE_SERVICE_ROLE_KEY.",
  )
  test.describe.configure({ mode: "serial" })
  test.setTimeout(180_000)

  test.beforeAll(async () => {
    admin = await createAdminClient()
    test.skip(admin == null, "SUPABASE_SERVICE_ROLE_KEY fehlt.")
    if (!admin) return

    const node = await admin
      .from("document_tree_nodes")
      .insert({
        tenant_id: E2E_TENANT_ID,
        project_id: E2E_PROJECT_ID,
        node_type: "document",
        name: DOC_NAME,
        slug: `qa80-${STAMP}`,
        created_by: E2E_USER_ID,
        confidentiality_level: "standard",
      })
      .select("id")
      .single()
    expect(node.error, `Baumknoten anlegen: ${node.error?.message}`).toBeNull()
    nodeId = node.data!.id as string

    const doc = await admin
      .from("documents")
      .insert({
        tenant_id: E2E_TENANT_ID,
        tree_node_id: nodeId,
        storage_path: `${E2E_TENANT_ID}/${E2E_PROJECT_ID}/${nodeId}/qa80.txt`,
        mime_type: "text/plain",
        size_bytes: 42,
        original_filename: DOC_NAME,
        checksum: `qa80-${STAMP}`,
        created_by: E2E_USER_ID,
      })
      .select("id")
      .single()
    expect(doc.error, `Dokument anlegen: ${doc.error?.message}`).toBeNull()
    documentId = doc.data!.id as string

    // Auszug als `extracted` mit bestätigter Klassifikation — sonst zeigt das
    // Panel den Zustand "Noch nicht ausgewertet" und die Quintessenz gar nicht.
    const ext = await admin.from("document_extractions").insert({
      tenant_id: E2E_TENANT_ID,
      document_id: documentId,
      status: "extracted",
      extracted_text: `Testtext ${STAMP}. Enthält keine personenbezogenen Daten.`,
      privacy_class: 2,
      full_text_classified_at: new Date().toISOString(),
    })
    expect(ext.error, `Auszug anlegen: ${ext.error?.message}`).toBeNull()

    const sum = await admin.from("document_summaries").insert({
      tenant_id: E2E_TENANT_ID,
      document_id: documentId,
      summary_markdown: SEEDED_SUMMARY,
      status: "auto",
      generated_at: new Date().toISOString(),
    })
    expect(sum.error, `Quintessenz anlegen: ${sum.error?.message}`).toBeNull()
  })

  test.afterAll(async () => {
    if (!admin) return
    if (documentId) {
      await admin.from("document_summaries").delete().eq("document_id", documentId)
      await admin.from("document_extractions").delete().eq("document_id", documentId)
      await admin.from("documents").delete().eq("id", documentId)
    }
    if (nodeId) await admin.from("document_tree_nodes").delete().eq("id", nodeId)
  })

  test("1 — Reiter Quintessenz zeigt die Fassung, Bearbeiten hebt auf 'Von Hand geändert'", async ({
    authenticatedPage: page,
  }) => {
    await page.goto(`/projects/${E2E_PROJECT_ID}/dokumente`, {
      waitUntil: "domcontentloaded",
    })

    // Der Baum lädt asynchron; erst danach ist der Knoten anklickbar.
    await expect(page.getByText(DOC_NAME).first()).toBeVisible({ timeout: 30_000 })
    await page.getByText(DOC_NAME).first().click()

    await page.getByRole("tab", { name: "Quintessenz" }).click()
    await expect(page.getByText(SEEDED_SUMMARY)).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText("Automatisch erzeugt", { exact: true })).toBeVisible()

    await page.getByRole("button", { name: "Bearbeiten" }).click()
    const box = page.getByLabel("Quintessenz bearbeiten")
    await expect(box).toBeVisible()
    await box.fill(EDITED_SUMMARY)
    await page.getByRole("button", { name: "Speichern" }).click()

    await expect(page.getByText("Von Hand geändert", { exact: true })).toBeVisible({
      timeout: 20_000,
    })
    await expect(page.getByText(EDITED_SUMMARY)).toBeVisible()

    // Gegenprobe in der Datenbank: die Oberfläche behauptet den Statuswechsel,
    // hier steht, ob er wirklich persistiert ist — samt Bearbeiter-Stempel.
    const row = await admin!
      .from("document_summaries")
      .select("status, summary_markdown, edited_by_user_id")
      .eq("document_id", documentId!)
      .single()
    expect(row.error).toBeNull()
    expect(row.data!.status).toBe("user_edited")
    expect(row.data!.summary_markdown).toBe(EDITED_SUMMARY)
    expect(row.data!.edited_by_user_id).toBe(E2E_USER_ID)
  })

  test("2 — 'Neu erzeugen' über eine Handänderung fragt zuerst, und Abbrechen lässt den Text stehen", async ({
    authenticatedPage: page,
  }) => {
    await page.goto(`/projects/${E2E_PROJECT_ID}/dokumente`, {
      waitUntil: "domcontentloaded",
    })
    await expect(page.getByText(DOC_NAME).first()).toBeVisible({ timeout: 30_000 })
    await page.getByText(DOC_NAME).first().click()
    await page.getByRole("tab", { name: "Quintessenz" }).click()
    await expect(page.getByText(EDITED_SUMMARY)).toBeVisible({ timeout: 20_000 })

    await page.getByRole("button", { name: "Neu erzeugen" }).click()

    // Das ist der Kern: der Dialog erscheint, statt sofort zu überschreiben.
    await expect(
      page.getByRole("heading", { name: "Handänderung überschreiben?" }),
    ).toBeVisible()
    await page.getByRole("button", { name: "Abbrechen" }).click()

    await expect(page.getByText(EDITED_SUMMARY)).toBeVisible()
    const row = await admin!
      .from("document_summaries")
      .select("status, summary_markdown")
      .eq("document_id", documentId!)
      .single()
    expect(row.data!.status).toBe("user_edited")
    expect(row.data!.summary_markdown).toBe(EDITED_SUMMARY)
  })
})
