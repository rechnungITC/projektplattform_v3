/**
 * PROJ-80-α — der Bestätigungsdialog vor dem Überschreiben einer Handänderung.
 *
 * **Warum diese Datei so klein ist:** die α-QA lief in zwei Sitzungen parallel.
 * `tests/PROJ-80-alpha-qa-chain.spec.ts` (aus #440) deckt neun Fälle ab —
 * Autorisierungs-Angriff über HTTP, Rollenregel, optimistische Sperre, den
 * Quintessenz-Reiter samt Handänderung und das Zugriffsprotokoll. Alles, was ich
 * zusätzlich auf Datenbankebene geprüft hatte (Schreib-Grants, direktes
 * INSERT/UPDATE/DELETE, `strict` verborgen samt Klartextsuche, fremder Mandant,
 * `anon`-Rechte), ist dort unabhängig ebenfalls belegt. Übrig bleibt genau **ein**
 * Fall, den die neun nicht prüfen — und der ist der destruktivste Weg im Produkt.
 *
 * „Neu erzeugen" über einer von Hand geänderten Quintessenz ist der einzige
 * Pfad, der eine menschlich verantwortete Fassung vernichtet; die Spec erlaubt das
 * ausdrücklich nur als Ausnahme („unless admin force-re-runs"). Der zweite
 * `/frontend`-Lauf hat dafür einen `AlertDialog` eingebaut (F-4). Ein
 * Komponententest beweist, dass die Komponente ihn *kennt* — erst dieser
 * Durchlauf, dass er auf der echten Seite **erscheint** und dass Abbrechen den
 * Text stehen lässt.
 *
 * Geseedet werden muss, weil das DMS in Produktion leer ist (0 Dokumente, 0
 * Knoten, 0 Auszüge, 0 Quintessenzen — live gemessen) und keine Fixture ein
 * Dokument mit Auszug anlegt. Die Fläche ist nicht modul-gegatet, deshalb genügt
 * der geteilte E2E-Mandant.
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
const EDITED_SUMMARY = `Nachgeschaerfte Kurzfassung ${STAMP}`

let admin: SupabaseClient | null = null
let nodeId: string | null = null
let documentId: string | null = null

test.describe("PROJ-80-α — Bestätigung vor dem Überschreiben", () => {
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
      // Direkt als Handänderung geseedet — nur dann zeigt „Neu erzeugen" den
      // Dialog. Den Weg dorthin (Bearbeiten → Speichern → `user_edited`) prüft
      // bereits #440; ihn hier zu wiederholen wäre doppelte Arbeit.
      summary_markdown: EDITED_SUMMARY,
      status: "user_edited",
      edited_by_user_id: E2E_USER_ID,
      edited_at: new Date().toISOString(),
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

  test("„Neu erzeugen“ über einer Handänderung fragt zuerst, Abbrechen lässt den Text stehen", async ({
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
