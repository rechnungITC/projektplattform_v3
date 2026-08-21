/**
 * PROJ-80-α — Routentests für Lesen und Bearbeiten der Quintessenz.
 *
 * Zwei Dinge werden hier ausdrücklich NICHT weggemockt, weil sie das eigentlich
 * Geprüfte sind:
 *
 *  - das Zugriffsprotokoll (PROJ-130-δ2): der Test prüft am echten Helfer, dass
 *    eine `strict`-Zeile einen Eintrag erzeugt und eine `standard`-Zeile nicht.
 *    Ein Mock hätte nur bestätigt, dass eine Funktion gerufen wird.
 *  - die optimistische Sperre: nicht nur die Vorprüfung, sondern dass die
 *    Bedingung im `UPDATE` selbst steht. Ohne diese Zusicherung wäre `If-Match`
 *    beratend, und der Spec-Edge-Case „zwei PMs gleichzeitig" nicht abgedeckt.
 */

import { beforeEach, describe, expect, it, vi } from "vitest"

const { getAuthMock, accessMock, adminMock } = vi.hoisted(() => ({
  getAuthMock: vi.fn(),
  accessMock: vi.fn(),
  adminMock: vi.fn(),
}))

vi.mock("@/app/api/_lib/route-helpers", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>
  return { ...actual, getAuthenticatedUserId: getAuthMock, requireProjectAccess: accessMock }
})
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: adminMock }))

import { GET, PATCH } from "./route"

const PROJECT = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa"
const OTHER_PROJECT = "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb"
const DOC = "eeeeeeee-5555-4555-8555-eeeeeeeeeeee"
const NODE = "dddddddd-4444-4444-8444-dddddddddddd"
const ME = "cccccccc-3333-4333-8333-cccccccccccc"
const STAMP = "2026-08-17T10:00:00.123456+00:00"

const DOC_ROW = { id: DOC, tree_node_id: NODE, original_filename: "a.pdf", mime_type: "application/pdf" }

interface Rows {
  documents?: unknown
  document_tree_nodes?: unknown
  document_summaries?: unknown
  document_extractions?: unknown
}

/** Nachbildung der Aufrufkette, die je Tabelle antwortet. */
type RpcResult = { error: { message: string } | null }

function userClient(rows: Rows) {
  // Rückgabetyp explizit: sonst leitet TS `{ error: null }` ab und ein Test, der
  // einen Protokollfehler nachstellen will, wäre nicht mehr schreibbar.
  const rpc = vi.fn(async (): Promise<RpcResult> => ({ error: null }))
  const from = vi.fn((table: keyof Rows) => {
    const chain: Record<string, unknown> = {}
    for (const m of ["select", "eq", "is", "order", "limit"]) chain[m] = vi.fn(() => chain)
    chain.maybeSingle = vi.fn(async () => ({ data: rows[table] ?? null, error: null }))
    chain.single = chain.maybeSingle
    return chain
  })
  return { from, rpc }
}

/** Admin-Client, der die `eq`-Bedingungen des UPDATE mitschreibt. */
function adminClient(
  updated: unknown,
  error: { message: string } | null = null,
): { client: unknown; eqCalls: Array<[string, unknown]>; update: ReturnType<typeof vi.fn> } {
  const eqCalls: Array<[string, unknown]> = []
  const update = vi.fn()
  const chain: Record<string, unknown> = {}
  chain.update = vi.fn((patch: unknown) => {
    update(patch)
    return chain
  })
  chain.eq = vi.fn((col: string, val: unknown) => {
    eqCalls.push([col, val])
    return chain
  })
  chain.select = vi.fn(() => chain)
  chain.maybeSingle = vi.fn(async () => ({ data: updated, error }))
  return { client: { from: vi.fn(() => chain) }, eqCalls, update }
}

function ctx(id = PROJECT, docId = DOC) {
  return { params: Promise.resolve({ id, docId }) }
}
function patchReq(body: unknown, ifMatch?: string) {
  return new Request("http://t", {
    method: "PATCH",
    headers: ifMatch ? { "if-match": ifMatch, "content-type": "application/json" } : { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  getAuthMock.mockReset()
  accessMock.mockReset()
  adminMock.mockReset()
  accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
})

describe("GET .../documents/[docId]/summary", () => {
  it("401 ohne Sitzung", async () => {
    getAuthMock.mockResolvedValue({ userId: null, supabase: userClient({}) })
    expect((await GET(new Request("http://t"), ctx())).status).toBe(401)
  })

  it("400 bei ungültiger Dokument-Kennung", async () => {
    getAuthMock.mockResolvedValue({ userId: ME, supabase: userClient({}) })
    expect((await GET(new Request("http://t"), ctx(PROJECT, "nope"))).status).toBe(400)
  })

  it("reicht den Zugriffsfehler unverändert weiter", async () => {
    getAuthMock.mockResolvedValue({ userId: ME, supabase: userClient({}) })
    accessMock.mockResolvedValue({ error: Response.json({ error: {} }, { status: 403 }) })
    expect((await GET(new Request("http://t"), ctx())).status).toBe(403)
  })

  it("404 wenn das Dokument zu einem anderen Projekt gehört", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: userClient({
        documents: DOC_ROW,
        document_tree_nodes: { project_id: OTHER_PROJECT, confidentiality_level: "standard" },
      }),
    })
    expect((await GET(new Request("http://t"), ctx())).status).toBe(404)
  })

  it("liefert Quintessenz UND Auszugs-Zustand — die Unterscheidbarkeit ist der Zweck", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: userClient({
        documents: DOC_ROW,
        document_tree_nodes: { project_id: PROJECT, confidentiality_level: "standard" },
        document_summaries: { document_id: DOC, status: "auto", summary_markdown: "Kern", updated_at: STAMP },
        document_extractions: { status: "extracted", privacy_class: 2 },
      }),
    })
    const body = await (await GET(new Request("http://t"), ctx())).json()
    expect(body.summary.summary_markdown).toBe("Kern")
    expect(body.extraction.status).toBe("extracted")
    expect(body.document.id).toBe(DOC)
  })

  it("unterscheidet „keine Quintessenz“ von „kein Auszug“ statt beides zu null zu machen", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: userClient({
        documents: DOC_ROW,
        document_tree_nodes: { project_id: PROJECT, confidentiality_level: "standard" },
        document_extractions: { status: "failed", failure_code: "no_text_layer" },
      }),
    })
    const body = await (await GET(new Request("http://t"), ctx())).json()
    expect(body.summary).toBeNull()
    expect(body.extraction.failure_code).toBe("no_text_layer")
  })

  it("protokolliert das Lesen eines `strict`-Dokuments (PROJ-130-δ2)", async () => {
    const supabase = userClient({
      documents: DOC_ROW,
      document_tree_nodes: { project_id: PROJECT, confidentiality_level: "strict" },
      document_summaries: { document_id: DOC, status: "auto", summary_markdown: "geheim", updated_at: STAMP },
      document_extractions: { status: "extracted" },
    })
    getAuthMock.mockResolvedValue({ userId: ME, supabase })
    expect((await GET(new Request("http://t"), ctx())).status).toBe(200)
    expect(supabase.rpc).toHaveBeenCalledWith(
      "log_confidential_read",
      expect.objectContaining({ p_entity_type: "documents", p_max_level: "strict", p_entity_id: DOC }),
    )
  })

  it("protokolliert NICHT bei `standard` — sonst schreibt jedes gewöhnliche Dokument mit", async () => {
    const supabase = userClient({
      documents: DOC_ROW,
      document_tree_nodes: { project_id: PROJECT, confidentiality_level: "standard" },
      document_extractions: { status: "extracted" },
    })
    getAuthMock.mockResolvedValue({ userId: ME, supabase })
    await GET(new Request("http://t"), ctx())
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it("liefert nichts aus, wenn der Pflicht-Protokolleintrag scheitert", async () => {
    const supabase = userClient({
      documents: DOC_ROW,
      document_tree_nodes: { project_id: PROJECT, confidentiality_level: "strict" },
      document_summaries: { document_id: DOC, summary_markdown: "geheim", updated_at: STAMP },
    })
    supabase.rpc.mockResolvedValue({ error: { message: "log down" } })
    getAuthMock.mockResolvedValue({ userId: ME, supabase })
    const res = await GET(new Request("http://t"), ctx())
    expect(res.status).toBe(500)
    // Der Inhalt darf dabei nicht doch durchsickern.
    expect(await res.text()).not.toContain("geheim")
  })
})

describe("PATCH .../documents/[docId]/summary", () => {
  const visible: Rows = {
    documents: DOC_ROW,
    document_tree_nodes: { project_id: PROJECT, confidentiality_level: "standard" },
    document_summaries: { document_id: DOC, updated_at: STAMP, tenant_id: "t1" },
  }

  it("401 ohne Sitzung", async () => {
    getAuthMock.mockResolvedValue({ userId: null, supabase: userClient({}) })
    expect((await PATCH(patchReq({ summary_markdown: "x" }, STAMP), ctx())).status).toBe(401)
  })

  it("verlangt Bearbeitungsrecht, nicht bloß Leserecht", async () => {
    getAuthMock.mockResolvedValue({ userId: ME, supabase: userClient(visible) })
    accessMock.mockResolvedValue({ error: Response.json({ error: {} }, { status: 403 }) })
    expect((await PATCH(patchReq({ summary_markdown: "x" }, STAMP), ctx())).status).toBe(403)
    expect(accessMock).toHaveBeenCalledWith(expect.anything(), PROJECT, ME, "edit")
  })

  it("400 bei leerem Text", async () => {
    getAuthMock.mockResolvedValue({ userId: ME, supabase: userClient(visible) })
    expect((await PATCH(patchReq({ summary_markdown: "" }, STAMP), ctx())).status).toBe(400)
  })

  it("404 wenn das Dokument zu einem anderen Projekt gehört — auch mit Bearbeitungsrecht hier", async () => {
    // Die Lücke, gegen die `document-scope` gebaut wurde: Recht in Projekt A,
    // Schreibvorgang auf ein Dokument aus Projekt B.
    const admin = adminClient({ document_id: DOC })
    adminMock.mockReturnValue(admin.client)
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: userClient({
        documents: DOC_ROW,
        document_tree_nodes: { project_id: OTHER_PROJECT, confidentiality_level: "standard" },
        document_summaries: { document_id: DOC, updated_at: STAMP, tenant_id: "t1" },
      }),
    })
    const res = await PATCH(patchReq({ summary_markdown: "x" }, STAMP), ctx())
    expect(res.status).toBe(404)
    // Entscheidend: es wurde gar nicht geschrieben.
    expect(admin.update).not.toHaveBeenCalled()
  })

  it("428 wenn If-Match fehlt — Pflicht, nicht optional", async () => {
    const admin = adminClient({ document_id: DOC })
    adminMock.mockReturnValue(admin.client)
    getAuthMock.mockResolvedValue({ userId: ME, supabase: userClient(visible) })
    const res = await PATCH(patchReq({ summary_markdown: "x" }), ctx())
    expect(res.status).toBe(428)
    expect(admin.update).not.toHaveBeenCalled()
  })

  it("409 wenn If-Match veraltet ist", async () => {
    const admin = adminClient({ document_id: DOC })
    adminMock.mockReturnValue(admin.client)
    getAuthMock.mockResolvedValue({ userId: ME, supabase: userClient(visible) })
    const res = await PATCH(patchReq({ summary_markdown: "x" }, "2020-01-01T00:00:00Z"), ctx())
    expect(res.status).toBe(409)
    expect(admin.update).not.toHaveBeenCalled()
  })

  it("404 wenn es noch keine Quintessenz gibt", async () => {
    adminMock.mockReturnValue(adminClient(null).client)
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: userClient({
        documents: DOC_ROW,
        document_tree_nodes: { project_id: PROJECT, confidentiality_level: "standard" },
      }),
    })
    expect((await PATCH(patchReq({ summary_markdown: "x" }, STAMP), ctx())).status).toBe(404)
  })

  it("speichert, hebt auf `user_edited` und stempelt den Bearbeiter", async () => {
    const admin = adminClient({ document_id: DOC, status: "user_edited", summary_markdown: "neu" })
    adminMock.mockReturnValue(admin.client)
    getAuthMock.mockResolvedValue({ userId: ME, supabase: userClient(visible) })

    const res = await PATCH(patchReq({ summary_markdown: "neu" }, STAMP), ctx())
    expect(res.status).toBe(200)
    expect((await res.json()).summary.status).toBe("user_edited")
    expect(admin.update).toHaveBeenCalledWith(
      expect.objectContaining({
        summary_markdown: "neu",
        status: "user_edited",
        edited_by_user_id: ME,
      }),
    )
  })

  it("trägt die If-Match-Bedingung IM Update — sonst wäre die Sperre beratend", async () => {
    const admin = adminClient({ document_id: DOC, status: "user_edited" })
    adminMock.mockReturnValue(admin.client)
    getAuthMock.mockResolvedValue({ userId: ME, supabase: userClient(visible) })

    await PATCH(patchReq({ summary_markdown: "neu" }, STAMP), ctx())
    expect(admin.eqCalls).toEqual(
      expect.arrayContaining([
        ["document_id", DOC],
        ["updated_at", STAMP],
      ]),
    )
  })

  it("409 wenn zwischen Prüfung und Schreiben jemand anders zuschlägt", async () => {
    // Das UPDATE trifft dann 0 Zeilen. Ohne diesen Zweig würde die Route einen
    // verlorenen Schreibvorgang als Erfolg melden.
    const admin = adminClient(null)
    adminMock.mockReturnValue(admin.client)
    getAuthMock.mockResolvedValue({ userId: ME, supabase: userClient(visible) })

    const res = await PATCH(patchReq({ summary_markdown: "neu" }, STAMP), ctx())
    expect(res.status).toBe(409)
    expect(admin.update).toHaveBeenCalled()
  })

  it("500 wenn das Schreiben fehlschlägt", async () => {
    adminMock.mockReturnValue(adminClient(null, { message: "db down" }).client)
    getAuthMock.mockResolvedValue({ userId: ME, supabase: userClient(visible) })
    expect((await PATCH(patchReq({ summary_markdown: "neu" }, STAMP), ctx())).status).toBe(500)
  })
})
