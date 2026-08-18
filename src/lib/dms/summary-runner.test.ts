/**
 * PROJ-80-α — Schutz der von Hand geänderten Quintessenz.
 *
 * Geprüft wird der echte `runDocumentSummary`; weggemockt sind nur seine zwei
 * Außengrenzen (Datenbank, AI-Router). Der Kern — „wann darf überschrieben
 * werden" — läuft ungemockt, sonst würde der Test die Zusicherung nachbilden,
 * die er beweisen soll.
 */

import { beforeEach, describe, expect, it, vi } from "vitest"

const { adminMock, invokeMock } = vi.hoisted(() => ({
  adminMock: vi.fn(),
  invokeMock: vi.fn(),
}))

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: adminMock }))
vi.mock("@/lib/ai/router", () => ({ invokeDocumentSummaryGeneration: invokeMock }))

import { runDocumentSummary } from "./summary-runner"

const TENANT = "11111111-1111-4111-8111-111111111111"
const DOC = "eeeeeeee-5555-4555-8555-eeeeeeeeeeee"
const NODE = "dddddddd-4444-4444-8444-dddddddddddd"
const ME = "cccccccc-3333-4333-8333-cccccccccccc"

interface Rows {
  document_summaries?: unknown
  document_extractions?: unknown
  documents?: unknown
  document_tree_nodes?: unknown
  skills?: unknown
  skill_versions?: unknown
}

/** Fake-Client, der die geschriebene Zeile mitschreibt. */
function client(rows: Rows) {
  const upserts: Array<Record<string, unknown>> = []
  const from = vi.fn((table: keyof Rows) => {
    const chain: Record<string, unknown> = {}
    for (const m of ["select", "eq"]) chain[m] = vi.fn(() => chain)
    chain.maybeSingle = vi.fn(async () => ({ data: rows[table] ?? null, error: null }))
    chain.upsert = vi.fn(async (row: Record<string, unknown>) => {
      upserts.push(row)
      return { error: null }
    })
    return chain
  })
  return { supabase: { from }, upserts }
}

const READY: Rows = {
  document_extractions: { status: "extracted", extracted_text: "Inhalt", privacy_class: 2 },
  documents: { original_filename: "a.pdf", mime_type: "application/pdf", tree_node_id: NODE },
  document_tree_nodes: { project_id: "pppppppp-1111-4111-8111-pppppppppppp" },
}

beforeEach(() => {
  adminMock.mockReset()
  invokeMock.mockReset()
  invokeMock.mockResolvedValue({
    summary: { title: "T" },
    summary_markdown: "Neu erzeugt",
    reason_code: null,
  })
})

describe("PROJ-80 runDocumentSummary — Handänderung", () => {
  it("überschreibt eine von Hand geänderte Fassung NICHT und ruft kein Modell", async () => {
    const { supabase, upserts } = client({ ...READY, document_summaries: { status: "user_edited" } })
    adminMock.mockReturnValue(supabase)

    const res = await runDocumentSummary({ tenantId: TENANT, documentId: DOC, actorUserId: ME })

    expect(res).toEqual({ status: "user_edited", reason_code: "user_edited_preserved" })
    expect(upserts).toHaveLength(0)
    // Der teure Teil darf gar nicht laufen — sonst würde jeder nächtliche Lauf
    // für eine Fassung zahlen, die er anschließend wegwirft.
    expect(invokeMock).not.toHaveBeenCalled()
  })

  it("überschreibt sie auf ausdrückliches Verlangen (`force`)", async () => {
    const { supabase, upserts } = client({ ...READY, document_summaries: { status: "user_edited" } })
    adminMock.mockReturnValue(supabase)

    const res = await runDocumentSummary({
      tenantId: TENANT,
      documentId: DOC,
      actorUserId: ME,
      force: true,
    })

    expect(res).toEqual({ status: "auto", reason_code: null })
    expect(upserts[0]).toMatchObject({ status: "auto", summary_markdown: "Neu erzeugt" })
  })

  it("löscht beim Neuerzeugen den Bearbeiter-Stempel", async () => {
    // Sonst behauptete die Zeile „automatisch erzeugt" und trüge gleichzeitig
    // einen Bearbeiter — eine Angabe, die auf diesen Text nicht mehr zutrifft.
    const { supabase, upserts } = client({
      ...READY,
      document_summaries: { status: "user_edited" },
    })
    adminMock.mockReturnValue(supabase)

    await runDocumentSummary({ tenantId: TENANT, documentId: DOC, actorUserId: ME, force: true })

    expect(upserts[0]).toMatchObject({ edited_by_user_id: null, edited_at: null })
  })

  it("erzeugt normal, wenn noch keine Quintessenz existiert", async () => {
    const { supabase, upserts } = client(READY)
    adminMock.mockReturnValue(supabase)

    const res = await runDocumentSummary({ tenantId: TENANT, documentId: DOC, actorUserId: ME })

    expect(res?.status).toBe("auto")
    expect(upserts).toHaveLength(1)
  })

  it("überschreibt eine automatisch erzeugte Fassung ohne `force`", async () => {
    const { supabase } = client({ ...READY, document_summaries: { status: "auto" } })
    adminMock.mockReturnValue(supabase)

    const res = await runDocumentSummary({ tenantId: TENANT, documentId: DOC, actorUserId: ME })
    expect(res?.status).toBe("auto")
  })

  it("bucht ein leeres Modellergebnis als `stale` MIT Grund, nicht als Erfolg", async () => {
    invokeMock.mockResolvedValue({ summary: null, summary_markdown: null, reason_code: "class3_blocked" })
    const { supabase, upserts } = client(READY)
    adminMock.mockReturnValue(supabase)

    const res = await runDocumentSummary({ tenantId: TENANT, documentId: DOC, actorUserId: ME })

    expect(res).toEqual({ status: "stale", reason_code: "class3_blocked" })
    expect(upserts[0]).toMatchObject({ status: "stale", reason_code: "class3_blocked" })
  })
})
