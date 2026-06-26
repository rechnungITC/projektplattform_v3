import { beforeEach, describe, expect, it, vi } from "vitest"

const { getAuthMock, accessMock } = vi.hoisted(() => ({
  getAuthMock: vi.fn(),
  accessMock: vi.fn(),
}))

vi.mock("@/app/api/_lib/route-helpers", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>
  return {
    ...actual,
    getAuthenticatedUserId: getAuthMock,
    requireProjectAccess: accessMock,
  }
})

import { GET, POST } from "./route"

const PROJECT = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa"
const ME = "cccccccc-3333-4333-8333-cccccccccccc"
const LEAD = "dddddddd-4444-4444-8444-dddddddddddd"

function chain(result: { data: unknown; error: unknown }) {
  const c: Record<string, unknown> = {}
  for (const m of ["select", "eq", "order", "insert", "update", "delete"]) {
    c[m] = vi.fn(() => c)
  }
  for (const t of ["limit", "single", "maybeSingle"]) {
    c[t] = vi.fn(async () => result)
  }
  return c
}
function supa(result: { data: unknown; error: unknown }) {
  return { from: vi.fn(() => chain(result)) }
}
function ctx() {
  return { params: Promise.resolve({ id: PROJECT }) }
}
function postReq(body: unknown) {
  return new Request("http://t/dd-streams", { method: "POST", body: JSON.stringify(body) })
}

beforeEach(() => {
  getAuthMock.mockReset()
  accessMock.mockReset()
})

describe("GET /api/projects/[id]/dd-streams", () => {
  it("401 when unauthenticated", async () => {
    getAuthMock.mockResolvedValue({ userId: null, supabase: supa({ data: [], error: null }) })
    expect((await GET(new Request("http://t/dd-streams"), ctx())).status).toBe(401)
  })

  it("400 on invalid project id", async () => {
    getAuthMock.mockResolvedValue({ userId: ME, supabase: supa({ data: [], error: null }) })
    const res = await GET(new Request("http://t/dd-streams"), {
      params: Promise.resolve({ id: "not-a-uuid" }),
    })
    expect(res.status).toBe(400)
  })

  it("lists streams with forward-compatible null counts", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: supa({ data: [{ id: "s1", status: "started" }], error: null }),
    })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    const res = await GET(new Request("http://t/dd-streams"), ctx())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.streams).toHaveLength(1)
    expect(body.streams[0].open_findings).toBeNull()
    expect(body.streams[0].open_questions).toBeNull()
  })

  it("forwards the access error (403)", async () => {
    getAuthMock.mockResolvedValue({ userId: ME, supabase: supa({ data: [], error: null }) })
    accessMock.mockResolvedValue({ error: Response.json({ error: {} }, { status: 403 }) })
    expect((await GET(new Request("http://t/dd-streams"), ctx())).status).toBe(403)
  })
})

describe("POST /api/projects/[id]/dd-streams", () => {
  it("400 on invalid body (missing label)", async () => {
    getAuthMock.mockResolvedValue({ userId: ME, supabase: supa({ data: null, error: null }) })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    expect((await POST(postReq({ stream_key: "legal" }), ctx())).status).toBe(400)
  })

  it("400 on invalid stream_key format", async () => {
    getAuthMock.mockResolvedValue({ userId: ME, supabase: supa({ data: null, error: null }) })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    expect((await POST(postReq({ stream_key: "Legal DD", label: "X" }), ctx())).status).toBe(400)
  })

  it("creates a stream (201)", async () => {
    getAuthMock.mockResolvedValue({
      userId: LEAD,
      supabase: supa({ data: { id: "new", stream_key: "legal" }, error: null }),
    })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    const res = await POST(postReq({ stream_key: "legal", label: "Legal" }), ctx())
    expect(res.status).toBe(201)
    expect((await res.json()).stream.id).toBe("new")
  })

  it("409 on duplicate stream (unique violation)", async () => {
    getAuthMock.mockResolvedValue({
      userId: LEAD,
      supabase: supa({ data: null, error: { code: "23505", message: "dup" } }),
    })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    expect((await POST(postReq({ stream_key: "legal", label: "Legal" }), ctx())).status).toBe(409)
  })
})
