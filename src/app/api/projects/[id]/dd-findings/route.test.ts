import { beforeEach, describe, expect, it, vi } from "vitest"

const getUserMock = vi.fn()
const rpcMock = vi.fn()

interface QueryChain {
  select: ReturnType<typeof vi.fn>
  eq: ReturnType<typeof vi.fn>
  /** PROJ-Y-114d: die Sichtbarkeitsabfrage auf `dd_questions` endet auf `.in()`. */
  in: ReturnType<typeof vi.fn>
  order: ReturnType<typeof vi.fn>
  limit: ReturnType<typeof vi.fn>
  maybeSingle: ReturnType<typeof vi.fn>
}
function newQueryChain(): QueryChain {
  const c = {} as QueryChain
  c.select = vi.fn().mockReturnValue(c)
  c.eq = vi.fn().mockReturnValue(c)
  c.in = vi.fn()
  c.order = vi.fn().mockReturnValue(c)
  c.limit = vi.fn()
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

import { GET, POST } from "./route"

const PROJECT = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa"
const STREAM = "55555555-5555-4555-8555-555555555555"
const ME = "cccccccc-3333-4333-8333-cccccccccccc"
const QUESTION = "99999999-9999-4999-8999-999999999999"

function ctx() {
  return { params: Promise.resolve({ id: PROJECT }) }
}
function queueProjectView() {
  const proj = newQueryChain()
  proj.maybeSingle.mockResolvedValue({ data: { id: PROJECT, tenant_id: "t1" }, error: null })
  queue.push(proj)
}
function post(body: unknown) {
  return POST(new Request("http://t/", { method: "POST", body: JSON.stringify(body) }), ctx())
}

beforeEach(() => {
  queue.length = 0
  getUserMock.mockReset()
  rpcMock.mockReset()
  fromMock.mockClear()
})

describe("GET /api/projects/[id]/dd-findings", () => {
  it("401 unauthenticated", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    expect((await GET(new Request("http://t/"), ctx())).status).toBe(401)
  })
  it("400 invalid project id", async () => {
    const res = await GET(new Request("http://t/"), {
      params: Promise.resolve({ id: "nope" }),
    })
    expect(res.status).toBe(400)
  })
  it("lists findings for a member", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    queueProjectView()
    const list = newQueryChain()
    list.limit.mockResolvedValue({ data: [{ id: "f1", severity: "hoch" }], error: null })
    queue.push(list)
    const res = await GET(new Request("http://t/"), ctx())
    expect(res.status).toBe(200)
    expect(((await res.json()) as { findings: unknown[] }).findings).toHaveLength(1)
  })

  // PROJ-Y-114d — die Herkunfts-Verknuepfung darf keine unsichtbare Frage verraten.
  // Gefunden als Vektor T der PROJ-Y-114a-QA: die Schreibseite war dicht, die
  // Leseseite nicht. Autoritaet ist die RLS des Aufrufers — was die Abfrage auf
  // `dd_questions` zurueckgibt, ist sichtbar; alles andere wird genullt.
  it("nullt die Quell-Frage, wenn sie fuer den Aufrufer nicht sichtbar ist", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    queueProjectView()
    const list = newQueryChain()
    list.limit.mockResolvedValue({
      data: [{ id: "f1", severity: "hoch", source_dd_question_id: QUESTION }],
      error: null,
    })
    queue.push(list)
    const questions = newQueryChain()
    questions.in.mockResolvedValue({ data: [], error: null }) // RLS verbirgt sie
    queue.push(questions)

    const res = await GET(new Request("http://t/"), ctx())
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      findings: { source_dd_question_id: string | null }[]
    }
    expect(body.findings[0].source_dd_question_id).toBeNull()
    // Gefragt wurde mit der Nutzersitzung auf `dd_questions` — nicht nachgebaut.
    expect(fromMock).toHaveBeenCalledWith("dd_questions")
  })

  it("laesst die Quell-Frage stehen, wenn sie sichtbar ist (kein Blanket-Deny)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    queueProjectView()
    const list = newQueryChain()
    list.limit.mockResolvedValue({
      data: [{ id: "f1", severity: "hoch", source_dd_question_id: QUESTION }],
      error: null,
    })
    queue.push(list)
    const questions = newQueryChain()
    questions.in.mockResolvedValue({ data: [{ id: QUESTION }], error: null })
    queue.push(questions)

    const res = await GET(new Request("http://t/"), ctx())
    const body = (await res.json()) as {
      findings: { source_dd_question_id: string | null }[]
    }
    expect(body.findings[0].source_dd_question_id).toBe(QUESTION)
  })

  it("fragt `dd_questions` gar nicht, wenn keine Zeile eine Quelle traegt", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    queueProjectView()
    const list = newQueryChain()
    list.limit.mockResolvedValue({
      data: [{ id: "f1", severity: "hoch", source_dd_question_id: null }],
      error: null,
    })
    queue.push(list)
    // Keine zweite Kette in der Warteschlange: wuerde gefragt, liefe `from()` leer
    // und der Fall waere rot. Genau das ist die Zusicherung.
    const res = await GET(new Request("http://t/"), ctx())
    expect(res.status).toBe(200)
    expect(fromMock).not.toHaveBeenCalledWith("dd_questions")
  })
})

describe("POST /api/projects/[id]/dd-findings", () => {
  it("401 unauthenticated", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    expect((await post({ dd_stream_id: STREAM, title: "X" })).status).toBe(401)
  })
  it("400 on missing title", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    queueProjectView()
    expect((await post({ dd_stream_id: STREAM })).status).toBe(400)
  })
  it("400 on invalid severity", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    queueProjectView()
    expect((await post({ dd_stream_id: STREAM, title: "X", severity: "huge" })).status).toBe(400)
  })
  it("201 creates via RPC", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    queueProjectView()
    rpcMock.mockResolvedValue({ data: { id: "f1", severity: "mittel" }, error: null })
    const res = await post({ dd_stream_id: STREAM, title: "Altlasten", severity: "mittel" })
    expect(res.status).toBe(201)
    expect(rpcMock).toHaveBeenCalledWith("create_dd_finding", expect.objectContaining({
      p_dd_stream_id: STREAM,
      p_title: "Altlasten",
      p_severity: "mittel",
    }))
  })
  it("403 maps RPC 42501", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    queueProjectView()
    rpcMock.mockResolvedValue({ data: null, error: { code: "42501", message: "denied" } })
    expect((await post({ dd_stream_id: STREAM, title: "X" })).status).toBe(403)
  })
  it("404 maps RPC P0002 (stream not found)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    queueProjectView()
    rpcMock.mockResolvedValue({ data: null, error: { code: "P0002", message: "no stream" } })
    expect((await post({ dd_stream_id: STREAM, title: "X" })).status).toBe(404)
  })

  // --- PROJ-Y-114a — Herkunftsnachweis ------------------------------------
  it("passes the source provenance through to the RPC", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    queueProjectView()
    rpcMock.mockResolvedValue({ data: { id: "f1" }, error: null })
    const QUESTION = "77777777-7777-4777-8777-777777777777"
    const res = await post({
      dd_stream_id: STREAM,
      title: "Altlasten",
      source_kind: "qa_answer",
      source_ref: "VDR 3.4.1",
      source_dd_question_id: QUESTION,
    })
    expect(res.status).toBe(201)
    expect(rpcMock).toHaveBeenCalledWith(
      "create_dd_finding",
      expect.objectContaining({
        p_source_kind: "qa_answer",
        p_source_ref: "VDR 3.4.1",
        p_source_dd_question_id: QUESTION,
      })
    )
  })
  it("defaults the source to null when omitted (no silent provenance)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    queueProjectView()
    rpcMock.mockResolvedValue({ data: { id: "f1" }, error: null })
    await post({ dd_stream_id: STREAM, title: "X" })
    expect(rpcMock).toHaveBeenCalledWith(
      "create_dd_finding",
      expect.objectContaining({
        p_source_kind: null,
        p_source_ref: null,
        p_source_dd_question_id: null,
      })
    )
  })
  it("400 on an invented source_kind", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    queueProjectView()
    const res = await post({
      dd_stream_id: STREAM,
      title: "X",
      source_kind: "hearsay",
    })
    expect(res.status).toBe(400)
    expect(rpcMock).not.toHaveBeenCalled()
  })
  it("400 on a non-uuid source_dd_question_id", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    queueProjectView()
    const res = await post({
      dd_stream_id: STREAM,
      title: "X",
      source_dd_question_id: "not-a-uuid",
    })
    expect(res.status).toBe(400)
    expect(rpcMock).not.toHaveBeenCalled()
  })
  // PROJ-Y-114d — die Antwort des Anlege-Wegs ist derselbe Kanal wie die Liste.
  // Ohne diesen Fall waere nur die GET-Verdrahtung geprueft, waehrend `POST` die
  // Kennung einer unsichtbaren Frage im 201-Rumpf zurueckgeben koennte.
  it("nullt die Quell-Frage auch in der 201-Antwort, wenn sie unsichtbar ist", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    queueProjectView()
    rpcMock.mockResolvedValue({
      data: { id: "f1", source_dd_question_id: QUESTION },
      error: null,
    })
    const questions = newQueryChain()
    questions.in.mockResolvedValue({ data: [], error: null }) // RLS verbirgt sie
    queue.push(questions)

    const res = await post({ dd_stream_id: STREAM, title: "X" })
    expect(res.status).toBe(201)
    const body = (await res.json()) as {
      finding: { source_dd_question_id: string | null }
    }
    expect(body.finding.source_dd_question_id).toBeNull()
    expect(fromMock).toHaveBeenCalledWith("dd_questions")
  })
})
