import { beforeEach, describe, expect, it, vi } from "vitest"

const getUserMock = vi.fn()
const rpcMock = vi.fn()

interface QueryChain {
  select: ReturnType<typeof vi.fn>
  eq: ReturnType<typeof vi.fn>
  /** PROJ-Y-114d: die Sichtbarkeitsabfrage auf `dd_questions` endet auf `.in()`. */
  in: ReturnType<typeof vi.fn>
  maybeSingle: ReturnType<typeof vi.fn>
}
function newQueryChain(): QueryChain {
  const c = {} as QueryChain
  c.select = vi.fn().mockReturnValue(c)
  c.eq = vi.fn().mockReturnValue(c)
  c.in = vi.fn()
  c.maybeSingle = vi.fn()
  return c
}
const queue: QueryChain[] = []
const fromMock = vi.fn(() => {
  const next = queue.shift()
  if (!next) throw new Error("from() queue empty")
  return next
})

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: getUserMock },
    from: fromMock,
    rpc: rpcMock,
  })),
}))

import { PATCH } from "./route"

const PROJECT = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa"
const FINDING = "ffffffff-7777-4777-8777-ffffffffffff"
const ME = "cccccccc-3333-4333-8333-cccccccccccc"
const QUESTION = "99999999-9999-4999-8999-999999999999"

function ctx() {
  return { params: Promise.resolve({ id: PROJECT, findingId: FINDING }) }
}
function queueProjectView() {
  const proj = newQueryChain()
  proj.maybeSingle.mockResolvedValue({ data: { id: PROJECT, tenant_id: "t1" }, error: null })
  queue.push(proj)
}
function patch(body: unknown) {
  return PATCH(new Request("http://t/", { method: "PATCH", body: JSON.stringify(body) }), ctx())
}

beforeEach(() => {
  queue.length = 0
  getUserMock.mockReset()
  rpcMock.mockReset()
  fromMock.mockClear()
})

describe("PATCH /api/projects/[id]/dd-findings/[findingId]", () => {
  it("401 unauthenticated", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    expect((await patch({ status: "in_review" })).status).toBe(401)
  })
  it("400 on empty body", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    queueProjectView()
    expect((await patch({})).status).toBe(400)
  })
  it("400 on invalid severity", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    queueProjectView()
    expect((await patch({ severity: "nope" })).status).toBe(400)
  })
  it("200 updates via RPC (→ deal_breaker)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    queueProjectView()
    rpcMock.mockResolvedValue({ data: { id: FINDING, severity: "deal_breaker" }, error: null })
    const res = await patch({ severity: "deal_breaker" })
    expect(res.status).toBe(200)
    expect(rpcMock).toHaveBeenCalledWith("update_dd_finding", expect.objectContaining({
      p_finding_id: FINDING,
      p_severity: "deal_breaker",
    }))
  })
  it("403 maps RPC 42501", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    queueProjectView()
    rpcMock.mockResolvedValue({ data: null, error: { code: "42501", message: "denied" } })
    expect((await patch({ status: "resolved" })).status).toBe(403)
  })
  it("404 maps RPC P0002", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    queueProjectView()
    rpcMock.mockResolvedValue({ data: null, error: { code: "P0002", message: "not found" } })
    expect((await patch({ status: "resolved" })).status).toBe(404)
  })

  // --- PROJ-Y-114a — Herkunftsnachweis ------------------------------------
  it("passes clear_source through so a source can actually be removed", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    queueProjectView()
    rpcMock.mockResolvedValue({ data: { id: FINDING }, error: null })
    const res = await patch({ clear_source: true, source_kind: "interview" })
    expect(res.status).toBe(200)
    expect(rpcMock).toHaveBeenCalledWith(
      "update_dd_finding",
      expect.objectContaining({
        p_clear_source: true,
        p_source_kind: "interview",
        p_source_ref: null,
        p_source_dd_question_id: null,
      })
    )
  })
  it("leaves clear_source false when the caller does not ask for it", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    queueProjectView()
    rpcMock.mockResolvedValue({ data: { id: FINDING }, error: null })
    await patch({ status: "resolved" })
    expect(rpcMock).toHaveBeenCalledWith(
      "update_dd_finding",
      expect.objectContaining({ p_clear_source: false })
    )
  })
  it("400 on an invented source_kind", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    queueProjectView()
    const res = await patch({ source_kind: "hearsay" })
    expect(res.status).toBe(400)
    expect(rpcMock).not.toHaveBeenCalled()
  })
  // PROJ-Y-114d — der Bearbeiten-Weg ist der Fall, den Vektor O ausdruecklich
  // erlaubt: eine Leitung OHNE Freigabe darf ein Finding mit UNVERAENDERTER
  // `strict`-Verknuepfung aendern. Die Kennung darf dabei nicht in der Antwort
  // stehen — sonst waere die Existenz der Frage genau hier ablesbar.
  it("nullt die Quell-Frage in der Antwort, wenn sie unsichtbar ist", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    queueProjectView()
    rpcMock.mockResolvedValue({
      data: { id: FINDING, source_dd_question_id: QUESTION },
      error: null,
    })
    const questions = newQueryChain()
    questions.in.mockResolvedValue({ data: [], error: null }) // RLS verbirgt sie
    queue.push(questions)

    const res = await patch({ status: "resolved" })
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      finding: { source_dd_question_id: string | null }
    }
    expect(body.finding.source_dd_question_id).toBeNull()
    expect(fromMock).toHaveBeenCalledWith("dd_questions")
  })

  it("laesst sie stehen, wenn sie sichtbar ist (kein Blanket-Deny)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    queueProjectView()
    rpcMock.mockResolvedValue({
      data: { id: FINDING, source_dd_question_id: QUESTION },
      error: null,
    })
    const questions = newQueryChain()
    questions.in.mockResolvedValue({ data: [{ id: QUESTION }], error: null })
    queue.push(questions)

    const body = (await (await patch({ status: "resolved" })).json()) as {
      finding: { source_dd_question_id: string | null }
    }
    expect(body.finding.source_dd_question_id).toBe(QUESTION)
  })
})
