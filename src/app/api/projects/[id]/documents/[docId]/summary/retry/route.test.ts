/**
 * PROJ-80-α — Routentests für „Quintessenz erneut erzeugen".
 *
 * Der wichtigste Vektor ist nicht der Erfolgsfall, sondern die Sperre bei
 * unfertigem Auszug: ohne geprüften Volltext darf kein Text an ein Modell gehen
 * (Invariante #3). Der Test prüft deshalb, dass der Erzeuger in diesen Fällen
 * **gar nicht gerufen** wird — ein 409 allein würde nicht ausschließen, dass
 * vorher schon etwas losgeschickt wurde.
 */

import { beforeEach, describe, expect, it, vi } from "vitest"

const { getAuthMock, accessMock, runMock } = vi.hoisted(() => ({
  getAuthMock: vi.fn(),
  accessMock: vi.fn(),
  runMock: vi.fn(),
}))

vi.mock("@/app/api/_lib/route-helpers", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>
  return { ...actual, getAuthenticatedUserId: getAuthMock, requireProjectAccess: accessMock }
})
vi.mock("@/lib/dms/summary-runner", () => ({ runDocumentSummary: runMock }))

import { POST } from "./route"

const PROJECT = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa"
const OTHER_PROJECT = "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb"
const DOC = "eeeeeeee-5555-4555-8555-eeeeeeeeeeee"
const NODE = "dddddddd-4444-4444-8444-dddddddddddd"
const ME = "cccccccc-3333-4333-8333-cccccccccccc"

const DOC_ROW = { id: DOC, tree_node_id: NODE, original_filename: "a.pdf", mime_type: "application/pdf" }

interface Rows {
  documents?: unknown
  document_tree_nodes?: unknown
  document_extractions?: unknown
}

function userClient(rows: Rows) {
  const rpc = vi.fn(async () => ({ error: null }))
  const from = vi.fn((table: keyof Rows) => {
    const chain: Record<string, unknown> = {}
    for (const m of ["select", "eq"]) chain[m] = vi.fn(() => chain)
    chain.maybeSingle = vi.fn(async () => ({ data: rows[table] ?? null, error: null }))
    return chain
  })
  return { from, rpc }
}

function ctx(id = PROJECT, docId = DOC) {
  return { params: Promise.resolve({ id, docId }) }
}
const req = () => new Request("http://t", { method: "POST" })

const visible = (extraction: unknown, project = PROJECT): Rows => ({
  documents: DOC_ROW,
  document_tree_nodes: { project_id: project, confidentiality_level: "standard" },
  document_extractions: extraction,
})

beforeEach(() => {
  getAuthMock.mockReset()
  accessMock.mockReset()
  runMock.mockReset()
  accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
})

describe("POST .../documents/[docId]/summary/retry", () => {
  it("401 ohne Sitzung", async () => {
    getAuthMock.mockResolvedValue({ userId: null, supabase: userClient({}) })
    expect((await POST(req(), ctx())).status).toBe(401)
  })

  it("400 bei ungültiger Dokument-Kennung", async () => {
    getAuthMock.mockResolvedValue({ userId: ME, supabase: userClient({}) })
    expect((await POST(req(), ctx(PROJECT, "nope"))).status).toBe(400)
  })

  it("verlangt Bearbeitungsrecht", async () => {
    getAuthMock.mockResolvedValue({ userId: ME, supabase: userClient({}) })
    accessMock.mockResolvedValue({ error: Response.json({ error: {} }, { status: 403 }) })
    expect((await POST(req(), ctx())).status).toBe(403)
    expect(accessMock).toHaveBeenCalledWith(expect.anything(), PROJECT, ME, "edit")
    expect(runMock).not.toHaveBeenCalled()
  })

  it("404 — und erzeugt nichts — wenn das Dokument zu einem anderen Projekt gehört", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: userClient(visible({ status: "extracted" }, OTHER_PROJECT)),
    })
    expect((await POST(req(), ctx())).status).toBe(404)
    expect(runMock).not.toHaveBeenCalled()
  })

  it("404 wenn es noch keinen Textauszug gibt", async () => {
    getAuthMock.mockResolvedValue({ userId: ME, supabase: userClient(visible(null)) })
    expect((await POST(req(), ctx())).status).toBe(404)
    expect(runMock).not.toHaveBeenCalled()
  })

  it.each(["pending", "failed", "too_large", "unsupported_type"])(
    "409 bei Auszugs-Zustand %s — und es geht kein Text an ein Modell",
    async (status) => {
      getAuthMock.mockResolvedValue({ userId: ME, supabase: userClient(visible({ status })) })
      const res = await POST(req(), ctx())
      expect(res.status).toBe(409)
      // Die Begründung nennt den Zustand, damit der Nutzer weiß, was hilft.
      expect((await res.json()).error.message).toContain(status)
      expect(runMock).not.toHaveBeenCalled()
    },
  )

  it("erzeugt bei geprüftem Auszug und gibt Zustand samt Grund zurück", async () => {
    getAuthMock.mockResolvedValue({ userId: ME, supabase: userClient(visible({ status: "extracted" })) })
    runMock.mockResolvedValue({ status: "auto", reason_code: null })

    const res = await POST(req(), ctx())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: "auto", reason_code: null })
    // `force: true` ist hier der Punkt: dieser Knopf IST die ausdrückliche
    // Nutzerhandlung, die die Spec als Ausnahme vom Schutz der Handänderung
    // vorsieht. Automatische Läufe rufen ohne den Schalter.
    expect(runMock).toHaveBeenCalledWith({
      tenantId: "t1",
      documentId: DOC,
      actorUserId: ME,
      force: true,
    })
  })

  it("reicht einen erklärbaren Fehlschlag als Grund durch statt als leeres Ergebnis (PROJ-137)", async () => {
    getAuthMock.mockResolvedValue({ userId: ME, supabase: userClient(visible({ status: "extracted" })) })
    runMock.mockResolvedValue({ status: "stale", reason_code: "class3_blocked" })

    const body = await (await POST(req(), ctx())).json()
    expect(body).toEqual({ status: "stale", reason_code: "class3_blocked" })
  })

  it("500 wenn der Lauf gar kein Ergebnis liefert", async () => {
    getAuthMock.mockResolvedValue({ userId: ME, supabase: userClient(visible({ status: "extracted" })) })
    runMock.mockResolvedValue(null)
    expect((await POST(req(), ctx())).status).toBe(500)
  })

  it("sät den Summarizer-Skill nach, solange die Nutzersitzung da ist", async () => {
    // Der Hintergrundlauf kann die RPC nicht rufen: sie prüft `is_tenant_member`,
    // und für service-role ist `auth.uid()` leer.
    const supabase = userClient(visible({ status: "extracted" }))
    getAuthMock.mockResolvedValue({ userId: ME, supabase })
    runMock.mockResolvedValue({ status: "auto", reason_code: null })

    await POST(req(), ctx())
    expect(supabase.rpc).toHaveBeenCalledWith("ensure_summarizer_skill", { p_tenant_id: "t1" })
  })

  it("erzeugt trotzdem, wenn das Nachsäen scheitert (Spec: „indexing still runs“)", async () => {
    const supabase = userClient(visible({ status: "extracted" }))
    supabase.rpc.mockRejectedValue(new Error("no skill"))
    getAuthMock.mockResolvedValue({ userId: ME, supabase })
    runMock.mockResolvedValue({ status: "auto", reason_code: null })

    expect((await POST(req(), ctx())).status).toBe(200)
    expect(runMock).toHaveBeenCalled()
  })
})
