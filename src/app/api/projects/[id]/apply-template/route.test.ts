import { beforeEach, describe, expect, it, vi } from "vitest"

// PROJ-96 (AC3/AC4) — POST /api/projects/[id]/apply-template.
const getUserMock = vi.fn()
const rpcMock = vi.fn()

interface QueryChain {
  select: ReturnType<typeof vi.fn>
  eq: ReturnType<typeof vi.fn>
  maybeSingle: ReturnType<typeof vi.fn>
}

function newQueryChain(): QueryChain {
  const chain = {} as QueryChain
  chain.select = vi.fn().mockReturnValue(chain)
  chain.eq = vi.fn().mockReturnValue(chain)
  chain.maybeSingle = vi.fn()
  return chain
}

const queue: { table: string; chain: QueryChain }[] = []
function enqueue(table: string, chain: QueryChain) {
  queue.push({ table, chain })
}

const fromMock = vi.fn((table: string) => {
  const next = queue.shift()
  if (!next) throw new Error(`Unexpected from('${table}') — queue empty`)
  if (next.table !== table) {
    throw new Error(`Expected from('${next.table}') but got from('${table}')`)
  }
  return next.chain
})

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: getUserMock },
    from: fromMock,
    rpc: rpcMock,
  })),
}))

import { POST } from "./route"

const PROJECT = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa"
const TEMPLATE = "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb"
const ME = "cccccccc-3333-4333-8333-cccccccccccc"

function ctx(id: string = PROJECT) {
  return { params: Promise.resolve({ id }) }
}
function req(body: unknown = { templateId: TEMPLATE }) {
  return new Request("http://t/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}
function queueViewAccess() {
  const proj = newQueryChain()
  proj.maybeSingle.mockResolvedValue({
    data: { id: PROJECT, tenant_id: "t1" },
    error: null,
  })
  enqueue("projects", proj)
}

beforeEach(() => {
  queue.length = 0
  getUserMock.mockReset()
  rpcMock.mockReset()
  fromMock.mockClear()
})

describe("POST /api/projects/[id]/apply-template", () => {
  it("400 on invalid project id", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    const res = await POST(req(), ctx("not-a-uuid"))
    expect(res.status).toBe(400)
  })

  it("401 when unauthenticated", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    const res = await POST(req(), ctx())
    expect(res.status).toBe(401)
  })

  it("400 on invalid body (missing templateId)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    const res = await POST(req({}), ctx())
    expect(res.status).toBe(400)
  })

  it("400 on non-uuid templateId", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    const res = await POST(req({ templateId: "nope" }), ctx())
    expect(res.status).toBe(400)
  })

  it("200 returns the apply result for an authorized caller", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    queueViewAccess()
    rpcMock.mockResolvedValue({
      data: {
        template_id: TEMPLATE,
        template_version: 1,
        workstreams_created: 7,
        deliverables_created: 9,
        phase_model: { seeded: 9 },
      },
      error: null,
    })
    const res = await POST(req(), ctx())
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({
      workstreams_created: 7,
      deliverables_created: 9,
    })
    expect(rpcMock).toHaveBeenCalledWith("apply_ma_project_template", {
      p_project_id: PROJECT,
      p_template_id: TEMPLATE,
    })
  })

  it("200 passes through the PROJ-Y-96b raci_created field", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    queueViewAccess()
    rpcMock.mockResolvedValue({
      data: {
        template_id: TEMPLATE,
        template_version: 1,
        workstreams_created: 7,
        deliverables_created: 9,
        raci_created: 23,
        phase_model: { seeded: 9 },
      },
      error: null,
    })
    const res = await POST(req(), ctx())
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({
      workstreams_created: 7,
      deliverables_created: 9,
      raci_created: 23,
    })
  })

  it("200 passes through PROJ-Y-96b RACI warnings verbatim", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    queueViewAccess()
    rpcMock.mockResolvedValue({
      data: {
        template_id: TEMPLATE,
        template_version: 1,
        workstreams_created: 7,
        deliverables_created: 9,
        raci_created: 23,
        phase_model: { seeded: 9 },
        warnings: [
          {
            code: "raci_unknown_role_key",
            target_type: "workstream",
            target_key: "commercial",
            role_key: "deal_lead",
          },
          {
            code: "raci_orphan_target",
            target_type: "deliverable",
            target_key: "does_not_exist",
            role_key: "sponsor",
          },
        ],
      },
      error: null,
    })
    const res = await POST(req(), ctx())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.warnings).toHaveLength(2)
    expect(body.warnings[0]).toMatchObject({
      code: "raci_unknown_role_key",
      role_key: "deal_lead",
    })
    expect(body.warnings[1]).toMatchObject({ code: "raci_orphan_target" })
  })

  it("403 maps the RPC authority denial (42501)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    queueViewAccess()
    rpcMock.mockResolvedValue({
      data: null,
      error: { code: "42501", message: "not authorized" },
    })
    const res = await POST(req(), ctx())
    expect(res.status).toBe(403)
  })

  it("404 maps a missing project/template (P0002)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    queueViewAccess()
    rpcMock.mockResolvedValue({
      data: null,
      error: { code: "P0002", message: "template not found" },
    })
    const res = await POST(req(), ctx())
    expect(res.status).toBe(404)
  })

  it("409 maps the re-apply / non-M&A block (P0001)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    queueViewAccess()
    rpcMock.mockResolvedValue({
      data: null,
      error: { code: "P0001", message: "project already has workstreams" },
    })
    const res = await POST(req(), ctx())
    expect(res.status).toBe(409)
  })
})
