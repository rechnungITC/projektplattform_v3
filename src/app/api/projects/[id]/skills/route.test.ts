import { beforeEach, describe, expect, it, vi } from "vitest"

// PROJ-78 — GET/POST /api/projects/[id]/skills

const getUserMock = vi.fn()
const rpcMock = vi.fn()

interface QueryChain {
  select: ReturnType<typeof vi.fn>
  eq: ReturnType<typeof vi.fn>
  order: ReturnType<typeof vi.fn>
  maybeSingle: ReturnType<typeof vi.fn>
}
function newQueryChain(): QueryChain {
  const c = {} as QueryChain
  c.select = vi.fn().mockReturnValue(c)
  c.eq = vi.fn().mockReturnValue(c)
  c.order = vi.fn().mockReturnValue(c)
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
const SKILL = "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb"
const ME = "cccccccc-3333-4333-8333-cccccccccccc"

function ctx() {
  return { params: Promise.resolve({ id: PROJECT }) }
}
function queueProject() {
  const proj = newQueryChain()
  proj.maybeSingle.mockResolvedValue({
    data: { id: PROJECT, tenant_id: "t1" },
    error: null,
  })
  queue.push(proj)
}
/** requireProjectAccess("manage_members") reads tenant + project membership. */
function queueMembership(tenantRole: string | null, projectRole: string | null) {
  const t = newQueryChain()
  t.maybeSingle.mockResolvedValue({
    data: tenantRole ? { role: tenantRole } : null,
    error: null,
  })
  const p = newQueryChain()
  p.maybeSingle.mockResolvedValue({
    data: projectRole ? { role: projectRole } : null,
    error: null,
  })
  queue.push(t, p)
}
function post(body: unknown) {
  return POST(
    new Request("http://t/", { method: "POST", body: JSON.stringify(body) }),
    ctx()
  )
}
const validBody = {
  assignments: [{ skill_id: SKILL, assignment_source: "auto_method" }],
}

beforeEach(() => {
  queue.length = 0
  getUserMock.mockReset()
  rpcMock.mockReset()
  fromMock.mockClear()
  getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
})

describe("GET /api/projects/[id]/skills", () => {
  it("401 when unauthenticated", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    expect((await GET(new Request("http://t/"), ctx())).status).toBe(401)
  })

  it("400 on an invalid project id", async () => {
    const res = await GET(new Request("http://t/"), {
      params: Promise.resolve({ id: "nope" }),
    })
    expect(res.status).toBe(400)
  })

  it("returns the assigned skills for a project member", async () => {
    queueProject()
    const list = newQueryChain()
    list.order.mockResolvedValue({
      data: [{ id: "ps1", skill_id: SKILL, assignment_source: "auto_method" }],
      error: null,
    })
    queue.push(list)

    const res = await GET(new Request("http://t/"), ctx())
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({
      project_skills: [
        { id: "ps1", skill_id: SKILL, assignment_source: "auto_method" },
      ],
    })
  })
})

describe("POST /api/projects/[id]/skills", () => {
  it("401 when unauthenticated", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    expect((await post(validBody)).status).toBe(401)
  })

  it("403 for a plain viewer (manage_members gate)", async () => {
    queueProject()
    queueMembership("member", "viewer")
    const res = await post(validBody)
    expect(res.status).toBe(403)
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it("400 on a malformed assignment_source", async () => {
    queueProject()
    queueMembership(null, "lead")
    const res = await post({
      assignments: [{ skill_id: SKILL, assignment_source: "bogus" }],
    })
    expect(res.status).toBe(400)
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it("400 on an empty assignments array", async () => {
    queueProject()
    queueMembership(null, "lead")
    expect((await post({ assignments: [] })).status).toBe(400)
  })

  it("400 on a non-uuid skill_id", async () => {
    queueProject()
    queueMembership(null, "lead")
    const res = await post({
      assignments: [{ skill_id: "nope", assignment_source: "manual_pm" }],
    })
    expect(res.status).toBe(400)
  })

  it("201 and forwards the payload to the RPC for a project lead", async () => {
    queueProject()
    queueMembership(null, "lead")
    rpcMock.mockResolvedValue({ data: { assigned: 1, skipped: 0 }, error: null })

    const res = await post(validBody)
    expect(res.status).toBe(201)
    await expect(res.json()).resolves.toEqual({ assigned: 1, skipped: 0 })
    expect(rpcMock).toHaveBeenCalledWith("assign_project_skills", {
      p_project_id: PROJECT,
      p_assignments: validBody.assignments,
    })
  })

  it("maps the RPC authority error (42501) to 403", async () => {
    queueProject()
    queueMembership("admin", null)
    rpcMock.mockResolvedValue({
      data: null,
      error: { code: "42501", message: "only project leads…" },
    })
    expect((await post(validBody)).status).toBe(403)
  })

  it("maps an inactive/invalid skill (22023) to 422", async () => {
    queueProject()
    queueMembership("admin", null)
    rpcMock.mockResolvedValue({
      data: null,
      error: { code: "22023", message: "skill is not active" },
    })
    expect((await post(validBody)).status).toBe(422)
  })

  it("maps a missing skill/project (P0002) to 404", async () => {
    queueProject()
    queueMembership("admin", null)
    rpcMock.mockResolvedValue({
      data: null,
      error: { code: "P0002", message: "skill not found" },
    })
    expect((await post(validBody)).status).toBe(404)
  })
})
